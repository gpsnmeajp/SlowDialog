#!/usr/bin/env python3
"""Build self-contained SlowDialog HTML files into dist/."""

from __future__ import annotations

import argparse
import base64
import json
import re
from pathlib import Path
from urllib.parse import unquote


ROOT = Path(__file__).resolve().parent
DEFAULT_DIST = ROOT / "dist"

HTML_TARGETS = (
    ("index.html", "index.html"),
    ("index_en.html", "index_en.html"),
)

MIME_TYPES = {
    ".css": "text/css",
    ".js": "text/javascript",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".wav": "audio/wav",
}

CSS_URL_RE = re.compile(r"url\(\s*(['\"]?)([^'\"\)]+)\1\s*\)", re.IGNORECASE)
TAG_ATTR_RE = re.compile(
    r"([:\w-]+)\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s\"'>/]+)",
    re.IGNORECASE,
)
LINK_TAG_RE = re.compile(r"<link\b[^>]*>", re.IGNORECASE)
SCRIPT_SRC_TAG_RE = re.compile(
    r"<script\b[^>]*\bsrc\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s\"'>/]+)[^>]*>\s*</script>",
    re.IGNORECASE,
)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as fp:
        fp.write(text)


def mime_type(path: Path) -> str:
    return MIME_TYPES.get(path.suffix.lower(), "application/octet-stream")


def data_url(path: Path) -> str:
    payload = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime_type(path)};base64,{payload}"


def is_external_url(url: str) -> bool:
    lowered = url.lower()
    return (
        lowered.startswith("data:")
        or lowered.startswith("http://")
        or lowered.startswith("https://")
        or lowered.startswith("//")
        or lowered.startswith("#")
    )


def resolve_local_path(base_dir: Path, url: str) -> Path:
    clean_url = unquote(url.split("#", 1)[0].split("?", 1)[0])
    path = (base_dir / clean_url).resolve()
    path.relative_to(ROOT.resolve())
    return path


def embed_css_urls(css: str, css_path: Path) -> str:
    def replace_url(match: re.Match[str]) -> str:
        quote, raw_url = match.group(1), match.group(2).strip()
        if is_external_url(raw_url):
            return match.group(0)

        asset_path = resolve_local_path(css_path.parent, raw_url)
        if not asset_path.is_file():
            raise FileNotFoundError(f"CSS asset not found: {raw_url} -> {asset_path}")

        preferred_quote = quote or '"'
        return f"url({preferred_quote}{data_url(asset_path)}{preferred_quote})"

    return CSS_URL_RE.sub(replace_url, css)


def embed_audio_urls(js: str, sound_dir: Path) -> str:
    audio_map = {
        path.stem: data_url(path)
        for path in sorted(sound_dir.glob("*.wav"))
        if path.is_file()
    }
    if not audio_map:
        raise FileNotFoundError(f"No WAV files found in {sound_dir}")

    audio_json = json.dumps(audio_map, ensure_ascii=True, separators=(",", ":"))
    injection = (
        f"const SLOWDIALOG_BUNDLED_AUDIO = Object.freeze({audio_json});\n"
    )

    strict_marker = "'use strict';\n"
    if strict_marker not in js:
        raise ValueError("app.js does not contain the expected 'use strict' marker")
    js = js.replace(strict_marker, strict_marker + "\n" + injection, 1)

    original = "_cache[name] = new Audio(`sound/${name}.wav`);"
    replacement = "_cache[name] = new Audio(SLOWDIALOG_BUNDLED_AUDIO[name] || '');"
    if original not in js:
        raise ValueError("app.js audio loader pattern was not found")
    return js.replace(original, replacement, 1)


def attrs_from_tag(tag: str) -> dict[str, str]:
    attrs: dict[str, str] = {}
    for match in TAG_ATTR_RE.finditer(tag):
        name = match.group(1).lower()
        value = match.group(2).strip("\"'")
        attrs[name] = value
    return attrs


def replace_stylesheet(html: str, href: str, css: str) -> str:
    escaped_css = css.replace("</style", "<\\/style")
    replacement = (
        "<style>\n"
        "/* Bundled from style.css by package_single_html.py */\n"
        f"{escaped_css}\n"
        "</style>"
    )
    replaced = 0

    def replace_tag(match: re.Match[str]) -> str:
        nonlocal replaced
        tag = match.group(0)
        attrs = attrs_from_tag(tag)
        rels = {part.lower() for part in attrs.get("rel", "").split()}
        if "stylesheet" in rels and attrs.get("href") == href:
            replaced += 1
            return replacement
        return tag

    html = LINK_TAG_RE.sub(replace_tag, html)
    if replaced != 1:
        raise ValueError(f"Expected to replace one stylesheet link, replaced {replaced}")
    return html


def replace_script(html: str, src: str, js: str) -> str:
    escaped_js = js.replace("</script", "<\\/script")
    replacement = (
        "<script>\n"
        "// Bundled from app.js by package_single_html.py\n"
        f"{escaped_js}\n"
        "</script>"
    )
    replaced = 0

    def replace_tag(match: re.Match[str]) -> str:
        nonlocal replaced
        tag = match.group(0)
        attrs = attrs_from_tag(tag)
        if attrs.get("src") == src:
            replaced += 1
            return replacement
        return tag

    html = SCRIPT_SRC_TAG_RE.sub(replace_tag, html)
    if replaced != 1:
        raise ValueError(f"Expected to replace one script tag, replaced {replaced}")
    return html


def build_html(source_html: Path, css: str, js: str) -> str:
    html = read_text(source_html)
    html = replace_stylesheet(html, "style.css", css)
    html = replace_script(html, "app.js", js)
    return html


def validate_bundle(html: str, output_path: Path) -> None:
    forbidden_patterns = (
        r"<link\b[^>]*\bhref\s*=\s*['\"]style\.css['\"]",
        r"<script\b[^>]*\bsrc\s*=\s*['\"]app\.js['\"]",
        r"url\(\s*['\"]?(?:fonts|sound)/",
        r"\bsound/\$\{name\}\.wav\b",
    )
    for pattern in forbidden_patterns:
        if re.search(pattern, html, re.IGNORECASE):
            raise ValueError(f"Local resource reference remained in {output_path}: {pattern}")


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def build(output_dir: Path) -> list[Path]:
    css_path = ROOT / "style.css"
    js_path = ROOT / "app.js"
    sound_dir = ROOT / "sound"

    css = embed_css_urls(read_text(css_path), css_path)
    js = embed_audio_urls(read_text(js_path), sound_dir)

    output_dir.mkdir(parents=True, exist_ok=True)
    outputs: list[Path] = []

    for source_name, output_name in HTML_TARGETS:
        output_path = output_dir / output_name
        html = build_html(ROOT / source_name, css, js)
        validate_bundle(html, output_path)
        write_text(output_path, html)
        outputs.append(output_path)

    return outputs


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Bundle SlowDialog into self-contained HTML files."
    )
    parser.add_argument(
        "--dist",
        type=Path,
        default=DEFAULT_DIST,
        help="Output directory. Defaults to ./dist.",
    )
    args = parser.parse_args()

    outputs = build(args.dist.resolve())
    print("Built self-contained HTML files:")
    for path in outputs:
        print(f"- {display_path(path)} ({path.stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
