#!/usr/bin/env python3
"""Compare a V1.7.1 1080px preview with its 2160px PNG export.

The export is reduced to preview coordinates with an exact 2x BOX reduction.  The
gate intentionally measures geometry instead of asking for byte-identical pixels:
browser screenshots and html2canvas use different rasterizers, while their ink
bounds, projection alignment, and H2 accent-bar geometry must still agree.

Exit codes:
    0: analysis completed and the requested gate passed
    1: valid images were analyzed, but the strict gate (or non-empty check) failed
    2: invalid arguments, unreadable input, wrong dimensions, or missing Pillow
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
from collections import deque
from pathlib import Path
from typing import Any, Sequence


SCHEMA_VERSION = 1
EXPECTED_PREVIEW_SIZE = (1080, 1800)
EXPECTED_EXPORT_SIZE = (2160, 3600)
DEFAULT_INK_THRESHOLD = 24
DEFAULT_MIN_INK_PIXELS = 64
DEFAULT_MAX_LAG = 64
DEFAULT_LAG_TOLERANCE = 1
DEFAULT_PROJECTION_SCORE = 0.75
DEFAULT_BBOX_TOLERANCE = 2
DEFAULT_H2_BAR_TOLERANCE = 2
DEFAULT_H2_PURPLE = (138, 75, 124)
DEFAULT_H2_PURPLE_TOLERANCE = 45


class InputError(ValueError):
    """An input cannot be analyzed as the required preview/export pair."""


def _round(value: float | None, digits: int = 6) -> float | None:
    if value is None:
        return None
    rounded = round(float(value), digits)
    return 0.0 if rounded == 0 else rounded


def _parse_rgb(value: str) -> tuple[int, int, int]:
    text = value.strip().removeprefix("#")
    if len(text) != 6:
        raise argparse.ArgumentTypeError("color must use #RRGGBB or RRGGBB")
    try:
        channels = tuple(int(text[index : index + 2], 16) for index in (0, 2, 4))
    except ValueError as exc:
        raise argparse.ArgumentTypeError("color must use hexadecimal digits") from exc
    return channels  # type: ignore[return-value]


def _load_pillow() -> tuple[Any, Any]:
    try:
        from PIL import Image, ImageChops
    except ImportError as exc:  # pragma: no cover - depends on the host runtime
        raise InputError(
            "Pillow is required; install the project's existing image-test dependency"
        ) from exc
    return Image, ImageChops


def _open_rgb(path: Path, expected_size: tuple[int, int], label: str) -> Any:
    Image, _ = _load_pillow()
    try:
        with Image.open(path) as source:
            source.load()
            actual_size = source.size
            image = source.convert("RGB")
    except (FileNotFoundError, OSError) as exc:
        raise InputError(f"cannot read {label} image {path}: {exc}") from exc
    if actual_size != expected_size:
        raise InputError(
            f"{label} must be {expected_size[0]}x{expected_size[1]}, "
            f"got {actual_size[0]}x{actual_size[1]}"
        )
    return image


def _border_background(image: Any) -> tuple[int, int, int]:
    """Estimate a flat page background from a sparse two-pixel border sample."""

    width, height = image.size
    pixels = image.load()
    samples: list[tuple[int, int, int]] = []
    step = max(1, min(width, height) // 256)
    for x in range(0, width, step):
        samples.append(pixels[x, 0])
        samples.append(pixels[x, height - 1])
        if height > 2:
            samples.append(pixels[x, 1])
            samples.append(pixels[x, height - 2])
    for y in range(0, height, step):
        samples.append(pixels[0, y])
        samples.append(pixels[width - 1, y])
        if width > 2:
            samples.append(pixels[1, y])
            samples.append(pixels[width - 2, y])
    return tuple(
        int(round(statistics.median(sample[channel] for sample in samples)))
        for channel in range(3)
    )  # type: ignore[return-value]


def _max_channel_difference_mask(
    image: Any, reference: tuple[int, int, int], threshold: int, *, invert: bool = False
) -> Any:
    Image, ImageChops = _load_pillow()
    reference_image = Image.new("RGB", image.size, reference)
    red, green, blue = ImageChops.difference(image, reference_image).split()
    maximum = ImageChops.lighter(ImageChops.lighter(red, green), blue)
    if invert:
        table = [255 if value <= threshold else 0 for value in range(256)]
    else:
        table = [255 if value > threshold else 0 for value in range(256)]
    return maximum.point(table, mode="L")


def _projection_counts(mask: Any) -> tuple[list[int], list[int], int]:
    width, height = mask.size
    data = mask.tobytes()
    rows = [0] * height
    columns = [0] * width
    ink_pixels = 0
    for y in range(height):
        start = y * width
        row = data[start : start + width]
        count = sum(row) // 255
        rows[y] = count
        ink_pixels += count
        for x, value in enumerate(row):
            if value:
                columns[x] += 1
    return rows, columns, ink_pixels


def _bbox_dict(bbox: tuple[int, int, int, int] | None) -> dict[str, int] | None:
    if bbox is None:
        return None
    left, top, right, bottom = bbox
    return {
        "left": left,
        "top": top,
        "rightExclusive": right,
        "bottomExclusive": bottom,
        "width": right - left,
        "height": bottom - top,
    }


def _best_projection_lag(
    preview: Sequence[int], exported: Sequence[int], max_lag: int
) -> dict[str, Any]:
    if len(preview) != len(exported):
        raise InputError("projection lengths differ after export reduction")
    preview_energy = math.sqrt(sum(value * value for value in preview))
    export_energy = math.sqrt(sum(value * value for value in exported))
    if preview_energy == 0 or export_energy == 0:
        return {
            "lag": None,
            "score": None,
            "normalizedAbsoluteError": None,
        }

    denominator = preview_energy * export_energy
    limit = min(max_lag, len(preview) - 1)
    candidates: list[tuple[float, int]] = []
    for lag in range(-limit, limit + 1):
        start = max(0, -lag)
        stop = min(len(preview), len(preview) - lag)
        dot = sum(preview[index] * exported[index + lag] for index in range(start, stop))
        candidates.append((dot / denominator, lag))
    score, lag = max(candidates, key=lambda item: (item[0], -abs(item[1]), -item[1]))

    preview_total = sum(preview)
    export_total = sum(exported)
    normalized_error = 0.0
    for index in range(len(preview)):
        export_index = index + lag
        left = preview[index] / preview_total if preview_total else 0.0
        right = (
            exported[export_index] / export_total
            if export_total and 0 <= export_index < len(exported)
            else 0.0
        )
        normalized_error += abs(left - right)
    for export_index in range(len(exported)):
        preview_index = export_index - lag
        if not 0 <= preview_index < len(preview):
            normalized_error += exported[export_index] / export_total

    return {
        "lag": lag,
        "definition": "positive means export-half ink is lower/right of preview",
        "score": _round(score),
        "normalizedAbsoluteError": _round(normalized_error),
    }


def _connected_components(mask: Any) -> list[dict[str, Any]]:
    width, height = mask.size
    data = mask.tobytes()
    visited = bytearray(width * height)
    components: list[dict[str, Any]] = []
    for seed, value in enumerate(data):
        if not value or visited[seed]:
            continue
        visited[seed] = 1
        queue: deque[int] = deque([seed])
        area = 0
        min_x = width
        min_y = height
        max_x = -1
        max_y = -1
        while queue:
            index = queue.pop()
            y, x = divmod(index, width)
            area += 1
            min_x = min(min_x, x)
            max_x = max(max_x, x)
            min_y = min(min_y, y)
            max_y = max(max_y, y)
            for dy in (-1, 0, 1):
                neighbor_y = y + dy
                if neighbor_y < 0 or neighbor_y >= height:
                    continue
                row_start = neighbor_y * width
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    neighbor_x = x + dx
                    if neighbor_x < 0 or neighbor_x >= width:
                        continue
                    neighbor = row_start + neighbor_x
                    if data[neighbor] and not visited[neighbor]:
                        visited[neighbor] = 1
                        queue.append(neighbor)
        component_width = max_x - min_x + 1
        component_height = max_y - min_y + 1
        components.append(
            {
                "left": min_x,
                "top": min_y,
                "rightExclusive": max_x + 1,
                "bottomExclusive": max_y + 1,
                "width": component_width,
                "height": component_height,
                "area": area,
                "fillRatio": area / (component_width * component_height),
            }
        )
    return components


def _detect_h2_bar(
    image: Any,
    target: tuple[int, int, int],
    color_tolerance: int,
) -> dict[str, Any]:
    purple_mask = _max_channel_difference_mask(
        image, target, color_tolerance, invert=True
    )
    components = _connected_components(purple_mask)
    candidates = [
        component
        for component in components
        # A one-line H2 bar is about 12x65 CSS px.  Requiring a substantial,
        # well-filled vertical component avoids treating purple glyph strokes on
        # the cover as an H2 bar while retaining JPEG-antialiased bar edges.
        if 8 <= component["width"] <= 24
        and component["height"] >= 48
        and component["height"] / component["width"] >= 2
        and component["area"] >= 30
        and component["fillRatio"] >= 0.5
    ]
    candidates.sort(
        key=lambda component: (
            abs(component["width"] - 12),
            -component["fillRatio"],
            -component["area"],
            component["top"],
            component["left"],
        )
    )
    selected = candidates[0] if candidates else None
    return {
        "found": selected is not None,
        "method": "accent-color connected component nearest the 12px H2 bar width",
        "targetRgb": list(target),
        "maxChannelColorTolerance": color_tolerance,
        "candidateCount": len(candidates),
        "bbox": (
            {
                key: (_round(value) if key == "fillRatio" else value)
                for key, value in selected.items()
            }
            if selected
            else None
        ),
    }


def _phase_correlation(
    preview_mask: Any, export_mask: Any, *, disabled: bool
) -> dict[str, Any]:
    if disabled:
        return {"available": False, "reason": "disabled by --no-phase-correlation"}
    try:
        import cv2  # type: ignore[import-not-found]
        import numpy as np  # type: ignore[import-not-found]
    except ImportError as exc:
        return {"available": False, "reason": f"optional dependency unavailable: {exc}"}
    preview = np.asarray(preview_mask, dtype=np.float32) / 255.0
    exported = np.asarray(export_mask, dtype=np.float32) / 255.0
    try:
        (shift_x, shift_y), response = cv2.phaseCorrelate(preview, exported)
    except (cv2.error, ValueError) as exc:
        return {"available": False, "reason": f"phase correlation failed: {exc}"}
    return {
        "available": True,
        "definition": "positive means export-half ink is right/lower than preview",
        "shiftX": _round(shift_x),
        "shiftY": _round(shift_y),
        "response": _round(response),
    }


def _bbox_comparison(
    preview_bbox: dict[str, int] | None,
    export_bbox: dict[str, int] | None,
    tolerance: int,
) -> dict[str, Any]:
    if preview_bbox is None or export_bbox is None:
        return {
            "pass": False,
            "toleranceCssPx": tolerance,
            "deltas": None,
            "maxAbsDelta": None,
        }
    fields = ("left", "top", "rightExclusive", "bottomExclusive")
    deltas = {field: export_bbox[field] - preview_bbox[field] for field in fields}
    maximum = max(abs(value) for value in deltas.values())
    return {
        "pass": maximum <= tolerance,
        "toleranceCssPx": tolerance,
        "deltas": deltas,
        "maxAbsDelta": maximum,
    }


def _h2_comparison(
    preview_bar: dict[str, Any],
    export_bar: dict[str, Any],
    tolerance: int,
    require_bar: bool,
) -> dict[str, Any]:
    preview_found = bool(preview_bar["found"])
    export_found = bool(export_bar["found"])
    if not preview_found and not export_found:
        return {
            "status": "absent-in-both",
            "pass": not require_bar,
            "required": require_bar,
            "toleranceCssPx": tolerance,
            "deltas": None,
            "maxAbsBboxDelta": None,
        }
    if preview_found != export_found:
        return {
            "status": "missing-in-one-image",
            "pass": False,
            "required": require_bar,
            "toleranceCssPx": tolerance,
            "deltas": None,
            "maxAbsBboxDelta": None,
        }
    fields = ("left", "top", "rightExclusive", "bottomExclusive")
    preview_bbox = preview_bar["bbox"]
    export_bbox = export_bar["bbox"]
    deltas = {field: export_bbox[field] - preview_bbox[field] for field in fields}
    maximum = max(abs(value) for value in deltas.values())
    return {
        "status": "compared",
        "pass": maximum <= tolerance,
        "required": require_bar,
        "toleranceCssPx": tolerance,
        "deltas": deltas,
        "maxAbsBboxDelta": maximum,
    }


def _image_analysis(
    image: Any,
    *,
    source_path: Path,
    source_size: tuple[int, int],
    ink_threshold: int,
    h2_color: tuple[int, int, int],
    h2_color_tolerance: int,
) -> tuple[dict[str, Any], Any, list[int], list[int]]:
    background = _border_background(image)
    ink_mask = _max_channel_difference_mask(image, background, ink_threshold)
    rows, columns, ink_pixels = _projection_counts(ink_mask)
    result = {
        "path": str(source_path.resolve()),
        "sourceWidth": source_size[0],
        "sourceHeight": source_size[1],
        "analysisWidth": image.width,
        "analysisHeight": image.height,
        "estimatedBackgroundRgb": list(background),
        "ink": {
            "threshold": ink_threshold,
            "pixelCount": ink_pixels,
            "bbox": _bbox_dict(ink_mask.getbbox()),
        },
        "h2Bar": _detect_h2_bar(image, h2_color, h2_color_tolerance),
    }
    return result, ink_mask, rows, columns


def analyze(args: argparse.Namespace) -> dict[str, Any]:
    Image, _ = _load_pillow()
    preview_path = Path(args.preview)
    export_path = Path(args.export)
    preview = _open_rgb(preview_path, EXPECTED_PREVIEW_SIZE, "preview")
    exported = _open_rgb(export_path, EXPECTED_EXPORT_SIZE, "export")
    export_half = exported.resize(EXPECTED_PREVIEW_SIZE, Image.Resampling.BOX)

    preview_result, preview_mask, preview_rows, preview_columns = _image_analysis(
        preview,
        source_path=preview_path,
        source_size=preview.size,
        ink_threshold=args.ink_threshold,
        h2_color=args.h2_color,
        h2_color_tolerance=args.h2_color_tolerance,
    )
    export_result, export_mask, export_rows, export_columns = _image_analysis(
        export_half,
        source_path=export_path,
        source_size=exported.size,
        ink_threshold=args.ink_threshold,
        h2_color=args.h2_color,
        h2_color_tolerance=args.h2_color_tolerance,
    )
    export_result["reduction"] = {
        "factor": 2,
        "method": "Pillow BOX (exact 2x2 pixel-area reduction)",
    }

    preview_nonempty = preview_result["ink"]["pixelCount"] >= args.min_ink_pixels
    export_nonempty = export_result["ink"]["pixelCount"] >= args.min_ink_pixels
    content_check = {
        "pass": preview_nonempty and export_nonempty,
        "minimumInkPixels": args.min_ink_pixels,
        "previewPass": preview_nonempty,
        "exportHalfPass": export_nonempty,
    }
    bbox = _bbox_comparison(
        preview_result["ink"]["bbox"],
        export_result["ink"]["bbox"],
        args.bbox_tolerance,
    )
    row_projection = _best_projection_lag(
        preview_rows, export_rows, args.max_lag
    )
    column_projection = _best_projection_lag(
        preview_columns, export_columns, args.max_lag
    )
    for projection in (row_projection, column_projection):
        lag = projection["lag"]
        score = projection["score"]
        projection["lagToleranceCssPx"] = args.lag_tolerance
        projection["minimumScore"] = args.projection_score
        projection["pass"] = (
            lag is not None
            and score is not None
            and abs(lag) <= args.lag_tolerance
            and score >= args.projection_score
        )
    h2 = _h2_comparison(
        preview_result["h2Bar"],
        export_result["h2Bar"],
        args.h2_bar_tolerance,
        args.require_h2_bar,
    )
    phase = _phase_correlation(
        preview_mask, export_mask, disabled=args.no_phase_correlation
    )

    checks = {
        "nonEmptyContent": content_check,
        "inkBoundingBox": bbox,
        "rowProjection": row_projection,
        "columnProjection": column_projection,
        "h2BarBoundingBox": h2,
    }
    failures = [name for name, check in checks.items() if not check["pass"]]
    return {
        "schemaVersion": SCHEMA_VERSION,
        "coordinateSystem": "1080x1800 preview CSS pixels",
        "preview": preview_result,
        "exportHalf": export_result,
        "comparison": {
            "pass": not failures,
            "failures": failures,
            "checks": checks,
            "phaseCorrelation": phase,
        },
        "strict": {
            "enabled": args.strict,
            "pass": not failures,
            "exitPolicy": (
                "all comparison checks are enforced"
                if args.strict
                else "comparison failures are reported; only empty content forces exit 1"
            ),
        },
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Compare a 1080x1800 editor preview capture with a 2160x3600 PNG export."
        ),
        epilog="Exit codes: 0 pass, 1 geometry/empty-content failure, 2 invalid input.",
    )
    parser.add_argument("preview", help="1080x1800 preview PNG or JPEG")
    parser.add_argument("export", help="2160x3600 exported PNG")
    parser.add_argument("--strict", action="store_true", help="exit 1 on any failed check")
    parser.add_argument(
        "--output", type=Path, help="also write the JSON report to this path"
    )
    parser.add_argument("--ink-threshold", type=int, default=DEFAULT_INK_THRESHOLD)
    parser.add_argument("--min-ink-pixels", type=int, default=DEFAULT_MIN_INK_PIXELS)
    parser.add_argument("--max-lag", type=int, default=DEFAULT_MAX_LAG)
    parser.add_argument("--lag-tolerance", type=int, default=DEFAULT_LAG_TOLERANCE)
    parser.add_argument(
        "--projection-score", type=float, default=DEFAULT_PROJECTION_SCORE
    )
    parser.add_argument("--bbox-tolerance", type=int, default=DEFAULT_BBOX_TOLERANCE)
    parser.add_argument(
        "--h2-bar-tolerance", type=int, default=DEFAULT_H2_BAR_TOLERANCE
    )
    parser.add_argument(
        "--h2-color", type=_parse_rgb, default=DEFAULT_H2_PURPLE, metavar="#RRGGBB"
    )
    parser.add_argument(
        "--h2-color-tolerance", type=int, default=DEFAULT_H2_PURPLE_TOLERANCE
    )
    parser.add_argument(
        "--require-h2-bar",
        action="store_true",
        help="fail when an H2 bar candidate is absent from both images",
    )
    parser.add_argument(
        "--no-phase-correlation",
        action="store_true",
        help="skip optional OpenCV/NumPy subpixel phase correlation",
    )
    return parser


def _validate_args(args: argparse.Namespace) -> None:
    integer_ranges = {
        "ink-threshold": (args.ink_threshold, 0, 254),
        "min-ink-pixels": (
            args.min_ink_pixels,
            1,
            EXPECTED_PREVIEW_SIZE[0] * EXPECTED_PREVIEW_SIZE[1],
        ),
        "max-lag": (args.max_lag, 0, 512),
        "lag-tolerance": (args.lag_tolerance, 0, args.max_lag),
        "bbox-tolerance": (args.bbox_tolerance, 0, 128),
        "h2-bar-tolerance": (args.h2_bar_tolerance, 0, 128),
        "h2-color-tolerance": (args.h2_color_tolerance, 0, 255),
    }
    for label, (value, minimum, maximum) in integer_ranges.items():
        if not minimum <= value <= maximum:
            raise InputError(f"--{label} must be between {minimum} and {maximum}")
    if not 0 <= args.projection_score <= 1:
        raise InputError("--projection-score must be between 0 and 1")


def _emit(payload: dict[str, Any], output: Path | None) -> None:
    rendered = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=False)
    if output is not None:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)


def main(argv: Sequence[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    try:
        _validate_args(args)
        result = analyze(args)
    except InputError as exc:
        payload = {
            "schemaVersion": SCHEMA_VERSION,
            "error": {"kind": "invalid-input", "message": str(exc)},
            "strict": {"enabled": bool(args.strict), "pass": False},
        }
        _emit(payload, args.output)
        return 2
    _emit(result, args.output)
    empty_failed = not result["comparison"]["checks"]["nonEmptyContent"]["pass"]
    if empty_failed or (args.strict and not result["comparison"]["pass"]):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
