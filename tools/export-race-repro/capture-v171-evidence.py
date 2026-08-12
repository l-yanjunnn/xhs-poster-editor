#!/usr/bin/env python3
"""Capture the local V1.7.1 preview, layout manifest and native PNG."""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
from pathlib import Path
from typing import Any

from playwright.async_api import async_playwright


DEFAULT_URL = "http://127.0.0.1:5173/v171-typography-harness.html"


async def capture(
    url: str,
    page_number: int,
    output: Path,
) -> dict[str, Any]:
    output.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        errors: list[str] = []
        try:
            preview = await browser.new_page(
                viewport={"width": 1080, "height": 1800},
                device_scale_factor=1,
            )
            preview.on("pageerror", lambda error: errors.append(str(error)))
            await preview.goto(
                f"{url}?capture=preview&page={page_number}",
                wait_until="networkidle",
            )
            await preview.wait_for_function(
                "document.querySelector('#harness-status')?.textContent?.startsWith('已就绪')",
                timeout=30_000,
            )
            preview_path = output / f"minimal-p{page_number:02d}-preview-1080.png"
            await preview.screenshot(path=str(preview_path))
            manifest = await preview.evaluate(
                """() => {
                  const number = (value) => Number(value ?? 0)
                  const page = document.querySelector('.page')
                  const pageRect = page.getBoundingClientRect()
                  const rect = (element) => {
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
                  const blockId = (element) =>
                    element.closest('p,h1,h2,h3')?.dataset.layoutSnapshot ?? ''
                  const atoms = [...page.querySelectorAll('.dtl-atom')].map(
                    (atom, index) => ({
                      index,
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
                      top: number(atom.dataset.layoutTop),
                      rect: rect(atom),
                    }),
                  )
                  const lines = [...page.querySelectorAll('.dtl-line')].map(
                    (line) => ({
                      block: blockId(line),
                      line: line.dataset.layoutLine ?? '',
                      end: line.dataset.layoutEnd ?? '',
                      justified: line.dataset.layoutJustified ?? 'false',
                      right: number(line.dataset.layoutRight),
                      target: number(line.dataset.layoutTarget),
                      residual: number(line.dataset.layoutResidual),
                      rect: rect(line),
                    }),
                  )
                  const underlines = [
                    ...page.querySelectorAll('.dtl-decoration--underline'),
                  ].map((underline, index) => ({
                    index,
                    block: blockId(underline),
                    line: underline.dataset.layoutLine ?? '',
                    rect: rect(underline),
                  }))
                  return {
                    atoms,
                    lines,
                    page: {
                      state: page.dataset.layoutState ?? '',
                      phase:
                        page.dataset.layoutSnapshotPhase ?? 'pending',
                      snapshot: page.dataset.layoutSnapshot ?? '',
                      issues: Number(page.dataset.layoutIssueCount ?? 0),
                    },
                    underlines,
                    viewport: { width: pageRect.width, height: pageRect.height },
                  }
                }"""
            )
            manifest_path = output / f"minimal-p{page_number:02d}-layout.json"
            manifest_path.write_text(
                json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )

            exported = await browser.new_page(
                viewport={"width": 2160, "height": 3600},
                device_scale_factor=1,
            )
            exported.on("pageerror", lambda error: errors.append(str(error)))
            await exported.goto(
                f"{url}?capture=export&page={page_number}",
                wait_until="networkidle",
            )
            await exported.wait_for_function(
                "window.__v171ExportEvidence?.passedCount === 1",
                timeout=60_000,
            )
            data_url = await exported.evaluate(
                f"window.__v171DownloadPng({page_number})"
            )
            export_path = output / f"minimal-p{page_number:02d}-export-2160.png"
            export_path.write_bytes(base64.b64decode(data_url.split(",", 1)[1]))
            evidence = await exported.evaluate("window.__v171ExportEvidence")
            evidence_path = output / f"minimal-p{page_number:02d}-export-evidence.json"
            evidence_path.write_text(
                json.dumps(evidence, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
        finally:
            await browser.close()

    if errors:
        raise RuntimeError("browser errors: " + "; ".join(errors))
    return {
        "preview": str(preview_path),
        "export": str(export_path),
        "manifest": str(manifest_path),
        "evidence": str(evidence_path),
        "snapshot": manifest["page"]["snapshot"],
        "atoms": len(manifest["atoms"]),
        "lines": len(manifest["lines"]),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default=DEFAULT_URL)
    parser.add_argument("--page", type=int, default=2)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(
        json.dumps(
            asyncio.run(
                capture(
                    args.url,
                    max(1, args.page),
                    args.output,
                )
            ),
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
