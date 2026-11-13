"""
Generate edge function inventory for docs/migration.
Run: python scripts/migration_edge_inventory.py
Writes: docs/migration/edge-functions-inventory.md
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FUNCTIONS = REPO / "supabase" / "functions"
CONFIG = REPO / "supabase" / "config.toml"
OUT_DEFAULT = REPO / "docs" / "migration" / "edge-functions-inventory.md"


def parse_verify_jwt() -> dict[str, bool | None]:
    out: dict[str, bool | None] = {}
    if not CONFIG.exists():
        return out
    text = CONFIG.read_text(encoding="utf-8", errors="ignore")
    # [functions.name]\nverify_jwt = true|false
    block = re.findall(
        r"\[functions\.([a-z0-9-]+)\]\s*\n\s*verify_jwt\s*=\s*(true|false)",
        text,
    )
    for name, val in block:
        out[name] = val == "true"
    return out


def scan_function(path: Path) -> dict:
    name = path.name
    idx = path / "index.ts"
    t = idx.read_text(encoding="utf-8", errors="ignore")

    env = sorted(set(re.findall(r"Deno\.env\.get\([\"']([^\"']+)[\"']", t)))
    tables = sorted(set(re.findall(r"\.from\([\"']([a-zA-Z0-9_]+)[\"']", t)))
    rpcs = sorted(set(re.findall(r"\.rpc\([\"']([^\"']+)[\"']", t)))
    internal = sorted(set(re.findall(r"/functions/v1/([a-z0-9-]+)", t)))
    methods = sorted(set(m.upper() for m in re.findall(r"req\.method\s*[=!]==?\s*[\"']([A-Za-z]+)[\"']", t)))

    # Heuristic: Stripe if stripe.com or Stripe SDK import
    stripe_hints = bool(
        re.search(r"stripe\.com|api\.stripe\.com|@?stripe", t, re.I)
    )

    return {
        "name": name,
        "env": env,
        "tables": tables,
        "rpcs": rpcs,
        "internal_edge_calls": internal,
        "http_methods_branch": methods,
        "stripe_related": stripe_hints,
    }


def main() -> None:
    verify = parse_verify_jwt()
    dirs = sorted(d for d in FUNCTIONS.iterdir() if d.is_dir() and (d / "index.ts").exists())

    lines: list[str] = []
    lines.append("# Inventário: Edge Functions (Supabase)")
    lines.append("")
    lines.append(
        "Gerado por `scripts/migration_edge_inventory.py`. "
        "Tabelas e RPCs vêm de heurísticas estáticas (`.from(...)` e `.rpc(...)` no `index.ts`). "
        "Chamadas internas listam destinos `/functions/v1/...` no código."
    )
    lines.append("")

    lines.append("## Resumo (`verify_jwt` em `supabase/config.toml`)")
    lines.append("")
    lines.append("| Função | verify_jwt (config) |")
    lines.append("| --- | --- |")
    def fmt_verify(v: bool | None) -> str:
        if v is True:
            return "`true`"
        if v is False:
            return "`false`"
        return "_não definido — usa default da plataforma (em geral `true`)_"

    for d in dirs:
        n = d.name
        v = verify.get(n)
        lines.append(f"| `{n}` | {fmt_verify(v)} |")
    lines.append("")

    lines.append("## Detalhe por função")
    lines.append("")
    for d in dirs:
        data = scan_function(d)
        n = data["name"]
        lines.append(f"### `{n}`")
        lines.append("")
        vjwt = verify.get(n)
        vjwt_s = (
            "`true`"
            if vjwt is True
            else "`false`"
            if vjwt is False
            else "_(default plataforma)_"
        )
        lines.append(f"- **verify_jwt (toml):** {vjwt_s}")
        methods = data["http_methods_branch"]
        lines.append(
            f"- **Métodos HTTP referenciados no código:** "
            f"{', '.join(f'`{m}`' for m in methods) or '_(inferir pelo handler; muitas só tratam OPTIONS + POST)_'}"
        )
        lines.append(f"- **Stripe / pagamentos (heurística):** {'sim' if data['stripe_related'] else 'não'}")
        env = data["env"]
        lines.append(
            f"- **Variáveis de ambiente (`Deno.env.get`):** {len(env)} — "
            + (", ".join(f"`{e}`" for e in env) if env else "_(nenhuma detetada)_")
        )
        rpcs = data["rpcs"]
        lines.append(
            "- **RPCs Supabase:** "
            + (", ".join(f"`{r}`" for r in rpcs) if rpcs else "_(nenhum `.rpc()` no ficheiro)_")
        )
        tabs = data["tables"]
        lines.append(
            f"- **Tabelas `.from(...)`:** {len(tabs)} "
            + ("(ver lista abaixo)" if len(tabs) > 15 else "")
        )
        if tabs:
            lines.append("  - " + ", ".join(f"`{t}`" for t in tabs))
        internal = [x for x in data["internal_edge_calls"] if x != n]
        if internal:
            uniq = sorted(set(internal))
            lines.append(
                "- **Chama outras Edge Functions:** "
                + ", ".join(f"`{u}`" for u in uniq)
            )
        lines.append("")

    out = Path(sys.argv[1]) if len(sys.argv) > 1 else OUT_DEFAULT
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
