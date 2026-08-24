import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { filterGeoOptions, normalizeGeoSearch } from "@/lib/fnrh/geoOptions";
import { Check, ChevronDown, Loader2, Search } from "lucide-react";

type FnrhSuggestInputProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
};

/**
 * Select com busca: clique abre a lista (como Motivo da viagem);
 * digitar filtra; permite valor livre se não estiver na lista.
 */
export function FnrhSuggestInput({
  id,
  value,
  onChange,
  options,
  placeholder = "Selecione",
  disabled,
  loading,
  className,
}: FnrhSuggestInputProps) {
  const listId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const filtered = useMemo(
    () => filterGeoOptions(options, query, 80),
    [options, query],
  );

  const exactMatch = useMemo(() => {
    const n = normalizeGeoSearch(query);
    if (!n) return false;
    return options.some((o) => normalizeGeoSearch(o) === n);
  }, [options, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHighlight(0);
      return;
    }
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  const pick = (opt: string) => {
    onChange(opt);
    setOpen(false);
  };

  const useTypedValue = () => {
    const v = query.trim();
    if (!v) return;
    onChange(v);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <span
            className={cn(
              "line-clamp-1 text-left",
              !value?.trim() && "text-muted-foreground",
            )}
          >
            {value?.trim() ? value : placeholder}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar ou digitar…"
            className="flex h-10 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (filtered[highlight]) pick(filtered[highlight]);
                else if (query.trim() && !exactMatch) useTypedValue();
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          />
          {loading ? <Loader2 className="ml-2 h-3.5 w-3.5 shrink-0 animate-spin opacity-60" /> : null}
        </div>
        <ul
          id={listId}
          role="listbox"
          className="max-h-60 overflow-auto py-1 text-sm"
        >
          {loading && filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-muted-foreground">
              Carregando opções…
            </li>
          ) : filtered.length === 0 ? (
            <li className="px-3 py-4 text-center text-muted-foreground">
              {query.trim()
                ? "Nenhuma opção encontrada"
                : "Digite para buscar ou escolha abaixo"}
            </li>
          ) : (
            filtered.map((opt, i) => {
              const selected = normalizeGeoSearch(opt) === normalizeGeoSearch(value);
              return (
                <li
                  key={opt}
                  role="option"
                  aria-selected={selected}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center gap-2 px-3 py-2 hover:bg-accent hover:text-accent-foreground",
                    i === highlight && "bg-accent text-accent-foreground",
                  )}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(opt);
                  }}
                >
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0",
                      selected ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="line-clamp-1">{opt}</span>
                </li>
              );
            })
          )}
        </ul>
        {query.trim() && !exactMatch ? (
          <button
            type="button"
            className="w-full border-t px-3 py-2 text-left text-sm text-primary hover:bg-accent"
            onMouseDown={(e) => {
              e.preventDefault();
              useTypedValue();
            }}
          >
            Usar &quot;{query.trim()}&quot;
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
