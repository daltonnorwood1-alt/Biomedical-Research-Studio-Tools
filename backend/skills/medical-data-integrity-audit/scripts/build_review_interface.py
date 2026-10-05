#!/usr/bin/env python3
"""Build a portable version 2 medical evidence and revision workspace."""

from __future__ import annotations

import argparse
import base64
import html
import json
import mimetypes
from collections import Counter
from pathlib import Path
from typing import Any


ALLOWED_SEVERITIES = ("critical", "major", "minor", "note")
ALLOWED_CONFIDENCE = ("high", "moderate", "low")
ALLOWED_CHECK_STATUS = ("pass", "fail", "warning", "not assessable")
ALLOWED_VERDICTS = ("correct", "needs modifications", "completely incorrect", "not assessable")
ALLOWED_METHODS_STATUS = ("appropriate", "needs clarification", "not appropriate", "not assessable")
MAX_REVIEW_BYTES = 5 * 1024 * 1024
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_TABLE_COLUMNS = 100
MAX_TABLE_ROWS = 10_000
ALLOWED_ROOT: Path | None = None


def esc(value: Any) -> str:
    return html.escape("" if value is None else str(value), quote=True)


def require_mapping(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be a JSON object")
    return value


def require_list(value: Any, label: str) -> list[Any]:
    if not isinstance(value, list):
        raise ValueError(f"{label} must be a JSON array")
    return value


def normalize_interpretation(value: Any) -> dict[str, Any]:
    if isinstance(value, str):
        return {"headline": "Scientific interpretation", "summary": value, "key_points": []}
    interpretation = require_mapping(value or {}, "interpretation")
    key_points = require_list(interpretation.get("key_points", []), "interpretation.key_points")
    return {
        "headline": interpretation.get("headline", "Scientific interpretation"),
        "summary": interpretation.get("summary", "No interpretation supplied."),
        "key_points": key_points,
    }


def normalize_verdict(value: Any) -> dict[str, Any]:
    if isinstance(value, str):
        raw_status = value.strip().lower()
        aliases = {
            "needs revision": "needs modifications",
            "needs modification": "needs modifications",
            "incorrect": "completely incorrect",
        }
        status = aliases.get(raw_status, raw_status)
        summary = value
        modifications: list[Any] = []
    else:
        verdict = require_mapping(value or {}, "verdict")
        status = str(verdict.get("status", "not assessable")).strip().lower()
        summary = verdict.get("summary", "No verdict explanation supplied.")
        modifications = require_list(verdict.get("modifications", []), "verdict.modifications")
    if status not in ALLOWED_VERDICTS:
        raise ValueError(f"verdict.status is invalid: {status}")
    return {"status": status, "summary": summary, "modifications": modifications}


def normalize_methods_assessment(value: Any) -> dict[str, Any]:
    if isinstance(value, str):
        return {"status": "not assessable", "summary": value}
    assessment = require_mapping(value or {}, "methods_assessment")
    status = str(assessment.get("status", "not assessable")).strip().lower()
    if status not in ALLOWED_METHODS_STATUS:
        raise ValueError(f"methods_assessment.status is invalid: {status}")
    return {
        "status": status,
        "summary": assessment.get("summary", "No Methods-data assessment supplied."),
    }


def normalize(record: dict[str, Any]) -> dict[str, Any]:
    artifact = require_mapping(record.get("artifact", {}), "artifact")
    methods = require_mapping(record.get("methods", {}), "methods")
    results = require_mapping(record.get("results", {}), "results")
    findings = require_list(record.get("findings", []), "findings")
    revisions = require_list(record.get("revisions", []), "revisions")
    checks = require_list(record.get("checks", []), "checks")
    limitations = require_list(record.get("limitations", []), "limitations")
    source_files = require_list(record.get("source_files", []), "source_files")

    normalized_findings = []
    for index, raw in enumerate(findings, start=1):
        finding = require_mapping(raw, f"findings[{index - 1}]")
        severity = str(finding.get("severity", "note")).lower()
        confidence = str(finding.get("confidence", "low")).lower()
        if severity not in ALLOWED_SEVERITIES:
            raise ValueError(f"findings[{index - 1}].severity is invalid: {severity}")
        if confidence not in ALLOWED_CONFIDENCE:
            raise ValueError(f"findings[{index - 1}].confidence is invalid: {confidence}")
        finding = dict(finding)
        finding["id"] = finding.get("id") or f"F-{index:03d}"
        finding["severity"] = severity
        finding["confidence"] = confidence
        normalized_findings.append(finding)

    normalized_revisions = []
    for index, raw in enumerate(revisions, start=1):
        revision = require_mapping(raw, f"revisions[{index - 1}]")
        revision = dict(revision)
        revision["id"] = revision.get("id") or f"R-{index:03d}"
        normalized_revisions.append(revision)

    normalized_checks = []
    for index, raw in enumerate(checks):
        check = require_mapping(raw, f"checks[{index}]")
        status = str(check.get("status", "not assessable")).lower()
        if status not in ALLOWED_CHECK_STATUS:
            raise ValueError(f"checks[{index}].status is invalid: {status}")
        check = dict(check)
        check["status"] = status
        normalized_checks.append(check)

    record = dict(record)
    record.update(
        artifact=artifact,
        methods=methods,
        methods_assessment=normalize_methods_assessment(record.get("methods_assessment", {})),
        results=results,
        interpretation=normalize_interpretation(record.get("interpretation", {})),
        verdict=normalize_verdict(record.get("verdict", {})),
        findings=normalized_findings,
        revisions=normalized_revisions,
        checks=normalized_checks,
        limitations=limitations,
        source_files=source_files,
    )
    return record


def contained_path(path: Path, label: str) -> Path:
    if ALLOWED_ROOT is None:
        raise ValueError("allowed project root was not configured")
    resolved = path.expanduser().resolve(strict=False)
    if not resolved.is_relative_to(ALLOWED_ROOT):
        raise ValueError(f"{label} must stay within the allowed project root")
    return resolved


def image_data_uri(path_value: str) -> tuple[str, str]:
    if not path_value:
        return "", "No image path was supplied."
    path = contained_path(Path(path_value), "artifact.source_path")
    if not path.is_file():
        return "", f"Image not found: {path}"
    mime, _ = mimetypes.guess_type(path.name)
    if mime not in {"image/png", "image/jpeg", "image/gif", "image/webp"}:
        return "", f"Unsupported image type: {mime or path.suffix}"
    if path.stat().st_size > MAX_IMAGE_BYTES:
        raise ValueError(f"artifact image exceeds {MAX_IMAGE_BYTES} bytes")
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}", ""


