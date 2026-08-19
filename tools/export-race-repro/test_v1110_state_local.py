from __future__ import annotations

import argparse
import base64
import json
import sys
import time

from playwright.sync_api import Page, sync_playwright


DEFAULT_URL = "http://127.0.0.1:4173/"
RESULTS: list[dict[str, object]] = []
RELIABILITY_LINE_ONE = "「看起来」高分 和\u00a0「实际高分」12组"
RELIABILITY_LINE_TWO = "是两件事情"
RELIABILITY_TEXT = RELIABILITY_LINE_ONE + RELIABILITY_LINE_TWO


def record(name: str, passed: bool, **details: object) -> None:
    RESULTS.append({"name": name, "pass": passed, **details})


def page_state(page: Page) -> dict[str, object]:
    cover = page.locator(".page.page--first").first
    return cover.evaluate(
        """el => {
          const subtitle = el.querySelector('.content > h1:first-of-type + p');
          const atoms = subtitle ? [...subtitle.querySelectorAll('.dtl-atom')] : [];
          return {
            spacing: el.dataset.coverSubtitleSpacing || null,
            vertical: el.dataset.coverVertical || null,
            layoutState: el.dataset.layoutState || null,
            phase: el.dataset.layoutSnapshotPhase || null,
            snapshot: el.dataset.layoutSnapshot || null,
            issueCount: el.dataset.layoutIssueCount || null,
            subtitleText: subtitle?.textContent || null,
            sourceLetterSpacing: subtitle ? getComputedStyle(subtitle).letterSpacing : null,
            atomXs: atoms.slice(0, 6).map(a => a.dataset.layoutX || null),
            atomGaps: atoms.slice(0, 6).map(a => a.dataset.layoutGap || null),
          };
        }"""
    )


def wait_sealed(
    page: Page,
    spacing: str,
    timeout: int = 30_000,
) -> dict[str, object]:
    page.wait_for_function(
        """spacing => {
          const el = document.querySelector('.page.page--first');
          return el && el.dataset.coverSubtitleSpacing === spacing
            && ['ready','ready-with-warnings'].includes(el.dataset.layoutState || '')
            && el.dataset.layoutSnapshotPhase === 'sealed';
        }""",
        arg=spacing,
        timeout=timeout,
    )
    return page_state(page)


def spacing_group(page: Page):
    return page.get_by_role("group", name="副标题字距")


def click_spacing(page: Page, label: str, value: str) -> dict[str, object]:
    spacing_group(page).get_by_role("button", name=label, exact=True).click()
    return wait_sealed(page, value)


def click_vertical(page: Page, label: str, value: str) -> dict[str, object]:
    page.get_by_role("group", name="垂直位置").get_by_role(
        "button",
        name=label,
        exact=True,
    ).click()
    page.wait_for_function(
        """value => {
          const el = document.querySelector('.page.page--first');
          return el && el.dataset.coverVertical === value
            && ['ready','ready-with-warnings'].includes(el.dataset.layoutState || '')
            && el.dataset.layoutSnapshotPhase === 'sealed';
        }""",
        arg=value,
        timeout=30_000,
    )
    return page_state(page)


def inspector_group_count(page: Page) -> int:
    return spacing_group(page).count()


def clear_selection(page: Page) -> None:
    page.locator(".ProseMirror").click(position={"x": 8, "y": 8})
    page.keyboard.press("Escape")
    page.wait_for_timeout(150)


def enter_reliability_fixture(page: Page) -> dict[str, object]:
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
    page.keyboard.insert_text(RELIABILITY_LINE_ONE)
    page.keyboard.press("Shift+Enter")
    page.keyboard.insert_text(RELIABILITY_LINE_TWO)
    wait_sealed(page, "standard")
    return page.evaluate(
        """() => {
          const editor = document.querySelector(
            '.tiptap-editor .ProseMirror > h1:first-of-type + p'
          );
          const preview = document.querySelector(
            '.page.page--first .content > h1:first-of-type + p'
          );
          if (!(editor instanceof HTMLElement)
              || !(preview instanceof HTMLElement)) {
            throw new Error('Subtitle fixture targets not found');
          }
          const atoms = Array.from(
            preview.querySelectorAll(':scope > .dtl-atom')
          ).map(atom => ({
            text: atom.textContent,
            line: Number(atom.dataset.layoutLine),
          }));
          return {
            editorHtml: editor.innerHTML,
            editorBreakCount: editor.querySelectorAll('br').length,
            previewText: preview.textContent,
            previewBreakCount: preview.querySelectorAll(
              'br[data-layout-explicit-break]'
            ).length,
            atomText: atoms.map(atom => atom.text).join(''),
            atomTexts: atoms.map(atom => atom.text),
            atomLines: Array.from(new Set(atoms.map(atom => atom.line))),
          };
        }""",
    )


