"""Gate 0 诊断：CDN 可选字体（Google Fonts / jsdelivr）在生产预览与导出中的真实表现。

只读诊断，不改线上任何东西。对每个 CDN 字体回答三个问题：
  1. 主文档（预览）里字体真的加载并应用了吗？（document.fonts + canvas 宽度对比）
  2. 导出 PNG 里的字形与预览一致吗？（预览截图 vs 导出 PNG 的 ink IoU，
     以本地化的思源黑体做同管线噪声基线）
  3. 字体请求/加载体积：页面全程对 googleapis/gstatic/jsdelivr 的请求、状态与字节数；
     导出期间 iframe 是否重新发起字体请求；console 是否出现
     "[exportPng] skipping cross-origin stylesheet"。

用法：
    python3 tools/font-gate0/gate0_cdn_fonts_prod.py [URL] [EXPECTED_VERSION] [OUT_DIR]
    URL 默认 Cloudflare prod；测大陆通道传 https://xhsposter.tshzchen.cn
前提：Cloudflare 入口需系统 proxy 127.0.0.1:7897（脚本按 URL 自动判断）；大陆通道直连。
"""
import asyncio
import io
import json
import re
import sys
import time
import zipfile
from pathlib import Path

from PIL import Image
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "https://xhs-poster-editor.l-yanjunnn.workers.dev/"
EXPECTED_VERSION = sys.argv[2] if len(sys.argv) > 2 else "v1.7.3"
USE_PROXY = "workers.dev" in URL
ENTRY = "cloudflare" if USE_PROXY else "mainland"
OUT = Path(sys.argv[3]) if len(sys.argv) > 3 else Path(f"/tmp/gate0_cdn_fonts/{ENTRY}")
OUT.mkdir(parents=True, exist_ok=True)

SAMPLE = "永远的字体诊断样张"  # 手书/宋黑差异明显的常用字，全部在各字体覆盖范围内

# label = UI 里 H1 全局样式下拉的选项文字；family = CSS 首选族名；fallback = stack 里的兜底
CDN_FONTS = [
    {"label": "霞鹜文楷", "family": "LXGW WenKai", "fallback": "serif", "cdn": "jsdelivr"},
    {"label": "站酷小薇", "family": "ZCOOL XiaoWei", "fallback": '"Noto Serif SC", serif', "cdn": "google"},
    {"label": "站酷庆科黄油", "family": "ZCOOL QingKe HuangYou", "fallback": '"Noto Sans SC", sans-serif', "cdn": "google"},
    {"label": "马善政毛笔", "family": "Ma Shan Zheng", "fallback": "cursive", "cdn": "google"},
    {"label": "龙藏体", "family": "Long Cang", "fallback": "cursive", "cdn": "google"},
]
BASELINE = {"label": "思源黑体", "family": "Noto Sans SC", "fallback": "sans-serif", "cdn": "local"}

FONT_HOSTS = ("fonts.googleapis.com", "fonts.gstatic.com", "cdn.jsdelivr.net")


def ink_set(png_bytes: bytes, size=(270, 450), threshold=140):
    img = Image.open(io.BytesIO(png_bytes)).convert("L").resize(size, Image.BILINEAR)
    return {i for i, p in enumerate(img.getdata()) if p < threshold}


def compare_ink(preview_png: bytes, export_png: bytes) -> dict:
    a, b = ink_set(preview_png), ink_set(export_png)
    union = len(a | b)
    return {
        "preview_ink": len(a),
        "export_ink": len(b),
        "iou": round(len(a & b) / union, 4) if union else 1.0,
        "ink_ratio": round(len(b) / len(a), 4) if a else 0.0,
    }


async def pick_select(page, group_label: str, option_text: str):
    group = page.get_by_role("group", name=group_label, exact=True).last
    await group.get_by_role("combobox").click()
    await page.get_by_role("option", name=option_text, exact=False).first.click()
    await page.wait_for_timeout(400)