def render_table(table: dict[str, Any]) -> str:
    columns = table.get("columns", [])
    rows = table.get("rows", [])
    if not isinstance(columns, list) or not isinstance(rows, list) or not columns:
        return '<div class="empty-state">No structured table preview was supplied.</div>'
    if len(columns) > MAX_TABLE_COLUMNS or len(rows) > MAX_TABLE_ROWS:
        raise ValueError(
            f"artifact table exceeds limits ({MAX_TABLE_COLUMNS} columns, {MAX_TABLE_ROWS} rows)"
        )
    header = "".join(f"<th>{esc(column)}</th>" for column in columns)
    body_rows = []
    for row in rows:
        if not isinstance(row, list):
            raise ValueError("Every artifact.table.rows entry must be an array")
        if len(row) != len(columns):
            raise ValueError("Every artifact table row must match the column count")
        body_rows.append("<tr>" + "".join(f"<td>{esc(value)}</td>" for value in row) + "</tr>")
    return (
        '<div class="table-scroll"><table class="source-table"><thead><tr>'
        + header
        + "</tr></thead><tbody>"
        + "".join(body_rows)
        + "</tbody></table></div>"
    )


def render_artifact(artifact: dict[str, Any]) -> str:
    artifact_type = str(artifact.get("type", "figure")).lower()
    label = esc(artifact.get("label", "Submitted artifact"))
    caption = esc(artifact.get("caption", ""))
    controls = ""
    if artifact_type == "table":
        preview = render_table(require_mapping(artifact.get("table", {}), "artifact.table"))
        type_label = "Submitted table"
    else:
        uri, error = image_data_uri(str(artifact.get("source_path", "")))
        preview = (
            f'<img id="artifact-image" class="artifact-image" src="{uri}" alt="{label}">'
            if uri
            else f'<div class="empty-state">{esc(error)}</div>'
        )
        type_label = "Submitted figure"
        if uri:
            controls = (
                '<div class="zoom-controls" aria-label="Figure zoom controls">'
                '<button type="button" data-zoom="out" aria-label="Zoom out">−</button>'
                '<button type="button" data-zoom="reset" aria-label="Reset zoom">100%</button>'
                '<button type="button" data-zoom="in" aria-label="Zoom in">+</button>'
                "</div>"
            )
    caption_html = f'<div class="artifact-caption">{caption}</div>' if caption else ""
    return (
        '<div class="panel-heading">'
        f'<div><div class="section-kicker">Source evidence</div><h2>{label}</h2></div>'
        f'<span class="neutral-badge">{esc(type_label)}</span></div>'
        f'<div class="artifact-stage">{preview}</div>{controls}{caption_html}'
    )


def render_interpretation(interpretation: dict[str, Any]) -> str:
    points = interpretation["key_points"]
    points_html = ""
    if points:
        points_html = '<ul class="key-points">' + "".join(f"<li>{esc(point)}</li>" for point in points) + "</ul>"
    return (
        '<article class="analysis-card interpretation-card">'
        '<div class="analysis-label"><span>01</span>AI interpretation</div>'
        f'<h3>{esc(interpretation["headline"])}</h3>'
        f'<p>{esc(interpretation["summary"])}</p>{points_html}</article>'
    )


