#!/usr/bin/env python3
"""Static repository checks for A2CA.

Uses only the Python standard library so it can run on a fresh clone.
"""
from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import json
import re
import subprocess
import sys
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "resources"


class HtmlRefs(HTMLParser):
    def __init__(self, file: Path) -> None:
        super().__init__(convert_charrefs=True)
        self.file = file
        self.ids: list[str] = []
        self.refs: list[str] = []

    def handle_starttag(self, tag: str, attrs):
        d = dict(attrs)
        if d.get("id"):
            self.ids.append(d["id"])
        for key in ("href", "src"):
            value = d.get(key)
            if value:
                self.refs.append(value)
        style = d.get("style", "")
        self.refs.extend(re.findall(r"url\(['\"]?([^'\")]+)", style))


def local_target(base: Path, ref: str) -> Path | None:
    ref = ref.strip()
    if not ref or ref.startswith(("#", "data:", "mailto:", "javascript:")):
        return None
    parts = urlsplit(ref)
    if parts.scheme or parts.netloc:
        return None
    path = parts.path
    if not path or path == "about:blank":
        return None
    return (base / path).resolve()


def check_html(errors: list[str]) -> None:
    root_resolved = ROOT.resolve()
    for file in sorted(p for p in ROOT.rglob("*.html") if not is_ignored(p)):
        parser = HtmlRefs(file)
        parser.feed(file.read_text(encoding="utf-8"))
        seen: set[str] = set()
        dupes: set[str] = set()
        for elem_id in parser.ids:
            if elem_id in seen:
                dupes.add(elem_id)
            seen.add(elem_id)
        if dupes:
            errors.append(f"{file.relative_to(ROOT)} has duplicate id(s): {', '.join(sorted(dupes))}")
        for ref in parser.refs:
            target = local_target(file.parent, ref)
            if target is None:
                continue
            try:
                target.relative_to(root_resolved)
            except ValueError:
                errors.append(f"{file.relative_to(ROOT)} references outside repository: {ref}")
                continue
            if not target.exists():
                errors.append(f"{file.relative_to(ROOT)} missing local reference: {ref}")


def check_css(errors: list[str]) -> None:
    for file in sorted(p for p in ROOT.rglob("*.css") if not is_ignored(p)):
        text = file.read_text(encoding="utf-8")
        for ref in re.findall(r"url\(['\"]?([^'\")]+)", text):
            target = local_target(file.parent, ref)
            if target is not None and not target.exists():
                errors.append(f"{file.relative_to(ROOT)} missing CSS resource: {ref}")


def check_version(errors: list[str]) -> None:
    version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        errors.append(f"VERSION is not semantic x.y.z: {version!r}")
    main_py = (ROOT / "main.py").read_text(encoding="utf-8")
    core = (RES / "a2ca-core.js").read_text(encoding="utf-8")
    analysis = (RES / "analysis.js").read_text(encoding="utf-8")
    upload = (RES / "upload.html").read_text(encoding="utf-8")
    if 'APP_VERSION = (ROOT / "VERSION").read_text' not in main_py:
        errors.append("main.py does not use VERSION as the canonical application version")
    if 'data-a2ca-version' not in upload or 'getAppMeta' not in core:
        errors.append("browser version labels are not hydrated from /api/meta")
    if "await A2CA.getAppVersion()" not in analysis:
        errors.append("analysis session export does not use the canonical server version")
    try:
        package_version = json.loads((ROOT / "package.json").read_text(encoding="utf-8")).get("version")
    except (OSError, json.JSONDecodeError):
        package_version = None
    if package_version != version:
        errors.append(f"package.json version {package_version!r} does not match VERSION {version}")
    citation = (ROOT / "CITATION.cff").read_text(encoding="utf-8")
    if f"version: {version}" not in citation:
        errors.append("CITATION.cff version does not match VERSION")
    for file in ROOT.rglob("*"):
        if not file.is_file() or file.name in {"CHANGELOG.md", "validate_repo.py"}:
            continue
        if file.suffix.lower() not in {".py", ".js", ".html", ".css", ".md", ".json", ".toml", ".cff"}:
            continue
        text = file.read_text(encoding="utf-8", errors="ignore")
        if "2.0.42" in text:
            errors.append(f"stale application version 2.0.42 in {file.relative_to(ROOT)}")


