"""v1.7.0 导入→完整 ZIP 本地/生产 UI 回归。

只使用页面公开的用户交互和真实浏览器下载，不依赖 dev-only
``window.__editor`` / ``window.__test``，也不读写 IndexedDB。每次运行都会
创建全新 Chromium context，并在应用启动前禁用
``showSaveFilePicker``，确保兼容 ZIP 走可观测的 download 事件。

用法：
    python3 tools/export-race-repro/test_v170_import_export_ui.py \
      [URL] [EXPECTED_VERSION] [--out OUT] [--proxy PROXY]

也可用环境变量 URL / EXPECTED_VERSION / PLAYWRIGHT_PROXY 提供同名参数。
默认产物写入 /tmp/xhs-v170-import-export-ui/<UTC 时间>/。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import struct
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any

from playwright.async_api import Browser, BrowserContext, Page, async_playwright, expect


DEFAULT_URL = "http://127.0.0.1:4174/"
DEFAULT_VERSION = "v1.7.0"
FIXTURE_18 = "申论还原型概括题.md"
FIXTURE_19 = "超限19页导出演示.md"
STATUS_18 = "18 张，达到当前普通图文单篇上限"
STATUS_19 = "共 19 张，超过普通图文单篇上限 18 张；仍会完整生成"
EXPORT_TOPIC = "v170-19页完整导出回归"
EXPORT_ZIP_NAME = "v170-19页完整导出回归.zip"
MANIFEST_NAME = "导出清单.json"
EXPECTED_PAGES = list(range(1, 20))
EXPECTED_PNG_SIZE = (2160, 3600)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="v1.7.0 导入 18/19 页并真实下载完整 ZIP 的 UI 回归",
    )
    parser.add_argument(
        "url",
        nargs="?",
        default=os.environ.get("URL", DEFAULT_URL),
        help=f"本地或生产预览 URL（默认 {DEFAULT_URL}）",
    )
    parser.add_argument(
        "expected_version",
        nargs="?",
        default=os.environ.get("EXPECTED_VERSION", DEFAULT_VERSION),
        help=f"顶栏应显示的版本（默认 {DEFAULT_VERSION}）",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("/tmp/xhs-v170-import-export-ui"),
        help="下载与失败截图的根目录",
    )
    parser.add_argument(
        "--proxy",
        default=os.environ.get("PLAYWRIGHT_PROXY"),
        help="可选 Playwright 代理，例如 http://127.0.0.1:7897",
    )
    return parser.parse_args()


def log(message: str) -> None:
    print(f"[v1.7.0 import/export UI] {message}", flush=True)


def assert_equal(actual: Any, expected: Any, label: str) -> None:
    if actual != expected:
        raise AssertionError(f"{label}: 实际 {actual!r}，期望 {expected!r}")


async def wait_for_app(page: Page, url: str, expected_version: str) -> None:
    await page.goto(url, wait_until="domcontentloaded", timeout=120_000)
    await page.locator(".page-preview-group").first.wait_for(timeout=30_000)
    await page.locator(".workspace-blocking-layer").wait_for(
        state="detached",
        timeout=30_000,
    )
    version = ((await page.locator(".topbar-version").text_content()) or "").strip()
    assert_equal(version, expected_version, "顶栏版本")


async def import_fixture(
    page: Page,
    *,
    fixture_name: str,
    expected_status: str,
    page_count: int,
    expected_draft_title: str,
) -> None:
    log(f"导入 {fixture_name}")
    await page.get_by_role("button", name="导入文稿", exact=True).click()
    dialog = page.get_by_role("dialog")
    await dialog.get_by_role("heading", name="导入文稿", exact=True).wait_for()

    fixture_button = dialog.locator("button").filter(has_text=fixture_name)
    await expect(fixture_button).to_have_count(1)
    await fixture_button.click()
    await dialog.get_by_role("heading", name="确认解析结果", exact=True).wait_for(
        timeout=30_000,
    )

    # 上限文案必须精确，而且解析预览明确说明全部页位于同一新草稿。
    await dialog.get_by_text(expected_status, exact=True).first.wait_for()
    await dialog.get_by_text("全部位于同一新草稿", exact=True).wait_for()
    thumbnails = dialog.locator('[title^="第 "][title*=" 页："]')
    await expect(thumbnails).to_have_count(page_count)
    for page_number, thumbnail in enumerate(await thumbnails.all(), start=1):
        title = await thumbnail.get_attribute("title")
        if not title or not title.startswith(f"第 {page_number} 页："):
            raise AssertionError(
                f"{fixture_name} 解析缩略图页码错位：第 {page_number} 个为 {title!r}",
            )

    await dialog.get_by_role("button", name="生成到新草稿", exact=True).click()
    await dialog.wait_for(state="hidden", timeout=60_000)
    await page.get_by_text(
        f"{page_count} 页 · 导出 2160 × 3600",
        exact=True,
    ).wait_for(timeout=60_000)
    await expect(page.locator(".page-preview-group")).to_have_count(
        page_count,
        timeout=60_000,
    )
    await page.get_by_text(f"1 / {page_count}", exact=True).wait_for()
    await page.get_by_text(f"{page_count} / {page_count}", exact=True).wait_for()

    # 从用户可见的草稿库确认：导入结果只有一份，并且是当前草稿。
    await page.get_by_role("button", name="打开草稿管理", exact=True).click()
    draft_dialog = page.get_by_role("dialog")
    await draft_dialog.get_by_role("heading", name="草稿", exact=True).wait_for()
    active_article = draft_dialog.locator("article").filter(
        has_text=expected_draft_title,
    )
    await expect(active_article).to_have_count(1)
    article_text = await active_article.inner_text()
    if "当前" not in article_text:
        raise AssertionError(f"{expected_draft_title} 未标记为当前草稿")
    await page.keyboard.press("Escape")
    await draft_dialog.wait_for(state="hidden")
    log(f"{page_count} 页精确状态、页码和单草稿生成通过")


async def download_complete_zip(page: Page, run_dir: Path) -> Path:
    log("通过导出 Dialog 显式选择兼容 ZIP 并完整下载 19 页")
    await page.get_by_role("button", name="导出 PNG", exact=True).click()
    dialog = page.get_by_role("dialog")
    await dialog.get_by_role("heading", name="导出 PNG", exact=True).wait_for()
    await dialog.get_by_text(STATUS_19, exact=True).wait_for()
    await dialog.get_by_text("共 19 张", exact=True).wait_for()

    zip_choice = dialog.locator("button").filter(has_text=re.compile(r"兼容 ZIP"))
    await expect(zip_choice).to_have_count(1)
    await zip_choice.click()
    assert_equal(await zip_choice.get_attribute("aria-pressed"), "true", "兼容 ZIP 选中态")
    await dialog.get_by_text(
        "ZIP 名称可在下方设置；保存路径由浏览器下载设置决定。",
        exact=True,
    ).wait_for()

    await dialog.get_by_label("文档主题", exact=True).fill(EXPORT_TOPIC)
    await dialog.get_by_label("ZIP 默认名称", exact=True).fill(EXPORT_ZIP_NAME)
    await dialog.get_by_role("button", name="导出全部 19 张", exact=True).click()
    await dialog.get_by_role(
        "heading",
        name="确认导出全部 19 张",
        exact=True,
    ).wait_for()
    await dialog.get_by_text(
        "可以一次性导出；这里确认的是上传边界，不是导出限制。",
        exact=True,
    ).wait_for()

    async with page.expect_download(timeout=600_000) as download_info:
        await dialog.get_by_role(
            "button",
            name="确认本地完整留存，继续",
            exact=True,
        ).click()
    download = await download_info.value
    failure = await download.failure()
    if failure:
        raise AssertionError(f"浏览器下载失败：{failure}")
    assert_equal(download.suggested_filename, EXPORT_ZIP_NAME, "下载 ZIP 文件名")

    zip_path = run_dir / EXPORT_ZIP_NAME
    await download.save_as(zip_path)
    await dialog.wait_for(state="hidden", timeout=30_000)
    log(f"真实下载完成：{zip_path}")
    return zip_path


def validate_zip(zip_path: Path) -> dict[str, Any]:
    log("校验 ZIP 单顶层目录、19 张 PNG 与导出清单")
    with zipfile.ZipFile(zip_path) as archive:
        infos = archive.infolist()
        file_infos = [info for info in infos if not info.is_dir()]
        file_names = [info.filename for info in file_infos]
        assert_equal(len(file_names), len(set(file_names)), "ZIP 文件路径去重")

        paths = [PurePosixPath(name) for name in file_names]
        if any(path.is_absolute() or ".." in path.parts for path in paths):
            raise AssertionError("ZIP 包含非法绝对路径或上级目录")
        roots = {path.parts[0] for path in paths if path.parts}
        assert_equal(len(roots), 1, "ZIP 顶层目录数")
        root = next(iter(roots))
        if any(len(path.parts) != 2 or path.parts[0] != root for path in paths):
            raise AssertionError("所有交付文件应直接位于唯一顶层目录中")

        png_paths = sorted(
            (path for path in paths if path.suffix.lower() == ".png"),
            key=lambda path: path.name,
        )
        assert_equal(len(png_paths), 19, "PNG 数量")
        page_numbers: list[int] = []
        png_names: list[str] = []
        for path in png_paths:
            match = re.fullmatch(r"(\d{2})_.+_(cover|inner)\.png", path.name)
            if not match:
                raise AssertionError(f"PNG 文件名不符合页码/角色规则：{path.name}")
            page_number = int(match.group(1))
            expected_role = "cover" if page_number == 1 else "inner"
            assert_equal(match.group(2), expected_role, f"第 {page_number} 页角色")
            page_numbers.append(page_number)
            png_names.append(path.name)

            data = archive.read(path.as_posix())
            if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
                raise AssertionError(f"{path.name} 不是完整 PNG")
            size = struct.unpack(">II", data[16:24])
            assert_equal(size, EXPECTED_PNG_SIZE, f"{path.name} 像素尺寸")

        assert_equal(page_numbers, EXPECTED_PAGES, "PNG 原稿页码 01..19")

        manifest_paths = [path for path in paths if path.name == MANIFEST_NAME]
        assert_equal(len(manifest_paths), 1, "导出清单数量")
        manifest = json.loads(archive.read(manifest_paths[0].as_posix()).decode("utf-8"))
        assert_equal(manifest.get("folderName"), root, "manifest.folderName")
        assert_equal(manifest.get("sourcePageCount"), 19, "manifest.sourcePageCount")
        assert_equal(manifest.get("exportedPageCount"), 19, "manifest.exportedPageCount")
        assert_equal(manifest.get("sourcePages"), EXPECTED_PAGES, "manifest.sourcePages")
        assert_equal(manifest.get("exportMode"), "all", "manifest.exportMode")
        assert_equal(
            manifest.get("deliveryMode"),
            "compatibility-zip",
            "manifest.deliveryMode",
        )
        assert_equal(
            manifest.get("ordinaryPostCompatibility"),
            {"limit": 18, "isCompatible": False},
            "manifest.ordinaryPostCompatibility",
        )
        manifest_files = manifest.get("files")
        if not isinstance(manifest_files, list):
            raise AssertionError("manifest.files 应为数组")
        assert_equal(
            [item.get("pageNumber") for item in manifest_files],
            EXPECTED_PAGES,
            "manifest.files.pageNumber",
        )
        assert_equal(
            [item.get("fileName") for item in manifest_files],
            png_names,
            "manifest.files.fileName",
        )

    log("交付物通过：1 个顶层目录、19 张 2160×3600 PNG、sourcePages 1..19")
    return {
        "zip": str(zip_path),
        "rootFolder": root,
        "pngCount": 19,
        "sourcePages": EXPECTED_PAGES,
    }


async def run_ui(
    browser: Browser,
    *,
    url: str,
    expected_version: str,
    run_dir: Path,
) -> tuple[dict[str, Any], list[str], list[str]]:
    context: BrowserContext = await browser.new_context(
        viewport={"width": 1536, "height": 1024},
        accept_downloads=True,
    )
    # 只禁用原生文件“另存为” picker；兼容 ZIP 因此必定触发
    # Playwright 可观测的真实 browser download。注入不改应用数据或 UI。
    await context.add_init_script(
        """
        Object.defineProperty(window, 'showSaveFilePicker', {
          configurable: true,
          writable: true,
          value: undefined,
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

    try:
        await wait_for_app(page, url, expected_version)
        await import_fixture(
            page,
            fixture_name=FIXTURE_18,
            expected_status=STATUS_18,
            page_count=18,
            expected_draft_title="申论还原型概括题",
        )
        await import_fixture(
            page,
            fixture_name=FIXTURE_19,
            expected_status=STATUS_19,
            page_count=19,
            expected_draft_title="超限19页导出演示",
        )
        zip_path = await download_complete_zip(page, run_dir)
        await page.wait_for_timeout(500)
        result = validate_zip(zip_path)
        if console_errors or page_errors:
            raise AssertionError(
                "页面运行期出现错误："
                + json.dumps(
                    {"consoleErrors": console_errors, "pageErrors": page_errors},
                    ensure_ascii=False,
                ),
            )
        return result, console_errors, page_errors
    except Exception:
        try:
            await page.screenshot(path=run_dir / "failure.png")
        except Exception as screenshot_error:
            log(f"失败截图也未能保存：{screenshot_error}")
        raise
    finally:
        if console_errors:
            log("console error:\n  " + "\n  ".join(console_errors))
        if page_errors:
            log("page error:\n  " + "\n  ".join(page_errors))
        await context.close()


async def async_main(args: argparse.Namespace, run_dir: Path) -> dict[str, Any]:
    async with async_playwright() as playwright:
        launch_options: dict[str, Any] = {"headless": True}
        if args.proxy:
            launch_options["proxy"] = {"server": args.proxy}
        browser = await playwright.chromium.launch(**launch_options)
        try:
            result, console_errors, page_errors = await run_ui(
                browser,
                url=args.url,
                expected_version=args.expected_version,
                run_dir=run_dir,
            )
        finally:
            await browser.close()
    return {
        "url": args.url,
        "expectedVersion": args.expected_version,
        **result,
        "consoleErrors": console_errors,
        "pageErrors": page_errors,
    }


def main() -> int:
    args = parse_args()
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_dir = args.out.expanduser().resolve() / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    log(f"目标：{args.url} （{args.expected_version}）")
    log(f"全新 Chromium context；产物目录：{run_dir}")
    try:
        result = asyncio.run(async_main(args, run_dir))
    except Exception as error:
        log(f"失败：{error}")
        log(f"诊断产物：{run_dir}")
        return 1

    result_path = run_dir / "result.json"
    result_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    log(f"全部通过；结果：{result_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