def render_results(results: dict[str, Any]) -> str:
    return (
        '<article class="analysis-card results-card">'
        '<div class="analysis-label"><span>02</span>Results text</div>'
        f'<div class="source-location">{esc(results.get("location", "Location not supplied"))}</div>'
        f'<blockquote>{esc(results.get("excerpt", "No Results excerpt supplied."))}</blockquote>'
        "</article>"
    )


def render_verdict(verdict: dict[str, Any], confidence: Any) -> str:
    status = verdict["status"]
    status_class = status.replace(" ", "-")
    icons = {
        "correct": "✓",
        "needs modifications": "!",
        "completely incorrect": "×",
        "not assessable": "?",
    }
    modifications = verdict["modifications"]
    modifications_html = ""
    if modifications:
        modifications_html = (
            '<div class="modifications"><div class="micro-label">Required actions</div><ul>'
            + "".join(f"<li>{esc(item)}</li>" for item in modifications)
            + "</ul></div>"
        )
    return (
        f'<article class="analysis-card verdict-card verdict-{status_class}">'
        '<div class="analysis-label"><span>03</span>Scope-qualified verdict</div>'
        f'<div class="verdict-line"><span class="verdict-icon">{icons[status]}</span>'
        f'<div><div class="verdict-status">{esc(status)}</div>'
        f'<div class="confidence">Confidence: {esc(confidence or "not stated")}</div></div></div>'
        f'<p>{esc(verdict["summary"])}</p>{modifications_html}</article>'
    )


def render_methods(methods: dict[str, Any], assessment: dict[str, Any]) -> str:
    status = assessment["status"]
    status_class = status.replace(" ", "-")
    return (
        '<div class="methods-grid">'
        '<article class="context-card"><div class="section-kicker">Methods source</div>'
        f'<div class="source-location">{esc(methods.get("location", "Location not supplied"))}</div>'
        f'<blockquote>{esc(methods.get("excerpt", "No Methods excerpt supplied."))}</blockquote></article>'
        '<article class="context-card assessment-card"><div class="section-kicker">Methods–data fit</div>'
        f'<span class="status-badge method-{status_class}">{esc(status)}</span>'
        f'<p>{esc(assessment["summary"])}</p></article></div>'
    )


def render_revisions(revisions: list[dict[str, Any]]) -> str:
    if not revisions:
        return '<div class="empty-state">No text or display changes were proposed.</div>'
    rows = []
    for index, revision in enumerate(revisions, start=1):
        target_id = f"replacement-{index}"
        rows.append(
            '<tr>'
            f'<td><div class="revision-id">{esc(revision.get("id"))}</div>'
            f'<div class="source-location">{esc(revision.get("source_location", ""))}</div>'
            f'<div class="original-copy">{esc(revision.get("original", ""))}</div></td>'
            f'<td>{esc(revision.get("interpretation", ""))}</td>'
            f'<td>{esc(revision.get("suggested_change", ""))}</td>'
            f'<td class="replacement-cell"><div id="{target_id}" class="replacement-copy">'
            f'{esc(revision.get("proposed_replacement", ""))}</div>'
            f'<button type="button" class="copy-button" data-copy-target="{target_id}">Copy text</button></td>'
            "</tr>"
        )
    return (
        '<div class="revision-table-wrap"><table class="revision-table">'
        '<thead><tr><th><span>01</span>Original text or data</th><th><span>02</span>AI interpretation</th>'
        '<th><span>03</span>Suggested change</th><th><span>04</span>Proposed replacement</th></tr></thead>'
        f'<tbody>{"".join(rows)}</tbody></table></div>'
    )


def render_findings(findings: list[dict[str, Any]]) -> str:
    if not findings:
        return '<div class="empty-state">No non-pass findings were recorded.</div>'
    cards = []
    for finding in findings:
        severity = finding["severity"]
        searchable = " ".join(str(value) for value in finding.values()).lower()
        comparison = ""
        if finding.get("observed") or finding.get("comparator"):
            comparison = (
                '<div class="evidence-pair">'
                f'<div><span>Observed</span><strong>{esc(finding.get("observed", ""))}</strong></div>'
                f'<div><span>Comparator</span><strong>{esc(finding.get("comparator", ""))}</strong></div>'
                "</div>"
            )
        cards.append(
            f'<article class="finding-card finding-{esc(severity)}" data-severity="{esc(severity)}" '
            f'data-search="{esc(searchable)}">'
            '<div class="finding-top">'
            f'<div><span class="severity-badge severity-{esc(severity)}">{esc(severity)}</span>'
            f'<span class="finding-id">{esc(finding.get("id"))}</span></div>'
            f'<div class="finding-meta">{esc(finding.get("status", ""))} · {esc(finding.get("confidence"))} confidence</div>'
            "</div>"
            f'<h3>{esc(finding.get("category", "Uncategorized"))}</h3>'
            f'<div class="source-location">{esc(finding.get("location", ""))}</div>{comparison}'
            '<div class="finding-detail-grid">'
            f'<div><span>Evidence</span><p>{esc(finding.get("evidence", ""))}</p></div>'
            f'<div><span>Scientific consequence</span><p>{esc(finding.get("consequence", ""))}</p></div>'
            f'<div><span>Recommended action</span><p>{esc(finding.get("recommendation", ""))}</p></div>'
            "</div></article>"
        )
    return "".join(cards) + '<div id="no-findings" class="empty-state hidden">No findings match these filters.</div>'


