"""
Scan supabase/migrations/*.sql for RLS-related DDL:
- ALTER TABLE ... ENABLE/DISABLE ROW LEVEL SECURITY
- CREATE POLICY ...
- DROP POLICY ...

Writes docs/migration/rls-policies-inventory.md

Run: python scripts/migration_rls_inventory.py

Note: approximates `DO $$` blocks that loop over `pg_policies` (see Limitações).
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
OUT_DEFAULT = REPO / "docs" / "migration" / "rls-policies-inventory.md"


def parse_create_policy(stmt: str) -> dict | None:
    m = re.match(
        r"CREATE\s+POLICY\s+",
        stmt,
        re.IGNORECASE | re.DOTALL,
    )
    if not m:
        return None
    i = m.end()
    name, i = extract_quoted_or_ident(stmt, i)
    if not name:
        return None
    m_on = re.search(r"\bON\s+", stmt[i:], re.IGNORECASE)
    if not m_on:
        return None
    j = i + m_on.end()
    only_m = re.match(r"ONLY\s+", stmt[j:], re.IGNORECASE)
    if only_m:
        j += only_m.end()
    table, j = parse_qualified_name(stmt, j)
    if not table:
        return None
    rest = stmt[j:]
    m_for = re.search(r"\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b", rest, re.IGNORECASE)
    command = m_for.group(1).upper() if m_for else "?"
    roles: list[str] = []
    m_to = re.search(r"\bTO\s+", rest, re.IGNORECASE)
    if m_to:
        after_to = rest[m_to.end() :]
        stop_m = re.search(r"\b(USING|WITH)\b", after_to, re.IGNORECASE)
        chunk = after_to[: stop_m.start()] if stop_m else after_to
        chunk = chunk.split(";")[0]
        for part in chunk.split(","):
            p = part.strip()
            if p:
                roles.append(p)
    return {
        "policy_name": name,
        "table": table,
        "command": command,
        "roles": roles if roles else ["(default: all roles)"],
    }


def parse_drop_policy(stmt: str) -> dict | None:
    m = re.match(r"DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?", stmt, re.IGNORECASE | re.DOTALL)
    if not m:
        return None
    i = m.end()
    name, i = extract_quoted_or_ident(stmt, i)
    m_on = re.search(r"\bON\s+", stmt[i:], re.IGNORECASE)
    if not m_on or not name:
        return None
    j = i + m_on.end()
    table, j = parse_qualified_name(stmt, j)
    if not table:
        return None
    return {"policy_name": name, "table": table}


def parse_alter_rls(stmt: str) -> dict | None:
    m = re.match(
        r"ALTER\s+TABLE\s+",
        stmt,
        re.IGNORECASE | re.DOTALL,
    )
    if not m:
        return None
    i = m.end()
    table, i = parse_qualified_name(stmt, i)
    if not table:
        return None
    rest = stmt[i:]
    en = re.search(
        r"ENABLE\s+(?:ROW\s+LEVEL\s+)?SECURITY|ENABLE\s+ROW\s+LEVEL\s+SECURITY",
        rest,
        re.IGNORECASE,
    )
    dis = re.search(
        r"DISABLE\s+(?:ROW\s+LEVEL\s+)?SECURITY|DISABLE\s+ROW\s+LEVEL\s+SECURITY",
        rest,
        re.IGNORECASE,
    )
    if en:
        return {"table": table, "enabled": True}
    if dis:
        return {"table": table, "enabled": False}
    return None


def classify_ddl(stmt: str) -> str:
    """
    After stripping leading comments. Returns:
    create_policy | drop_policy | alter_table_rls | do_block | other
    """
    t = strip_leading_comments(stmt)
    if not t:
        return "other"
    u = t.upper()
    if u.startswith("CREATE POLICY"):
        return "create_policy"
    if u.startswith("DROP POLICY"):
        return "drop_policy"
    if u.startswith("ALTER TABLE"):
        return "alter_table_rls" if parse_alter_rls(t) else "other"
    if re.match(r"DO\s+", t, re.IGNORECASE):
        return "do_block"
    return "other"


def scan_file(path: Path) -> tuple[list[dict], list[dict], list[dict], bool]:
    rel = path.relative_to(REPO).as_posix()
    content = path.read_text(encoding="utf-8", errors="ignore")
    has_dynamic_drop = "DROP POLICY" in content and "EXECUTE format" in content and "pg_policies" in content

    creates: list[dict] = []
    drops: list[dict] = []
    alters: list[dict] = []

    for stmt in iter_statements(content):
        kind = classify_ddl(stmt)
        if kind == "create_policy":
            p = parse_create_policy(strip_leading_comments(stmt))
            if p:
                p["file"] = rel
                creates.append(p)
        elif kind == "drop_policy":
            d = parse_drop_policy(strip_leading_comments(stmt))
            if d:
                d["file"] = rel
                drops.append(d)
        elif kind == "alter_table_rls":
            a = parse_alter_rls(strip_leading_comments(stmt))
            if a:
                a["file"] = rel
                alters.append(a)
    return creates, drops, alters, has_dynamic_drop


def policy_key(table: str, name: str) -> tuple[str, str, str]:
    """(schema, table, policy_name) lower for matching."""
    tl = table.lower()
    parts = tl.split(".", 1)
    if len(parts) == 2:
        return parts[0], parts[1], name.lower()
    return "public", parts[0], name.lower()


def extract_bulk_drop_tables_from_do_block(stmt: str) -> list[tuple[str, str]]:
    """
    Detect `FOR r IN (SELECT policyname FROM pg_policies WHERE ...)` loops that drop
    all policies on a table (runtime). Returns [(schema, table), ...].
    """
    out: list[tuple[str, str]] = []
    for m in re.finditer(
        r"FOR\s+r\s+IN\s*\(\s*SELECT\s+policyname\s+FROM\s+pg_policies\s+WHERE\s+([^)]+)\)",
        stmt,
        re.IGNORECASE | re.DOTALL,
    ):
        where_clause = m.group(1)
        tm = re.search(r"tablename\s*=\s*'([^']+)'", where_clause, re.IGNORECASE)
        if not tm:
            continue
        table = tm.group(1)
        sm = re.search(r"schemaname\s*=\s*'([^']+)'", where_clause, re.IGNORECASE)
        schema = sm.group(1) if sm else "public"
        out.append((schema, table))
    return out


def clear_policies_for_table(
    active: dict[tuple[str, str, str], dict], schema: str, table: str
) -> None:
    sk, tk = schema.lower(), table.lower()
    to_pop = [k for k in active if k[0] == sk and k[1] == tk]
    for k in to_pop:
        active.pop(k, None)


def main() -> None:
    files = sorted(MIGRATIONS.glob("*.sql"), key=lambda p: p.name)

    all_creates: list[dict] = []
    all_drops: list[dict] = []
    all_alters: list[dict] = []
    dynamic_files: list[str] = []

    for p in files:
        creates, drops, alters, dyn = scan_file(p)
        all_creates.extend(creates)
        all_drops.extend(drops)
        all_alters.extend(alters)
        if dyn:
            dynamic_files.append(p.relative_to(REPO).as_posix())

    # Simular ordem das migrações: por ficheiro e por declaração (incl. DO $$ que limpa políticas).
    active_by_key: dict[tuple[str, str, str], dict] = {}
    for p in files:
        rel = p.relative_to(REPO).as_posix()
        content = p.read_text(encoding="utf-8", errors="ignore")
        for stmt in iter_statements(content):
            kind = classify_ddl(stmt)
            if kind == "do_block" and "pg_policies" in stmt:
                for schema, table in extract_bulk_drop_tables_from_do_block(stmt):
                    clear_policies_for_table(active_by_key, schema, table)
                continue
            if kind == "drop_policy":
                d = parse_drop_policy(strip_leading_comments(stmt))
                if d:
                    k = policy_key(d["table"], d["policy_name"])
                    active_by_key.pop(k, None)
            elif kind == "create_policy":
                c = parse_create_policy(strip_leading_comments(stmt))
                if c:
                    c["file"] = rel
                    k = policy_key(c["table"], c["policy_name"])
                    active_by_key[k] = c

    active = list(active_by_key.values())

    by_table: dict[str, list[dict]] = {}
    for c in active:
        t = c["table"]
        by_table.setdefault(t, []).append(c)

    lines: list[str] = []
    lines.append("# Inventário: Row Level Security (migrações)")
    lines.append("")
    lines.append(
        "Gerado por `scripts/migration_rls_inventory.py` a partir de `supabase/migrations/*.sql`."
    )
    lines.append("")
    lines.append("## Resumo")
    lines.append("")
    lines.append(f"- Ficheiros SQL: **{len(files)}**")
    lines.append(f"- `CREATE POLICY`: **{len(all_creates)}**")
    lines.append(f"- `DROP POLICY`: **{len(all_drops)}**")
    lines.append(
        f"- Políticas ativas estimadas (último `CREATE`/`DROP` por política, ordem dos ficheiros de migração): **{len(active)}**"
    )
    lines.append(f"- `ALTER TABLE ... ENABLE/DISABLE ROW LEVEL SECURITY`: **{len(all_alters)}**")
    lines.append("")

    lines.append("## Tabelas com RLS ativado (último `ALTER TABLE` por tabela nas migrações)")
    lines.append("")
    rls_state: dict[str, bool] = {}
    last_file: dict[str, str] = {}
    last_display: dict[str, str] = {}
    for a in sorted(all_alters, key=lambda x: x["file"]):
        key = a["table"].lower()
        rls_state[key] = a["enabled"]
        last_file[key] = a["file"]
        last_display[key] = a["table"]
    lines.append("| Tabela | RLS | Última migração |")
    lines.append("| --- | --- | --- |")
    for tkey in sorted(rls_state.keys()):
        en = rls_state[tkey]
        tbl = last_display.get(tkey, tkey)
        lines.append(
            f"| `{tbl}` | **{'ativado' if en else 'desativado'}** | `{last_file.get(tkey, '')}` |"
        )
    lines.append("")

    lines.append("## Políticas ativas estimadas (por tabela)")
    lines.append("")
    lines.append(
        "_Simulação: percorre as migrações em ordem de nome de ficheiro; cada `DROP POLICY` remove a política; cada `CREATE POLICY` substitui/recria._"
    )
    lines.append("")
    for table in sorted(by_table.keys(), key=str.lower):
        lines.append(f"### `{table}`")
        lines.append("")
        lines.append("| Nome da política | Comando | Roles | Migração |")
        lines.append("| --- | --- | --- | --- |")
        for c in sorted(by_table[table], key=lambda x: (x["policy_name"].lower(), x["file"])):
            roles = ", ".join(f"`{r}`" for r in c["roles"])
            if len(roles) > 120:
                roles = roles[:117] + "..."
            lines.append(
                f"| `{c['policy_name']}` | `{c['command']}` | {roles} | `{c['file']}` |"
            )
        lines.append("")

    lines.append("## `DROP POLICY` explícitos (referência)")
    lines.append("")
    lines.append("| Tabela | Política | Migração |")
    lines.append("| --- | --- | --- |")
    for d in sorted(all_drops, key=lambda x: (x["table"].lower(), x["policy_name"].lower(), x["file"])):
        lines.append(f"| `{d['table']}` | `{d['policy_name']}` | `{d['file']}` |")
    lines.append("")

    lines.append("## Limitações")
    lines.append("")
    lines.append(
        "- Políticas criadas ou alteradas **fora** destas migrações (SQL manual no dashboard) não aparecem."
    )
    lines.append(
        "- Blocos `DO $$ ... FOR r IN (SELECT policyname FROM pg_policies ...)` são **aproximados** "
        "como «remove todas as políticas desta tabela» antes dos `CREATE POLICY` seguintes **no mesmo ficheiro** "
        "(não expande nomes reais de `pg_policies` noutros ambientes)."
    )
    if dynamic_files:
        lines.append(
            "- Ficheiros que também contêm padrões dinâmicos além do loop simples acima (rever manualmente):"
        )
        for f in sorted(set(dynamic_files)):
            lines.append(f"  - `{f}`")
    lines.append(
        "- Expressões `USING` / `WITH CHECK` não são extraídas; ver o ficheiro de migração citado."
    )
    lines.append("")

    out = Path(sys.argv[1]) if len(sys.argv) > 1 else OUT_DEFAULT
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
