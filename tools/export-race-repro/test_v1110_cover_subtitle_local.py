"""Capture and verify the v1.11.0 cover-subtitle spacing candidate.

The script drives the real local production build with installed stable Chrome.
It captures public-exam 3 layouts x 3 spacing levels as both canvas screenshots
and exported 2160 x 3600 PNGs. Standard preview pixels and sealed geometry are
strictly compared with v1.10.2; exported PNGs allow only a one-level renderer
antialiasing delta on at most 0.003% of pixels.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import io
import json
import re
import sys
import tempfile
import zipfile
from pathlib import Path

from PIL import Image, ImageChops
from playwright.async_api import (
    Page,
    TimeoutError as PlaywrightTimeoutError,
    async_playwright,
)


REPO = Path(__file__).resolve().parents[2]
DEFAULT_URL = "http://127.0.0.1:4173/"
DEFAULT_BASELINE_DIR = (
    REPO
    / "docs"
    / "screenshots"
    / "v1.11.0"
    / "standard-baseline-v1.10.2-real-fixture"
)
DEFAULT_OUTPUT_DIR = (
    REPO
    / "docs"
    / "screenshots"
    / "v1.11.0"
    / "candidate-real-fixture-v1"
)
FIXTURE = "「看起来」高分和「实际高分」是两件事情"
LAYOUTS = (
    ("stack-left", "左对齐叠排"),
    ("poster-center", "居中海报"),
    ("kicker-above", "小字在上大字在下"),
)
SPACINGS = (
    ("compact", "紧凑"),
    ("standard", "标准"),
    ("relaxed", "舒展"),
)
PNG_CHANGED_PIXEL_RATIO_LIMIT = 0.00003  # 0.003%
PNG_MAX_CHANNEL_DELTA = 1


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def image_difference(left: Path, right: Path) -> dict[str, object]:
    with Image.open(left) as left_image, Image.open(right) as right_image:
        left_rgba = left_image.convert("RGBA")
        right_rgba = right_image.convert("RGBA")
        if left_rgba.size != right_rgba.size:
            return {
                "identical": False,
                "leftSize": list(left_rgba.size),
                "rightSize": list(right_rgba.size),
                "differenceBox": "size-mismatch",
                "changedPixelCount": None,
                "changedPixelRatio": None,
                "maxChannelDelta": None,
            }
        difference = ImageChops.difference(left_rgba, right_rgba)
        # Pillow 11.x defaults RGBA getbbox() to alpha_only=True. Exported PNGs
        # are opaque, so that default would report RGB-only changes as equal.
        difference_box = difference.getbbox(alpha_only=False)
        max_delta_image = difference.getchannel("R")
        for channel in ("G", "B", "A"):
            max_delta_image = ImageChops.lighter(
                max_delta_image,
                difference.getchannel(channel),
            )
        histogram = max_delta_image.histogram()
        total_pixels = left_rgba.width * left_rgba.height
        changed_pixel_count = total_pixels - histogram[0]
        max_channel_delta = max(
            (value for value, count in enumerate(histogram) if count),
            default=0,
        )
        return {
            "identical": difference_box is None,
            "leftSize": list(left_rgba.size),
            "rightSize": list(right_rgba.size),
            "differenceBox": list(difference_box) if difference_box else None,
            "changedPixelCount": changed_pixel_count,
            "changedPixelRatio": changed_pixel_count / total_pixels,
            "maxChannelDelta": max_channel_delta,
        }


def within_png_antialias_tolerance(comparison: dict[str, object]) -> bool:
    ratio = comparison["changedPixelRatio"]
    max_delta = comparison["maxChannelDelta"]
    return (
        isinstance(ratio, (int, float))
        and ratio <= PNG_CHANGED_PIXEL_RATIO_LIMIT
        and isinstance(max_delta, int)
        and max_delta <= PNG_MAX_CHANNEL_DELTA
    )


def compare_standard_geometry(
    baseline: dict[str, object],
    candidate: dict[str, object],
) -> dict[str, object]:
    field_pairs = {
        "text": ("text", "text"),
        "sourceLetterSpacing": (
            "sourceLetterSpacing",
            "sourceLetterSpacing",
        ),
        "sourceFontSize": ("sourceFontSize", "sourceFontSize"),
        "materializedLetterSpacing": (
            "materializedLetterSpacing",
            "materializedLetterSpacing",
        ),
        "subtitleRect": ("rect", "subtitleRect"),
        "lines": ("lines", "lines"),
        "atoms": ("atoms", "atoms"),
        "snapshotId": ("snapshotId", "snapshotId"),
        "layoutState": ("layoutState", "layoutState"),
        "layoutPhase": ("layoutPhase", "layoutPhase"),
    }
    fields = {
        name: baseline.get(baseline_key) == candidate.get(candidate_key)
        for name, (baseline_key, candidate_key) in field_pairs.items()
    }
    return {
        "identical": all(fields.values()),
        "fields": fields,
        "baselineSnapshotId": baseline.get("snapshotId"),
        "candidateSnapshotId": candidate.get("snapshotId"),
    }


async def wait_for_sealed(page: Page, spacing: str) -> None:
    await page.wait_for_function(
        """spacing => {
          const first = document.querySelector('.page.page--first');
          return first?.dataset.coverSubtitleSpacing === spacing
            && first.dataset.layoutSnapshotPhase === 'sealed'
            && ['ready', 'ready-with-warnings'].includes(
              first.dataset.layoutState || ''
            );
        }""",
        arg=spacing,
        timeout=60_000,
    )


async def select_public_exam_theme(page: Page) -> None:
    theme_trigger = page.locator(".inspector-card").get_by_role("combobox").first
    await theme_trigger.click()
    await page.get_by_role("option", name="公考·山水卷", exact=True).click()
    await wait_for_sealed(page, "standard")


async def replace_cover_subtitle(page: Page) -> None:
    subtitle = page.locator(
        ".tiptap-editor .ProseMirror > h1:first-of-type + p",
    ).first
    await subtitle.evaluate(
        """element => {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(element);
          selection.removeAllRanges();
          selection.addRange(range);
        }""",
    )
    await page.keyboard.insert_text(FIXTURE)
    await page.wait_for_function(
        """fixture => document.querySelector(
          '.tiptap-editor .ProseMirror > h1:first-of-type + p'
        )?.textContent === fixture""",
        arg=FIXTURE,
        timeout=10_000,
    )
    await wait_for_sealed(page, "standard")


async def select_layout(page: Page, label: str) -> None:
    await page.get_by_role("button", name=label, exact=False).first.click()
    await page.locator('[aria-label="垂直位置"]').get_by_role(
        "button",
        name="中",
        exact=True,
    ).click()


async def select_spacing(page: Page, slug: str, label: str) -> None:
    await page.locator('[aria-label="副标题字距"]').get_by_role(
        "button",
        name=label,
        exact=True,
    ).click()
    await wait_for_sealed(page, slug)


async def measure_geometry(page: Page) -> dict[str, object]:
    return await page.evaluate(
        """() => {
          const page = document.querySelector('.page.page--first');
          const h1 = page?.querySelector('.content > h1:first-of-type');
          const subtitle = h1?.nextElementSibling;
          if (!(page instanceof HTMLElement)
              || !(h1 instanceof HTMLElement)
              || !(subtitle instanceof HTMLElement)) {
            throw new Error('Cover title/subtitle not found');
          }
          const pageRect = page.getBoundingClientRect();
          const titleRect = h1.getBoundingClientRect();
          const subtitleRect = subtitle.getBoundingClientRect();
          const scale = pageRect.width / 1080;
          const atoms = Array.from(
            subtitle.querySelectorAll(':scope > .dtl-atom')
          ).map(atom => ({
            line: Number(atom.dataset.layoutLine),
            text: atom.textContent,
            x: Number(atom.dataset.layoutX),
            advance: Number(atom.dataset.layoutAdvance),
            gap: Number(atom.dataset.layoutGap),
          }));
          const lines = Array.from(
            subtitle.querySelectorAll(':scope > .dtl-line')
          ).map(line => {
            const lineRect = line.getBoundingClientRect();
            const lineIndex = Number(line.dataset.layoutLine);
            return {
              line: lineIndex,
              x: (lineRect.left - pageRect.left) / scale,
              y: (lineRect.top - pageRect.top) / scale,
              width: lineRect.width / scale,
              text: atoms
                .filter(atom => atom.line === lineIndex)
                .map(atom => atom.text)
                .join(''),
            };
          });

          // Deterministic materialization resets the live block's CSS tracking;
          // recreate the scoped selector off-screen to record its source value.
          const probe = page.cloneNode(false);
          probe.style.cssText = [
            'position:fixed', 'left:-10000px', 'top:0',
            'width:1080px', 'height:1800px', 'visibility:hidden'
          ].join(';');
          const probeContent = document.createElement('div');
          probeContent.className = 'content';
          const probeH1 = document.createElement('h1');
          probeH1.textContent = '基线标题';
          const probeSubtitle = document.createElement('p');
          probeSubtitle.textContent = subtitle.textContent;
          probeContent.append(probeH1, probeSubtitle);
          probe.append(probeContent);
          document.body.append(probe);
          const sourceStyle = getComputedStyle(probeSubtitle);
          const sourceLetterSpacing = sourceStyle.letterSpacing;
          const sourceFontSize = sourceStyle.fontSize;
          probe.remove();

          const kickerBefore = getComputedStyle(subtitle, '::before');
          return {
            layout: page.dataset.coverLayout,
            vertical: page.dataset.coverVertical,
            spacing: page.dataset.coverSubtitleSpacing,
            text: subtitle.textContent,
            lineText: lines.map(line => line.text).join(''),
            sourceLetterSpacing,
            sourceFontSize,
            materializedLetterSpacing: getComputedStyle(subtitle).letterSpacing,
            subtitleRect: {
              x: (subtitleRect.left - pageRect.left) / scale,
              y: (subtitleRect.top - pageRect.top) / scale,
              width: subtitleRect.width / scale,
              height: subtitleRect.height / scale,
            },
            centerDelta: {
              title: (
                titleRect.left + titleRect.width / 2
                - pageRect.left - pageRect.width / 2
              ) / scale,
              subtitle: (
                subtitleRect.left + subtitleRect.width / 2
                - pageRect.left - pageRect.width / 2
              ) / scale,
            },
            lines,
            atoms,
            snapshotId: page.dataset.layoutSnapshot,
            layoutState: page.dataset.layoutState,
            layoutPhase: page.dataset.layoutSnapshotPhase,
            issueCount: Number(page.dataset.layoutIssueCount || 0),
            kickerBefore: {
              content: kickerBefore.content,
              width: kickerBefore.width,
              height: kickerBefore.height,
              backgroundColor: kickerBefore.backgroundColor,
            },
          };
        }""",
    )


async def export_first_page(page: Page, slug: str) -> bytes:
    export_button = page.get_by_role("button", name="导出 PNG")
    await page.wait_for_function(
        "!document.querySelector('.topbar-export')?.disabled",
        timeout=30_000,
    )
    await export_button.click()
    dialog = page.get_by_role("dialog")
    await dialog.get_by_label("文档主题", exact=True).fill(f"v1110-{slug}")
    await dialog.locator("button").filter(has_text=re.compile(r"兼容 ZIP")).first.click()
    await dialog.get_by_label("ZIP 默认名称", exact=True).fill(f"{slug}.zip")
    page_count = await page.locator(".page").count()
    export_all = dialog.get_by_role(
        "button",
        name=f"导出全部 {page_count} 张",
        exact=True,
    ).last
    download_task = asyncio.create_task(
        page.wait_for_event("download", timeout=120_000),
    )
    force_clicked = False
    try:
        await export_all.click()
        while not download_task.done():
            hard_block = dialog.get_by_text(
                re.compile(
                    r"字体或排版预检未通过，已阻止导出|"
                    r"字体或确定性排版存在硬阻断问题",
                ),
                exact=False,
            )
            if await hard_block.count() and await hard_block.first.is_visible():
                raise AssertionError(
                    f"{slug}: export is hard-blocked: {await dialog.inner_text()}",
                )

            warning_action = dialog.get_by_role(
                "button",
                name=re.compile(r"^(仍然导出|按当前预览强制导出)$"),
            )
            warning_visible = bool(
                await warning_action.count()
                and await warning_action.first.is_visible(),
            )
            if not force_clicked and warning_visible:
                await warning_action.first.click()
                force_clicked = True
                await asyncio.sleep(0.1)
                continue

            alerts = dialog.get_by_role("alert")
            visible_alerts = [
                text.strip()
                for text in await alerts.all_inner_texts()
                if text.strip()
            ]
            if visible_alerts and not warning_visible:
                raise AssertionError(
                    f"{slug}: unknown export blocker: "
                    + " | ".join(visible_alerts),
                )

            await asyncio.sleep(0.1)

        download = await download_task
    except PlaywrightTimeoutError as cause:
        detail = (
            await dialog.inner_text()
            if await dialog.is_visible()
            else "export dialog closed without a download"
        )
        raise AssertionError(
            f"{slug}: no download after 120s: {detail}",
        ) from cause
    finally:
        if not download_task.done():
            download_task.cancel()
            try:
                await download_task
            except asyncio.CancelledError:
                pass
        else:
            # Retrieve a completed task's exception even if a dialog blocker won
            # the race, avoiding an unobserved-task warning during the next case.
            try:
                download_task.exception()
            except asyncio.CancelledError:
                pass

    with tempfile.TemporaryDirectory(prefix="xhs-v1110-candidate-") as temp_dir:
        zip_path = Path(temp_dir) / f"{slug}.zip"
        await download.save_as(zip_path)
        with zipfile.ZipFile(zip_path) as archive:
            png_names = sorted(
                (name for name in archive.namelist() if name.lower().endswith(".png")),
                key=lambda name: int(
                    re.match(r"^(\d+)_", Path(name).name).group(1),
                ),
            )
            first_page = archive.read(png_names[0])
    await dialog.wait_for(state="hidden")
    return first_page


async def run(args: argparse.Namespace) -> dict[str, object]:
    output_dir: Path = args.output_dir
    baseline_dir: Path = args.baseline_dir
    if output_dir.exists() and any(output_dir.iterdir()):
        raise RuntimeError(f"Refusing to overwrite output directory: {output_dir}")
    if not (baseline_dir / "manifest.json").is_file():
        raise RuntimeError(f"Missing real-fixture baseline: {baseline_dir}")
    baseline_manifest = json.loads(
        (baseline_dir / "manifest.json").read_text(encoding="utf-8"),
    )
    baseline_layouts = baseline_manifest.get("layouts")
    if not isinstance(baseline_layouts, dict):
        raise RuntimeError("Real-fixture baseline manifest has no layouts")
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, object] = {
        "candidateVersionLabel": None,
        "candidateBundle": None,
        "fixture": FIXTURE,
        "theme": "公考·山水卷",
        "vertical": "middle",
        "viewport": {"width": 1440, "height": 900},
        "baselineDir": str(baseline_dir.relative_to(REPO)),
        "cases": {},
        "assertions": [],
    }
    assertions: list[dict[str, object]] = manifest["assertions"]

    async with async_playwright() as playwright:
        use_proxy = "workers.dev" in args.url
        browser = await playwright.chromium.launch(
            channel="chrome",
            headless=True,
            proxy={
                "server": "http://127.0.0.1:7897",
                "bypass": "cdn.jsdelivr.net",
            }
            if use_proxy
            else None,
            args=["--disable-http2"] if use_proxy else ["--no-proxy-server"],
        )
        context = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            accept_downloads=True,
        )
        await context.add_init_script(
            "Object.defineProperty(window, 'showSaveFilePicker', "
            "{ configurable: true, value: undefined })",
        )
        page = await context.new_page()
        await page.goto(args.url, wait_until="domcontentloaded", timeout=120_000)
        await page.wait_for_selector(".page", timeout=60_000)
        await wait_for_sealed(page, "standard")
        manifest["candidateVersionLabel"] = (
            await page.locator(".topbar-version").inner_text()
        ).strip()
        if manifest["candidateVersionLabel"] != args.expected_version:
            raise AssertionError(
                "Version mismatch: "
                f"{manifest['candidateVersionLabel']} != {args.expected_version}",
            )
        manifest["candidateBundle"] = await page.locator(
            'script[type="module"][src]',
        ).get_attribute("src")
        await select_public_exam_theme(page)
        await replace_cover_subtitle(page)

        for layout_slug, layout_label in LAYOUTS:
            await select_layout(page, layout_label)
            per_layout: list[dict[str, object]] = []
            for spacing_slug, spacing_label in SPACINGS:
                await select_spacing(page, spacing_slug, spacing_label)
                before_export = await measure_geometry(page)
                if before_export["text"] != FIXTURE:
                    raise AssertionError(
                        f"Unicode text changed in {layout_slug}/{spacing_slug}",
                    )
                if before_export["lineText"] != FIXTURE:
                    raise AssertionError(
                        f"Atom line text changed in {layout_slug}/{spacing_slug}",
                    )
                if before_export["layout"] != layout_slug:
                    raise AssertionError(
                        f"Layout dataset mismatch in {layout_slug}/{spacing_slug}",
                    )
                if before_export["vertical"] != "middle":
                    raise AssertionError(
                        f"Vertical dataset mismatch in {layout_slug}/{spacing_slug}",
                    )

                case_slug = f"{spacing_slug}-{layout_slug}"
                preview_path = output_dir / f"{case_slug}-preview.png"
                await page.locator(".page").first.screenshot(path=preview_path)
                png_bytes = await export_first_page(page, case_slug)
                png_path = output_dir / f"{case_slug}-2160x3600.png"
                png_path.write_bytes(png_bytes)
                with Image.open(io.BytesIO(png_bytes)) as exported_image:
                    png_size = exported_image.size
                if png_size != (2160, 3600):
                    raise AssertionError(
                        f"Unexpected PNG size in {case_slug}: {png_size}",
                    )

                after_export = await measure_geometry(page)
                if (
                    after_export["snapshotId"] != before_export["snapshotId"]
                    or after_export["text"] != before_export["text"]
                    or after_export["lines"] != before_export["lines"]
                ):
                    raise AssertionError(
                        f"Export changed sealed geometry in {case_slug}",
                    )

                standard_comparison = None
                if spacing_slug == "standard":
                    baseline_geometry = baseline_layouts.get(layout_slug)
                    if not isinstance(baseline_geometry, dict):
                        raise RuntimeError(
                            f"Missing baseline geometry for {layout_slug}",
                        )
                    baseline_preview = (
                        baseline_dir / f"standard-{layout_slug}-preview.png"
                    )
                    baseline_png = (
                        baseline_dir / f"standard-{layout_slug}-2160x3600.png"
                    )
                    standard_comparison = {
                        "geometryAndSnapshot": compare_standard_geometry(
                            baseline_geometry,
                            before_export,
                        ),
                        "preview": image_difference(
                            baseline_preview,
                            preview_path,
                        ),
                        "png": image_difference(baseline_png, png_path),
                    }
                    standard_comparison["png"][
                        "withinAntialiasTolerance"
                    ] = within_png_antialias_tolerance(
                        standard_comparison["png"],
                    )
                    if not standard_comparison["geometryAndSnapshot"][
                        "identical"
                    ]:
                        raise AssertionError(
                            "Standard sealed geometry/snapshot drift in "
                            f"{layout_slug}: "
                            f"{standard_comparison['geometryAndSnapshot']}",
                        )
                    if not standard_comparison["preview"]["identical"]:
                        raise AssertionError(
                            f"Standard preview drift in {layout_slug}",
                        )
                    if not standard_comparison["png"][
                        "withinAntialiasTolerance"
                    ]:
                        raise AssertionError(
                            "Standard PNG drift exceeds antialias tolerance in "
                            f"{layout_slug}: {standard_comparison['png']}",
                        )

                case = {
                    **before_export,
                    "preview": preview_path.name,
                    "previewSha256": sha256_bytes(preview_path.read_bytes()),
                    "png": png_path.name,
                    "pngSha256": sha256_bytes(png_bytes),
                    "pngSize": list(png_size),
                    "snapshotAfterExport": after_export["snapshotId"],
                    "standardPixelComparison": standard_comparison,
                }
                manifest["cases"][case_slug] = case
                per_layout.append(case)
                print(
                    f"PASS {case_slug}: {before_export['sourceLetterSpacing']} "
                    f"snapshot={before_export['snapshotId']}"
                    + (
                        "; standard PNG changed="
                        f"{standard_comparison['png']['changedPixelCount']} "
                        f"({standard_comparison['png']['changedPixelRatio']:.8%}), "
                        "maxChannelDelta="
                        f"{standard_comparison['png']['maxChannelDelta']}"
                        if standard_comparison
                        else ""
                    ),
                    flush=True,
                )

            snapshots = [case["snapshotId"] for case in per_layout]
            atom_xs = [
                [atom["x"] for atom in case["atoms"]]
                for case in per_layout
            ]
            snapshot_changes = len(set(snapshots)) == 3
            geometry_changes = len({json.dumps(xs) for xs in atom_xs}) == 3
            if not snapshot_changes or not geometry_changes:
                raise AssertionError(
                    f"Spacing did not change snapshot/atom geometry for {layout_slug}",
                )
            if layout_slug == "poster-center":
                centered = all(
                    abs(case["centerDelta"]["subtitle"]) <= 8
                    for case in per_layout
                )
                if not centered:
                    raise AssertionError("poster-center subtitle is not centered")
            else:
                centered = None
            if layout_slug == "kicker-above":
                kicker_visible = all(
                    case["kickerBefore"]["content"] not in ("none", "normal")
                    and case["kickerBefore"]["width"] != "0px"
                    for case in per_layout
                )
                if not kicker_visible:
                    raise AssertionError("kicker marker pseudo-element is missing")
            else:
                kicker_visible = None
            assertions.append(
                {
                    "layout": layout_slug,
                    "threeDistinctSnapshots": snapshot_changes,
                    "threeDistinctAtomGeometries": geometry_changes,
                    "posterCenterWithin8px": centered,
                    "kickerMarkerVisible": kicker_visible,
                },
            )

        await browser.close()

    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Capture the v1.11.0 public-exam 3x3 local visual matrix.",
    )
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--expected-version", default="v1.11.0")
    parser.add_argument(
        "--baseline-dir",
        type=Path,
        default=DEFAULT_BASELINE_DIR,
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        manifest = asyncio.run(run(args))
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    print(
        f"PASS: {len(manifest['cases'])} cases written to {args.output_dir}",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