def run(url: str) -> None:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context(viewport={"width": 1728, "height": 1117})
        page = context.new_page()
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_selector(".ProseMirror", timeout=30_000)
        page.wait_for_function(
            "() => document.querySelector('.workspace-app')?.getAttribute('aria-busy') !== 'true'",
            timeout=30_000,
        )
        initial = wait_sealed(page, "standard")

        labels = spacing_group(page).get_by_role("button").all_text_contents()
        pressed = spacing_group(page).locator(
            'button[aria-pressed="true"]',
        ).all_text_contents()
        helper = page.get_by_text(
            "实验能力 · 只影响封面副标题",
            exact=True,
        ).count()
        record(
            "page-state-control-visible",
            labels == ["紧凑", "标准", "舒展"]
            and pressed == ["标准"]
            and helper == 1,
            labels=labels,
            pressed=pressed,
            helperCount=helper,
            initial=initial,
        )

        # Text selection should replace PageInspector and hide the page-only control.
        editor = page.locator(".ProseMirror")
        editor.locator("h1").first.click()
        page.keyboard.down("Shift")
        page.keyboard.press("ArrowRight")
        page.keyboard.press("ArrowRight")
        page.keyboard.up("Shift")
        page.wait_for_timeout(250)
        text_count = inspector_group_count(page)
        record(
            "text-selection-hides-control",
            text_count == 0,
            groupCount=text_count,
            inspectorText=page.locator(
                ".workspace-inspector-panel",
            ).inner_text()[:500],
        )
        clear_selection(page)
        page.wait_for_function(
            "() => document.querySelector('[aria-label=\"副标题字距\"]')",
        )

        # Insert an in-memory PNG through the real Asset Library UI. The browser
        # context is ephemeral, so this never writes an image to the repository.
        page.get_by_role("button", name="插入图片", exact=True).click()
        asset_dialog = page.get_by_role("dialog", name="素材库")
        asset_dialog.wait_for(timeout=10_000)
        png = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        )
        asset_dialog.locator('input[type="file"]').set_input_files(
            {
                "name": "v1110-smoke.png",
                "mimeType": "image/png",
                "buffer": png,
            },
        )
        uploaded = asset_dialog.get_by_role("img", name="v1110-smoke.png")
        uploaded.wait_for(timeout=10_000)
        uploaded.click()
        asset_dialog.wait_for(state="hidden", timeout=10_000)
        image = page.locator(".ProseMirror img[data-image-id]").last
        image.wait_for(timeout=10_000)
        image.click()
        page.wait_for_timeout(250)
        image_count = inspector_group_count(page)
        record(
            "image-selection-hides-control",
            image_count == 0,
            groupCount=image_count,
            imageAlt=image.get_attribute("alt"),
            inspectorText=page.locator(
                ".workspace-inspector-panel",
            ).inner_text()[:500],
        )
        clear_selection(page)
        page.wait_for_function(
            "() => document.querySelector('[aria-label=\"副标题字距\"]')",
        )

        # The public-exam left-stack layout has three distinct source spacings.
        page.get_by_role("button", name="主题库", exact=True).click()
        theme_dialog = page.get_by_role("dialog", name="主题")
        theme_dialog.wait_for(timeout=10_000)
        public_card = theme_dialog.locator('[data-theme-id="public-exam"]')
        if not public_card.count():
            public_card = theme_dialog.locator(
                "[data-theme-id]",
                has_text="公考·山水卷",
            ).first
        public_theme_id = public_card.get_attribute("data-theme-id")
        public_card.get_by_role("button", name="应用", exact=True).click()
        public_standard = wait_sealed(page, "standard")
        record(
            "apply-public-exam-standard",
            public_standard["spacing"] == "standard"
            and theme_dialog.is_hidden(),
            themeId=public_theme_id,
            state=public_standard,
        )

        reliability = enter_reliability_fixture(page)
        record(
            "intentional-space-nbsp-shift-enter-preserved",
            reliability["editorBreakCount"] == 1
            and reliability["previewBreakCount"] == 1
            and reliability["previewText"] == RELIABILITY_TEXT
            and reliability["atomText"] == RELIABILITY_TEXT
            and " " in reliability["atomTexts"]
            and "\u00a0" in reliability["atomTexts"]
            and len(reliability["atomLines"]) >= 2,
            expectedText=RELIABILITY_TEXT,
            state=reliability,
        )

        # Do not wait between clicks: the final relaxed transaction must win.
        group = spacing_group(page)
        group.get_by_role("button", name="紧凑", exact=True).click()
        group.get_by_role("button", name="标准", exact=True).click()
        group.get_by_role("button", name="舒展", exact=True).click()
        rapid = wait_sealed(page, "relaxed")
        rapid_pressed = spacing_group(page).locator(
            'button[aria-pressed="true"]',
        ).all_text_contents()
        record(
            "rapid-switch-latest-wins",
            rapid["spacing"] == "relaxed"
            and rapid["phase"] == "sealed"
            and rapid["layoutState"] in ("ready", "ready-with-warnings")
            and rapid_pressed == ["舒展"],
            final=rapid,
            pressed=rapid_pressed,
        )

        compact = click_spacing(page, "紧凑", "compact")
        standard = click_spacing(page, "标准", "standard")
        relaxed = click_spacing(page, "舒展", "relaxed")
        record(
            "three-spacing-dataset-and-sealed",
            all(
                state["phase"] == "sealed"
                and state["layoutState"] in ("ready", "ready-with-warnings")
                for state in (compact, standard, relaxed)
            )
            and [compact["spacing"], standard["spacing"], relaxed["spacing"]]
            == ["compact", "standard", "relaxed"]
            and len(
                {compact["snapshot"], standard["snapshot"], relaxed["snapshot"]},
            )
            == 3,
            compact=compact,
            standard=standard,
            relaxed=relaxed,
        )

        top = click_vertical(page, "上", "top")
        middle = click_vertical(page, "中", "middle")
        bottom = click_vertical(page, "下", "bottom")
        record(
            "three-vertical-positions-sealed",
            [top["vertical"], middle["vertical"], bottom["vertical"]]
            == ["top", "middle", "bottom"]
            and all(
                state["phase"] == "sealed"
                and state["layoutState"] in ("ready", "ready-with-warnings")
                for state in (top, middle, bottom)
            ),
            top=top,
            middle=middle,
            bottom=bottom,
        )

        page.locator(".topbar-save-status").filter(
            has_text="已保存",
        ).wait_for(timeout=30_000)
        saved_title = page.locator(".topbar-save-status").get_attribute("title")
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector(".ProseMirror", timeout=30_000)
        page.wait_for_function(
            "() => document.querySelector('.workspace-app')?.getAttribute('aria-busy') !== 'true'",
            timeout=30_000,
        )
        restored = wait_sealed(page, "relaxed")
        restored_pressed = spacing_group(page).locator(
            'button[aria-pressed="true"]',
        ).all_text_contents()
        record(
            "autosave-refresh-restores-relaxed",
            restored["spacing"] == "relaxed" and restored_pressed == ["舒展"],
            savedStatusTitle=saved_title,
            restored=restored,
            pressed=restored_pressed,
        )

        theme_name = f"v1110-browser-smoke-{int(time.time())}"
        page.get_by_role("button", name="主题库", exact=True).click()
        dialog = page.get_by_role("dialog", name="主题")
        dialog.wait_for(timeout=10_000)
        dialog.get_by_role("tab", name="我的", exact=True).click()
        dialog.get_by_placeholder("主题名称").fill(theme_name)
        dialog.get_by_role("button", name="保存", exact=True).click()
        card = dialog.locator(
            '[data-theme-id^="user-"]',
            has_text=theme_name,
        ).first
        card.wait_for(timeout=15_000)
        saved_theme_id = card.get_attribute("data-theme-id")
        page.keyboard.press("Escape")
        dialog.wait_for(state="hidden", timeout=10_000)
        click_spacing(page, "标准", "standard")
        page.get_by_role("button", name="主题库", exact=True).click()
        dialog = page.get_by_role("dialog", name="主题")
        dialog.get_by_role("tab", name="我的", exact=True).click()
        card = dialog.locator(f'[data-theme-id="{saved_theme_id}"]')
        card.get_by_role("button", name="应用", exact=True).click()
        theme_restored = wait_sealed(page, "relaxed")
        theme_pressed = spacing_group(page).locator(
            'button[aria-pressed="true"]',
        ).all_text_contents()
        record(
            "user-theme-restores-relaxed",
            theme_restored["spacing"] == "relaxed"
            and theme_pressed == ["舒展"],
            themeName=theme_name,
            themeId=saved_theme_id,
            restored=theme_restored,
            pressed=theme_pressed,
        )

        browser.close()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run the v1.11.0 cover subtitle spacing state smoke test.",
    )
    parser.add_argument(
        "--url",
        default=DEFAULT_URL,
        help=f"Local preview URL (default: {DEFAULT_URL})",
    )
    args = parser.parse_args()

    try:
        run(args.url)
    except Exception as exc:
        record("harness-exception", False, error=repr(exc))

    print(json.dumps(RESULTS, ensure_ascii=False, indent=2))
    return 1 if any(not result["pass"] for result in RESULTS) else 0


if __name__ == "__main__":
    sys.exit(main())
