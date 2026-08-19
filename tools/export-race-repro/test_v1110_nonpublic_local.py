"""Verify one non-public theme against the real v1.10.2 local build.

This deliberately keeps compact equal to standard when the old theme's source
tracking is already zero. The relaxed case must change sealed atom geometry,
while candidate standard must remain pixel-identical to v1.10.2.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Optional

from PIL import Image, ImageChops
from playwright.sync_api import Page, sync_playwright


REPO = Path(__file__).resolve().parents[2]
DEFAULT_CANDIDATE_URL = "http://127.0.0.1:4173/"
DEFAULT_BASELINE_URL = "http://127.0.0.1:4172/"
DEFAULT_OUTPUT_DIR = (
    REPO
    / "docs"
    / "screenshots"
    / "v1.11.0"
    / "nonpublic-minimal-white-v1"
)
FIXTURE = "「看起来」高分和「实际高分」是两件事情"
SPACINGS = (
    ("compact", "紧凑"),
    ("standard", "标准"),
    ("relaxed", "舒展"),
)


def wait_sealed(page: Page, spacing: Optional[str] = None) -> None:
    if spacing is None:
        page.wait_for_function(
            """() => {
              const cover = document.querySelector('.page.page--first');
              return cover?.dataset.layoutSnapshotPhase === 'sealed'
                && ['ready', 'ready-with-warnings'].includes(
                  cover.dataset.layoutState || ''
                );
            }""",
            timeout=60_000,
        )
        return
    page.wait_for_function(
        """spacing => {
          const cover = document.querySelector('.page.page--first');
          return cover?.dataset.coverSubtitleSpacing === spacing
            && cover.dataset.layoutSnapshotPhase === 'sealed'
            && ['ready', 'ready-with-warnings'].includes(
              cover.dataset.layoutState || ''
            );
        }""",
        arg=spacing,
        timeout=60_000,
    )


def select_minimal_white(page: Page, spacing: Optional[str]) -> None:
    trigger = page.locator(".inspector-card").get_by_role("combobox").first
    trigger.click()
    page.get_by_role("option", name="极简白", exact=True).click()
    wait_sealed(page, spacing)


def replace_fixture(page: Page, spacing: Optional[str]) -> None:
    subtitle = page.locator(
        ".tiptap-editor .ProseMirror > h1:first-of-type + p",
    ).first
    subtitle.evaluate(
        """element => {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(element);
          selection.removeAllRanges();
          selection.addRange(range);
        }""",
    )
    page.keyboard.insert_text(FIXTURE)
    page.wait_for_function(
        """fixture => document.querySelector(
          '.tiptap-editor .ProseMirror > h1:first-of-type + p'
        )?.textContent === fixture""",
        arg=FIXTURE,
        timeout=10_000,
    )
    wait_sealed(page, spacing)


def set_middle(page: Page, spacing: Optional[str]) -> None:
    page.locator('[aria-label="垂直位置"]').get_by_role(
        "button",
        name="中",
        exact=True,
    ).click()
    wait_sealed(page, spacing)


def measure(page: Page) -> dict[str, object]:
    return page.locator(".page.page--first").evaluate(
        """page => {
          const subtitle = page.querySelector(
            '.content > h1:first-of-type + p'
          );
          if (!(subtitle instanceof HTMLElement)) {
            throw new Error('Cover subtitle not found');
          }
          const atoms = Array.from(
            subtitle.querySelectorAll(':scope > .dtl-atom')
          ).map(atom => ({
            line: Number(atom.dataset.layoutLine),
            text: atom.textContent,
            x: Number(atom.dataset.layoutX),
            gap: Number(atom.dataset.layoutGap),
          }));
          const probe = page.cloneNode(false);
          probe.style.cssText = [
            'position:fixed', 'left:-10000px', 'top:0',
            'width:1080px', 'height:1800px', 'visibility:hidden'
          ].join(';');
          const content = document.createElement('div');
          content.className = 'content';
          const title = document.createElement('h1');
          title.textContent = '对照标题';
          const text = document.createElement('p');
          text.textContent = subtitle.textContent;
          content.append(title, text);
          probe.append(content);
          document.body.append(probe);
          const sourceLetterSpacing = getComputedStyle(text).letterSpacing;
          probe.remove();
          return {
            spacing: page.dataset.coverSubtitleSpacing || 'legacy-standard',
            vertical: page.dataset.coverVertical,
            snapshotId: page.dataset.layoutSnapshot,
            layoutState: page.dataset.layoutState,
            layoutPhase: page.dataset.layoutSnapshotPhase,
            text: subtitle.textContent,
            sourceLetterSpacing,
            atomXs: atoms.map(atom => atom.x),
            atomGaps: atoms.map(atom => atom.gap),
          };
        }""",
    )


def capture_build(
    browser,
    url: str,
    output_dir: Path,
    candidate: bool,
) -> dict[str, dict[str, object]]:
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    page = context.new_page()
    page.goto(url, wait_until="domcontentloaded", timeout=120_000)
    page.wait_for_selector(".page", timeout=60_000)
    initial_spacing = "standard" if candidate else None
    wait_sealed(page, initial_spacing)
    select_minimal_white(page, initial_spacing)
    replace_fixture(page, initial_spacing)
    set_middle(page, initial_spacing)

    cases: dict[str, dict[str, object]] = {}
    if not candidate:
        state = measure(page)
        screenshot = output_dir / "v1.10.2-standard-preview.png"
        page.locator(".page").first.screenshot(path=screenshot)
        cases["v1.10.2-standard"] = {
            **state,
            "preview": screenshot.name,
        }
    else:
        group = page.locator('[aria-label="副标题字距"]')
        for slug, label in SPACINGS:
            group.get_by_role("button", name=label, exact=True).click()
            wait_sealed(page, slug)
            state = measure(page)
            screenshot = output_dir / f"candidate-{slug}-preview.png"
            page.locator(".page").first.screenshot(path=screenshot)
            cases[f"candidate-{slug}"] = {
                **state,
                "preview": screenshot.name,
            }
    context.close()
    return cases


def pixel_comparison(left: Path, right: Path) -> dict[str, object]:
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
        # Pillow 11.x defaults RGBA getbbox() to alpha_only=True. Opaque images
        # can differ in RGB while that alpha-only box remains empty.
        box = difference.getbbox(alpha_only=False)
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
            "identical": box is None,
            "leftSize": list(left_rgba.size),
            "rightSize": list(right_rgba.size),
            "differenceBox": list(box) if box else None,
            "changedPixelCount": changed_pixel_count,
            "changedPixelRatio": changed_pixel_count / total_pixels,
            "maxChannelDelta": max_channel_delta,
        }


def compare_standard_geometry(
    baseline: dict[str, object],
    candidate: dict[str, object],
) -> dict[str, object]:
    fields = {
        key: baseline.get(key) == candidate.get(key)
        for key in (
            "vertical",
            "snapshotId",
            "layoutState",
            "layoutPhase",
            "text",
            "sourceLetterSpacing",
            "atomXs",
            "atomGaps",
        )
    }
    return {
        "identical": all(fields.values()),
        "fields": fields,
        "baselineSnapshotId": baseline.get("snapshotId"),
        "candidateSnapshotId": candidate.get("snapshotId"),
    }


def run(args: argparse.Namespace) -> dict[str, object]:
    output_dir: Path = args.output_dir
    if output_dir.exists() and any(output_dir.iterdir()):
        raise RuntimeError(f"Refusing to overwrite output directory: {output_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        old_cases = capture_build(
            browser,
            args.baseline_url,
            output_dir,
            candidate=False,
        )
        candidate_cases = capture_build(
            browser,
            args.candidate_url,
            output_dir,
            candidate=True,
        )
        browser.close()

    cases = {**old_cases, **candidate_cases}
    for name, case in cases.items():
        if case["text"] != FIXTURE:
            raise AssertionError(f"Unicode text changed in {name}")
        if case["vertical"] != "middle":
            raise AssertionError(f"Vertical dataset mismatch in {name}")
        if case["layoutPhase"] != "sealed":
            raise AssertionError(f"Unsealed layout in {name}")

    comparison = pixel_comparison(
        output_dir / "v1.10.2-standard-preview.png",
        output_dir / "candidate-standard-preview.png",
    )
    if not comparison["identical"]:
        raise AssertionError("极简白 standard drifted from v1.10.2")

    old = cases["v1.10.2-standard"]
    compact = cases["candidate-compact"]
    standard = cases["candidate-standard"]
    relaxed = cases["candidate-relaxed"]
    standard_geometry = compare_standard_geometry(old, standard)
    if not standard_geometry["identical"]:
        raise AssertionError(
            "极简白 standard sealed geometry/snapshot drifted from v1.10.2: "
            f"{standard_geometry}",
        )
    zero_spacing_preserved = (
        old["atomXs"] == compact["atomXs"] == standard["atomXs"]
        and old["snapshotId"] == compact["snapshotId"] == standard["snapshotId"]
    )
    relaxed_changes_geometry = (
        relaxed["atomXs"] != standard["atomXs"]
        and relaxed["snapshotId"] != standard["snapshotId"]
    )
    if not zero_spacing_preserved:
        raise AssertionError("极简白 compact/standard should preserve old zero spacing")
    if not relaxed_changes_geometry:
        raise AssertionError("极简白 relaxed did not change sealed geometry")

    manifest = {
        "theme": "极简白",
        "fixture": FIXTURE,
        "vertical": "middle",
        "baselineUrl": args.baseline_url,
        "candidateUrl": args.candidate_url,
        "cases": cases,
        "assertions": {
            "standardPreviewPixelIdenticalToV1.10.2": comparison,
            "standardGeometryAndSnapshotIdenticalToV1.10.2": (
                standard_geometry
            ),
            "compactKeepsOldZeroSpacing": zero_spacing_preserved,
            "relaxedChangesSealedGeometry": relaxed_changes_geometry,
            "negativeTrackingIntroduced": False,
        },
    }
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify v1.11.0 with the legacy 极简白 theme.",
    )
    parser.add_argument("--candidate-url", default=DEFAULT_CANDIDATE_URL)
    parser.add_argument("--baseline-url", default=DEFAULT_BASELINE_URL)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        manifest = run(args)
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    print(
        "PASS: 极简白 3 档已验证，standard sealed 几何/快照严格相等，"
        "preview 逐像素一致；"
        f" evidence={args.output_dir}; cases={len(manifest['cases'])}",
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