async def pick_font(page, field_label: str, option_text: str):
    field = page.locator(".font-field").filter(has_text=field_label).first
    await field.get_by_role("combobox").click()
    await page.get_by_role("option", name=option_text, exact=False).first.click()
    await page.wait_for_timeout(400)


async def font_probe(page, family: str, fallback: str) -> dict:
    """主文档侧证据：fonts.check + canvas 宽度对比（宽度不同 → 首选族真的在用）"""
    return await page.evaluate(
        """async ([family, fallback, sample]) => {
          try { await document.fonts.load(`90px "${family}"`, sample) } catch {}
          await new Promise((r) => setTimeout(r, 300))
          const check = document.fonts.check(`90px "${family}"`, sample)
          const ctx = document.createElement('canvas').getContext('2d')
          ctx.font = `90px "${family}", ${fallback}`
          const wStack = ctx.measureText(sample).width
          ctx.font = `90px ${fallback}`
          const wFallback = ctx.measureText(sample).width
          return {
            fontsCheck: check,
            widthStack: Math.round(wStack * 100) / 100,
            widthFallback: Math.round(wFallback * 100) / 100,
            widthDiffers: Math.abs(wStack - wFallback) > 0.5,
          }
        }""",
        [family, fallback, SAMPLE],
    )


async def export_current(page, name: str):
    """导出兼容 ZIP，返回 (第一页 PNG, 失败原因)。预检阻断时带回弹窗文字。"""
    export_button = page.get_by_role("button", name="导出 PNG")
    await export_button.wait_for()
    await page.wait_for_function(
        "!document.querySelector('.topbar-export')?.disabled", timeout=30_000,
    )
    await export_button.click()
    dlg = page.get_by_role("dialog")
    await dlg.get_by_label("文档主题", exact=True).fill(name)
    await dlg.locator("button").filter(has_text=re.compile(r"兼容 ZIP")).first.click()
    await dlg.get_by_label("ZIP 默认名称", exact=True).fill(f"{name}.zip")
    page_count = await page.locator(".page").count()
    try:
        async with page.expect_download(timeout=120_000) as dl_info:
            await dlg.get_by_role(
                "button", name=f"导出全部 {page_count} 张", exact=True,
            ).last.click()
        dl = await dl_info.value
    except Exception:
        # 拿不到下载 → 多半是预检阻断，抓弹窗文字后关闭
        text = (await dlg.inner_text()) if await dlg.count() else "(dialog gone)"
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(500)
        return None, " | ".join(text.split("\n"))[:600]
    path = OUT / f"{name}.zip"
    await dl.save_as(path)
    await dlg.wait_for(state="hidden")
    with zipfile.ZipFile(path) as archive:
        members = sorted(
            (m for m in archive.namelist() if m.lower().endswith(".png")),
            key=lambda m: int(re.match(r"^(\d+)_", Path(m).name).group(1)),
        )
        return archive.read(members[0]), None