def render_checks(checks: list[dict[str, Any]]) -> str:
    if not checks:
        return '<div class="empty-state">No checks were recorded.</div>'
    items = []
    for check in checks:
        status = check["status"]
        items.append(
            '<article class="check-card">'
            f'<span class="check-badge check-{esc(status).replace(" ", "-")}">{esc(status)}</span>'
            f'<div><h3>{esc(check.get("check", "Unnamed check"))}</h3>'
            f'<p>{esc(check.get("evidence", ""))}</p></div></article>'
        )
    return '<div class="check-grid">' + "".join(items) + "</div>"


def render_list(values: list[Any], empty_message: str) -> str:
    if not values:
        return f'<div class="empty-state">{esc(empty_message)}</div>'
    return '<ul class="limitations-list">' + "".join(f"<li>{esc(value)}</li>" for value in values) + "</ul>"


def build_html(record: dict[str, Any]) -> str:
    findings = record["findings"]
    counts = Counter(finding["severity"] for finding in findings)
    metric_cards = "".join(
        f'<div class="metric metric-{severity}"><span>{counts[severity]}</span><small>{severity.title()}</small></div>'
        for severity in ALLOWED_SEVERITIES
    )
    source_chips = "".join(
        f'<span class="source-chip">{esc(item)}</span>' for item in record["source_files"]
    ) or '<span class="muted">No source filenames recorded</span>'
    filters = '<button type="button" class="filter active" data-filter="all">All</button>' + "".join(
        f'<button type="button" class="filter" data-filter="{severity}">{severity.title()} {counts[severity]}</button>'
        for severity in ALLOWED_SEVERITIES
    )
    verdict_status = record["verdict"]["status"]
    verdict_class = verdict_status.replace(" ", "-")

    replacements = {
        "__TITLE__": esc(record.get("title", "Medical Data Integrity Review")),
        "__REVIEWED_AT__": esc(record.get("reviewed_at", "Date not supplied")),
        "__SCOPE__": esc(record.get("scope", "Scope not supplied")),
        "__SOURCE_CHIPS__": source_chips,
        "__VERDICT_STATUS__": esc(verdict_status),
        "__VERDICT_CLASS__": esc(verdict_class),
        "__METRIC_CARDS__": metric_cards,
        "__ARTIFACT__": render_artifact(record["artifact"]),
        "__INTERPRETATION__": render_interpretation(record["interpretation"]),
        "__RESULTS__": render_results(record["results"]),
        "__VERDICT__": render_verdict(record["verdict"], record.get("overall_confidence")),
        "__METHODS__": render_methods(record["methods"], record["methods_assessment"]),
        "__REVISIONS__": render_revisions(record["revisions"]),
        "__FILTERS__": filters,
        "__FINDINGS__": render_findings(findings),
        "__CHECKS__": render_checks(record["checks"]),
        "__LIMITATIONS__": render_list(record["limitations"], "No limitations were recorded."),
    }
    output = HTML_TEMPLATE
    for marker, value in replacements.items():
        output = output.replace(marker, value)
    return output


