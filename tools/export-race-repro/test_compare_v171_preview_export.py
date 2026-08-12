#!/usr/bin/env python3
"""Self-tests for the V1.7.1 preview/export pixel geometry gate."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


SCRIPT = Path(__file__).with_name("compare-v171-preview-export.py")
PURPLE = (138, 75, 124)


def _fixture(*, bar_top: int | None = 180, blank: bool = False) -> Image.Image:
    image = Image.new("RGB", (1080, 1800), "white")
    if blank:
        return image
    draw = ImageDraw.Draw(image)
    draw.rectangle((132, 188, 740, 214), fill=(45, 41, 43))
    draw.rectangle((96, 360, 965, 374), fill=(45, 41, 43))
    draw.rectangle((96, 410, 895, 424), fill=(45, 41, 43))
    draw.rectangle((96, 460, 930, 474), fill=(45, 41, 43))
    if bar_top is not None:
        draw.rectangle((96, bar_top, 107, bar_top + 109), fill=PURPLE)
    return image


class PreviewExportComparisonTest(unittest.TestCase):
    def _run(
        self,
        preview: Image.Image,
        exported_half: Image.Image,
        *extra: str,
    ) -> tuple[subprocess.CompletedProcess[str], dict[str, object]]:
        with tempfile.TemporaryDirectory(prefix="xhs-v171-pixel-gate-") as directory:
            root = Path(directory)
            preview_path = root / "preview.jpg"
            export_path = root / "export.png"
            preview.save(preview_path, quality=96, subsampling=0)
            exported_half.resize((2160, 3600), Image.Resampling.NEAREST).save(export_path)
            completed = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    str(preview_path),
                    str(export_path),
                    "--strict",
                    "--no-phase-correlation",
                    *extra,
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            return completed, json.loads(completed.stdout)

    def test_identical_geometry_passes_strict_gate(self) -> None:
        image = _fixture()
        completed, report = self._run(image, image, "--require-h2-bar")
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertTrue(report["comparison"]["pass"])
        self.assertEqual(
            report["comparison"]["checks"]["h2BarBoundingBox"]["maxAbsBboxDelta"],
            0,
        )

    def test_sixteen_css_pixel_h2_shift_fails_strict_gate(self) -> None:
        completed, report = self._run(
            _fixture(bar_top=180),
            _fixture(bar_top=196),
            "--require-h2-bar",
        )
        self.assertEqual(completed.returncode, 1)
        h2 = report["comparison"]["checks"]["h2BarBoundingBox"]
        self.assertFalse(h2["pass"])
        self.assertEqual(h2["deltas"]["top"], 16)
        self.assertEqual(h2["maxAbsBboxDelta"], 16)
        self.assertIn("h2BarBoundingBox", report["comparison"]["failures"])

    def test_empty_pair_never_passes(self) -> None:
        blank = _fixture(blank=True)
        completed, report = self._run(blank, blank)
        self.assertEqual(completed.returncode, 1)
        self.assertFalse(report["comparison"]["pass"])
        self.assertFalse(
            report["comparison"]["checks"]["nonEmptyContent"]["pass"]
        )

    def test_h2_is_optional_when_absent_from_both(self) -> None:
        image = _fixture(bar_top=None)
        completed, report = self._run(image, image)
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        h2 = report["comparison"]["checks"]["h2BarBoundingBox"]
        self.assertEqual(h2["status"], "absent-in-both")
        self.assertTrue(h2["pass"])


if __name__ == "__main__":
    unittest.main()