async def main():
    net_log: list[dict] = []   # 全程字体相关请求
    console_log: list[dict] = []
    phase = {"name": "load"}   # 当前阶段标记，request/console 回调按它归档

    async with async_playwright() as p:
        # 大陆通道必须强制直连：不传 proxy 时 Chromium 仍会用 macOS 系统代理，
        # 会把「Google Fonts 直连可达性」测成假阳性（Gate 0 首轮实测踩过）
        browser = await p.chromium.launch(
            headless=True,
            proxy={"server": "http://127.0.0.1:7897"} if USE_PROXY else None,
            args=[] if USE_PROXY else ["--no-proxy-server"],
        )
        context = await browser.new_context(
            viewport={"width": 1440, "height": 900}, accept_downloads=True,
        )
        await context.add_init_script(
            "Object.defineProperty(window, 'showSaveFilePicker', "
            "{ configurable: true, value: undefined })"
        )
        page = await context.new_page()

        def on_response(resp):
            if any(h in resp.url for h in FONT_HOSTS):
                try:
                    length = int(resp.headers.get("content-length") or 0)
                except ValueError:
                    length = 0
                net_log.append({
                    "phase": phase["name"], "status": resp.status,
                    "bytes": length, "url": resp.url[:160], "t": time.time(),
                })

        def on_request_failed(req):
            if any(h in req.url for h in FONT_HOSTS):
                net_log.append({
                    "phase": phase["name"], "status": "FAILED",
                    "error": req.failure, "url": req.url[:160], "t": time.time(),
                })

        def on_console(msg):
            text = msg.text
            if "exportPng" in text or "stylesheet" in text or msg.type in ("error", "warning"):
                console_log.append({"phase": phase["name"], "type": msg.type, "text": text[:300]})

        page.on("response", on_response)
        page.on("requestfailed", on_request_failed)
        page.on("console", on_console)

        await page.goto(URL, wait_until="domcontentloaded", timeout=120_000)
        await page.wait_for_selector(".page", timeout=60_000)
        await page.wait_for_timeout(3000)

        version = (await page.locator(".topbar-version").text_content()) or ""
        print(f"[{ENTRY}] 页面版本: {version}（期望 {EXPECTED_VERSION}）")

        # ---- 内容换成单页中文 H1 ----
        editor = page.locator(".tiptap-editor .ProseMirror, .ProseMirror").first
        await editor.click()
        await page.keyboard.press("Meta+a")
        await page.keyboard.type(SAMPLE)
        await page.keyboard.press("Meta+a")
        await page.get_by_role("combobox", name="段落样式").click()
        await page.get_by_role("option", name="H1 · 一级标题", exact=True).click()
        await page.wait_for_timeout(500)
        await page.wait_for_function("document.querySelectorAll('.page').length === 1")
        await page.locator(".page").click(position={"x": 12, "y": 12})
        await pick_select(page, "主题", "极简白")  # 纯 CSS 背景，字形对比最干净
        await page.locator(".inspector-details summary").click()

        results = []
        for font in [BASELINE, *CDN_FONTS]:
            tag = font["family"].replace(" ", "")
            phase["name"] = f"apply:{tag}"
            await pick_font(page, "H1 全局样式", font["label"])
            probe = await font_probe(page, font["family"], font["fallback"])
            await page.wait_for_timeout(800)
            await page.locator(".page").click(position={"x": 12, "y": 12})

            preview_png = await page.locator(".page").first.screenshot()
            (OUT / f"preview-{tag}.png").write_bytes(preview_png)

            phase["name"] = f"export:{tag}"
            export_png, blocked = await export_current(page, f"gate0-{tag}")
            row = {"entry": ENTRY, "font": font["label"], "family": font["family"],
                   "cdn": font["cdn"], "probe": probe}
            if export_png is None:
                row["export"] = {"blocked": blocked}
            else:
                (OUT / f"export-{tag}.png").write_bytes(export_png)
                row["export"] = compare_ink(preview_png, export_png)
            export_net = [n for n in net_log if n["phase"] == f"export:{tag}"]
            row["export_font_requests"] = export_net
            results.append(row)
            print(json.dumps(row, ensure_ascii=False))

        await browser.close()

    report = {
        "entry": ENTRY, "url": URL, "version": version,
        "results": results, "net_log": net_log, "console_log": console_log,
    }
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    total_bytes = sum(n.get("bytes", 0) for n in net_log if isinstance(n.get("bytes"), int))
    failed = [n for n in net_log if n["status"] == "FAILED" or (isinstance(n["status"], int) and n["status"] >= 400)]
    print(f"\n[{ENTRY}] 字体相关请求 {len(net_log)} 个 / {total_bytes/1024:.0f} KB；失败 {len(failed)} 个")
    print(f"[{ENTRY}] 完整报告与截图: {OUT}/")


asyncio.run(main())