HTML_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'">
<title>__TITLE__</title>
<style>
:root {
  --ink:#172335; --muted:#697386; --subtle:#8b95a7; --line:#e3e8ef; --line-strong:#d2dae5;
  --paper:#ffffff; --canvas:#f3f6fa; --navy:#0d2238; --navy-soft:#163754; --blue:#2f6df6;
  --blue-soft:#eaf1ff; --teal:#148b78; --teal-soft:#e2f5f0; --critical:#b83232;
  --critical-soft:#fdeaea; --major:#c26214; --major-soft:#fff0df; --minor:#9b7710;
  --minor-soft:#fff7d9; --note:#526a7a; --note-soft:#edf2f5; --pass:#237a50; --pass-soft:#e4f5ec;
  --shadow:0 14px 40px rgba(22,42,68,.08); --radius:18px;
}
* { box-sizing:border-box; }
html { scroll-behavior:smooth; }
body { margin:0; color:var(--ink); background:var(--canvas); font:15px/1.58 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
button,input { font:inherit; }
.product-bar { height:68px; display:flex; align-items:center; justify-content:space-between; gap:20px; padding:0 clamp(20px,4vw,64px); color:#fff; background:var(--navy); border-bottom:1px solid rgba(255,255,255,.1); }
.brand { display:flex; align-items:center; gap:12px; font-weight:800; letter-spacing:-.01em; }
.brand-mark { width:36px; height:36px; display:grid; place-items:center; border-radius:11px; color:#fff; background:linear-gradient(135deg,#2f6df6,#20ae98); box-shadow:0 7px 20px rgba(47,109,246,.28); }
.brand small { display:block; color:#93a9bb; font-size:10px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; }
.print-button { cursor:pointer; border:1px solid rgba(255,255,255,.18); border-radius:10px; color:#fff; background:rgba(255,255,255,.07); padding:8px 13px; }
.hero { color:#fff; background:linear-gradient(115deg,var(--navy) 0%,#133754 60%,#135a63 125%); padding:38px clamp(20px,4vw,64px) 52px; }
.hero-inner { width:min(1540px,100%); margin:auto; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:32px; align-items:end; }
.hero h1 { max-width:980px; margin:8px 0 12px; font-family:Georgia,"Times New Roman",serif; font-size:clamp(33px,4.4vw,58px); line-height:1.05; letter-spacing:-.025em; }
.hero p { max-width:980px; margin:0; color:#cad9e5; font-size:15px; }
.eyebrow { color:#82d9ce; font-size:11px; font-weight:850; letter-spacing:.13em; text-transform:uppercase; }
.hero-status { min-width:220px; border:1px solid rgba(255,255,255,.14); border-radius:16px; padding:16px 18px; background:rgba(255,255,255,.07); backdrop-filter:blur(8px); }
.hero-status span { display:block; color:#a8bbc9; font-size:10px; font-weight:800; letter-spacing:.1em; text-transform:uppercase; }
.hero-status strong { display:block; margin-top:5px; font-size:19px; text-transform:capitalize; }
.shell { width:min(1540px,94vw); margin:-24px auto 64px; position:relative; }
.summary-strip { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:18px; padding:18px 20px; border:1px solid var(--line); border-radius:var(--radius); background:rgba(255,255,255,.98); box-shadow:var(--shadow); }
.meta-row { display:flex; flex-wrap:wrap; align-items:center; gap:9px; }
.meta-label { color:var(--subtle); font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
.source-chip { display:inline-flex; align-items:center; max-width:280px; border:1px solid var(--line); border-radius:999px; padding:5px 10px; color:#4b586a; background:#f8fafc; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.metrics { display:grid; grid-template-columns:repeat(4,74px); gap:8px; }
.metric { display:flex; align-items:center; justify-content:center; gap:7px; border-radius:11px; padding:8px; background:#f6f8fb; }
.metric span { font-size:20px; font-weight:850; }
.metric small { color:var(--muted); font-size:10px; font-weight:700; }
.metric-critical span { color:var(--critical); } .metric-major span { color:var(--major); }
.metric-minor span { color:var(--minor); } .metric-note span { color:var(--note); }
.workspace { display:grid; grid-template-columns:minmax(500px,1.14fr) minmax(380px,.86fr); gap:20px; align-items:start; margin-top:20px; }
.panel,.section-card,.context-card { border:1px solid var(--line); border-radius:var(--radius); background:var(--paper); box-shadow:var(--shadow); }
.visual-panel { position:sticky; top:18px; min-width:0; padding:24px; }
.panel-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:18px; }
.panel-heading h2 { margin:3px 0 0; font-family:Georgia,"Times New Roman",serif; font-size:27px; line-height:1.15; }
.section-kicker,.micro-label { color:var(--teal); font-size:10px; font-weight:850; letter-spacing:.12em; text-transform:uppercase; }
.neutral-badge,.status-badge,.severity-badge,.check-badge { display:inline-flex; align-items:center; border-radius:999px; padding:5px 9px; font-size:10px; font-weight:850; letter-spacing:.04em; text-transform:uppercase; }
.neutral-badge { color:#536275; background:#eef2f6; }
.artifact-stage { min-height:440px; max-height:690px; display:grid; place-items:center; overflow:auto; border:1px solid var(--line); border-radius:14px; background:linear-gradient(135deg,#f9fbfd,#f0f4f8); padding:18px; }
.artifact-image { display:block; max-width:100%; height:auto; transform-origin:center center; transition:transform .18s ease; }
.artifact-caption { margin-top:14px; padding:13px 15px; border-left:3px solid #8ab6af; border-radius:0 8px 8px 0; color:#506071; background:#f7faf9; font-family:Georgia,"Times New Roman",serif; font-size:14px; }
.zoom-controls { display:flex; justify-content:center; gap:7px; margin-top:12px; }
.zoom-controls button { cursor:pointer; min-width:38px; border:1px solid var(--line-strong); border-radius:9px; color:#415064; background:#fff; padding:6px 10px; }
.analysis-panel { display:grid; gap:14px; }
.analysis-card { overflow:hidden; border:1px solid var(--line); border-radius:16px; background:var(--paper); box-shadow:var(--shadow); padding:20px; }
.analysis-card h3 { margin:9px 0 7px; font-family:Georgia,"Times New Roman",serif; font-size:22px; line-height:1.2; }
.analysis-card p { margin:8px 0 0; color:#435165; }
.analysis-label { display:flex; align-items:center; gap:9px; color:var(--blue); font-size:10px; font-weight:850; letter-spacing:.11em; text-transform:uppercase; }
.analysis-label span { width:25px; height:25px; display:grid; place-items:center; border-radius:8px; color:#fff; background:var(--blue); letter-spacing:0; }
.interpretation-card { border-top:4px solid var(--blue); }
.results-card { border-top:4px solid #7d8ca1; }
.verdict-card { border-top:4px solid var(--major); }
.verdict-correct { border-top-color:var(--pass); } .verdict-completely-incorrect { border-top-color:var(--critical); }
.verdict-not-assessable { border-top-color:var(--note); }
.key-points { display:grid; gap:6px; margin:12px 0 0; padding-left:19px; color:#435165; }
.source-location { color:var(--subtle); font-size:12px; margin:6px 0 0; }
blockquote { margin:12px 0 0; padding:0 0 0 15px; border-left:3px solid #a9b5c4; color:#2f3b4b; white-space:pre-wrap; font-family:Georgia,"Times New Roman",serif; font-size:16px; line-height:1.55; }
.verdict-line { display:flex; align-items:center; gap:12px; margin-top:13px; }
.verdict-icon { width:44px; height:44px; display:grid; place-items:center; flex:0 0 auto; border-radius:14px; color:#fff; background:var(--major); font-size:25px; font-weight:800; }
.verdict-correct .verdict-icon { background:var(--pass); } .verdict-completely-incorrect .verdict-icon { background:var(--critical); }
.verdict-not-assessable .verdict-icon { background:var(--note); }
.verdict-status { font-family:Georgia,"Times New Roman",serif; font-size:22px; font-weight:700; text-transform:capitalize; }
.confidence { color:var(--muted); font-size:12px; }
.modifications { margin-top:14px; padding:13px 15px; border-radius:11px; background:#fff7eb; }
.modifications ul { margin:7px 0 0; padding-left:18px; }
.section-card { margin-top:20px; padding:24px; }
.section-head { display:flex; align-items:end; justify-content:space-between; gap:20px; margin-bottom:18px; }
.section-head h2 { margin:3px 0 0; font-family:Georgia,"Times New Roman",serif; font-size:28px; line-height:1.15; }
.section-head p { max-width:620px; margin:0; color:var(--muted); font-size:13px; }
.methods-grid { display:grid; grid-template-columns:1.2fr .8fr; gap:16px; }
.context-card { padding:20px; box-shadow:none; }
.assessment-card p { margin:12px 0 0; color:#435165; }
.method-appropriate { color:var(--pass); background:var(--pass-soft); }
.method-needs-clarification { color:var(--major); background:var(--major-soft); }
.method-not-appropriate { color:var(--critical); background:var(--critical-soft); }
.method-not-assessable { color:var(--note); background:var(--note-soft); }
.revision-table-wrap,.table-scroll { overflow:auto; border:1px solid var(--line); border-radius:14px; }
table { width:100%; border-collapse:collapse; }
.revision-table { table-layout:fixed; min-width:1040px; }
.revision-table th { width:25%; padding:13px 15px; color:#546277; background:#f3f6fa; font-size:11px; letter-spacing:.05em; text-align:left; text-transform:uppercase; }
.revision-table th span { display:inline-grid; place-items:center; width:22px; height:22px; margin-right:7px; border-radius:7px; color:#fff; background:#728196; font-size:9px; }
.revision-table th:last-child span { background:var(--teal); }
.revision-table td { padding:17px 15px; border-top:1px solid var(--line); vertical-align:top; color:#3b4859; }
.revision-id { color:var(--blue); font-size:11px; font-weight:850; }
.original-copy { margin-top:8px; color:#263446; font-family:Georgia,"Times New Roman",serif; }
.replacement-cell { background:#f3fbf8; }
.replacement-copy { color:#1d4b43; font-family:Georgia,"Times New Roman",serif; }
.copy-button { cursor:pointer; margin-top:11px; border:1px solid #b9dcd3; border-radius:8px; color:#166c5c; background:#fff; padding:6px 9px; font-size:11px; font-weight:750; }
.controls { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.filter { cursor:pointer; border:1px solid var(--line-strong); border-radius:999px; color:#506074; background:#fff; padding:7px 11px; font-size:12px; }
.filter.active { color:#fff; border-color:var(--navy-soft); background:var(--navy-soft); }
#finding-search { min-width:230px; flex:1; border:1px solid var(--line-strong); border-radius:10px; padding:8px 11px; color:var(--ink); background:#fff; }
.findings-list { display:grid; gap:12px; }
.finding-card { border:1px solid var(--line); border-left:4px solid var(--note); border-radius:14px; padding:18px; background:#fff; }
.finding-critical { border-left-color:var(--critical); } .finding-major { border-left-color:var(--major); }
.finding-minor { border-left-color:var(--minor); } .finding-note { border-left-color:var(--note); }
.finding-top { display:flex; justify-content:space-between; gap:16px; align-items:center; }
.severity-critical { color:var(--critical); background:var(--critical-soft); }
.severity-major { color:var(--major); background:var(--major-soft); }
.severity-minor { color:var(--minor); background:var(--minor-soft); }
.severity-note { color:var(--note); background:var(--note-soft); }
.finding-id { margin-left:8px; color:var(--muted); font-size:11px; font-weight:800; }
.finding-meta { color:var(--muted); font-size:12px; text-transform:capitalize; }
.finding-card h3 { margin:12px 0 0; font-family:Georgia,"Times New Roman",serif; font-size:21px; }
.evidence-pair { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:14px; }
.evidence-pair div { padding:12px; border:1px solid var(--line); border-radius:11px; background:#f8fafc; }
.evidence-pair span,.finding-detail-grid span { display:block; color:var(--subtle); font-size:9px; font-weight:850; letter-spacing:.09em; text-transform:uppercase; }
.evidence-pair strong { display:block; margin-top:4px; color:#344255; font-size:13px; }
.finding-detail-grid { display:grid; grid-template-columns:1fr 1fr 1.15fr; gap:15px; margin-top:16px; }
.finding-detail-grid p { margin:5px 0 0; color:#435165; font-size:13px; }
.check-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
.check-card { display:grid; grid-template-columns:110px 1fr; gap:14px; align-items:start; border:1px solid var(--line); border-radius:13px; padding:15px; background:#fff; }
.check-card h3 { margin:0; font-size:14px; }
.check-card p { margin:5px 0 0; color:var(--muted); font-size:13px; }
.check-pass { color:var(--pass); background:var(--pass-soft); } .check-fail { color:var(--critical); background:var(--critical-soft); }
.check-warning { color:var(--major); background:var(--major-soft); } .check-not-assessable { color:var(--note); background:var(--note-soft); }
.limitations-list { display:grid; gap:8px; margin:0; padding-left:20px; color:#4a586a; }
.empty-state { padding:26px; border:1px dashed var(--line-strong); border-radius:12px; color:var(--muted); background:#f8fafc; text-align:center; }
.muted { color:var(--muted); }
.hidden { display:none !important; }
@media (max-width:1050px) {
  .workspace { grid-template-columns:1fr; } .visual-panel { position:static; }
  .artifact-stage { min-height:340px; } .methods-grid { grid-template-columns:1fr; }
  .finding-detail-grid { grid-template-columns:1fr; }
}
@media (max-width:720px) {
  .product-bar { height:auto; padding-top:12px; padding-bottom:12px; }
  .hero-inner,.summary-strip { grid-template-columns:1fr; } .hero-status { min-width:0; }
  .metrics { grid-template-columns:repeat(4,1fr); } .metric { display:block; text-align:center; }
  .section-head { display:block; } .section-head p { margin-top:8px; }
  .check-grid,.evidence-pair { grid-template-columns:1fr; } .finding-top { align-items:flex-start; flex-direction:column; gap:6px; }
  .artifact-stage { min-height:260px; padding:8px; }
}
@media print {
  body { background:#fff; } .product-bar,.print-button,.controls,.zoom-controls,.copy-button { display:none !important; }
  .hero { padding:24px; } .shell { width:100%; margin:0; } .summary-strip { box-shadow:none; }
  .visual-panel { position:static; } .panel,.section-card,.context-card,.analysis-card { box-shadow:none; break-inside:avoid; }
  .workspace { grid-template-columns:1fr 1fr; } .artifact-stage { min-height:300px; }
}
</style>
</head>
<body>
<nav class="product-bar">
  <div class="brand"><span class="brand-mark">MI</span><div>MedIntegrity<small>Evidence Review · Version 2.0</small></div></div>
  <button id="print-review" type="button" class="print-button">Print review</button>
</nav>
<header class="hero">
  <div class="hero-inner">
    <div><div class="eyebrow">Medical data integrity review</div><h1>__TITLE__</h1><p>__SCOPE__</p></div>
    <div class="hero-status verdict-__VERDICT_CLASS__"><span>Current verdict</span><strong>__VERDICT_STATUS__</strong></div>
  </div>
</header>
<main class="shell">
  <section class="summary-strip">
    <div class="meta-row"><span class="meta-label">Reviewed</span><span>__REVIEWED_AT__</span><span class="meta-label">Sources</span>__SOURCE_CHIPS__</div>
    <div class="metrics">__METRIC_CARDS__</div>
  </section>

  <section class="workspace" aria-label="Evidence comparison workspace">
    <div class="panel visual-panel">__ARTIFACT__</div>
    <div class="analysis-panel">__INTERPRETATION____RESULTS____VERDICT__</div>
  </section>

  <section class="section-card">
    <div class="section-head"><div><div class="section-kicker">Analytical context</div><h2>Methods and data fit</h2></div><p>Confirms whether the stated method is appropriate for the supplied design, variables, analysis population, and inferential target.</p></div>
    __METHODS__
  </section>

  <section class="section-card">
    <div class="section-head"><div><div class="section-kicker">Action pathway</div><h2>From evidence to publication-ready revision</h2></div><p>Original wording or data is preserved before interpretation, recommendation, and proposed replacement.</p></div>
    __REVISIONS__
  </section>

  <section class="section-card">
    <div class="section-head"><div><div class="section-kicker">Audit trail</div><h2>Detailed findings</h2></div><div class="controls">__FILTERS__<input id="finding-search" type="search" placeholder="Search findings" aria-label="Search findings"></div></div>
    <div class="findings-list">__FINDINGS__</div>
  </section>

  <section class="section-card">
    <div class="section-head"><div><div class="section-kicker">Verification</div><h2>Checks performed</h2></div><p>Passed, failed, warning, and not-assessable checks remain visible for reproducibility.</p></div>
    __CHECKS__
  </section>

  <section class="section-card">
    <div class="section-head"><div><div class="section-kicker">Review boundary</div><h2>Limitations and items not assessable</h2></div></div>
    __LIMITATIONS__
  </section>
</main>
<script>
const filterButtons = [...document.querySelectorAll('.filter')];
const findingCards = [...document.querySelectorAll('.finding-card')];
const findingSearch = document.getElementById('finding-search');
const noFindings = document.getElementById('no-findings');
let activeSeverity = 'all';
function applyFindingFilters() {
  const query = (findingSearch?.value || '').trim().toLowerCase();
  let visible = 0;
  findingCards.forEach(card => {
    const severityMatch = activeSeverity === 'all' || card.dataset.severity === activeSeverity;
    const searchMatch = !query || (card.dataset.search || '').includes(query);
    card.hidden = !(severityMatch && searchMatch);
    if (!card.hidden) visible += 1;
  });
  if (noFindings) noFindings.classList.toggle('hidden', visible !== 0 || findingCards.length === 0);
}
filterButtons.forEach(button => button.addEventListener('click', () => {
  filterButtons.forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  activeSeverity = button.dataset.filter;
  applyFindingFilters();
}));
if (findingSearch) findingSearch.addEventListener('input', applyFindingFilters);

const artifactImage = document.getElementById('artifact-image');
let artifactScale = 1;
document.querySelectorAll('[data-zoom]').forEach(button => button.addEventListener('click', () => {
  if (!artifactImage) return;
  const action = button.dataset.zoom;
  artifactScale = action === 'reset' ? 1 : Math.min(2, Math.max(.65, artifactScale + (action === 'in' ? .15 : -.15)));
  artifactImage.style.transform = `scale(${artifactScale})`;
  const reset = document.querySelector('[data-zoom="reset"]');
  if (reset) reset.textContent = `${Math.round(artifactScale * 100)}%`;
}));

document.querySelectorAll('.copy-button').forEach(button => button.addEventListener('click', async () => {
  const target = document.getElementById(button.dataset.copyTarget);
  if (!target) return;
  try {
    await navigator.clipboard.writeText(target.innerText);
    const previous = button.textContent;
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = previous; }, 1400);
  } catch (_) {
    button.textContent = 'Select and copy';
  }
}));

document.getElementById('print-review')?.addEventListener('click', () => window.print());
</script>
</body>
</html>
"""


def main() -> int:
    global ALLOWED_ROOT
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("review_json", type=Path, help="JSON review record")
    parser.add_argument("--output", type=Path, required=True, help="HTML file to create")
    parser.add_argument("--allowed-root", type=Path, required=True, help="Project artifact root containing all inputs and outputs")
    parser.add_argument("--validate-only", action="store_true", help="Validate without writing HTML")
    args = parser.parse_args()

    try:
        ALLOWED_ROOT = args.allowed_root.expanduser().resolve(strict=True)
        if not ALLOWED_ROOT.is_dir():
            raise ValueError("--allowed-root must be a directory")
        review_path = contained_path(args.review_json, "review_json")
        output_path = contained_path(args.output, "output")
        if review_path.stat().st_size > MAX_REVIEW_BYTES:
            raise ValueError(f"review JSON exceeds {MAX_REVIEW_BYTES} bytes")
        payload = json.loads(review_path.read_text(encoding="utf-8"))
        record = normalize(require_mapping(payload, "review record"))
        rendered = build_html(record)
        if args.validate_only:
            print(f"Valid version 2 review record: {review_path}")
            return 0
        output_path.parent.mkdir(parents=True, exist_ok=True)
        if output_path.is_symlink():
            raise ValueError("output must not be a symbolic link")
        output_path.write_text(rendered, encoding="utf-8")
        print(f"Created version 2 review interface: {output_path}")
        return 0
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        parser.error(str(exc))
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
