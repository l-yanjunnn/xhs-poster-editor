"""v1.9.0 优化前真实浏览器基线（P1 打字热路径 + P5/P7 导出基线校准热路径）。

测两件事：
1. 打字帧延迟：点进 Tiptap 正文逐字输入 30 个中文字符，页面内
   requestAnimationFrame 时间戳记录每次 keydown 后第一帧到来的延迟
   （keydown -> 下一个 rAF 回调 timestamp），报告 median/p95。
   先测默认 5 页教程文档，再用「插入分页」+insert_text 把文档撑到 10+ 页复测。
2. 导出耗时：UI 触发全部页导出，init script 置 showSaveFilePicker=undefined
   强制走兼容 ZIP 的真实 browser download（对齐 test_v170_import_export_ui.py），
   计从点击触发导出到 download 落盘完成的总毫秒数。

用法：
    cd app && ./node_modules/.bin/tsc -b && ./node_modules/.bin/vite build
    ./node_modules/.bin/vite preview --port 4173 &
    python3 tools/perf/browser-baseline.py [URL]
（默认 http://localhost:4173/；纯观测，不改 app/src。）
"""
import asyncio
import functools
import json
import statistics
import sys
import tempfile
import time
from pathlib import Path

print = functools.partial(print, flush=True)  # 后台运行时实时可见

from playwright.async_api import async_playwright

ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
EXPORT_ONLY = "--export-only" in sys.argv  # 无争抢环境下单独复测导出耗时
URL = ARGS[0] if ARGS else "http://localhost:4173/"
# Playwright 默认直连；Cloudflare 入口必须显式代理（对齐 test_prod_deep）
USE_PROXY = "workers.dev" in URL

TYPE_TEXT = "确定性排版基线采样字符共三十个整覆盖断行求解器编辑热路径观测"  # 30 字
TYPE_DELAY_MS = 120  # 每键间隔，留出上一次 reflow 完成的窗口

RAF_RECORDER = """
() => {
  window.__perfKeys = [];
  window.__perfFrames = [];
  // CJK 输入走 insertText，没有 keydown；用捕获阶段 beforeinput 做击键
  // 时间戳（先于 ProseMirror 同步 reflow 处理），keydown 兜底覆盖普通键。
  window.addEventListener('beforeinput', () => {
    window.__perfKeys.push(performance.now());
  }, true);
  window.addEventListener('keydown', (e) => {
    if (e.key && e.key.length > 1) return; // 修饰键/导航键不算击键
    window.__perfKeys.push(performance.now());
  }, true);
  const loop = (ts) => {
    window.__perfFrames.push(performance.now());
    if (window.__perfFrames.length > 20000) window.__perfFrames.shift();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
"""

COLLECT_LATENCIES = """
() => {
  const keys = window.__perfKeys || [];
  const frames = window.__perfFrames || [];
  const latencies = [];
  for (const k of keys) {
    const next = frames.find((f) => f >= k);
    if (next !== undefined) latencies.push(next - k);
  }
  window.__perfKeys = [];
  return { latencies, keyCount: keys.length, frameCount: frames.length };
}
"""


def stats_ms(samples):
    ordered = sorted(samples)
    def q(p):
        pos = (len(ordered) - 1) * p
        lo, hi = int(pos), min(int(pos) + 1, len(ordered) - 1)
        return ordered[lo] + (ordered[hi] - ordered[lo]) * (pos - lo)
    return {
        "n": len(ordered),
        "median": round(statistics.median(ordered), 2),
        "p95": round(q(0.95), 2),
        "max": round(ordered[-1], 2),
    }


async def measure_typing(page, label):
    """点进正文末尾，逐字输入 30 个中文字符并测每键后的首帧延迟。"""
    editor = page.locator(".tiptap-editor .ProseMirror, .ProseMirror").first
    await editor.click()
    await page.keyboard.press("Meta+ArrowDown")  # 光标到文档末尾
    await page.wait_for_timeout(500)
    await page.evaluate(RAF_RECORDER)
    await page.wait_for_timeout(200)
    await page.keyboard.type(TYPE_TEXT, delay=TYPE_DELAY_MS)
    await page.wait_for_timeout(800)
    collected = await page.evaluate(COLLECT_LATENCIES)
    latencies = collected["latencies"]
    if not latencies:
        raise AssertionError(f"打字延迟无样本，注入侧计数：{collected}")
    # 清掉刚输入的采样字符，避免污染后续测量/导出内容
    for _ in range(len(TYPE_TEXT)):
        await page.keyboard.press("Backspace")
    await page.wait_for_timeout(500)
    result = stats_ms(latencies)
    print(f"[打字帧延迟 | {label}] {result}")
    return result


async def grow_document(page, target_pages):
    """用「插入分页」+ insert_text 把文档撑到 target_pages 页以上。"""
    editor = page.locator(".tiptap-editor .ProseMirror, .ProseMirror").first
    await editor.click()
    await page.keyboard.press("Meta+ArrowDown")
    filler = (
        "确定性排版把断行决策从浏览器收回到求解器手里，预览与导出因此逐像素一致。"
        "这一段是基线采样的填充正文，用来把文档撑长，覆盖长文档编辑热路径。"
    )
    break_button = page.get_by_role("button", name="插入分页", exact=True)
    for _ in range(40):
        count = await page.locator(".page").count()
        if count >= target_pages:
            break
        await break_button.click()
        await page.wait_for_timeout(150)
        await page.keyboard.insert_text(filler + filler)
        await page.wait_for_timeout(400)
    count = await page.locator(".page").count()
    print(f"[长文档] 文档已撑到 {count} 页")
    return count