def check_generated_files(errors: list[str]) -> None:
    bad = []
    for p in ROOT.rglob("*"):
        if "__pycache__" in p.parts or p.suffix in {".pyc", ".pyo"}:
            bad.append(str(p.relative_to(ROOT)))
    if bad:
        errors.append("generated Python artifacts found: " + ", ".join(bad))


def check_python(errors: list[str]) -> None:
    for file in sorted(p for p in ROOT.rglob("*.py") if not is_ignored(p)):
        try:
            compile(file.read_text(encoding="utf-8"), str(file), "exec")
        except SyntaxError as exc:
            errors.append(f"Python syntax error in {file.relative_to(ROOT)}: {exc}")


def check_javascript(errors: list[str]) -> None:
    try:
        subprocess.run(["node", "--version"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("Note: Node.js not available; JavaScript syntax check skipped.")
        return
    for file in sorted(p for p in ROOT.rglob("*.js") if not is_ignored(p)):
        proc = subprocess.run(["node", "--check", str(file)], capture_output=True, text=True)
        if proc.returncode:
            errors.append(f"JavaScript syntax error in {file.relative_to(ROOT)}:\n{proc.stderr.strip()}")



def check_deployment(errors: list[str]) -> None:
    main_py = ROOT / "main.py"
    railway = ROOT / "railway.toml"
    if not main_py.exists():
        errors.append("main.py is missing")
    if not railway.exists():
        errors.append("railway.toml is missing")
    else:
        text = railway.read_text(encoding="utf-8")
        if 'startCommand = "python main.py"' not in text:
            errors.append("railway.toml does not start python main.py")
        if 'healthcheckPath = "/health"' not in text:
            errors.append("railway.toml does not configure /health")
    railpack = ROOT / "railpack.json"
    if not railpack.exists():
        errors.append("railpack.json is missing")
    else:
        try:
            config = json.loads(railpack.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"railpack.json is invalid JSON: {exc}")
        else:
            packages = config.get("deploy", {}).get("aptPackages", [])
            if not isinstance(packages, list):
                errors.append("railpack deploy.aptPackages must be a list")
            else:
                for package in ("mafft", "fasttree"):
                    if package not in packages:
                        errors.append(f"railpack.json does not install the {package} runtime package")
                if "..." not in packages:
                    errors.append("railpack deploy.aptPackages should extend generated packages with '...'")
            if config.get("deploy", {}).get("startCommand") != "python main.py":
                errors.append("railpack.json does not start python main.py")
    upload_fasta = (RES / "upload_fasta.html").read_text(encoding="utf-8")
    upload_fasta_js = (RES / "upload_fasta.js").read_text(encoding="utf-8")
    if "biowasm" in upload_fasta.lower() or "Aioli" in upload_fasta_js:
        errors.append("browser-side FastTree/BioWasm dependency is still present")
    if "looksLikeAlignedFasta" in upload_fasta_js:
        errors.append("obsolete undefined looksLikeAlignedFasta helper is still referenced")
    if "a2ca-services.js" not in upload_fasta:
        errors.append("FASTA workflow does not load a2ca-services.js")
    analysis_html = (RES / "analysis.html").read_text(encoding="utf-8")
    if "a2ca-analysis-science.js" not in analysis_html:
        errors.append("analysis page does not load a2ca-analysis-science.js")
    obsolete = [
        ROOT / "run_A2CA_offline.html",
        ROOT / "run_A2CA_online_Windows.bat",
        ROOT / "run_A2CA_online_Mac.command",
        RES / "run_A2CA.py",
    ]
    for file in obsolete:
        if file.exists():
            errors.append(f"obsolete desktop launcher present in web edition: {file.relative_to(ROOT)}")


def main() -> int:
    errors: list[str] = []
    check_html(errors)
    check_css(errors)
    check_version(errors)
    check_generated_files(errors)
    check_deployment(errors)
    check_python(errors)
    check_javascript(errors)
    if errors:
        print("A2CA repository validation failed:\n")
        for i, error in enumerate(errors, 1):
            print(f"{i}. {error}")
        return 1
    print("A2CA repository validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
