"""
Shared SQL scanning helpers for migration docs (statement boundaries, identifiers).
Used by migration_rls_inventory.py, migration_triggers_inventory.py, etc.
"""
from __future__ import annotations


def try_start_dollar_quote(s: str, i: int) -> tuple[str, int] | None:
    """
    If s[i] starts a dollar-quoted string ($tag$ or $$), return (delimiter, index after opening delim).
    """
    if i >= len(s) or s[i] != "$":
        return None
    j = s.find("$", i + 1)
    if j == -1:
        return None
    tag = s[i + 1 : j]
    delim = "$" + tag + "$"
    return delim, j + 1


def sql_statement_end(s: str, start: int) -> int:
    """Index after terminating `;` of SQL statement starting at start, or len(s)."""
    i = start
    n = len(s)
    depth = 0
    in_single = in_double = False
    in_line_comment = False
    in_block_comment = False
    dollar_delim: str | None = None
    while i < n:
        c = s[i]
        nxt = s[i + 1] if i + 1 < n else ""

        if in_line_comment:
            if c == "\n":
                in_line_comment = False
            i += 1
            continue
        if in_block_comment:
            if c == "*" and nxt == "/":
                in_block_comment = False
                i += 2
                continue
            i += 1
            continue
        if not in_single and not in_double:
            if c == "-" and nxt == "-":
                in_line_comment = True
                i += 2
                continue
            if c == "/" and nxt == "*":
                in_block_comment = True
                i += 2
                continue

        if dollar_delim is not None:
            if s.startswith(dollar_delim, i):
                i += len(dollar_delim)
                dollar_delim = None
                continue
            i += 1
            continue

        if not in_single and not in_double:
            if c == "(":
                depth += 1
            elif c == ")" and depth > 0:
                depth -= 1
            elif c == "$" and depth == 0:
                started = try_start_dollar_quote(s, i)
                if started:
                    dollar_delim, i = started
                    continue
            elif c == ";" and depth == 0:
                return i + 1
            elif c == "'":
                in_single = True
                i += 1
                continue
            elif c == '"':
                in_double = True
                i += 1
                continue
            i += 1
            continue

        if in_single:
            if c == "'" and nxt == "'":
                i += 2
                continue
            if c == "'":
                in_single = False
            i += 1
            continue
        if in_double:
            if c == '"' and nxt == '"':
                i += 2
                continue
            if c == '"':
                in_double = False
            i += 1
            continue
    return n


def extract_quoted_or_ident(s: str, i: int) -> tuple[str, int]:
    while i < len(s) and s[i].isspace():
        i += 1
    if i >= len(s):
        return "", i
    if s[i] == '"':
        j = i + 1
        parts: list[str] = []
        while j < len(s):
            if s[j] == '"':
                if j + 1 < len(s) and s[j + 1] == '"':
                    parts.append('"')
                    j += 2
                    continue
                return "".join(parts), j + 1
            parts.append(s[j])
            j += 1
        return "".join(parts), j
    j = i
    while j < len(s) and (s[j].isalnum() or s[j] in "_"):
        j += 1
    return s[i:j], j


def parse_qualified_name(s: str, i: int, default_schema: str = "public") -> tuple[str, int]:
    """
    Parse schema.table or bare table. Bare identifiers become default_schema.name.
    """
    first, j = extract_quoted_or_ident(s, i)
    if not first:
        return "", i
    while j < len(s) and s[j].isspace():
        j += 1
    if j < len(s) and s[j] == ".":
        second, j = extract_quoted_or_ident(s, j + 1)
        if not second:
            return f"{default_schema}.{first}", j
        return f"{first}.{second}", j
    if "." in first:
        return first, j
    return f"{default_schema}.{first}", j


def strip_leading_comments(s: str) -> str:
    """Remove leading `--` line comments and `/* */` blocks."""
    t = s.lstrip()
    while t:
        if t.startswith("--"):
            nl = t.find("\n")
            if nl == -1:
                return ""
            t = t[nl + 1 :].lstrip()
            continue
        if t.startswith("/*"):
            end = t.find("*/")
            if end == -1:
                return t
            t = t[end + 2 :].lstrip()
            continue
        break
    return t


def iter_statements(text: str) -> list[str]:
    stmts: list[str] = []
    i = 0
    n = len(text)
    while i < n:
        while i < n and text[i].isspace():
            i += 1
        if i >= n:
            break
        end = sql_statement_end(text, i)
        block = text[i:end].strip()
        if block:
            stmts.append(block)
        i = end
    return stmts