async def measure_export(page, run_dir):
    """UI 触发全部页导出（兼容 ZIP download 路径），返回总毫秒数。"""
    await page.get_by_role("button", name="导出 PNG", exact=True).click()
    dialog = page.get_by_role("dialog")
    await dialog.get_by_role("heading", name="导出 PNG", exact=True).wait_for()
    await page.wait_for_timeout(300)

    # 显式选择兼容 ZIP（对齐 test_v170_import_export_ui.py；否则目录写入
    # 路径在 picker 被禁用后 prepareDestination 会失败，导出根本不开始）
    zip_choice = dialog.locator("button").filter(has_text="兼容 ZIP")
    if await zip_choice.count() == 1:
        await zip_choice.click()
        await page.wait_for_timeout(200)

    page_count = await page.locator(".page").count()
    export_button = dialog.get_by_role(
        "button", name=f"导出全部 {page_count} 张", exact=True
    )
    if not await export_button.count():
        text = await dialog.inner_text()
        raise AssertionError(f"导出按钮缺失，对话框状态：{text[:600]!r}")
    download_task = asyncio.ensure_future(
        page.wait_for_event("download", timeout=600_000)
    )
    t0 = time.monotonic()
    await export_button.click()
    # 默认教程文稿会触发排版预检 warning（第 3 页两行超限），footer 变为
    # 「按当前预览强制导出」；真正启动渲染+下载的是这次点击，t0 以它为准。
    force = dialog.get_by_role("button", name="按当前预览强制导出", exact=True)
    try:
        await force.wait_for(timeout=15_000)
        precheck_ms = (time.monotonic() - t0) * 1000
        print(f"[导出] 预检发现排版 warning（耗时 {precheck_ms:.0f}ms），走强制导出")
        t0 = time.monotonic()
        await force.click()
    except Exception:
        pass  # 无 warning，t0 = 导出按钮点击
    # >18 页会先弹确认步骤；确认按钮的点击才是真正的触发点
    confirm = dialog.get_by_role("button", name="确认本地完整留存，继续", exact=True)
    try:
        await confirm.wait_for(timeout=3_000)
        t0 = time.monotonic()
        await confirm.click()
    except Exception:
        pass  # 无确认步骤，t0 不变
    # 等 download，同时盯着对话框有没有报错（报错时导出根本没开始）
    while not download_task.done():
        await asyncio.sleep(2)
        try:
            body = await dialog.inner_text(timeout=1_000)
        except Exception:
            body = ""
        for marker in ("无法打开导出位置", "导出失败", "硬阻断"):
            if marker in body:
                download_task.cancel()
                raise AssertionError(f"导出未开始/失败：对话框显示 {marker!r}；{body[:400]!r}")
    download = download_task.result()
    zip_path = run_dir / (download.suggested_filename or "export.zip")
    await download.save_as(zip_path)
    elapsed_ms = (time.monotonic() - t0) * 1000
    failure = await download.failure()
    if failure:
        raise AssertionError(f"下载失败：{failure}")
    size_kb = zip_path.stat().st_size / 1024
    await dialog.wait_for(state="hidden", timeout=30_000)
    print(
        f"[导出耗时] {page_count} 页全部导出（兼容 ZIP）："
        f"{elapsed_ms:.0f}ms，ZIP {size_kb:.0f}KB -> {zip_path}"
    )
    return {"pages": page_count, "ms": round(elapsed_ms), "zipKB": round(size_kb)}


async def main():
    run_dir = Path(tempfile.mkdtemp(prefix="xhs-perf-baseline-"))
    results = {}
    console_errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            proxy={"server": "http://127.0.0.1:7897"} if USE_PROXY else None,
        )
        context = await browser.new_context(
            viewport={"width": 1536, "height": 1024},
            accept_downloads=True,
        )
        # 禁用原生目录/文件 picker，导出必然走可观测的兼容 ZIP download
        await context.add_init_script(
            "Object.defineProperty(window, 'showSaveFilePicker',"
            " { configurable: true, writable: true, value: undefined })"
        )
        page = await context.new_page()
        page.on(
            "console",
            lambda m: console_errors.append(m.text) if m.type == "error" else None,
        )
        page.on("pageerror", lambda e: console_errors.append(str(e)))

        await page.goto(URL, wait_until="domcontentloaded", timeout=120_000)
        await page.wait_for_selector(".page", timeout=60_000)
        await page.wait_for_timeout(3000)  # 字体/确定性排版就绪
        base_pages = await page.locator(".page").count()
        print(f"页面就绪：{base_pages} 页（默认教程文档）")

        if EXPORT_ONLY:
            results["export_5p"] = await measure_export(page, run_dir)
        else:
            results["typing_5p"] = await measure_typing(
                page, f"{base_pages} 页教程文档"
            )
            results["export_5p"] = await measure_export(page, run_dir)
            grown = await grow_document(page, target_pages=11)
            results["typing_long"] = await measure_typing(page, f"{grown} 页长文档")
            results["longdoc_pages"] = grown

        if console_errors:
            print(f"console/page error {len(console_errors)} 条: {console_errors[:3]}")
        results["console_errors"] = len(console_errors)
        await browser.close()

    print("\nJSON:", json.dumps(results, ensure_ascii=False))


asyncio.run(main())
