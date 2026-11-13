"""
Scan supabase/migrations/*.sql for CREATE TRIGGER / DROP TRIGGER.

Writes docs/migration/triggers-inventory.md

Run from repo root: python scripts/migration_triggers_inventory.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from migration_sql_scanner import (
    extract_quoted_or_ident,
    iter_statements,
    parse_qualified_name,
    strip_leading_comments,
)

REPO = Path(__file__).resolve().parent.parent
MIGRATIONS = REPO / "supabase" / "migrations"
OUT_DEFAULT = REPO / "docs" / "migration" / "triggers-inventory.md"


def classify_trigger_stmt(stmt: str) -> str:
    t = strip_leading_comments(stmt)
    if not t:
        return "other"
    u = t.upper()
    if u.startswith("CREATE TRIGGER") or u.startswith("CREATE OR REPLACE TRIGGER"):
        return "create_trigger"
    if u.startswith("DROP TRIGGER"):
        return "drop_trigger"
    return "other"


def parse_drop_trigger(stmt: str) -> dict | None:
    t = strip_leading_comments(stmt)
    m = re.match(r"DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?", t, re.IGNORECASE | re.DOTALL)
    if not m:
        return None
    i = m.end()
    name, i = extract_quoted_or_ident(t, i)
    if not name:
        return None
    m_on = re.search(r"\bON\s+", t[i:], re.IGNORECASE)
    if not m_on:
        return None
    j = i + m_on.end()
    table, _ = parse_qualified_name(t, j)
    if not table:
        return None
    return {"trigger_name": name, "table": table}


def parse_create_trigger(stmt: str) -> dict | None:
    t = strip_leading_comments(stmt)
    m = re.match(r"CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+", t, re.IGNORECASE | re.DOTALL)
    if not m:
        return None
    i = m.end()
    name, i = extract_quoted_or_ident(t, i)
    if not name:
        return None
    while i < len(t) and t[i].isspace():
        i += 1
    tm = re.match(r"(BEFORE|AFTER|INSTEAD\s+OF)\s+", t[i:], re.IGNORECASE)
    if not tm:
        return None
    timing = tm.group(1).upper().replace("  ", " ")
    i += tm.end()
    ev_parts: list[str] = []
    while True:
        em = re.match(
            r"(INSERT|UPDATE|DELETE|TRUNCATE)\b",
            t[i:],
            re.IGNORECASE,
        )
        if not em:
            break
        ev_parts.append(em.group(1).upper())
        i += em.end()
        while i < len(t) and t[i].isspace():
            i += 1
        if re.match(r"OR\s+", t[i:], re.IGNORECASE):
            om = re.match(r"OR\s+", t[i:], re.IGNORECASE)
            i += om.end()
            continue
        break
    events = " OR ".join(ev_parts) if ev_parts else "?"
    m_on = re.search(r"\bON\s+", t[i:], re.IGNORECASE)
    if not m_on:
        return None
    j = i + m_on.end()
    only_m = re.match(r"ONLY\s+", t[j:], re.IGNORECASE)
    if only_m:
        j += only_m.end()
    table, j = parse_qualified_name(t, j)
    if not table:
        return None
    rest = t[j:]
    fn_m = re.search(
        r"EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+(.+?)(?:;|\s*$)",
        rest,
        re.IGNORECASE | re.DOTALL,
    )
    fn = ""
    if fn_m:
        fn = re.sub(r"\s+", " ", fn_m.group(1).strip())
        if len(fn) > 120:
            fn = fn[:117] + "..."
    return {
        "trigger_name": name,
        "table": table,
        "timing": timing,
        "events": events,
        "function": fn or "—",
    }


def trigger_key(table: str, name: str) -> tuple[str, str, str]:
    tl = table.lower()
    parts = tl.split(".", 1)
    if len(parts) == 2:
        return parts[0], parts[1], name.lower()
    return "public", parts[0], name.lower()


def main() -> None:
    files = sorted(MIGRATIONS.glob("*.sql"), key=lambda p: p.name)

    all_creates: list[dict] = []
    all_drops: list[dict] = []

    for p in files:
        rel = p.relative_to(REPO).as_posix()
        content = p.read_text(encoding="utf-8", errors="ignore")
        for stmt in iter_statements(content):
            kind = classify_trigger_stmt(stmt)
            if kind == "create_trigger":
                c = parse_create_trigger(stmt)
                if c:
                    c["file"] = rel
                    all_creates.append(c)
            elif kind == "drop_trigger":
                d = parse_drop_trigger(stmt)
                if d:
                    d["file"] = rel
                    all_drops.append(d)

    active: dict[tuple[str, str, str], dict] = {}
    for p in files:
        rel = p.relative_to(REPO).as_posix()
        content = p.read_text(encoding="utf-8", errors="ignore")
        for stmt in iter_statements(content):
            kind = classify_trigger_stmt(stmt)
            if kind == "drop_trigger":
                d = parse_drop_trigger(stmt)
                if d:
                    k = trigger_key(d["table"], d["trigger_name"])
                    active.pop(k, None)
            elif kind == "create_trigger":
                c = parse_create_trigger(stmt)
                if c:
                    c["file"] = rel
                    k = trigger_key(c["table"], c["trigger_name"])
                    active[k] = c

    active_list = list(active.values())

    by_table: dict[str, list[dict]] = {}
    for c in active_list:
        by_table.setdefault(c["table"], []).append(c)

    lines: list[str] = []
    lines.append("# Inventário: triggers (migrações)")
    lines.append("")
    lines.append(
        "Gerado por `scripts/migration_triggers_inventory.py` a partir de "
        "`supabase/migrations/*.sql`."
    )
    lines.append("")
    lines.append("## Resumo")
    lines.append("")
    lines.append(f"- Ficheiros SQL: **{len(files)}**")
    lines.append(f"- `CREATE TRIGGER`: **{len(all_creates)}**")
    lines.append(f"- `DROP TRIGGER`: **{len(all_drops)}**")
    lines.append(
        f"- Triggers ativos estimados (último `CREATE`/`DROP` por trigger, ordem dos ficheiros): **{len(active_list)}**"
    )
    lines.append("")

    lines.append("## Triggers ativos estimados (por tabela)")
    lines.append("")
    lines.append(
        "_Simulação: percorrer migrações por nome de ficheiro; `DROP TRIGGER` remove; `CREATE TRIGGER` define._"
    )
    lines.append("")
    for table in sorted(by_table.keys(), key=str.lower):
        lines.append(f"### `{table}`")
        lines.append("")
        lines.append("| Nome | Momento | Eventos | Função / procedimento | Migração |")
        lines.append("| --- | --- | --- | --- | --- |")
        for c in sorted(
            by_table[table], key=lambda x: (x["trigger_name"].lower(), x["file"])
        ):
            lines.append(
                f"| `{c['trigger_name']}` | `{c['timing']}` | `{c['events']}` | `{c['function']}` | `{c['file']}` |"
            )
        lines.append("")

    lines.append("## `DROP TRIGGER` (referência)")
    lines.append("")
    lines.append("| Trigger | Tabela | Migração |")
    lines.append("| --- | --- | --- |")
    for d in sorted(
        all_drops, key=lambda x: (x["table"].lower(), x["trigger_name"].lower(), x["file"])
    ):
        lines.append(f"| `{d['trigger_name']}` | `{d['table']}` | `{d['file']}` |")
    lines.append("")

    lines.append("## Limitações")
    lines.append("")
    lines.append(
        "- Apenas `CREATE TRIGGER` / `DROP TRIGGER` estáticos; triggers criados só no dashboard não aparecem."
    )
    lines.append(
        "- A expressão `WHEN (...)` não é extraída; colunas `REFERENCING` / `CONSTRAINT TRIGGER` podem ser incompletas."
    )
    lines.append("")

    out = Path(sys.argv[1]) if len(sys.argv) > 1 else OUT_DEFAULT
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
