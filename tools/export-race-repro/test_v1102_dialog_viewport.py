"""v1.10.2 低视口导入/导出弹窗几何回归。

覆盖文件选择、拖拽、粘贴、示例四条导入入口，并用 19 页草稿
回归 ExportDialog。断言头尾始终在视口内，真实鼠标滚轮只滚动中间区。

用法：
    python3 tools/export-race-repro/test_v1102_dialog_viewport.py [URL]

默认访问 http://127.0.0.1:4174/，证据写入
/tmp/xhs-v1102-dialog-viewport/<UTC 时间>/。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable
from urllib.parse import urlparse

from playwright.async_api import Browser, BrowserContext, Locator, Page, async_playwright, expect


DEFAULT_URL = "http://127.0.0.1:4174/"
FIXTURE_NAME = "超限19页导出演示.md"
PRIMARY_VIEWPORT = {"width": 1366, "height": 650}
SMOKE_VIEWPORTS = (
    {"width": 1600, "height": 720},
    {"width": 900, "height": 650},
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="v1.10.2 低视口弹窗可达性回归",
    )
    parser.add_argument(
        "url",
        nargs="?",
        default=os.environ.get("URL", DEFAULT_URL),
        help=f"本地或生产预览 URL（默认 {DEFAULT_URL}）",
    )
    parser.add_argument(
        "--expected-version",
        default=os.environ.get("EXPECTED_VERSION"),
        help="可选：顶栏应显示的版本，如 v1.10.2",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("/tmp/xhs-v1102-dialog-viewport"),
        help="截图与结果根目录",
    )
    parser.add_argument(
        "--proxy",
        default=os.environ.get("PROXY_URL"),
        help=(
            "可选 Chromium 代理；workers.dev 未显式传入时自动使用 "
            "http://127.0.0.1:7897"
        ),
    )
    return parser.parse_args()


def log(message: str) -> None:
    print(f"[v1.10.2 dialog viewport] {message}", flush=True)


def assert_within_viewport(
    metrics: dict[str, float],
    viewport_height: float,
    label: str,
) -> None:
    if metrics["top"] < -0.5 or metrics["bottom"] > viewport_height + 0.5:
        raise AssertionError(
            f"{label} 超出视口：{metrics}，innerHeight={viewport_height}",
        )


async def rect(locator: Locator) -> dict[str, float]:
    return await locator.evaluate(
        """element => {
          const value = element.getBoundingClientRect()
          return {
            top: value.top,
            right: value.right,
            bottom: value.bottom,
            left: value.left,
            width: value.width,
            height: value.height,
          }
        }""",
    )


async def wait_for_app(
    page: Page,
    url: str,
    expected_version: str | None,
) -> None:
    await page.goto(url, wait_until="domcontentloaded", timeout=120_000)
    await page.locator(".page-preview-group").first.wait_for(timeout=60_000)
    await page.locator(".workspace-blocking-layer").wait_for(
        state="detached",
        timeout=60_000,
    )
    if expected_version:
        await expect(page.locator(".topbar-version")).to_have_text(
            expected_version,
        )


async def open_import_dialog(page: Page) -> Locator:
    await page.get_by_role("button", name="导入文稿", exact=True).click()
    dialog = page.get_by_role("dialog")
    await dialog.get_by_role(
        "heading",
        name="导入文稿",
        exact=True,
    ).wait_for()
    return dialog


async def enter_review_by_file(
    page: Page,
    fixture_path: Path,
    _source: str,
) -> Locator:
    dialog = await open_import_dialog(page)
    await dialog.locator('input[type="file"]').set_input_files(fixture_path)
    return dialog


async def enter_review_by_drag(
    page: Page,
    _fixture_path: Path,
    source: str,
) -> Locator:
    dialog = await open_import_dialog(page)
    data_transfer = await page.evaluate_handle(
        """([value, name]) => {
          const transfer = new DataTransfer()
          transfer.items.add(new File([value], name, { type: 'text/markdown' }))
          return transfer
        }""",
        [source, FIXTURE_NAME],
    )
    try:
        drop_zone = dialog.locator("button").filter(
            has_text="把文稿拖到这里",
        )
        await drop_zone.dispatch_event(
            "drop",
            {"dataTransfer": data_transfer},
        )
    finally:
        await data_transfer.dispose()
    return dialog


async def enter_review_by_paste(
    page: Page,
    _fixture_path: Path,
    source: str,
) -> Locator:
    dialog = await open_import_dialog(page)
    await dialog.get_by_role("tab", name="粘贴全文", exact=True).click()
    await dialog.get_by_label("粘贴整篇文稿", exact=True).fill(source)
    await dialog.get_by_role("button", name="解析并预览", exact=True).click()
    return dialog


async def enter_review_by_example(
    page: Page,
    _fixture_path: Path,
    _source: str,
) -> Locator:
    dialog = await open_import_dialog(page)
    fixture_button = dialog.locator("button").filter(has_text=FIXTURE_NAME)
    await expect(fixture_button).to_have_count(1)
    await fixture_button.click()
    return dialog


async def wait_for_review(dialog: Locator) -> None:
    await dialog.get_by_role(
        "heading",
        name="确认解析结果",
        exact=True,
    ).wait_for(timeout=60_000)
    await dialog.get_by_role(
        "button",
        name="生成到新草稿",
        exact=True,
    ).wait_for()


async def assert_scroll_contract(
    page: Page,
    dialog: Locator,
    cta: Locator,
    label: str,
) -> dict[str, Any]:
    viewport_height = await page.evaluate("window.innerHeight")
    header = dialog.locator(':scope > [data-slot="dialog-header"]')
    footer = dialog.locator(':scope > [data-slot="dialog-footer"]')
    scroll_body = dialog.locator(
        ":scope > div.min-h-0.overflow-y-auto",
    )
    await expect(header).to_have_count(1)
    await expect(footer).to_have_count(1)
    await expect(scroll_body).to_have_count(1)
    await expect(cta).to_be_visible()
    # 避免把 Dialog 自身 100ms 入场缩放误认为滚动导致的位移。
    await dialog.evaluate(
        "element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => undefined)))",
    )

    dialog_before = await rect(dialog)
    header_before = await rect(header)
    footer_before = await rect(footer)
    cta_before = await rect(cta)
    scroll_before = await scroll_body.evaluate(
        "element => ({ scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight })",
    )
    assert_within_viewport(dialog_before, viewport_height, f"{label} 弹窗")
    assert_within_viewport(header_before, viewport_height, f"{label} header")
    assert_within_viewport(footer_before, viewport_height, f"{label} footer")
    assert_within_viewport(cta_before, viewport_height, f"{label} CTA")
    if scroll_before["scrollHeight"] <= scroll_before["clientHeight"]:
        raise AssertionError(f"{label} 中间区没有形成真实滚动容器：{scroll_before}")

    body_box = await scroll_body.bounding_box()
    if not body_box:
        raise AssertionError(f"{label} 中间滚动区无几何尺寸")
    # Review 内部还有页面缩略图等嵌套滚动区。鼠标放在
    # 中间主滚动区的左上 padding 内，确保 wheel 真实命中本容器。
    await page.mouse.move(
        body_box["x"] + 4,
        body_box["y"] + 4,
    )
    await page.mouse.wheel(0, 700)
    await scroll_body.evaluate(
        """(element, previous) => new Promise((resolve, reject) => {
          const deadline = performance.now() + 3000
          const check = () => {
            if (element.scrollTop > previous) return resolve(element.scrollTop)
            if (performance.now() > deadline) {
              return reject(new Error('wheel 后 scrollTop 未增加'))
            }
            requestAnimationFrame(check)
          }
          check()
        })""",
        scroll_before["scrollTop"],
    )

    header_after = await rect(header)
    footer_after = await rect(footer)
    cta_after = await rect(cta)
    scroll_after = await scroll_body.evaluate(
        "element => ({ scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight })",
    )
    assert_within_viewport(header_after, viewport_height, f"{label} 滚动后 header")
    assert_within_viewport(footer_after, viewport_height, f"{label} 滚动后 footer")
    assert_within_viewport(cta_after, viewport_height, f"{label} 滚动后 CTA")
    if (
        abs(header_after["top"] - header_before["top"]) > 0.5
        or abs(header_after["bottom"] - header_before["bottom"]) > 0.5
    ):
        raise AssertionError(
            f"{label} header 随中间区滚动："
            f"{header_before} -> {header_after}",
        )
    if abs(footer_after["top"] - footer_before["top"]) > 0.5:
        raise AssertionError(
            f"{label} footer 随中间区滚动："
            f"{footer_before['top']} -> {footer_after['top']}",
        )

    return {
        "dialog": dialog_before,
        "headerBefore": header_before,
        "headerAfter": header_after,
        "footerBefore": footer_before,
        "footerAfter": footer_after,
        "ctaBefore": cta_before,
        "ctaAfter": cta_after,
        "scrollBefore": scroll_before,
        "scrollAfter": scroll_after,
        "innerHeight": viewport_height,
    }


async def assert_import_keyboard_reachability(
    page: Page,
    dialog: Locator,
) -> None:
    expected_footer_actions = {"重新选择", "取消", "生成到新草稿"}
    reached: set[str] = set()
    for _ in range(80):
        active = await page.evaluate(
            """() => {
              const element = document.activeElement
              return element instanceof HTMLElement
                ? (element.innerText || element.getAttribute('aria-label') || '').trim()
                : ''
            }""",
        )
        if active in expected_footer_actions:
            reached.add(active)
        if reached == expected_footer_actions:
            break
        await page.keyboard.press("Tab")
    if reached != expected_footer_actions:
        raise AssertionError(
            f"Tab 未到达 footer 全部操作：已到达 {sorted(reached)}",
        )

    await page.keyboard.press("Shift+Tab")
    active_after_reverse = await page.evaluate(
        "() => (document.activeElement instanceof HTMLElement ? document.activeElement.innerText.trim() : '')",
    )
    if active_after_reverse != "取消":
        raise AssertionError(
            f"Shift+Tab 未从 CTA 回到取消：{active_after_reverse!r}",
        )
    focused = dialog.locator(":focus")
    assert_within_viewport(
        await rect(focused),
        await page.evaluate("window.innerHeight"),
        "Shift+Tab 聚焦操作",
    )


async def close_import_review(dialog: Locator) -> None:
    await dialog.get_by_role("button", name="取消", exact=True).click()
    await dialog.wait_for(state="hidden")


async def create_long_draft(dialog: Locator, page: Page) -> None:
    await dialog.get_by_role(
        "button",
        name="生成到新草稿",
        exact=True,
    ).click()
    await dialog.wait_for(state="hidden", timeout=90_000)
    await expect(page.locator(".page-preview-group")).to_have_count(
        19,
        timeout=90_000,
    )


async def assert_export_dialog(page: Page, run_dir: Path) -> dict[str, Any]:
    await page.get_by_role("button", name="导出 PNG", exact=True).click()
    dialog = page.get_by_role("dialog")
    await dialog.get_by_role(
        "heading",
        name="导出 PNG",
        exact=True,
    ).wait_for()
    cta = dialog.get_by_role(
        "button",
        name="导出全部 19 张",
        exact=True,
    )
    metrics = await assert_scroll_contract(page, dialog, cta, "导出 19 页")
    await dialog.screenshot(path=run_dir / "export-1366x650.png")
    await dialog.get_by_role("button", name="取消", exact=True).click()
    await dialog.wait_for(state="hidden")
    return metrics


async def make_context(
    browser: Browser,
    viewport: dict[str, int],
) -> tuple[BrowserContext, Page, list[str], list[str]]:
    context = await browser.new_context(viewport=viewport)
    await context.add_init_script(
        """
        Object.defineProperty(window, 'showDirectoryPicker', {
          configurable: true, writable: true, value: undefined,
        })
        Object.defineProperty(window, 'showSaveFilePicker', {
          configurable: true, writable: true, value: undefined,
        })
        """,
    )
    page = await context.new_page()
    page.set_default_timeout(30_000)
    console_errors: list[str] = []
    page_errors: list[str] = []
    page.on(
        "console",
        lambda message: console_errors.append(message.text)
        if message.type == "error"
        else None,
    )
    page.on("pageerror", lambda error: page_errors.append(str(error)))
    return context, page, console_errors, page_errors


async def run_primary(
    browser: Browser,
    args: argparse.Namespace,
    fixture_path: Path,
    source: str,
    run_dir: Path,
) -> dict[str, Any]:
    context, page, console_errors, page_errors = await make_context(
        browser,
        PRIMARY_VIEWPORT,
    )
    routes: tuple[
        tuple[
            str,
            Callable[[Page, Path, str], Awaitable[Locator]],
        ],
        ...,
    ] = (
        ("file", enter_review_by_file),
        ("drag", enter_review_by_drag),
        ("paste", enter_review_by_paste),
        ("example", enter_review_by_example),
    )
    results: dict[str, Any] = {}
    try:
        await wait_for_app(page, args.url, args.expected_version)
        for index, (route_name, enter_review) in enumerate(routes):
            log(f"1366×650 导入路径：{route_name}")
            dialog = await enter_review(page, fixture_path, source)
            await wait_for_review(dialog)
            cta = dialog.get_by_role(
                "button",
                name="生成到新草稿",
                exact=True,
            )
            results[route_name] = await assert_scroll_contract(
                page,
                dialog,
                cta,
                f"导入 {route_name}",
            )
            await dialog.screenshot(
                path=run_dir / f"import-{route_name}-1366x650.png",
            )
            if route_name == "example":
                await assert_import_keyboard_reachability(page, dialog)
                await create_long_draft(dialog, page)
            else:
                await close_import_review(dialog)

        results["export"] = await assert_export_dialog(page, run_dir)
        if console_errors or page_errors:
            raise AssertionError(
                "页面运行期出现错误："
                + json.dumps(
                    {
                        "consoleErrors": console_errors,
                        "pageErrors": page_errors,
                    },
                    ensure_ascii=False,
                ),
            )
        return {
            "viewport": PRIMARY_VIEWPORT,
            "routes": results,
            "consoleErrors": console_errors,
            "pageErrors": page_errors,
        }
    except Exception:
        await page.screenshot(path=run_dir / "failure-primary.png")
        raise
    finally:
        await context.close()


async def run_smoke_viewport(
    browser: Browser,
    args: argparse.Namespace,
    viewport: dict[str, int],
    fixture_path: Path,
    source: str,
    run_dir: Path,
) -> dict[str, Any]:
    context, page, console_errors, page_errors = await make_context(
        browser,
        viewport,
    )
    label = f"{viewport['width']}x{viewport['height']}"
    try:
        await wait_for_app(page, args.url, args.expected_version)
        dialog = await enter_review_by_example(page, fixture_path, source)
        await wait_for_review(dialog)
        metrics = await assert_scroll_contract(
            page,
            dialog,
            dialog.get_by_role(
                "button",
                name="生成到新草稿",
                exact=True,
            ),
            f"导入 {label}",
        )
        if viewport["width"] == 900:
            await assert_import_keyboard_reachability(page, dialog)
        await dialog.screenshot(path=run_dir / f"import-example-{label}.png")
        if console_errors or page_errors:
            raise AssertionError(
                f"{label} 页面错误："
                + json.dumps(
                    {
                        "consoleErrors": console_errors,
                        "pageErrors": page_errors,
                    },
                    ensure_ascii=False,
                ),
            )
        return {
            "viewport": viewport,
            "metrics": metrics,
            "consoleErrors": console_errors,
            "pageErrors": page_errors,
        }
    except Exception:
        await page.screenshot(path=run_dir / f"failure-{label}.png")
        raise
    finally:
        await context.close()


async def async_main(
    args: argparse.Namespace,
    fixture_path: Path,
    source: str,
    run_dir: Path,
) -> dict[str, Any]:
    async with async_playwright() as playwright:
        proxy_server = args.proxy
        hostname = (urlparse(args.url).hostname or "").lower()
        if not proxy_server and (
            hostname == "workers.dev" or hostname.endswith(".workers.dev")
        ):
            proxy_server = "http://127.0.0.1:7897"
        launch_options: dict[str, Any] = {"headless": True}
        if proxy_server:
            launch_options["proxy"] = {"server": proxy_server}
            launch_options["args"] = ["--disable-http2"]
        else:
            launch_options["args"] = ["--no-proxy-server"]
        browser = await playwright.chromium.launch(**launch_options)
        try:
            primary = await run_primary(
                browser,
                args,
                fixture_path,
                source,
                run_dir,
            )
            smoke = []
            for viewport in SMOKE_VIEWPORTS:
                log(
                    f"补充视口：{viewport['width']}×{viewport['height']}",
                )
                smoke.append(
                    await run_smoke_viewport(
                        browser,
                        args,
                        viewport,
                        fixture_path,
                        source,
                        run_dir,
                    ),
                )
        finally:
            await browser.close()
    return {"url": args.url, "primary": primary, "smoke": smoke}


def main() -> int:
    args = parse_args()
    repository = Path(__file__).resolve().parents[2]
    fixture_path = repository / "app" / "public" / "fixtures" / FIXTURE_NAME
    if not fixture_path.is_file():
        log(f"找不到回归 fixture：{fixture_path}")
        return 1
    source = fixture_path.read_text(encoding="utf-8")
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    run_dir = args.out.expanduser().resolve() / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    log(f"目标：{args.url}；证据：{run_dir}")
    try:
        result = asyncio.run(
            async_main(args, fixture_path, source, run_dir),
        )
    except Exception as error:
        log(f"失败：{error}")
        log(f"诊断产物：{run_dir}")
        return 1

    result_path = run_dir / "result.json"
    result_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    log(f"全部通过：{result_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
