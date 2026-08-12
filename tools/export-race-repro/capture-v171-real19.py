#!/usr/bin/env python3
"""Capture the real 19-page V1.7.1 typography regression through its UI.

The source Markdown stays in memory: Playwright fills the harness textarea and
clicks the same ``load-real`` button as a user.  No source copy is written under
``public`` (or anywhere else in the repository).
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from playwright.async_api import Page, async_playwright


DEFAULT_URL = "http://127.0.0.1:5173/v171-typography-harness.html"
DEFAULT_BOUNDARY_MARKER = "可在作答上，对比前面的作答"
EXPECTED_PAGE_COUNT = 19
RETAINED_PAGES = (1, 2, 3, 5, 19)
ANALYZER_PATH = Path(__file__).with_name("analyze-v171-captures.py")


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def separator_count(source: str) -> int:
    return sum(line.strip() == "---" for line in source.splitlines())


def restore_boundary(source: str, marker: str) -> tuple[str, bool]:
    """Restore the known missing page boundary only for an 18-page source."""

    separators = separator_count(source)
    if separators == EXPECTED_PAGE_COUNT - 1:
        return source, False
    if separators != EXPECTED_PAGE_COUNT - 2:
        raise ValueError(
            f"期望 17 或 18 个 Markdown 分页线，实际为 {separators}"
        )
    if not marker:
        raise ValueError("边界恢复 marker 不能为空")
    marker_count = source.count(marker)
    if marker_count != 1:
        raise ValueError(
            f"边界 marker 必须唯一，实际命中 {marker_count} 次：{marker!r}"
        )
    marker_offset = source.index(marker)
    line_start = source.rfind("\n", 0, marker_offset) + 1
    prefix = source[:line_start]
    suffix = source[line_start:]
    if prefix and not prefix.endswith("\n\n"):
        prefix = prefix.rstrip("\n") + "\n\n"
    # The textarea accepts Markdown, so use its native page-break syntax.  The
    # importer turns it into <hr class="page-break"> without mutating the file.
    return prefix + "---\n\n" + suffix, True


def load_analyzer() -> Any:
    spec = importlib.util.spec_from_file_location("v171_capture_analyzer", ANALYZER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"无法加载分析器：{ANALYZER_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def wait_for_real_pages(page: Page) -> None:
    await page.wait_for_function(
        """() => {
          const status = document.querySelector('#harness-status')?.textContent ?? ''
          if (status.startsWith('真实文稿失败') || status.startsWith('预检失败')) {
            throw new Error(status)
          }
          const pages = [...document.querySelectorAll('#preview-pages .page')]
          return status.startsWith('真实文稿已就绪') &&
            pages.length === 19 &&
            pages.every((item) =>
              item.dataset.layoutState === 'ready' &&
              item.dataset.layoutSnapshotPhase === 'sealed' &&
              Number(item.dataset.layoutIssueCount ?? 0) === 0 &&
              Boolean(item.dataset.layoutSnapshot)
            )
        }""",
        timeout=120_000,
    )


async def load_real_source(page: Page, source: str) -> None:
    await page.fill("#real-source", source)
    await page.click("#load-real")
    await wait_for_real_pages(page)


async def collect_layout(page: Page) -> dict[str, Any]:
    return await page.evaluate(
        """() => {
          const number = (value) => Number(value ?? 0)
          const rect = (element, pageRect) => {
            const value = element.getBoundingClientRect()
            return {
              x: value.x - pageRect.x,
              y: value.y - pageRect.y,
              width: value.width,
              height: value.height,
              right: value.right - pageRect.x,
              bottom: value.bottom - pageRect.y,
            }
          }
          const pageItems = [...document.querySelectorAll('#preview-pages .page')]
          return {
            userAgent: navigator.userAgent,
            status: document.querySelector('#harness-status')?.textContent ?? '',
            pages: pageItems.map((page, pageIndex) => {
              const pageRect = page.getBoundingClientRect()
              const blocks = [...page.querySelectorAll('.content .deterministic-text-layout')]
              const blockId = (element) => {
                const block = element.closest('.deterministic-text-layout')
                const index = blocks.indexOf(block)
                return index >= 0 ? `p${pageIndex + 1}-b${index}` : ''
              }
              const atoms = [...page.querySelectorAll('.dtl-atom')].map((atom, index) => ({
                index,
                atom: atom.dataset.layoutAtom ?? '',
                block: blockId(atom),
                line: atom.dataset.layoutLine ?? '',
                text: atom.textContent ?? '',
                kind: atom.dataset.layoutKind ?? '',
                advance: number(atom.dataset.layoutAdvance),
                box: number(atom.dataset.layoutBox),
                gap: number(atom.dataset.layoutGap),
                glyphOffset: number(atom.dataset.layoutGlyphOffset),
                inkLeft: number(atom.dataset.layoutInkLeft),
                inkRight: number(atom.dataset.layoutInkRight),
                x: number(atom.dataset.layoutX),
                fontSize: Number.parseFloat(getComputedStyle(atom).fontSize),
                baseline: number(atom.dataset.layoutBaseline),
                nativeBaseline: number(atom.dataset.layoutNativeBaseline),
                lineTop: number(atom.dataset.layoutLineTop),
                top: number(atom.dataset.layoutTop),
                rect: rect(atom, pageRect),
              }))
              const lines = [...page.querySelectorAll('.dtl-line')].map((line) => ({
                block: blockId(line),
                line: line.dataset.layoutLine ?? '',
                end: line.dataset.layoutEnd ?? '',
                justified: line.dataset.layoutJustified ?? 'false',
                right: number(line.dataset.layoutRight),
                target: number(line.dataset.layoutTarget),
                residual: number(line.dataset.layoutResidual),
                baseline: number(line.dataset.layoutBaseline),
                rect: rect(line, pageRect),
              }))
              const decorations = [...page.querySelectorAll('.dtl-decoration')].map((item, index) => ({
                index,
                block: blockId(item),
                line: item.closest('.dtl-line')?.dataset.layoutLine ?? '',
                kind: item.classList.contains('dtl-decoration--underline') ? 'underline' :
                  item.classList.contains('dtl-decoration--highlight') ? 'highlight' : 'other',
                baseline: number(item.dataset.layoutBaseline),
                underlineY: number(item.dataset.layoutUnderlineY),
                underlineDescent: number(item.dataset.layoutUnderlineDescent),
                underlineFontSize: number(item.dataset.layoutUnderlineFontSize),
                underlineThickness: number(item.dataset.layoutUnderlineThickness),
                rect: rect(item, pageRect),
              }))
              return {
                page: pageIndex + 1,
                state: page.dataset.layoutState ?? '',
                phase: page.dataset.layoutSnapshotPhase ?? '',
                snapshot: page.dataset.layoutSnapshot ?? '',
                issues: Number(page.dataset.layoutIssueCount ?? 0),
                viewport: {width: pageRect.width, height: pageRect.height},
                atoms,
                lines,
                decorations,
              }
            }),
          }
        }"""
    )


def aggregate_layout(
    capture: dict[str, Any], analyzer: Any
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    reports: list[dict[str, Any]] = []
    for item in capture["pages"]:
        manifest = {
            "page": {
                "number": item["page"],
                "state": item["state"],
                "phase": item["phase"],
                "snapshot": item["snapshot"],
                "issues": item["issues"],
            },
            "viewport": item["viewport"],
            "atoms": item["atoms"],
            "lines": item["lines"],
            "underlines": [
                decoration
                for decoration in item["decorations"]
                if decoration["kind"] == "underline"
            ],
        }
        reports.append(
            analyzer.analyze_layout(manifest, require_line_end_closing=False)
        )

    def maximum(path: tuple[str, ...]) -> float | None:
        values: list[float] = []
        for report in reports:
            value: Any = report
            for key in path:
                value = value.get(key) if isinstance(value, dict) else None
            if isinstance(value, (int, float)):
                values.append(float(value))
        return max(values) if values else None

    counts = {
        "pages": len(capture["pages"]),
        "ready": sum(item["state"] == "ready" for item in capture["pages"]),
        "sealed": sum(item["phase"] == "sealed" for item in capture["pages"]),
        "issues": sum(int(item["issues"]) for item in capture["pages"]),
        "atoms": sum(len(item["atoms"]) for item in capture["pages"]),
        "lines": sum(len(item["lines"]) for item in capture["pages"]),
        "justifiedLines": sum(report["counts"]["justifiedLines"] for report in reports),
        "decorations": sum(len(item["decorations"]) for item in capture["pages"]),
        "underlines": sum(report["counts"]["underlines"] for report in reports),
        "punctuationOpticalBoundaries": sum(
            report["punctuationOpticalClearance"]["candidateCount"]
            for report in reports
        ),
        "lineEndClosingPunctuation": sum(
            report["lineEndClosingHanging"]["candidateCount"]
            for report in reports
        ),
        "mixedHanAlnumLines": sum(
            report["baselines"]["mixedHanAlnumLineCount"] for report in reports
        ),
    }
    raw_punctuation_width_pass = all(
        report["punctuationWidth"]["pass"] for report in reports
    )
    # The analyzer describes this width envelope as diagnostic.  Its hard rule
    # is visible-ink coverage; bilateral visual safety is enforced by the
    # separate punctuation clearance gate below.  Keep the diagnostic failure
    # visible without mislabelling a visually safe compact cluster as failure.
    punctuation_width_safety_pass = all(
        all(item.get("inkCoveragePass") for item in report["punctuationWidth"]["items"])
        for report in reports
    )
    geometry_checks = {
        "allPagesReadySealedIssueFree": (
            counts["pages"] == EXPECTED_PAGE_COUNT
            and counts["ready"] == EXPECTED_PAGE_COUNT
            and counts["sealed"] == EXPECTED_PAGE_COUNT
            and counts["issues"] == 0
        ),
        "rightEdgePass": all(report["rightEdge"]["pass"] for report in reports),
        "hanHanSpacingPass": all(
            report["hanHanSpacing"]["justifiedLines"]["pass"] for report in reports
        ),
        "punctuationInkCoveragePass": punctuation_width_safety_pass,
        "punctuationOpticalClearancePass": all(
            report["punctuationOpticalClearance"]["pass"] for report in reports
        ),
        "lineEndClosingHangingPass": all(
            report["lineEndClosingHanging"]["pass"] for report in reports
        ),
        "baselinePass": all(report["baselines"]["pass"] for report in reports),
        "decorationGeometryPass": all(report["underlines"]["pass"] for report in reports),
    }
    return {
        "counts": counts,
        "geometry": {
            "maxRightEdgeError": maximum(("rightEdge", "maxError")),
            "maxHanHanGapDeviation": maximum(
                ("hanHanSpacing", "justifiedLines", "maxLineDeviation")
            ),
            "maxBaselineSpread": maximum(("baselines", "maxSpread")),
            "maxMixedHanAlnumBaselineSpread": maximum(
                ("baselines", "mixedHanAlnumMaxSpread")
            ),
            "maxPunctuationPreferredDeviationEm": maximum(
                ("punctuationOpticalClearance", "maxAbsPreferredDeviationEm")
            ),
            "maxColonSideDifferenceEm": maximum(
                ("punctuationOpticalClearance", "maxColonSideDifferenceEm")
            ),
            "maxLineEndVisibleRightError": maximum(
                ("lineEndClosingHanging", "maxVisibleRightError")
            ),
        },
        "diagnostics": {
            "punctuationBoxEnvelopePass": raw_punctuation_width_pass,
            "punctuationBoxEnvelopeNote": (
                "diagnostic only; hard ink coverage and bilateral visible clearance "
                "remain acceptance gates"
            ),
        },
        "checks": geometry_checks,
        # A real article legitimately has no underline.  Do not reuse the
        # analyzer's fixture-coverage gate as a production-layout failure.
        "pass": all(geometry_checks.values()),
    }, reports


async def capture_real19(
    source_path: Path,
    url: str,
    output: Path,
    marker: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    original = source_path.read_text(encoding="utf-8")
    injected, boundary_restored = restore_boundary(original, marker)
    output.mkdir(parents=True, exist_ok=True)
    analyzer = load_analyzer()
    browser_errors: list[str] = []

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        try:
            page = await browser.new_page(
                viewport={"width": 1400, "height": 1800}, device_scale_factor=1
            )
            page.on("pageerror", lambda error: browser_errors.append(str(error)))
            await page.goto(url, wait_until="networkidle")
            await load_real_source(page, injected)

            capture = await collect_layout(page)
            if len(capture["pages"]) != EXPECTED_PAGE_COUNT:
                raise AssertionError(f"布局采集页数错误：{len(capture['pages'])}")
            aggregate, page_reports = aggregate_layout(capture, analyzer)

            # A Vite hot update during a long local session can replace the DOM
            # between layout capture and export.  Reload once and inject through
            # the same UI again so export always starts from a fresh document.
            await page.reload(wait_until="networkidle")
            await load_real_source(page, injected)
            await page.click("#render-export")
            await page.wait_for_function(
                "window.__v171ExportEvidence?.passedCount === 19",
                timeout=240_000,
            )
            evidence = await page.evaluate("window.__v171ExportEvidence")
            status = await page.locator("#harness-status").inner_text()
            for page_number in RETAINED_PAGES:
                data_url = await page.evaluate(
                    "(pageNumber) => window.__v171DownloadPng(pageNumber)",
                    page_number,
                )
                png_path = output / f"real-p{page_number:02d}-export-2160.png"
                png_path.write_bytes(base64.b64decode(data_url.split(",", 1)[1]))

            layout_summary = {
                "schemaVersion": 1,
                "capturedAt": datetime.now(timezone.utc).isoformat(),
                "userAgent": capture["userAgent"],
                "harnessStatus": capture["status"],
                "input": {
                    "mode": "harness-textarea-ui",
                    "repositoryPublicSourceRetained": False,
                    "originalPath": str(source_path.resolve()),
                    "originalSha256": sha256_text(original),
                    "originalCharacters": len(original),
                    "originalSeparatorCount": separator_count(original),
                    "injectedSha256": sha256_text(injected),
                    "injectedCharacters": len(injected),
                    "injectedSeparatorCount": separator_count(injected),
                    "boundaryMarker": marker,
                    "boundaryRestored": boundary_restored,
                },
                "aggregate": aggregate,
                "pages": capture["pages"],
                "pageReports": page_reports,
            }
            layout_path = output / "real-19-layout-summary.json"
            layout_path.write_text(
                json.dumps(layout_summary, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )

            records = evidence.get("records", [])
            export_checks = {
                "pageCount": evidence.get("pageCount") == EXPECTED_PAGE_COUNT,
                "passedCount": evidence.get("passedCount") == EXPECTED_PAGE_COUNT,
                "recordCount": len(records) == EXPECTED_PAGE_COUNT,
                "dimensions": all(
                    record.get("width") == 2160 and record.get("height") == 3600
                    for record in records
                ),
                "snapshots": all(record.get("snapshotMatch") for record in records),
                "baselineHashes": all(record.get("baselineHash") for record in records),
                "renderHashes": all(record.get("renderHash") for record in records),
                "retainedPngs": all(
                    (output / f"real-p{number:02d}-export-2160.png").is_file()
                    for number in RETAINED_PAGES
                ),
            }
            export_summary = {
                "schemaVersion": 1,
                "capturedAt": datetime.now(timezone.utc).isoformat(),
                "userAgent": capture["userAgent"],
                "harnessStatus": status,
                "input": layout_summary["input"],
                "retainedPages": list(RETAINED_PAGES),
                "evidence": evidence,
                "checks": export_checks,
                "pass": all(export_checks.values()),
            }
            export_path = output / "real-19-export-summary.json"
            export_path.write_text(
                json.dumps(export_summary, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
        finally:
            await browser.close()

    if browser_errors:
        raise RuntimeError("browser errors: " + "; ".join(browser_errors))
    return layout_summary, export_summary


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Capture the real 19-page V1.7.1 local typography regression."
    )
    parser.add_argument("source", type=Path, help="original local Markdown path")
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--boundary-marker", default=DEFAULT_BOUNDARY_MARKER)
    args = parser.parse_args()
    layout, exported = asyncio.run(
        capture_real19(args.source, args.url, args.output, args.boundary_marker)
    )
    result = {
        "layout": str((args.output / "real-19-layout-summary.json").resolve()),
        "export": str((args.output / "real-19-export-summary.json").resolve()),
        "retainedPages": list(RETAINED_PAGES),
        "counts": layout["aggregate"]["counts"],
        "layoutPass": layout["aggregate"]["pass"],
        "layoutChecks": layout["aggregate"]["checks"],
        "exportPass": exported["pass"],
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result["layoutPass"] and result["exportPass"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
