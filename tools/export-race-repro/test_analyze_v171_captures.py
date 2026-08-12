#!/usr/bin/env python3
"""Regression tests for the V1.7.1 layout-manifest geometry gate."""

from __future__ import annotations

import contextlib
import copy
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path
from types import ModuleType


SCRIPT = Path(__file__).with_name("analyze-v171-captures.py")


def _load_analyzer() -> ModuleType:
    spec = importlib.util.spec_from_file_location("analyze_v171_captures", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load analyzer from {SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ANALYZER = _load_analyzer()


def _payload(mark: str = "：") -> dict[str, object]:
    payload = copy.deepcopy(ANALYZER._synthetic_payload())
    punctuation = next(
        atom
        for atom in payload["atoms"]
        if atom.get("kind") == "closing-punctuation" and atom.get("text") == "："
    )
    punctuation["text"] = mark
    return payload


def _clearance_check(report: dict[str, object]) -> dict[str, object]:
    return next(
        check
        for check in report["checks"]
        if check["name"] == "punctuation-visible-clearance"
    )


def _optical_atom(
    index: int,
    text: str,
    kind: str,
    *,
    leading: float,
    trailing: float,
    ink_width: float = 10,
    font_size: float = 40,
) -> dict[str, object]:
    """Build an atom whose painted outline has explicit logical clearances."""

    return {
        "block": "optics",
        "line": "0",
        "index": index,
        "kind": kind,
        "text": text,
        "x": 0,
        "gap": 0,
        "glyphOffset": leading,
        "inkLeft": 0,
        "inkRight": ink_width,
        "box": leading + ink_width + trailing,
        "advance": font_size,
        "fontSize": font_size,
        "baseline": 48,
    }


def _clearance_metric(atoms: list[dict[str, object]]) -> dict[str, object]:
    return ANALYZER._analyze_punctuation_optical_clearance(atoms, {}, 0.01)


class PunctuationOpticalClearanceTest(unittest.TestCase):
    def test_middle_punctuation_may_exceed_one_em_to_cover_measured_ink(self) -> None:
        metric = ANALYZER._analyze_punctuation(
            [
                {
                    "block": "optics",
                    "line": "0",
                    "index": 0,
                    "kind": "middle-punctuation",
                    "text": "—",
                    "box": 45.2,
                    "inkLeft": 0,
                    "inkRight": 45.2,
                    "fontSize": 40,
                },
                {
                    "block": "optics",
                    "line": "0",
                    "index": 1,
                    "kind": "middle-punctuation",
                    "text": "…",
                    "box": 45.2,
                    "inkLeft": 0,
                    "inkRight": 45.2,
                    "fontSize": 40,
                },
            ],
            0.5,
            1.0,
        )

        self.assertTrue(metric["pass"])
        self.assertEqual(metric["maxRatio"], 1.13)
        self.assertEqual(metric["middle"]["maxRatio"], 1.13)
        self.assertEqual(metric["allowedRange"]["middle"]["max"], 1.25)
        self.assertEqual(
            [(item["text"], item["widthClass"]) for item in metric["items"]],
            [("—", "middle"), ("…", "middle")],
        )

    def test_ordinary_punctuation_keeps_the_one_em_upper_bound(self) -> None:
        metric = ANALYZER._analyze_punctuation(
            [
                {
                    "block": "optics",
                    "line": "0",
                    "index": 0,
                    "kind": "closing-punctuation",
                    "text": "：",
                    "box": 45.2,
                    "inkLeft": -7,
                    "inkRight": 17,
                    "fontSize": 40,
                }
            ],
            0.5,
            1.0,
        )

        self.assertFalse(metric["pass"])
        self.assertEqual(metric["ordinary"]["maxRatio"], 1.13)
        self.assertEqual(metric["items"][0]["allowedRange"]["max"], 1.0)

    def test_small_cluster_box_passes_when_it_contains_all_ink(self) -> None:
        metric = ANALYZER._analyze_punctuation(
            [
                {
                    "block": "optics",
                    "line": "0",
                    "index": 0,
                    "kind": "opening-punctuation",
                    "text": "“",
                    "box": 13.787,
                    "inkLeft": -24.96,
                    "inkRight": 38.747,
                    "fontSize": 40,
                }
            ],
            0.3,
            1.0,
        )

        self.assertTrue(metric["pass"])
        self.assertEqual(metric["minRatio"], 0.344675)
        self.assertEqual(metric["items"][0]["inkWidth"], 13.787)
        self.assertTrue(metric["items"][0]["inkCoveragePass"])

    def test_sub_half_em_box_still_fails_if_it_hides_visible_ink(self) -> None:
        metric = ANALYZER._analyze_punctuation(
            [
                {
                    "block": "optics",
                    "line": "0",
                    "index": 0,
                    "kind": "opening-punctuation",
                    "text": "《",
                    "box": 17,
                    "inkLeft": -21.16,
                    "inkRight": 38.537,
                    "fontSize": 40,
                }
            ],
            0.4,
            1.0,
        )

        self.assertFalse(metric["pass"])
        self.assertEqual(metric["minRatio"], 0.425)
        self.assertFalse(metric["items"][0]["inkCoveragePass"])
        self.assertIn(
            "box-below-visible-ink-width", metric["items"][0]["failures"]
        )

    def test_balanced_colon_uses_visible_gaps_not_a_fixed_origin(self) -> None:
        report = ANALYZER.analyze_layout(_payload())
        metric = report["punctuationOpticalClearance"]
        colon_items = [item for item in metric["items"] if "：" in item["pair"]]

        self.assertTrue(report["pass"])
        self.assertTrue(_clearance_check(report)["pass"])
        self.assertEqual([item["visibleGapEm"] for item in colon_items], [0.24, 0.24])
        self.assertEqual(metric["maxColonSideDifferenceEm"], 0)
        colon = next(atom for atom in _payload()["atoms"] if atom.get("text") == "：")
        self.assertEqual(colon["glyphOffset"], 0.6)
        legacy = next(
            check
            for check in report["checks"]
            if check["name"] == "closing-punctuation-trim-direction"
        )
        self.assertTrue(legacy["deprecated"])
        self.assertTrue(legacy["pass"])

    def test_unbalanced_colon_fails_even_when_its_box_width_is_legal(self) -> None:
        payload = _payload()
        colon = next(atom for atom in payload["atoms"] if atom.get("text") == "：")
        colon["glyphOffset"] = -5

        report = ANALYZER.analyze_layout(payload)
        metric = report["punctuationOpticalClearance"]
        colon_items = [item for item in metric["items"] if "：" in item["pair"]]

        self.assertFalse(report["pass"])
        self.assertFalse(_clearance_check(report)["pass"])
        self.assertIn("visible-clearance-below-minimum", colon_items[0]["failures"])
        self.assertIn("visible-clearance-above-maximum", colon_items[1]["failures"])

    def test_colon_balance_gate_catches_two_individually_legal_sides(self) -> None:
        atoms = [
            _optical_atom(0, "甲", "han", leading=2, trailing=2),
            _optical_atom(1, "：", "closing-punctuation", leading=5.2, trailing=10),
            _optical_atom(2, "乙", "han", leading=2, trailing=2),
        ]
        metric = _clearance_metric(atoms)

        self.assertTrue(all(item["pass"] for item in metric["items"]))
        self.assertFalse(metric["pass"])
        self.assertEqual(metric["maxColonSideDifferenceEm"], 0.12)
        self.assertFalse(metric["colonBalances"][0]["pass"])

    def test_enumeration_comma_has_suitable_but_not_forced_symmetric_sides(self) -> None:
        atoms = [
            _optical_atom(0, "体", "han", leading=2, trailing=2),
            _optical_atom(1, "、", "closing-punctuation", leading=4.8, trailing=6.8),
            _optical_atom(2, "下", "han", leading=2, trailing=2),
        ]
        metric = _clearance_metric(atoms)

        self.assertTrue(metric["pass"])
        self.assertEqual(
            [(item["profile"], item["visibleGapEm"]) for item in metric["items"]],
            [("comma-leading", 0.17), ("comma-trailing", 0.22)],
        )

    def test_cramped_han_to_enumeration_comma_is_rejected(self) -> None:
        atoms = [
            _optical_atom(0, "体", "han", leading=2, trailing=0.5),
            _optical_atom(1, "、", "closing-punctuation", leading=2, trailing=6.8),
            _optical_atom(2, "下", "han", leading=2, trailing=2),
        ]
        metric = _clearance_metric(atoms)

        self.assertFalse(metric["pass"])
        self.assertEqual(metric["items"][0]["visibleGapEm"], 0.0625)
        self.assertIn(
            "visible-clearance-below-minimum", metric["items"][0]["failures"]
        )

    def test_double_quotes_gate_inner_and_outer_visible_clearances(self) -> None:
        atoms = [
            _optical_atom(0, "字", "han", leading=2, trailing=2),
            _optical_atom(1, "“", "opening-punctuation", leading=6.8, trailing=5.2),
            _optical_atom(2, "引", "han", leading=2, trailing=2),
            _optical_atom(3, "”", "closing-punctuation", leading=5.2, trailing=6.8),
            _optical_atom(4, "后", "han", leading=2, trailing=2),
        ]
        metric = _clearance_metric(atoms)

        self.assertTrue(metric["pass"])
        self.assertEqual(
            [(item["profile"], item["visibleGapEm"]) for item in metric["items"]],
            [
                ("quote-outer", 0.22),
                ("quote-inner", 0.18),
                ("quote-inner", 0.18),
                ("quote-outer", 0.22),
            ],
        )

    def test_each_quote_text_side_rejects_too_tight_and_too_loose(self) -> None:
        cases = [
            ("字→“", "quote-outer", 0.149, "visible-clearance-below-minimum"),
            ("字→“", "quote-outer", 0.291, "visible-clearance-above-maximum"),
            ("“→引", "quote-inner", 0.129, "visible-clearance-below-minimum"),
            ("“→引", "quote-inner", 0.251, "visible-clearance-above-maximum"),
            ("引→”", "quote-inner", 0.129, "visible-clearance-below-minimum"),
            ("引→”", "quote-inner", 0.251, "visible-clearance-above-maximum"),
            ("”→后", "quote-outer", 0.149, "visible-clearance-below-minimum"),
            ("”→后", "quote-outer", 0.291, "visible-clearance-above-maximum"),
        ]
        for pair, profile, gap_em, expected_failure in cases:
            with self.subTest(pair=pair, gap_em=gap_em):
                left_text, right_text = pair.split("→")
                left_kind = (
                    "opening-punctuation" if left_text == "“"
                    else "closing-punctuation" if left_text == "”"
                    else "han"
                )
                right_kind = (
                    "opening-punctuation" if right_text == "“"
                    else "closing-punctuation" if right_text == "”"
                    else "han"
                )
                # Keep the right atom's leading clearance at 0.05em; assign
                # the remainder to the left atom's trailing clearance.
                atoms = [
                    _optical_atom(
                        0,
                        left_text,
                        left_kind,
                        leading=2,
                        trailing=gap_em * 40 - 2,
                    ),
                    _optical_atom(
                        1,
                        right_text,
                        right_kind,
                        leading=2,
                        trailing=2,
                    ),
                ]
                metric = _clearance_metric(atoms)
                item = metric["items"][0]

                self.assertFalse(metric["pass"])
                self.assertEqual(item["pair"], pair)
                self.assertEqual(item["profile"], profile)
                self.assertEqual(item["visibleGapEm"], gap_em)
                self.assertEqual(item["failures"], [expected_failure])

    def test_consecutive_punctuation_is_one_cluster_with_one_internal_gap(self) -> None:
        atoms = [
            _optical_atom(0, "”", "closing-punctuation", leading=3.6, trailing=2),
            _optical_atom(1, "，", "closing-punctuation", leading=2, trailing=6.8),
        ]
        metric = _clearance_metric(atoms)

        self.assertTrue(metric["pass"])
        self.assertEqual(metric["clusterCount"], 1)
        self.assertEqual(metric["clusters"][0]["text"], "”，")
        self.assertEqual(metric["items"][0]["profile"], "punctuation-cluster")
        self.assertEqual(metric["items"][0]["visibleGapEm"], 0.1)

    def test_closing_to_opening_cluster_uses_its_own_profile(self) -> None:
        atoms = [
            _optical_atom(0, "归", "han", leading=2, trailing=2),
            _optical_atom(1, "：", "closing-punctuation", leading=7.6, trailing=2.4),
            _optical_atom(2, "“", "opening-punctuation", leading=2.4, trailing=3.6),
        ]
        metric = _clearance_metric(atoms)

        self.assertTrue(metric["pass"])
        self.assertEqual(
            [(item["profile"], item["visibleGapEm"]) for item in metric["items"]],
            [("colon", 0.24), ("closing-opening-cluster", 0.12)],
        )
        self.assertEqual(metric["colonBalanceCount"], 0)
        self.assertEqual(metric["clusterCount"], 1)

    def test_semantic_space_breaks_a_punctuation_cluster(self) -> None:
        atoms = [
            _optical_atom(0, "”", "closing-punctuation", leading=3.6, trailing=6.8),
            _optical_atom(1, " ", "space", leading=0, trailing=0, ink_width=10),
            _optical_atom(2, "，", "closing-punctuation", leading=4.8, trailing=6.8),
        ]
        metric = _clearance_metric(atoms)

        self.assertEqual(metric["candidateCount"], 0)
        self.assertEqual(metric["semanticSpaceBoundaryCount"], 2)
        self.assertEqual(metric["clusterCount"], 0)

    def test_missing_neighbour_ink_metrics_cannot_pass_vacuously(self) -> None:
        atoms = [
            _optical_atom(0, "字", "han", leading=2, trailing=2),
            _optical_atom(1, "：", "closing-punctuation", leading=7.6, trailing=7.6),
        ]
        del atoms[1]["inkLeft"]
        metric = _clearance_metric(atoms)

        self.assertFalse(metric["pass"])
        self.assertEqual(metric["candidateCount"], 1)
        self.assertEqual(metric["measurableCount"], 0)
        self.assertEqual(metric["items"][0]["missingFields"], ["right.inkLeft"])
        self.assertEqual(metric["items"][0]["failures"], ["missing-layout-metrics"])

    def test_line_end_hanging_allows_balanced_nonzero_glyph_offset(self) -> None:
        report = ANALYZER.analyze_layout(_payload())
        hanging = report["lineEndClosingHanging"]
        item = hanging["items"][0]

        self.assertTrue(report["pass"])
        self.assertEqual(hanging["candidateCount"], 1)
        self.assertEqual(hanging["maxAbsGlyphOffset"], 2.4)
        self.assertEqual(hanging["maxVisibleRightError"], 0)
        self.assertEqual(item["incomingVisibleGapEm"], 0.16)
        self.assertTrue(item["inkCoveragePass"])
        self.assertNotIn("line-end-glyph-origin-moved", item["failures"])

    def test_line_end_hanging_allows_sub_half_em_box_when_ink_is_complete(self) -> None:
        payload = _payload()
        closer = next(atom for atom in payload["atoms"] if atom.get("text") == "。")
        closer["box"] = 13

        report = ANALYZER.analyze_layout(payload)
        item = report["lineEndClosingHanging"]["items"][0]

        self.assertTrue(item["pass"])
        self.assertEqual(item["boxToEmRatio"], 0.325)
        self.assertTrue(item["inkCoveragePass"])
        self.assertNotIn("line-end-box-below-half-em", item["failures"])

    def test_line_end_hanging_rejects_cramped_incoming_clearance(self) -> None:
        payload = _payload()
        closer = next(atom for atom in payload["atoms"] if atom.get("text") == "。")
        origin_shift = closer["glyphOffset"] - (-2)
        closer["glyphOffset"] = -2
        closer["x"] += origin_shift

        report = ANALYZER.analyze_layout(payload)
        item = report["lineEndClosingHanging"]["items"][0]

        self.assertEqual(item["visibleRightError"], 0)
        self.assertTrue(item["inkCoveragePass"])
        self.assertIn(
            "incoming-visible-clearance-below-minimum", item["failures"]
        )

    def test_line_end_hanging_rejects_ink_cut_off_by_compact_box(self) -> None:
        payload = _payload()
        closer = next(atom for atom in payload["atoms"] if atom.get("text") == "。")
        closer["box"] = 11

        report = ANALYZER.analyze_layout(payload)
        item = report["lineEndClosingHanging"]["items"][0]

        self.assertEqual(item["visibleRightError"], 0)
        self.assertEqual(item["incomingVisibleGapEm"], 0.16)
        self.assertFalse(item["inkCoveragePass"])
        self.assertIn(
            "line-end-visible-ink-outside-logical-box", item["failures"]
        )

    def test_line_end_hanging_still_rejects_visible_right_misalignment(self) -> None:
        payload = _payload()
        closer = next(atom for atom in payload["atoms"] if atom.get("text") == "。")
        closer["x"] += 3

        report = ANALYZER.analyze_layout(payload)
        item = report["lineEndClosingHanging"]["items"][0]

        self.assertFalse(report["pass"])
        self.assertTrue(item["inkCoveragePass"])
        self.assertIn("visible-ink-right-not-aligned", item["failures"])

    def test_strict_cli_rejects_cramped_visible_clearance(self) -> None:
        payload = _payload("、")
        punctuation = next(atom for atom in payload["atoms"] if atom.get("text") == "、")
        punctuation["glyphOffset"] = -5

        with tempfile.TemporaryDirectory(prefix="xhs-v171-clearance-gate-") as directory:
            manifest = Path(directory) / "layout.json"
            manifest.write_text(
                json.dumps(payload, ensure_ascii=False), encoding="utf-8"
            )
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                return_code = ANALYZER.main(
                    [str(manifest), "--punctuation-trim-tolerance", "0.01", "--strict"]
                )

        self.assertEqual(return_code, 2)
        rendered = json.loads(output.getvalue())
        self.assertFalse(rendered["pass"])
        self.assertFalse(
            next(
                check
                for check in rendered["checks"]
                if check["name"] == "punctuation-visible-clearance"
            )["pass"]
        )


if __name__ == "__main__":
    unittest.main()
