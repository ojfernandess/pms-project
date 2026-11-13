"""
List supabase.rpc(...) names used under src/ (TypeScript/TSX).
Run: python scripts/migration_frontend_rpc_inventory.py
Writes: docs/migration/frontend-rpc-inventory.md
"""
from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "src"
OUT_DEFAULT = REPO / "docs" / "migration" / "frontend-rpc-inventory.md"


def extract_rpc_name_after_paren(s: str, open_paren: int) -> str | None:
    """s[open_paren] == '('; find first quoted string inside parens."""
    i = open_paren + 1
    n = len(s)
    while i < n and s[i].isspace():
        i += 1
    if i >= n:
        return None
    q = s[i]
    if q not in "\"'`":
        return None
    i += 1
    start = i
    while i < n and s[i] != q:
        if q != "`" and s[i] == "\\":
            i += 2
            continue
        i += 1
    if i >= n:
        return None
    return s[start:i]


def scan_file(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    lines = text.splitlines()
    found: list[str] = []
    for li, line in enumerate(lines):
        # Multiline: .rpc(\n  "name"
        if ".rpc(" in line:
            p = line.find(".rpc(")
            block = line[p:]
            # If closing paren on same line with string
            name = extract_rpc_name_after_paren(block, block.find("("))
            if name:
                found.append(name)
                continue
            # Look ahead a few lines
            frag = "\n".join(lines[li : min(li + 6, len(lines))])
            pos = frag.find(".rpc(")
            if pos == -1:
                continue
            name = extract_rpc_name_after_paren(frag, pos + len(".rpc") - 1 + 1)
            if name:
                found.append(name)
    return found


def main() -> None:
    by_rpc: dict[str, list[str]] = defaultdict(list)
    doc_only: dict[str, list[str]] = defaultdict(list)

    for path in sorted(SRC.rglob("*.ts")) + sorted(SRC.rglob("*.tsx")):
        rel = path.relative_to(REPO).as_posix()
        names = scan_file(path)
        for n in names:
            if rel == "src/pages/Documentation.tsx":
                doc_only[n].append(rel)
            else:
                by_rpc[n].append(rel)

    lines: list[str] = []
    lines.append("# Inventário: RPCs chamados pelo frontend (`src/`)")
    lines.append("")
    lines.append(
        "Gerado por `scripts/migration_frontend_rpc_inventory.py`. "
        "Extrai o primeiro argumento em string de cada "
        "`supabase.rpc(...)` / `(supabase as any).rpc(...)`."
    )
    lines.append("")
    lines.append("## Tabela (exclui exemplos em `Documentation.tsx`)")
    lines.append("")
    lines.append("| RPC | Ficheiros |")
    lines.append("| --- | --- |")
    for name in sorted(by_rpc):
        files = sorted(set(by_rpc[name]))
        file_list = ", ".join(f"`{f}`" for f in files)
        lines.append(f"| `{name}` | {len(files)} - {file_list} |")

    if doc_only:
        lines.append("")
        lines.append("## Apenas exemplos em documentação")
        lines.append("")
        lines.append(
            "_Estes aparecem em `src/pages/Documentation.tsx` (snippets de exemplo); "
            "não contar como uso em produção._"
        )
        lines.append("")
        lines.append("| RPC |")
        lines.append("| --- |")
        for name in sorted(doc_only):
            lines.append(f"| `{name}` |")

    lines.append("")
    lines.append(f"_Total de RPCs distintos (sem Documentation): **{len(by_rpc)}**._")
    lines.append("")

    out = Path(sys.argv[1]) if len(sys.argv) > 1 else OUT_DEFAULT
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
