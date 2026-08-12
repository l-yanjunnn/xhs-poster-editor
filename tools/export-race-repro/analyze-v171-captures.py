#!/usr/bin/env python3
"""Measure V1.7.1 deterministic typography manifests and optional captures.

The layout manifest is produced from the browser's materialized typography DOM.  Its
``right``, ``target``, ``gap``, ``box``, ``fontSize`` and ``baseline`` values are in
layout (CSS) units.  DOM ``rect`` values may be scaled for capture, so this analyzer
deliberately does not derive typography metrics from those rectangles.

Pillow is only required when ``--png`` is supplied.  JPEG captures are accepted as
well; the argument keeps the product-facing PNG terminology used by the harness.
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable


SCHEMA_VERSION = 1
DEFAULT_RIGHT_EDGE_TOLERANCE = 0.01
DEFAULT_GAP_DEVIATION_TOLERANCE = 0.01
DEFAULT_BASELINE_TOLERANCE = 0.01
DEFAULT_PUNCTUATION_MIN_RATIO = 0.3
DEFAULT_PUNCTUATION_MAX_RATIO = 1.0
DEFAULT_MIDDLE_PUNCTUATION_MAX_RATIO = 1.25
PUNCTUATION_INK_COVERAGE_TOLERANCE = 0.01
DEFAULT_PUNCTUATION_TRIM_TOLERANCE = 0.01
DEFAULT_REPEAT_BAND = 780
DEFAULT_REPEAT_MAE = 1.0

# The layout solver works with logical boxes, but readers see the distance
# between painted glyph outlines.  These ranges are therefore expressed in em
# and apply to the *visible* boundary gap, including both neighbouring glyphs'
# side bearings and the explicit inter-atom gap.
PUNCTUATION_CLEARANCE_PROFILES: dict[str, dict[str, float]] = {
    "colon": {"min": 0.18, "preferred": 0.24, "max": 0.32},
    "comma-leading": {"min": 0.15, "preferred": 0.18, "max": 0.28},
    "comma-trailing": {"min": 0.16, "preferred": 0.22, "max": 0.30},
    "full-stop-leading": {"min": 0.15, "preferred": 0.18, "max": 0.26},
    "full-stop-trailing": {"min": 0.18, "preferred": 0.24, "max": 0.32},
    "strong-leading": {"min": 0.15, "preferred": 0.20, "max": 0.30},
    "strong-trailing": {"min": 0.18, "preferred": 0.24, "max": 0.32},
    "quote-inner": {"min": 0.14, "preferred": 0.18, "max": 0.24},
    "quote-outer": {"min": 0.16, "preferred": 0.22, "max": 0.28},
    "closing-opening-cluster": {"min": 0.08, "preferred": 0.12, "max": 0.16},
    "punctuation-cluster": {"min": 0.06, "preferred": 0.10, "max": 0.14},
    "generic": {"min": 0.10, "preferred": 0.20, "max": 0.32},
}
COLON_BALANCE_LIMIT_EM = 0.04

OPEN_QUOTES = frozenset("“‘")
CLOSE_QUOTES = frozenset("”’")
COLON_MARKS = frozenset("：")
COMMA_MARKS = frozenset("，、")
FULL_STOP_MARKS = frozenset("。")
STRONG_MARKS = frozenset("；？！")
ORDINARY_TEXT_KINDS = frozenset({"han", "digit", "latin", "other"})
TARGET_OPTICAL_MARKS = (
    OPEN_QUOTES
    | CLOSE_QUOTES
    | COLON_MARKS
    | COMMA_MARKS
    | FULL_STOP_MARKS
    | STRONG_MARKS
)


def _number(value: Any, *, field: str) -> float:
    if isinstance(value, bool):
        raise ValueError(f"{field} must be numeric, got bool")
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field} must be numeric, got {value!r}") from exc
    if not math.isfinite(result):
        raise ValueError(f"{field} must be finite, got {value!r}")
    return result


def _optional_number(value: Any) -> float | None:
    try:
        return _number(value, field="value")
    except ValueError:
        return None


def _boolish(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "1", "yes"}:
            return True
        if lowered in {"false", "0", "no", ""}:
            return False
    if isinstance(value, (int, float)):
        return bool(value)
    return False


def _round(value: float | None, digits: int = 6) -> float | None:
    if value is None:
        return None
    rounded = round(value, digits)
    return 0.0 if rounded == 0 else rounded


def _line_key(item: dict[str, Any]) -> tuple[str, str]:
    return str(item.get("block", "")), str(item.get("line", ""))


def _line_label(key: tuple[str, str]) -> str:
    return f"{key[0]}:{key[1]}"


def _sorted_atoms(atoms: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        atoms,
        key=lambda atom: (
            _optional_number(atom.get("index"))
            if _optional_number(atom.get("index")) is not None
            else math.inf
        ),
    )


def _metric_summary(values: list[float]) -> dict[str, Any]:
    if not values:
        return {
            "count": 0,
            "min": None,
            "max": None,
            "mean": None,
            "variance": None,
            "standardDeviation": None,
        }
    return {
        "count": len(values),
        "min": _round(min(values)),
        "max": _round(max(values)),
        "mean": _round(statistics.fmean(values)),
        "variance": _round(statistics.pvariance(values)),
        "standardDeviation": _round(statistics.pstdev(values)),
    }


def _analyze_right_edges(
    lines: list[dict[str, Any]], tolerance: float, warnings: list[str]
) -> dict[str, Any]:
    measured: list[dict[str, Any]] = []
    for line in lines:
        if not _boolish(line.get("justified")):
            continue
        try:
            right = _number(line.get("right"), field="lines[].right")
            target = _number(line.get("target"), field="lines[].target")
        except ValueError as exc:
            warnings.append(str(exc))
            continue
        solver_residual = abs(_optional_number(line.get("residual")) or 0.0)
        edge_error = abs(target - right)
        effective_error = max(edge_error, solver_residual)
        measured.append(
            {
                "block": str(line.get("block", "")),
                "line": str(line.get("line", "")),
                "end": line.get("end"),
                "right": _round(right),
                "target": _round(target),
                "rightEdgeError": _round(edge_error),
                "solverResidual": _round(solver_residual),
                "effectiveError": _round(effective_error),
                "pass": effective_error <= tolerance,
            }
        )
    max_error = max((item["effectiveError"] for item in measured), default=None)
    return {
        "scope": "justified non-terminal lines only",
        "lineCount": len(measured),
        "tolerance": tolerance,
        "maxError": max_error,
        "pass": max_error is None or max_error <= tolerance,
        "lines": measured,
    }


def _gap_line_metric(
    key: tuple[str, str], atoms: list[dict[str, Any]], justified: bool
) -> dict[str, Any] | None:
    gaps: list[float] = []
    ordered = _sorted_atoms(atoms)
    for current, following in zip(ordered, ordered[1:]):
        if current.get("kind") != "han" or following.get("kind") != "han":
            continue
        gap = _optional_number(current.get("gap"))
        if gap is not None:
            gaps.append(gap)
    if not gaps:
        return None
    mean = statistics.fmean(gaps)
    maximum_deviation = max(abs(gap - mean) for gap in gaps)
    return {
        "block": key[0],
        "line": key[1],
        "justified": justified,
        **_metric_summary(gaps),
        "maxDeviationFromLineMean": _round(maximum_deviation),
    }


def _summarize_gap_lines(
    lines: list[dict[str, Any]], tolerance: float
) -> dict[str, Any]:
    pair_count = sum(int(line["count"]) for line in lines)
    max_variance = max((float(line["variance"]) for line in lines), default=None)
    max_deviation = max(
        (float(line["maxDeviationFromLineMean"]) for line in lines), default=None
    )
    return {
        "lineCount": len(lines),
        "pairCount": pair_count,
        "maxLineVariance": _round(max_variance),
        "maxLineDeviation": _round(max_deviation),
        "tolerance": tolerance,
        "pass": max_deviation is None or max_deviation <= tolerance,
    }


def _analyze_han_gaps(
    atoms: list[dict[str, Any]],
    line_metadata: dict[tuple[str, str], dict[str, Any]],
    tolerance: float,
) -> dict[str, Any]:
    atom_groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for atom in atoms:
        atom_groups[_line_key(atom)].append(atom)

    line_results: list[dict[str, Any]] = []
    for key, grouped_atoms in atom_groups.items():
        metric = _gap_line_metric(
            key,
            grouped_atoms,
            _boolish(line_metadata.get(key, {}).get("justified")),
        )
        if metric is not None:
            line_results.append(metric)
    line_results.sort(key=lambda item: (item["block"], item["line"]))
    justified = [line for line in line_results if line["justified"]]
    return {
        "definition": "outgoing gap on adjacent Han-to-Han atom pairs, evaluated per line",
        "allLines": _summarize_gap_lines(line_results, tolerance),
        "justifiedLines": _summarize_gap_lines(justified, tolerance),
        "lines": line_results,
    }


def _analyze_punctuation(
    atoms: list[dict[str, Any]], minimum_ratio: float, maximum_ratio: float
) -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    ratios: list[float] = []
    ordinary_ratios: list[float] = []
    middle_ratios: list[float] = []
    for atom in atoms:
        kind = str(atom.get("kind", ""))
        if "punctuation" not in kind:
            continue
        box = _optional_number(atom.get("box"))
        font_size = _optional_number(atom.get("fontSize"))
        if box is None or font_size is None or font_size <= 0:
            continue
        ink_left = _optional_number(atom.get("inkLeft"))
        ink_right = _optional_number(atom.get("inkRight"))
        ratio = box / font_size
        ratios.append(ratio)
        is_middle = kind == "middle-punctuation"
        allowed_maximum = (
            max(maximum_ratio, DEFAULT_MIDDLE_PUNCTUATION_MAX_RATIO)
            if is_middle
            else maximum_ratio
        )
        (middle_ratios if is_middle else ordinary_ratios).append(ratio)
        failures: list[str] = []
        if ratio < minimum_ratio:
            failures.append("box-ratio-below-diagnostic-minimum")
        if ratio > allowed_maximum:
            failures.append("box-ratio-above-diagnostic-maximum")
        ink_width = (
            max(0.0, ink_left + ink_right)
            if ink_left is not None and ink_right is not None
            else None
        )
        if ink_width is None:
            failures.append("missing-ink-metrics")
        elif box + PUNCTUATION_INK_COVERAGE_TOLERANCE < ink_width:
            failures.append("box-below-visible-ink-width")
        items.append(
            {
                "block": str(atom.get("block", "")),
                "line": str(atom.get("line", "")),
                "index": atom.get("index"),
                "text": atom.get("text"),
                "kind": kind,
                "box": _round(box),
                "fontSize": _round(font_size),
                "boxToEmRatio": _round(ratio),
                "inkLeft": _round(ink_left),
                "inkRight": _round(ink_right),
                "inkWidth": _round(ink_width),
                "inkToEmRatio": _round(
                    ink_width / font_size if ink_width is not None else None
                ),
                "inkCoveragePass": (
                    ink_width is not None
                    and box + PUNCTUATION_INK_COVERAGE_TOLERANCE >= ink_width
                ),
                "widthClass": "middle" if is_middle else "ordinary",
                "allowedRange": {
                    "min": minimum_ratio,
                    "max": allowed_maximum,
                },
                "failures": failures,
                "pass": not failures,
            }
        )
    summary = _metric_summary(ratios)
    ordinary_summary = _metric_summary(ordinary_ratios)
    middle_summary = _metric_summary(middle_ratios)
    passes = all(item["pass"] for item in items)
    return {
        "definition": (
            "diagnostic logical-box envelope plus hard visible-ink coverage; "
            "the authoritative spacing gate is punctuationOpticalClearance, "
            "and middle punctuation may exceed 1em when measured ink requires it"
        ),
        "hardSafetyRule": (
            "box >= max(0, inkLeft + inkRight); adjacent visible corridors are "
            "validated separately by punctuationOpticalClearance"
        ),
        "diagnosticNote": (
            "boxToEmRatio is not a visual-safety minimum: compact punctuation "
            "clusters may use a small logical box when ink coverage and every "
            "adjacent visible-clearance corridor pass"
        ),
        "inkCoverageTolerance": PUNCTUATION_INK_COVERAGE_TOLERANCE,
        "allowedRange": {
            "ordinary": {"min": minimum_ratio, "max": maximum_ratio},
            "middle": {
                "min": minimum_ratio,
                "max": max(maximum_ratio, DEFAULT_MIDDLE_PUNCTUATION_MAX_RATIO),
            },
        },
        "count": len(items),
        "minRatio": summary["min"],
        "maxRatio": summary["max"],
        "ordinary": {
            "count": ordinary_summary["count"],
            "minRatio": ordinary_summary["min"],
            "maxRatio": ordinary_summary["max"],
        },
        "middle": {
            "count": middle_summary["count"],
            "minRatio": middle_summary["min"],
            "maxRatio": middle_summary["max"],
        },
        "pass": passes,
        "items": items,
    }


def _is_punctuation_atom(atom: dict[str, Any]) -> bool:
    return (
        "punctuation" in str(atom.get("kind", ""))
        or str(atom.get("text", "")) in TARGET_OPTICAL_MARKS
    )


def _is_target_optical_atom(atom: dict[str, Any]) -> bool:
    return str(atom.get("text", "")) in TARGET_OPTICAL_MARKS


def _clearance_profile_name(
    left: dict[str, Any], right: dict[str, Any]
) -> str:
    left_text = str(left.get("text", ""))
    right_text = str(right.get("text", ""))
    left_punctuation = _is_punctuation_atom(left)
    right_punctuation = _is_punctuation_atom(right)
    if left_punctuation and right_punctuation:
        if (
            left.get("kind") == "closing-punctuation"
            and right.get("kind") == "opening-punctuation"
        ):
            return "closing-opening-cluster"
        return "punctuation-cluster"
    if left_text in OPEN_QUOTES or right_text in CLOSE_QUOTES:
        return "quote-inner"
    if left_text in CLOSE_QUOTES or right_text in OPEN_QUOTES:
        return "quote-outer"
    mark = left_text if left_punctuation else right_text
    trailing = left_punctuation
    if mark in COLON_MARKS:
        return "colon"
    if mark in COMMA_MARKS:
        return "comma-trailing" if trailing else "comma-leading"
    if mark in FULL_STOP_MARKS:
        return "full-stop-trailing" if trailing else "full-stop-leading"
    if mark in STRONG_MARKS:
        return "strong-trailing" if trailing else "strong-leading"
    return "generic"


def _aliased_number(
    atom: dict[str, Any], aliases: tuple[str, ...]
) -> float | None:
    return next(
        (
            parsed
            for alias in aliases
            if (parsed := _optional_number(atom.get(alias))) is not None
        ),
        None,
    )


def _visible_boundary_gap(
    left: dict[str, Any], right: dict[str, Any]
) -> tuple[dict[str, float], list[str]]:
    fields = {
        "left.box": (left, ("box", "boxWidth")),
        "left.glyphOffset": (left, ("glyphOffset",)),
        "left.inkRight": (left, ("inkRight",)),
        "left.gap": (left, ("gap", "gapAfter")),
        "left.fontSize": (left, ("fontSize", "em")),
        "right.glyphOffset": (right, ("glyphOffset",)),
        "right.inkLeft": (right, ("inkLeft",)),
        "right.fontSize": (right, ("fontSize", "em")),
    }
    values: dict[str, float] = {}
    missing: list[str] = []
    for name, (source, aliases) in fields.items():
        value = _aliased_number(source, aliases)
        if value is None:
            missing.append(name)
        else:
            values[name] = value
    if missing:
        return values, missing

    punctuation_sizes = [
        values["left.fontSize"]
        for atom in (left,)
        if _is_punctuation_atom(atom)
    ] + [
        values["right.fontSize"]
        for atom in (right,)
        if _is_punctuation_atom(atom)
    ]
    em = min(punctuation_sizes) if punctuation_sizes else min(
        values["left.fontSize"], values["right.fontSize"]
    )
    if em <= 0:
        return values, ["fontSize-positive"]
    trailing = (
        values["left.box"]
        - values["left.glyphOffset"]
        - values["left.inkRight"]
    )
    leading = values["right.glyphOffset"] - values["right.inkLeft"]
    gap = trailing + values["left.gap"] + leading
    values.update(
        {
            "em": em,
            "leftTrailingClearance": trailing,
            "rightLeadingClearance": leading,
            "visibleGap": gap,
            "visibleGapEm": gap / em,
        }
    )
    return values, []


def _punctuation_clusters(
    atom_groups: dict[tuple[str, str], list[dict[str, Any]]]
) -> list[dict[str, Any]]:
    clusters: list[dict[str, Any]] = []
    for key, grouped_atoms in atom_groups.items():
        ordered = _sorted_atoms(grouped_atoms)
        start = 0
        while start < len(ordered):
            if not _is_punctuation_atom(ordered[start]):
                start += 1
                continue
            end = start + 1
            while end < len(ordered) and _is_punctuation_atom(ordered[end]):
                end += 1
            members = ordered[start:end]
            if len(members) >= 2 and any(_is_target_optical_atom(atom) for atom in members):
                clusters.append(
                    {
                        "block": key[0],
                        "line": key[1],
                        "text": "".join(str(atom.get("text", "")) for atom in members),
                        "size": len(members),
                        "indexes": [atom.get("index") for atom in members],
                    }
                )
            start = end
    return clusters


def _analyze_punctuation_optical_clearance(
    atoms: list[dict[str, Any]],
    line_metadata: dict[tuple[str, str], dict[str, Any]],
    tolerance: float,
) -> dict[str, Any]:
    """Measure both sides of punctuation from neighbouring visible ink edges.

    For adjacent atoms A and B, the visible gap is
    ``A.box - A.glyphOffset - A.inkRight + A.gap +
    B.glyphOffset - B.inkLeft``.  This deliberately permits a punctuation
    glyph to move inside its box: only the reader-visible result is gated.
    """

    del line_metadata  # Line membership is already encoded on every atom.
    atom_groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for atom in atoms:
        atom_groups[_line_key(atom)].append(atom)

    items: list[dict[str, Any]] = []
    skipped_semantic_spaces = 0
    for key, grouped_atoms in atom_groups.items():
        ordered = _sorted_atoms(grouped_atoms)
        for left, right in zip(ordered, ordered[1:]):
            if not (_is_target_optical_atom(left) or _is_target_optical_atom(right)):
                continue
            if (
                str(left.get("text", "")) == ""
                or str(right.get("text", "")) == ""
            ):
                continue
            if left.get("kind") == "space" or right.get("kind") == "space":
                skipped_semantic_spaces += 1
                continue
            profile_name = _clearance_profile_name(left, right)
            profile = PUNCTUATION_CLEARANCE_PROFILES[profile_name]
            values, missing = _visible_boundary_gap(left, right)
            result: dict[str, Any] = {
                "block": key[0],
                "line": key[1],
                "left": {
                    "index": left.get("index"),
                    "text": left.get("text"),
                    "kind": left.get("kind"),
                },
                "right": {
                    "index": right.get("index"),
                    "text": right.get("text"),
                    "kind": right.get("kind"),
                },
                "pair": f'{left.get("text", "")}→{right.get("text", "")}',
                "profile": profile_name,
                "allowedRangeEm": {
                    "min": profile["min"],
                    "preferred": profile["preferred"],
                    "max": profile["max"],
                },
                "missingFields": missing,
            }
            if missing:
                result.update(
                    {
                        "metricsComplete": False,
                        "failures": ["missing-layout-metrics"],
                        "pass": False,
                    }
                )
                items.append(result)
                continue

            gap_em = values["visibleGapEm"]
            failures: list[str] = []
            if gap_em < profile["min"] - tolerance:
                failures.append("visible-clearance-below-minimum")
            if gap_em > profile["max"] + tolerance:
                failures.append("visible-clearance-above-maximum")
            coordinate_gap = None
            left_x = _optional_number(left.get("x"))
            right_x = _optional_number(right.get("x"))
            if left_x is not None and right_x is not None:
                coordinate_gap = (
                    right_x
                    + values["right.glyphOffset"]
                    - values["right.inkLeft"]
                    - (
                        left_x
                        + values["left.glyphOffset"]
                        + values["left.inkRight"]
                    )
                )
            result.update(
                {
                    "metricsComplete": True,
                    "em": _round(values["em"]),
                    "leftTrailingClearance": _round(
                        values["leftTrailingClearance"]
                    ),
                    "interAtomGap": _round(values["left.gap"]),
                    "rightLeadingClearance": _round(
                        values["rightLeadingClearance"]
                    ),
                    "visibleGap": _round(values["visibleGap"]),
                    "visibleGapEm": _round(gap_em),
                    "coordinateVisibleGap": _round(coordinate_gap),
                    "deviationFromPreferredEm": _round(
                        gap_em - profile["preferred"]
                    ),
                    "failures": failures,
                    "pass": not failures,
                }
            )
            items.append(result)

    measurable = [item for item in items if item.get("metricsComplete")]
    gaps = [float(item["visibleGapEm"]) for item in measurable]
    target_deviations = [
        abs(float(item["deviationFromPreferredEm"])) for item in measurable
    ]
    colon_sides: dict[tuple[str, str, str], dict[str, dict[str, Any]]] = defaultdict(dict)
    for item in measurable:
        left = item["left"]
        right = item["right"]
        if (
            str(right.get("text", "")) in COLON_MARKS
            and str(left.get("kind", "")) in ORDINARY_TEXT_KINDS
        ):
            colon_sides[(item["block"], item["line"], str(right.get("index")))][
                "leading"
            ] = item
        if (
            str(left.get("text", "")) in COLON_MARKS
            and str(right.get("kind", "")) in ORDINARY_TEXT_KINDS
        ):
            colon_sides[(item["block"], item["line"], str(left.get("index")))][
                "trailing"
            ] = item
    colon_balances: list[dict[str, Any]] = []
    for key, sides in colon_sides.items():
        if "leading" not in sides or "trailing" not in sides:
            continue
        leading = float(sides["leading"]["visibleGapEm"])
        trailing = float(sides["trailing"]["visibleGapEm"])
        difference = abs(leading - trailing)
        colon_balances.append(
            {
                "block": key[0],
                "line": key[1],
                "index": key[2],
                "leadingGapEm": _round(leading),
                "trailingGapEm": _round(trailing),
                "absoluteDifferenceEm": _round(difference),
                "limitEm": COLON_BALANCE_LIMIT_EM,
                "pass": difference <= COLON_BALANCE_LIMIT_EM + tolerance,
            }
        )

    clusters = _punctuation_clusters(atom_groups)
    return {
        "definition": (
            "reader-visible clearance between adjacent glyph ink edges; "
            "punctuation placement may adjust both logical side bearings"
        ),
        "coordinateModel": {
            "leftTrailingClearance": "left.box - left.glyphOffset - left.inkRight",
            "rightLeadingClearance": "right.glyphOffset - right.inkLeft",
            "visibleGap": (
                "leftTrailingClearance + left.gap + rightLeadingClearance"
            ),
            "visibleGapEm": "visibleGap / punctuation fontSize",
        },
        "toleranceEm": tolerance,
        "profiles": PUNCTUATION_CLEARANCE_PROFILES,
        "colonBalanceLimitEm": COLON_BALANCE_LIMIT_EM,
        "candidateCount": len(items),
        "measurableCount": len(measurable),
        "semanticSpaceBoundaryCount": skipped_semantic_spaces,
        "characters": sorted(
            {
                str(atom.get("text", ""))
                for item in items
                for atom in (item["left"], item["right"])
                if str(atom.get("text", "")) in TARGET_OPTICAL_MARKS
            }
        ),
        "visibleGapEm": _metric_summary(gaps),
        "maxAbsPreferredDeviationEm": _round(
            max(target_deviations, default=None)
        ),
        "colonBalanceCount": len(colon_balances),
        "maxColonSideDifferenceEm": _round(
            max(
                (float(item["absoluteDifferenceEm"]) for item in colon_balances),
                default=None,
            )
        ),
        "colonBalances": colon_balances,
        "clusterCount": len(clusters),
        "clusters": clusters,
        "pass": (
            len(items) > 0
            and all(item["pass"] for item in items)
            and all(item["pass"] for item in colon_balances)
        ),
        "items": items,
    }


def _analyze_closing_punctuation_trim(
    atoms: list[dict[str, Any]],
    line_metadata: dict[tuple[str, str], dict[str, Any]],
    tolerance: float,
) -> dict[str, Any]:
    """Compatibility wrapper for callers of the former one-sided gate."""

    return _analyze_punctuation_optical_clearance(
        atoms, line_metadata, tolerance
    )


def _analyze_line_end_closing_hanging(
    atoms: list[dict[str, Any]],
    line_metadata: dict[tuple[str, str], dict[str, Any]],
    tolerance: float,
) -> dict[str, Any]:
    """Verify line-end closers align by visible ink, not a fixed glyph origin."""

    atom_groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for atom in atoms:
        atom_groups[_line_key(atom)].append(atom)

    items: list[dict[str, Any]] = []
    for key, line in line_metadata.items():
        if not _boolish(line.get("justified")) or line.get("end") != "wrap":
            continue
        ordered = _sorted_atoms(atom_groups.get(key, []))
        visible = [
            atom
            for atom in ordered
            if str(atom.get("text", "")) != ""
            and (_optional_number(atom.get("box")) or 0) > 0
        ]
        if not visible or visible[-1].get("kind") != "closing-punctuation":
            continue
        atom = visible[-1]
        previous = visible[-2] if len(visible) > 1 else None
        aliases = {
            "x": ("x",),
            "box": ("box", "boxWidth"),
            "glyphOffset": ("glyphOffset",),
            "inkLeft": ("inkLeft",),
            "inkRight": ("inkRight",),
            "fontSize": ("fontSize", "em"),
            "target": ("target",),
        }
        source = {**atom, "target": line.get("target")}
        values: dict[str, float] = {}
        missing: list[str] = []
        for canonical, names in aliases.items():
            value = next(
                (
                    parsed
                    for name in names
                    if (parsed := _optional_number(source.get(name))) is not None
                ),
                None,
            )
            if value is None:
                missing.append(canonical)
            else:
                values[canonical] = value
        failures: list[str] = []
        incoming_values: dict[str, float] = {}
        incoming_missing: list[str] = []
        incoming_profile_name: str | None = None
        incoming_profile: dict[str, float] | None = None
        if previous is not None:
            incoming_profile_name = _clearance_profile_name(previous, atom)
            incoming_profile = PUNCTUATION_CLEARANCE_PROFILES[
                incoming_profile_name
            ]
            incoming_values, incoming_missing = _visible_boundary_gap(
                previous, atom
            )
            missing.extend(
                f"incoming.{field}" for field in incoming_missing
            )
        ink_width: float | None = None
        ink_start: float | None = None
        ink_end: float | None = None
        ink_coverage_pass = False
        if not missing:
            # Canvas actualBoundingBoxLeft is signed, so the painted interval
            # relative to the glyph origin is [-inkLeft, inkRight].  A compact
            # hanging box is safe when it still spans that whole interval; its
            # em ratio is diagnostic, not an independent visual constraint.
            ink_width = max(0.0, values["inkLeft"] + values["inkRight"])
            ink_start = values["glyphOffset"] - values["inkLeft"]
            ink_end = values["glyphOffset"] + values["inkRight"]
            ink_coverage_pass = (
                ink_start >= -PUNCTUATION_INK_COVERAGE_TOLERANCE
                and ink_end
                <= values["box"] + PUNCTUATION_INK_COVERAGE_TOLERANCE
            )
        if missing:
            failures.append("missing-layout-metrics")
        else:
            visible_right_error = abs(
                values["target"] -
                (values["x"] + values["glyphOffset"] + values["inkRight"])
            )
            if visible_right_error > tolerance:
                failures.append("visible-ink-right-not-aligned")
            if not ink_coverage_pass:
                failures.append("line-end-visible-ink-outside-logical-box")
            if incoming_profile is not None:
                incoming_gap_em = incoming_values["visibleGapEm"]
                if incoming_gap_em < incoming_profile["min"] - tolerance:
                    failures.append("incoming-visible-clearance-below-minimum")
                if incoming_gap_em > incoming_profile["max"] + tolerance:
                    failures.append("incoming-visible-clearance-above-maximum")
        items.append(
            {
                "block": key[0],
                "line": key[1],
                "index": atom.get("index"),
                "text": atom.get("text"),
                "previous": None if previous is None else {
                    "index": previous.get("index"),
                    "text": previous.get("text"),
                    "kind": previous.get("kind"),
                },
                "missingFields": missing,
                "glyphOffset": _round(values.get("glyphOffset")),
                "incomingProfile": incoming_profile_name,
                "incomingAllowedRangeEm": incoming_profile,
                "incomingVisibleGap": _round(
                    incoming_values.get("visibleGap")
                ),
                "incomingVisibleGapEm": _round(
                    incoming_values.get("visibleGapEm")
                ),
                "boxToEmRatio": _round(
                    values["box"] / values["fontSize"]
                    if values.get("fontSize", 0) > 0 else None
                ),
                "inkWidth": _round(ink_width),
                "inkStartInBox": _round(ink_start),
                "inkEndInBox": _round(ink_end),
                "inkToEmRatio": _round(
                    ink_width / values["fontSize"]
                    if ink_width is not None and values.get("fontSize", 0) > 0
                    else None
                ),
                "inkCoverageTolerance": PUNCTUATION_INK_COVERAGE_TOLERANCE,
                "inkCoveragePass": ink_coverage_pass,
                "visibleRightError": _round(
                    abs(
                        values["target"] -
                        (values["x"] + values["glyphOffset"] + values["inkRight"])
                    )
                    if not missing else None
                ),
                "logicalOverflow": _round(
                    values["x"] + values["box"] - values["target"]
                    if not missing else None
                ),
                "failures": failures,
                "pass": not failures,
            }
        )
    return {
        "definition": (
            "justified wrap line-end closing punctuation covers its complete visible "
            "ink, preserves an acceptable incoming visible clearance, and aligns its "
            "visible ink right edge to target; logical box/em is diagnostic only"
        ),
        "hardSafetyRule": (
            "the painted interval [glyphOffset - inkLeft, glyphOffset + inkRight] "
            "must stay inside the logical box; incoming visible clearance must fit "
            "the character profile; visible ink right must align to target"
        ),
        "tolerance": tolerance,
        "candidateCount": len(items),
        "maxAbsGlyphOffset": _round(
            max((abs(float(item["glyphOffset"])) for item in items if item["glyphOffset"] is not None), default=None)
        ),
        "maxVisibleRightError": _round(
            max((float(item["visibleRightError"]) for item in items if item["visibleRightError"] is not None), default=None)
        ),
        "pass": all(item["pass"] for item in items),
        "items": items,
    }


def _baseline_line_metric(
    key: tuple[str, str], atoms: list[dict[str, Any]], justified: bool
) -> dict[str, Any] | None:
    glyphs = [
        atom
        for atom in atoms
        if atom.get("kind") != "space"
        and _optional_number(atom.get("baseline")) is not None
    ]
    if len(glyphs) < 2:
        return None
    baselines = [float(atom["baseline"]) for atom in glyphs]
    kinds = sorted({str(atom.get("kind", "")) for atom in glyphs})
    mixed_han_alnum = "han" in kinds and any(
        kind in {"digit", "latin"} for kind in kinds
    )
    return {
        "block": key[0],
        "line": key[1],
        "justified": justified,
        "glyphCount": len(glyphs),
        "kinds": kinds,
        "mixedHanAlnum": mixed_han_alnum,
        "min": _round(min(baselines)),
        "max": _round(max(baselines)),
        "spread": _round(max(baselines) - min(baselines)),
    }


def _analyze_baselines(
    atoms: list[dict[str, Any]],
    line_metadata: dict[tuple[str, str], dict[str, Any]],
    tolerance: float,
) -> dict[str, Any]:
    atom_groups: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for atom in atoms:
        atom_groups[_line_key(atom)].append(atom)
    line_results: list[dict[str, Any]] = []
    for key, grouped_atoms in atom_groups.items():
        metric = _baseline_line_metric(
            key,
            grouped_atoms,
            _boolish(line_metadata.get(key, {}).get("justified")),
        )
        if metric is not None:
            line_results.append(metric)
    line_results.sort(key=lambda item: (item["block"], item["line"]))
    mixed = [line for line in line_results if line["mixedHanAlnum"]]
    max_spread = max((float(line["spread"]) for line in line_results), default=None)
    mixed_max_spread = max((float(line["spread"]) for line in mixed), default=None)
    return {
        "definition": "max minus min stored baseline among non-space glyphs on a line",
        "lineCount": len(line_results),
        "mixedHanAlnumLineCount": len(mixed),
        "tolerance": tolerance,
        "maxSpread": _round(max_spread),
        "mixedHanAlnumMaxSpread": _round(mixed_max_spread),
        "pass": max_spread is None or max_spread <= tolerance,
        "lines": line_results,
    }


def _rect_numbers(item: dict[str, Any]) -> dict[str, float] | None:
    rect = item.get("rect")
    if not isinstance(rect, dict):
        return None
    values: dict[str, float] = {}
    for field in ("x", "y", "width", "height", "right", "bottom"):
        number = _optional_number(rect.get(field))
        if number is None:
            return None
        values[field] = number
    return values


def _infer_decoration_line(
    decoration: dict[str, Any], lines: list[dict[str, Any]]
) -> str | None:
    explicit = decoration.get("line")
    if explicit is not None and str(explicit) != "":
        return str(explicit)
    decoration_rect = _rect_numbers(decoration)
    if decoration_rect is None:
        return None
    block = str(decoration.get("block", ""))
    center_y = decoration_rect["y"] + decoration_rect["height"] / 2
    candidates: list[tuple[float, str]] = []
    for line in lines:
        if str(line.get("block", "")) != block:
            continue
        line_rect = _rect_numbers(line)
        if line_rect is None:
            continue
        if line_rect["y"] <= center_y <= line_rect["bottom"]:
            return str(line.get("line", ""))
        distance = min(
            abs(center_y - line_rect["y"]), abs(center_y - line_rect["bottom"])
        )
        candidates.append((distance, str(line.get("line", ""))))
    return min(candidates)[1] if candidates else None


def _analyze_underlines(
    underlines: list[dict[str, Any]], lines: list[dict[str, Any]]
) -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    thicknesses: list[float] = []
    widths: list[float] = []
    line_sets: dict[str, set[str]] = defaultdict(set)
    invalid_geometry_count = 0
    for underline in underlines:
        rect = _rect_numbers(underline)
        inferred_line = _infer_decoration_line(underline, lines)
        block = str(underline.get("block", ""))
        valid = rect is not None and rect["width"] > 0 and rect["height"] > 0
        if not valid:
            invalid_geometry_count += 1
        if rect is not None:
            thicknesses.append(rect["height"])
            widths.append(rect["width"])
        if inferred_line is not None:
            line_sets[block].add(inferred_line)
        items.append(
            {
                "block": block,
                "line": inferred_line,
                "index": underline.get("index"),
                "rect": {key: _round(value) for key, value in rect.items()}
                if rect is not None
                else None,
                "validGeometry": valid,
            }
        )
    block_counts = Counter(str(item.get("block", "")) for item in underlines)
    multiline_blocks = sorted(block for block, found_lines in line_sets.items() if len(found_lines) > 1)
    return {
        "count": len(underlines),
        "blockCounts": dict(sorted(block_counts.items())),
        "multiLineBlocks": multiline_blocks,
        "invalidGeometryCount": invalid_geometry_count,
        "thickness": _metric_summary(thicknesses),
        "width": _metric_summary(widths),
        "pass": invalid_geometry_count == 0,
        "items": items,
    }


def analyze_layout(
    payload: dict[str, Any],
    *,
    right_edge_tolerance: float = DEFAULT_RIGHT_EDGE_TOLERANCE,
    gap_deviation_tolerance: float = DEFAULT_GAP_DEVIATION_TOLERANCE,
    baseline_tolerance: float = DEFAULT_BASELINE_TOLERANCE,
    punctuation_min_ratio: float = DEFAULT_PUNCTUATION_MIN_RATIO,
    punctuation_max_ratio: float = DEFAULT_PUNCTUATION_MAX_RATIO,
    punctuation_trim_tolerance: float = DEFAULT_PUNCTUATION_TRIM_TOLERANCE,
    require_line_end_closing: bool = False,
) -> dict[str, Any]:
    warnings: list[str] = []
    atoms = payload.get("atoms")
    lines = payload.get("lines")
    underlines = payload.get("underlines", [])
    if not isinstance(atoms, list):
        raise ValueError("layout manifest must contain an atoms array")
    if not isinstance(lines, list):
        raise ValueError("layout manifest must contain a lines array")
    if not isinstance(underlines, list):
        raise ValueError("layout manifest underlines must be an array when present")
    if not all(isinstance(item, dict) for item in atoms + lines + underlines):
        raise ValueError("atoms, lines and underlines entries must be objects")

    line_metadata = {_line_key(line): line for line in lines}
    right_edges = _analyze_right_edges(lines, right_edge_tolerance, warnings)
    han_gaps = _analyze_han_gaps(atoms, line_metadata, gap_deviation_tolerance)
    punctuation = _analyze_punctuation(
        atoms, punctuation_min_ratio, punctuation_max_ratio
    )
    punctuation_clearance = _analyze_punctuation_optical_clearance(
        atoms, line_metadata, punctuation_trim_tolerance
    )
    line_end_closing_hanging = _analyze_line_end_closing_hanging(
        atoms, line_metadata, punctuation_trim_tolerance
    )
    baselines = _analyze_baselines(atoms, line_metadata, baseline_tolerance)
    underline_metrics = _analyze_underlines(underlines, lines)
    page = payload.get("page")
    page_ready = (
        isinstance(page, dict)
        and page.get("state") == "ready"
        and page.get("phase") == "sealed"
        and bool(page.get("snapshot"))
    )
    has_required_coverage = (
        len(atoms) > 0
        and len(lines) > 0
        and right_edges["lineCount"] > 0
        and punctuation["count"] > 0
        and punctuation_clearance["candidateCount"] > 0
        and (
            not require_line_end_closing
            or line_end_closing_hanging["candidateCount"] > 0
        )
        and baselines["mixedHanAlnumLineCount"] > 0
        and len(underlines) > 0
    )

    checks = [
        {
            "name": "sealed-ready-snapshot",
            "pass": page_ready,
            "measured": page,
            "limit": {"state": "ready", "phase": "sealed", "snapshot": "non-empty"},
        },
        {
            "name": "required-regression-coverage",
            "pass": has_required_coverage,
            "measured": {
                "atoms": len(atoms),
                "lines": len(lines),
                "justifiedLines": right_edges["lineCount"],
                "punctuation": punctuation["count"],
                "punctuationOpticalBoundaries": punctuation_clearance[
                    "candidateCount"
                ],
                # Kept for consumers of the pre-bilateral report schema.
                "interiorClosingPunctuation": punctuation_clearance[
                    "candidateCount"
                ],
                "lineEndClosingPunctuation": line_end_closing_hanging[
                    "candidateCount"
                ],
                "mixedHanAlnumLines": baselines["mixedHanAlnumLineCount"],
                "underlines": len(underlines),
            },
            "limit": (
                "all base counts > 0; line-end closing count > 0 when explicitly required"
            ),
        },
        {
            "name": "justified-right-edge",
            "pass": right_edges["pass"],
            "measured": right_edges["maxError"],
            "limit": right_edge_tolerance,
        },
        {
            "name": "han-han-gap-uniformity",
            "pass": han_gaps["justifiedLines"]["pass"],
            "measured": han_gaps["justifiedLines"]["maxLineDeviation"],
            "limit": gap_deviation_tolerance,
        },
        {
            "name": "punctuation-optical-width",
            "pass": punctuation["pass"],
            "measured": {
                "min": punctuation["minRatio"],
                "max": punctuation["maxRatio"],
                "ordinary": punctuation["ordinary"],
                "middle": punctuation["middle"],
            },
            "limit": punctuation["allowedRange"],
        },
        {
            "name": "punctuation-visible-clearance",
            "pass": punctuation_clearance["pass"],
            "measured": {
                "candidates": punctuation_clearance["candidateCount"],
                "measurable": punctuation_clearance["measurableCount"],
                "minimumVisibleGapEm": punctuation_clearance[
                    "visibleGapEm"
                ]["min"],
                "maximumVisibleGapEm": punctuation_clearance[
                    "visibleGapEm"
                ]["max"],
                "maxAbsPreferredDeviationEm": punctuation_clearance[
                    "maxAbsPreferredDeviationEm"
                ],
                "maxColonSideDifferenceEm": punctuation_clearance[
                    "maxColonSideDifferenceEm"
                ],
                "clusters": punctuation_clearance["clusterCount"],
            },
            "limit": {
                "profiles": PUNCTUATION_CLEARANCE_PROFILES,
                "colonSideDifferenceEm": COLON_BALANCE_LIMIT_EM,
                "toleranceEm": punctuation_trim_tolerance,
            },
        },
        {
            # Compatibility alias: the acceptance semantics are bilateral even
            # when an older report consumer still looks up this check name.
            "name": "closing-punctuation-trim-direction",
            "deprecated": True,
            "replacement": "punctuation-visible-clearance",
            "pass": punctuation_clearance["pass"],
            "measured": {
                "candidates": punctuation_clearance["candidateCount"],
                "measurable": punctuation_clearance["measurableCount"],
                "maxColonSideDifferenceEm": punctuation_clearance[
                    "maxColonSideDifferenceEm"
                ],
            },
            "limit": "same as punctuation-visible-clearance",
        },
        {
            "name": "line-end-closing-hanging",
            "pass": line_end_closing_hanging["pass"],
            "measured": {
                "candidates": line_end_closing_hanging["candidateCount"],
                "maxAbsGlyphOffset": line_end_closing_hanging[
                    "maxAbsGlyphOffset"
                ],
                "maxVisibleRightError": line_end_closing_hanging[
                    "maxVisibleRightError"
                ],
            },
            "limit": {
                "visibleRightError": punctuation_trim_tolerance,
                "incomingClearance": "character-specific visible-gap profile",
                "glyphOffset": "reported only; no fixed-origin requirement",
            },
        },
        {
            "name": "same-line-baseline",
            "pass": baselines["pass"],
            "measured": baselines["maxSpread"],
            "limit": baseline_tolerance,
        },
        {
            "name": "underline-positive-geometry",
            "pass": underline_metrics["pass"],
            "measured": underline_metrics["invalidGeometryCount"],
            "limit": 0,
        },
    ]
    return {
        "page": page,
        "viewport": payload.get("viewport"),
        "counts": {
            "atoms": len(atoms),
            "lines": len(lines),
            "justifiedLines": right_edges["lineCount"],
            "underlines": len(underlines),
        },
        "rightEdge": right_edges,
        "hanHanSpacing": han_gaps,
        "punctuationWidth": punctuation,
        "punctuationOpticalClearance": punctuation_clearance,
        # Deprecated data-key alias retained for existing local report readers.
        "closingPunctuationTrim": punctuation_clearance,
        "lineEndClosingHanging": line_end_closing_hanging,
        "baselines": baselines,
        "underlines": underline_metrics,
        "checks": checks,
        "pass": all(check["pass"] for check in checks),
        "warnings": warnings,
    }


def _parse_expected_size(raw: str) -> tuple[int, int]:
    normalized = raw.lower().replace("×", "x")
    try:
        width_text, height_text = normalized.split("x", 1)
        width, height = int(width_text), int(height_text)
    except (ValueError, TypeError) as exc:
        raise argparse.ArgumentTypeError("size must be WIDTHxHEIGHT") from exc
    if width <= 0 or height <= 0:
        raise argparse.ArgumentTypeError("size dimensions must be positive")
    return width, height


def analyze_image(
    path: Path,
    *,
    expected_size: tuple[int, int],
    repeat_band: int = DEFAULT_REPEAT_BAND,
    repeat_mae_threshold: float = DEFAULT_REPEAT_MAE,
) -> dict[str, Any]:
    try:
        from PIL import Image, ImageChops, ImageStat
    except ImportError as exc:  # pragma: no cover - environment-dependent path
        raise RuntimeError("Pillow is required for --png analysis") from exc

    with Image.open(path) as source:
        source.load()
        width, height = source.size
        image_format = source.format
        mode = source.mode
        rgb = source.convert("RGB")

    band_height = min(max(1, repeat_band), height // 2)
    top = rgb.crop((0, 0, width, band_height))
    bottom = rgb.crop((0, height - band_height, width, height))
    difference = ImageChops.difference(top, bottom)
    difference_stats = ImageStat.Stat(difference)
    top_stats = ImageStat.Stat(top)
    mean_absolute_error = statistics.fmean(difference_stats.mean)
    root_mean_square_error = statistics.fmean(difference_stats.rms)
    top_signal_stddev = statistics.fmean(top_stats.stddev)
    exact_match = difference.getbbox() is None
    has_meaningful_signal = top_signal_stddev >= 2.0
    repeated = exact_match or (
        has_meaningful_signal and mean_absolute_error <= repeat_mae_threshold
    )
    size_matches = (width, height) == expected_size
    checks = [
        {
            "name": "png-dimensions",
            "pass": size_matches,
            "measured": {"width": width, "height": height},
            "limit": {"width": expected_size[0], "height": expected_size[1]},
        },
        {
            "name": "no-top-bottom-repeat",
            "pass": not repeated,
            "measured": _round(mean_absolute_error),
            "limit": f"> {repeat_mae_threshold} raw RGB levels when top has signal",
        },
    ]
    return {
        "path": str(path.resolve()),
        "format": image_format,
        "mode": mode,
        "width": width,
        "height": height,
        "expected": {"width": expected_size[0], "height": expected_size[1]},
        "sizeMatches": size_matches,
        "topBottomRepeat": {
            "bandHeight": band_height,
            "meanAbsoluteErrorRaw": _round(mean_absolute_error),
            "meanAbsoluteErrorNormalized": _round(mean_absolute_error / 255),
            "rootMeanSquareErrorRaw": _round(root_mean_square_error),
            "topSignalStddevRaw": _round(top_signal_stddev),
            "exactMatch": exact_match,
            "thresholdRaw": repeat_mae_threshold,
            "detected": repeated,
            "note": "A low-error match is only flagged when the top band contains visible signal; an exact match is always flagged.",
        },
        "checks": checks,
        "pass": all(check["pass"] for check in checks),
    }


def _synthetic_payload() -> dict[str, Any]:
    return {
        "page": {"state": "ready", "phase": "sealed", "snapshot": "selftest"},
        "viewport": {"width": 2160, "height": 3600},
        "lines": [
            {
                "block": "body",
                "line": "0",
                "justified": "true",
                "end": "wrap",
                "right": 177.1,
                "target": 177.1,
                "residual": 0,
                "rect": {"x": 0, "y": 0, "width": 200, "height": 80, "right": 200, "bottom": 80},
            },
            {
                "block": "body",
                "line": "1",
                "justified": "false",
                "end": "paragraph",
                "right": 60,
                "target": 100,
                "residual": 0,
                "rect": {"x": 0, "y": 80, "width": 200, "height": 80, "right": 200, "bottom": 160},
            },
        ],
        "atoms": [
            {"block": "body", "line": "0", "index": 0, "kind": "han", "text": "甲", "x": 0, "gap": 1.5, "glyphOffset": 0, "inkLeft": -2, "inkRight": 38, "baseline": 48, "box": 40, "fontSize": 40},
            {"block": "body", "line": "0", "index": 1, "kind": "han", "text": "乙", "x": 41.5, "gap": 0, "glyphOffset": 0, "inkLeft": -2, "inkRight": 38, "baseline": 48, "box": 40, "fontSize": 40},
            {
                "block": "body",
                "line": "0",
                "index": 2,
                "kind": "closing-punctuation",
                "text": "：",
                "x": 81.5,
                "gap": 0,
                "baseline": 48,
                "advance": 40,
                "box": 21.2,
                "glyphOffset": 0.6,
                "inkLeft": -7,
                "inkRight": 13,
                "fontSize": 40,
            },
            {"block": "body", "line": "0", "index": 3, "kind": "han", "text": "丙", "x": 102.7, "gap": 0, "glyphOffset": 0, "inkLeft": -2, "inkRight": 38, "baseline": 48, "box": 40, "fontSize": 40},
            {"block": "body", "line": "0", "index": 4, "kind": "digit", "text": "2", "x": 142.7, "gap": 0, "glyphOffset": 0, "inkLeft": -1, "inkRight": 20, "baseline": 48, "box": 22, "fontSize": 40},
            {
                "block": "body",
                "line": "0",
                "index": 5,
                "kind": "closing-punctuation",
                "text": "。",
                "x": 164.7,
                "gap": 0,
                "baseline": 48,
                "advance": 40,
                "box": 20,
                "glyphOffset": 2.4,
                "inkLeft": -2,
                "inkRight": 10,
                "fontSize": 40,
            },
            {"block": "body", "line": "1", "index": 6, "kind": "han", "text": "丁", "x": 0, "gap": 0, "glyphOffset": 0, "inkLeft": -2, "inkRight": 38, "baseline": 48, "box": 40, "fontSize": 40},
        ],
        "underlines": [
            {"block": "body", "index": 0, "line": None, "rect": {"x": 0, "y": 60, "width": 100, "height": 4, "right": 100, "bottom": 64}},
            {"block": "body", "index": 1, "line": None, "rect": {"x": 0, "y": 140, "width": 60, "height": 4, "right": 60, "bottom": 144}},
        ],
    }


def _self_test() -> None:
    report = analyze_layout(_synthetic_payload())
    assert report["pass"] is True
    assert report["rightEdge"]["maxError"] == 0
    assert report["hanHanSpacing"]["justifiedLines"]["maxLineDeviation"] == 0
    assert report["punctuationWidth"]["minRatio"] == 0.5
    assert report["punctuationOpticalClearance"]["candidateCount"] == 3
    assert report["punctuationOpticalClearance"]["visibleGapEm"]["min"] == 0.16
    assert report["punctuationOpticalClearance"]["visibleGapEm"]["max"] == 0.24
    assert report["punctuationOpticalClearance"]["maxColonSideDifferenceEm"] == 0
    assert report["lineEndClosingHanging"]["candidateCount"] == 1
    assert report["lineEndClosingHanging"]["maxAbsGlyphOffset"] == 2.4
    assert report["lineEndClosingHanging"]["maxVisibleRightError"] == 0
    assert report["baselines"]["mixedHanAlnumMaxSpread"] == 0
    assert report["underlines"]["count"] == 2
    assert report["underlines"]["multiLineBlocks"] == ["body"]

    try:
        from PIL import Image
    except ImportError:
        print("self-test: layout PASS; image SKIPPED (Pillow unavailable)")
        return
    import tempfile

    with tempfile.TemporaryDirectory(prefix="xhs-v171-metrics-") as directory:
        repeated_path = Path(directory) / "repeated.png"
        image = Image.new("RGB", (20, 40), "white")
        for x in range(20):
            for y in range(10):
                image.putpixel((x, y), ((x * 13) % 255, (y * 19) % 255, 40))
        image.paste(image.crop((0, 0, 20, 10)), (0, 30))
        image.save(repeated_path)
        image_report = analyze_image(
            repeated_path, expected_size=(20, 40), repeat_band=10
        )
        assert image_report["sizeMatches"] is True
        assert image_report["topBottomRepeat"]["detected"] is True
        assert image_report["pass"] is False
    print("self-test: layout PASS; image dimensions PASS; repeat detector PASS")


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Analyze V1.7.1 deterministic typography layout geometry."
    )
    parser.add_argument("layout", nargs="?", type=Path, help="layout manifest JSON")
    parser.add_argument("--png", type=Path, help="optional exported PNG/capture image")
    parser.add_argument(
        "--output", type=Path, help="also write the complete report to this JSON file"
    )
    parser.add_argument(
        "--expected-size",
        type=_parse_expected_size,
        default=(2160, 3600),
        metavar="WIDTHxHEIGHT",
        help="expected image size (default: 2160x3600)",
    )
    parser.add_argument("--repeat-band", type=int, default=DEFAULT_REPEAT_BAND)
    parser.add_argument(
        "--repeat-mae-threshold", type=float, default=DEFAULT_REPEAT_MAE
    )
    parser.add_argument(
        "--right-edge-tolerance",
        type=float,
        default=DEFAULT_RIGHT_EDGE_TOLERANCE,
    )
    parser.add_argument(
        "--gap-deviation-tolerance",
        type=float,
        default=DEFAULT_GAP_DEVIATION_TOLERANCE,
    )
    parser.add_argument(
        "--baseline-tolerance", type=float, default=DEFAULT_BASELINE_TOLERANCE
    )
    parser.add_argument(
        "--punctuation-min-ratio",
        type=float,
        default=DEFAULT_PUNCTUATION_MIN_RATIO,
    )
    parser.add_argument(
        "--punctuation-max-ratio",
        type=float,
        default=DEFAULT_PUNCTUATION_MAX_RATIO,
    )
    parser.add_argument(
        "--punctuation-clearance-tolerance",
        "--punctuation-trim-tolerance",
        dest="punctuation_trim_tolerance",
        type=float,
        default=DEFAULT_PUNCTUATION_TRIM_TOLERANCE,
        help=(
            "allowed em slack around visible punctuation-clearance ranges; "
            "--punctuation-trim-tolerance is retained as a compatibility alias"
        ),
    )
    parser.add_argument(
        "--require-line-end-closing",
        action="store_true",
        help="require at least one justified wrap ending in a hanging closing punctuation",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="exit 2 when any acceptance check fails",
    )
    parser.add_argument("--self-test", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    if args.self_test:
        _self_test()
        return 0
    if args.layout is None:
        parser.error("layout is required unless --self-test is used")
    if args.repeat_band <= 0:
        parser.error("--repeat-band must be positive")
    for name in (
        "right_edge_tolerance",
        "gap_deviation_tolerance",
        "baseline_tolerance",
        "punctuation_trim_tolerance",
        "repeat_mae_threshold",
    ):
        if getattr(args, name) < 0:
            parser.error(f"--{name.replace('_', '-')} must be non-negative")
    if args.punctuation_min_ratio > args.punctuation_max_ratio:
        parser.error("punctuation min ratio cannot exceed max ratio")

    try:
        with args.layout.open("r", encoding="utf-8") as stream:
            payload = json.load(stream)
        if not isinstance(payload, dict):
            raise ValueError("layout manifest root must be an object")
        layout_report = analyze_layout(
            payload,
            right_edge_tolerance=args.right_edge_tolerance,
            gap_deviation_tolerance=args.gap_deviation_tolerance,
            baseline_tolerance=args.baseline_tolerance,
            punctuation_min_ratio=args.punctuation_min_ratio,
            punctuation_max_ratio=args.punctuation_max_ratio,
            punctuation_trim_tolerance=args.punctuation_trim_tolerance,
            require_line_end_closing=args.require_line_end_closing,
        )
        image_report = (
            analyze_image(
                args.png,
                expected_size=args.expected_size,
                repeat_band=args.repeat_band,
                repeat_mae_threshold=args.repeat_mae_threshold,
            )
            if args.png is not None
            else None
        )
    except (OSError, json.JSONDecodeError, ValueError, RuntimeError) as exc:
        print(f"analysis failed: {exc}", file=sys.stderr)
        return 1

    checks = [*layout_report["checks"]]
    if image_report is not None:
        checks.extend(image_report["checks"])
    report = {
        "schemaVersion": SCHEMA_VERSION,
        "inputs": {
            "layout": str(args.layout.resolve()),
            "png": str(args.png.resolve()) if args.png is not None else None,
        },
        "layout": layout_report,
        "image": image_report,
        "checks": checks,
        "pass": all(check["pass"] for check in checks),
    }
    rendered = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=False) + "\n"
    sys.stdout.write(rendered)
    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    if args.strict and not report["pass"]:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
