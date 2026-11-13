"""
Scan supabase/migrations/*.sql for PostgreSQL functions and GRANT EXECUTE.

Writes docs/migration/sql-rpc-inventory.md (UTF-8).

Run: python scripts/migration_sql_rpc_inventory.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MIGRATIONS = REPO / "supabase" / "migrations"
OUT_DEFAULT = REPO / "docs" / "migration" / "sql-rpc-inventory.md"
FRONTEND_RPC_DOC = REPO / "docs" / "migration" / "frontend-rpc-inventory.md"


def iter_migration_files() -> list[Path]:
    if not MIGRATIONS.is_dir():
        return []
    return sorted(MIGRATIONS.glob("*.sql"), key=lambda p: p.name)


def balanced_to_closing_paren(s: str, open_idx: int) -> int | None:
    """Return index just after matching `)` for `(` at open_idx, or None."""
    if open_idx >= len(s) or s[open_idx] != "(":
        return None
    depth = 0
    i = open_idx
    in_single = in_double = in_dollar = False
    dollar_tag = ""
    while i < len(s):
        c = s[i]
        if not in_single and not in_double and not in_dollar:
            if c == "(":
                depth += 1
            elif c == ")":
                depth -= 1
                if depth == 0:
                    return i + 1
            elif c == "'":
                in_single = True
            elif c == '"':
                in_double = True
            elif c == "$":
                j = i + 1
                while j < len(s) and s[j] != "$":
                    j += 1
                if j < len(s):
                    dollar_tag = s[i + 1 : j]
                    in_dollar = True
                    i = j
            i += 1
            continue
        if in_single:
            if c == "'" and (i + 1 >= len(s) or s[i + 1] != "'"):
                in_single = False
            elif c == "'" and i + 1 < len(s) and s[i + 1] == "'":
                i += 2
                continue
            i += 1
            continue
        if in_double:
            if c == '"':
                in_double = False
            i += 1
            continue
        if in_dollar:
            closing = f"${dollar_tag}$"
            if s.startswith(closing, i):
                in_dollar = False
                i += len(closing)
                continue
            i += 1
    return None


def extract_create_functions(text: str, filepath: str) -> list[dict]:
    """Extract CREATE [OR REPLACE] FUNCTION entries (name + arg list only)."""
    out: list[dict] = []
    i = 0
    while i < len(text):
        m = re.search(
            r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+",
            text[i:],
            re.IGNORECASE | re.DOTALL,
        )
        if not m:
            break
        start = i + m.end()
        j = start
        while j < len(text) and text[j].isspace():
            j += 1
        if j < len(text) and text[j] == '"':
            j += 1
            qs: list[str] = []
            while j < len(text) and text[j] != '"':
                qs.append(text[j])
                j += 1
            qualname = "".join(qs)
            if j < len(text) and text[j] == '"':
                j += 1
        else:
            name_start = j
            while j < len(text) and (text[j].isalnum() or text[j] in "._"):
                j += 1
            qualname = text[name_start:j]

        while j < len(text) and text[j].isspace():
            j += 1
        if j >= len(text) or text[j] != "(":
            i = start
            continue
        k_end = balanced_to_closing_paren(text, j)
        if k_end is None:
            i = start
            continue
        k = k_end
        args = re.sub(r"\s+", " ", text[j:k].strip())
        rest = text[k : k + 200].lstrip()
        returns = ""
        rm = re.match(r"RETURNS\s+(\S+)", rest, re.IGNORECASE)
        if rm:
            returns = rm.group(1).strip()
        out.append(
            {
                "qualname": qualname.strip(),
                "args": args,
                "returns": returns,
                "file": filepath,
            }
        )
        i = k
    return out


def extract_grant_function_target(text: str, start: int) -> tuple[str, int] | None:
    """
    After 'ON FUNCTION ', parse target up to ' TO '.
    Supports `schema.name` or `schema.name(args...)`, including multiline arg lists.
    Returns (function_span_stripped, index_of_space_after_TO).
    """
    i = start
    n = len(text)
    while i < n and text[i].isspace():
        i += 1
    if i >= n:
        return None
    to_idx = text.find(" TO ", i)
    if to_idx == -1:
        return None
    lp = text.find("(", i)
    if lp != -1 and lp < to_idx:
        end_paren = balanced_to_closing_paren(text, lp)
        if end_paren is None:
            return None
        to_after = text.find(" TO ", end_paren)
        if to_after == -1:
            return None
        return text[i:end_paren].strip(), to_after + len(" TO ")
    return text[i:to_idx].strip(), to_idx + len(" TO ")


def extract_grants(text: str, filepath: str) -> list[dict]:
    out: list[dict] = []
    for m in re.finditer(r"GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+", text, re.IGNORECASE):
        start = m.end()
        parsed = extract_grant_function_target(text, start)
        if not parsed:
            continue
        func_part, roles_start = parsed
        rest = text[roles_start:]
        semi = rest.find(";")
        roles_part = rest[:semi].strip() if semi != -1 else rest.strip()
        roles = [r.strip() for r in roles_part.split(",") if r.strip()]
        out.append({"function": func_part, "roles": roles, "file": filepath})
    return out


def normalize_sig(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().lower())


def load_frontend_rpcs() -> set[str]:
    """Best-effort: RPC names from frontend-rpc-inventory.md table rows."""
    names: set[str] = set()
    if not FRONTEND_RPC_DOC.is_file():
        return names
    t = FRONTEND_RPC_DOC.read_text(encoding="utf-8", errors="ignore")
    for line in t.splitlines():
        line = line.strip()
        if not line.startswith("| `"):
            continue
        m = re.match(r"\|\s*`([^`]+)`\s*\|", line)
        if m:
            names.add(m.group(1))
    return names


def main() -> None:
    migration_files = iter_migration_files()
    creates: list[dict] = []
    grants: list[dict] = []
    for p in migration_files:
        rel = p.relative_to(REPO).as_posix()
        content = p.read_text(encoding="utf-8", errors="ignore")
        creates.extend(extract_create_functions(content, rel))
        grants.extend(extract_grants(content, rel))

    # Last definition per (qualname + args) by migration order
    by_def: dict[str, dict] = {}
    for c in creates:
        key = normalize_sig(f"{c['qualname']}{c['args']}")
        by_def[key] = c

    # Grants: merge roles across migrations (same function signature)
    grant_merged: dict[str, dict] = {}
    for g in grants:
        key = normalize_sig(g["function"])
        if key not in grant_merged:
            grant_merged[key] = {
                "function": g["function"],
                "roles": set(),
                "files": [],
                "last_file": g["file"],
            }
        grant_merged[key]["roles"].update(g["roles"])
        grant_merged[key]["files"].append(g["file"])
        grant_merged[key]["last_file"] = g["file"]

    frontend_rpcs = load_frontend_rpcs()

    lines: list[str] = []
    lines.append("# Inventário: funções PostgreSQL (migrações)")
    lines.append("")
    lines.append(
        "Gerado por `scripts/migration_sql_rpc_inventory.py`, que analisa "
        "`supabase/migrations/*.sql`: definições `CREATE [OR REPLACE] FUNCTION` e `GRANT EXECUTE ON FUNCTION`."
    )
    lines.append("")
    lines.append("## Resumo")
    lines.append("")
    lines.append(f"- Ficheiros de migração analisados: **{len(migration_files)}**")
    lines.append(f"- Entradas `CREATE ... FUNCTION` encontradas: **{len(creates)}**")
    lines.append(f"- Únicas por nome+argumentos (última migração vence): **{len(by_def)}**")
    lines.append(
        f"- Linhas `GRANT EXECUTE ON FUNCTION`: **{len(grants)}** "
        f"(assinaturas distintas após merge: **{len(grant_merged)}**)"
    )
    lines.append("")

    lines.append("## Funções (última definição por migração aplicada)")
    lines.append("")
    lines.append("| Esquema.nome | Argumentos | RETURNS (início) | Última migração | Frontend `.rpc` |")
    lines.append("| --- | --- | --- | --- | --- |")
    for key in sorted(by_def.keys(), key=lambda k: (by_def[k]["qualname"].lower(), k)):
        c = by_def[key]
        q = c["qualname"]
        if "." not in q:
            q = f"public.{q}"
        name_only = q.split(".")[-1]
        fe = "sim" if name_only in frontend_rpcs else ""
        ret = c.get("returns") or "—"
        if len(ret) > 40:
            ret = ret[:37] + "..."
        args_short = c["args"]
        if len(args_short) > 80:
            args_short = args_short[:77] + "..."
        lines.append(
            f"| `{q}` | `{args_short}` | {ret} | `{c['file']}` | {fe or '—'} |"
        )
    lines.append("")

    lines.append("## Permissões `GRANT EXECUTE` (roles acumuladas por assinatura)")
    lines.append("")
    lines.append("| Função (como no SQL) | Roles | Última migração com GRANT |")
    lines.append("| --- | --- | --- |")
    for k in sorted(grant_merged.keys()):
        g = grant_merged[k]
        role_list = sorted(g["roles"], key=lambda x: (x != "anon", x != "authenticated", x))
        roles = ", ".join(f"`{r}`" for r in role_list)
        fn = g["function"]
        fn_show = re.sub(r"\s+", " ", fn)
        if len(fn_show) > 100:
            fn_show = fn_show[:97] + "..."
        lines.append(f"| `{fn_show}` | {roles} | `{g['last_file']}` |")
    lines.append("")

    lines.append("## Limitações deste relatório")
    lines.append("")
    lines.append(
        "- Apenas ficheiros em `supabase/migrations/` são analisados; o estado real da base "
        "pode ter objetos criados manualmente ou noutro pipeline."
    )
    lines.append(
        "- Muitas RPCs **não têm** `GRANT EXECUTE` explícito nas migrações (usam default dos roles em Postgres/Supabase)."
    )
    lines.append(
        "- **Varias versões** da mesma função com assinaturas diferentes aparecem como linhas separadas "
        "(a última migração por chave normalizada `nome + argumentos` vence)."
    )
    lines.append("")

    by_basename: dict[str, list[str]] = {}
    for c in by_def.values():
        bn = c["qualname"].split(".")[-1].strip('"')
        by_basename.setdefault(bn, []).append(normalize_sig(f"{c['qualname']}{c['args']}"))
    dups = {k: v for k, v in by_basename.items() if len(v) > 1}
    if dups:
        lines.append("## Mesmo nome, assinaturas distintas (várias linhas na tabela acima)")
        lines.append("")
        for name in sorted(dups.keys()):
            lines.append(f"- `{name}` ({len(dups[name])} variantes)")
        lines.append("")

    lines.append("## Cruzar com o frontend")
    lines.append("")
    lines.append(
        "A coluna **Frontend** usa nomes de `docs/migration/frontend-rpc-inventory.md` "
        "(correspondência pelo nome da função, não pela assinatura completa)."
    )
    lines.append("")
    in_sql = {c["qualname"].split(".")[-1].strip('"') for c in by_def.values()}
    missing = sorted(frontend_rpcs - in_sql)
    if missing:
        lines.append("### RPCs listados no frontend sem função encontrada nas migrações (por nome)")
        lines.append("")
        for n in missing:
            lines.append(f"- `{n}`")
        lines.append("")
        lines.append(
            "_Podem estar noutro esquema, gerados noutro repo, ou o nome na doc do frontend está desatualizado._"
        )
        lines.append("")
    else:
        lines.append("_Nenhuma discrepância de nome entre o frontend e as definições `CREATE FUNCTION` destas migrações._")
        lines.append("")

    out = Path(sys.argv[1]) if len(sys.argv) > 1 else OUT_DEFAULT
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
