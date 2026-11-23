import { useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowRight,
  Building2,
  ChevronDown,
  ChevronRight,
  Hotel,
  Home,
  MoreVertical,
  Plus,
  Search,
  Star,
  StarOff,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { DashboardEstablishment } from "@/hooks/useAccessibleEstablishments";
import {
  establishmentTypeLabel,
  filterEstablishmentsForSearch,
  type EstablishmentTypeFilter,
  type StatusFilter,
} from "@/lib/userDashboardFilters";

type CompanyRow = {
  id: string;
  name: string;
  cnpj?: string | null;
  is_active?: boolean | null;
  pms_logo_url?: string | null;
};

export type MyEstablishmentsHomeProps = {
  companies: CompanyRow[];
  allEstablishments: DashboardEstablishment[];
  favoriteIds: Set<string>;
  lastAccessedEstablishment: DashboardEstablishment | null;
  lastAccessedAt: string | null;
  canCreateCompany: boolean;
  canCreateEstablishment: boolean;
  onCreateCompany: () => void;
  onCreateEstablishment: (companyId: string) => void;
  onAccessEstablishment: (establishment: DashboardEstablishment) => void;
  onToggleFavorite: (establishmentId: string, next: boolean) => void;
  isLoading?: boolean;
};

function EstablishmentThumb({
  establishment,
}: {
  establishment: DashboardEstablishment;
}) {
  const src = establishment.logo_url || establishment.photo_url;
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="h-14 w-14 rounded-lg object-cover border bg-muted shrink-0"
      />
    );
  }
  const Icon = establishmentTypeLabel(establishment.type) === "Apartamento" ? Home : Hotel;
  return (
    <div className="h-14 w-14 rounded-lg border bg-muted/60 flex items-center justify-center shrink-0">
      <Icon className="h-7 w-7 text-muted-foreground" />
    </div>
  );
}

export function MyEstablishmentsHome({
  companies,
  allEstablishments,
  favoriteIds,
  lastAccessedEstablishment,
  lastAccessedAt,
  canCreateCompany,
  canCreateEstablishment,
  onCreateCompany,
  onCreateEstablishment,
  onAccessEstablishment,
  onToggleFavorite,
  isLoading,
}: MyEstablishmentsHomeProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<EstablishmentTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [collapsedCompanies, setCollapsedCompanies] = useState<Set<string>>(new Set());

  const companyById = useMemo(
    () => new Map(companies.map((c) => [c.id, c])),
    [companies],
  );

  const filteredEstablishments = useMemo(
    () =>
      filterEstablishmentsForSearch(
        allEstablishments,
        companyById,
        search,
        typeFilter,
        statusFilter,
      ),
    [allEstablishments, companyById, search, typeFilter, statusFilter],
  );

  const favorites = useMemo(
    () => allEstablishments.filter((e) => favoriteIds.has(e.id)),
    [allEstablishments, favoriteIds],
  );

  const establishmentsByCompany = useMemo(() => {
    const map = new Map<string, DashboardEstablishment[]>();
    for (const est of filteredEstablishments) {
      const list = map.get(est.company_id) || [];
      list.push(est);
      map.set(est.company_id, list);
    }
    return map;
  }, [filteredEstablishments]);

  const visibleCompanies = useMemo(() => {
    const withEst = new Set(filteredEstablishments.map((e) => e.company_id));
    if (!search.trim() && typeFilter === "all" && statusFilter === "all") {
      return companies;
    }
    return companies.filter(
      (c) =>
        withEst.has(c.id) ||
        c.name.toLowerCase().includes(search.trim().toLowerCase()) ||
        (c.cnpj || "").includes(search.trim()),
    );
  }, [companies, filteredEstablishments, search, typeFilter, statusFilter]);

  const toggleCompany = (id: string) => {
    setCollapsedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6 font-[family-name:var(--font-sans,Inter,system-ui,sans-serif)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
            Meus estabelecimentos
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Acesse e gerencie seus estabelecimentos em um só lugar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {canCreateCompany && (
            <Button variant="outline" onClick={onCreateCompany}>
              <Plus className="h-4 w-4 mr-2" />
              Nova empresa
            </Button>
          )}
          {canCreateEstablishment && visibleCompanies[0] && (
            <Button onClick={() => onCreateEstablishment(visibleCompanies[0].id)}>
              <Plus className="h-4 w-4 mr-2" />
              Novo estabelecimento
            </Button>
          )}
        </div>
      </div>

      {lastAccessedEstablishment && (
        <Card className="overflow-hidden border-0 shadow-md bg-gradient-to-r from-violet-600 to-indigo-600 text-white">
          <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-white/80">
                Continuar de onde você parou
              </p>
              <h2 className="text-lg sm:text-xl font-semibold">{lastAccessedEstablishment.name}</h2>
              <p className="text-sm text-white/85">
                {establishmentTypeLabel(lastAccessedEstablishment.type)}
                {lastAccessedEstablishment.city
                  ? ` · ${lastAccessedEstablishment.city}${lastAccessedEstablishment.state ? `, ${lastAccessedEstablishment.state}` : ""}`
                  : ""}
                {lastAccessedAt && (
                  <span className="opacity-90">
                    {" "}
                    ·{" "}
                    {formatDistanceToNow(new Date(lastAccessedAt), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </span>
                )}
              </p>
            </div>
            <Button
              variant="secondary"
              className="bg-white text-violet-700 hover:bg-white/95 shrink-0"
              onClick={() => onAccessEstablishment(lastAccessedEstablishment)}
            >
              Acessar PMS
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </Card>
      )}

      {favorites.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
            Favoritos
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {favorites.map((est) => (
              <EstablishmentCard
                key={est.id}
                establishment={est}
                companyName={companyById.get(est.company_id)?.name}
                isFavorite
                onAccess={() => onAccessEstablishment(est)}
                onToggleFavorite={() => onToggleFavorite(est.id, false)}
              />
            ))}
          </div>
        </section>
      )}

      <Card className="p-4 sm:p-5 border border-border/80 shadow-sm bg-card/80">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar empresa ou estabelecimento..."
              className="pl-9 bg-background"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "Todos"],
                ["hotel", "Hotéis"],
                ["apartment", "Apartamentos"],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={typeFilter === value ? "default" : "outline"}
                className="rounded-full"
                onClick={() => setTypeFilter(value)}
              >
                {label}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant={statusFilter === "active" ? "default" : "outline"}
              className="rounded-full"
              onClick={() =>
                setStatusFilter((s) => (s === "active" ? "all" : "active"))
              }
            >
              Ativos
            </Button>
            <Button
              type="button"
              size="sm"
              variant={statusFilter === "inactive" ? "secondary" : "outline"}
              className="rounded-full"
              onClick={() =>
                setStatusFilter((s) => (s === "inactive" ? "all" : "inactive"))
              }
            >
              Inativos
            </Button>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="py-16 text-center text-muted-foreground text-sm">Carregando...</div>
      ) : visibleCompanies.length === 0 ? (
        <Card className="p-10 text-center">
          <Building2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">Nenhum resultado para sua busca.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {visibleCompanies.map((company) => {
            const ests = establishmentsByCompany.get(company.id) || [];
            const totalForCompany = allEstablishments.filter((e) => e.company_id === company.id).length;
            const expanded = !collapsedCompanies.has(company.id);
            return (
              <Card key={company.id} className="border shadow-sm overflow-hidden">
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between border-b bg-muted/20">
                  <div className="flex items-start gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleCompany(company.id)}
                      className="mt-1 text-muted-foreground hover:text-foreground"
                      aria-label={expanded ? "Recolher" : "Expandir"}
                    >
                      {expanded ? (
                        <ChevronDown className="h-5 w-5" />
                      ) : (
                        <ChevronRight className="h-5 w-5" />
                      )}
                    </button>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold truncate">{company.name}</h3>
                        <Badge variant={company.is_active !== false ? "default" : "secondary"}>
                          {company.is_active !== false ? "Ativa" : "Inativa"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {company.cnpj ? `CNPJ ${company.cnpj} · ` : ""}
                        {totalForCompany} estabelecimento{totalForCompany !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {canCreateEstablishment && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onCreateEstablishment(company.id)}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        Adicionar estabelecimento
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => toggleCompany(company.id)}>
                          {expanded ? "Recolher lista" : "Expandir lista"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {expanded && (
                  <div className="p-4 sm:p-5">
                    {ests.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">
                        Nenhum estabelecimento nesta empresa.
                        {canCreateEstablishment && (
                          <>
                            {" "}
                            <button
                              type="button"
                              className="text-primary underline-offset-2 hover:underline"
                              onClick={() => onCreateEstablishment(company.id)}
                            >
                              Criar primeiro estabelecimento
                            </button>
                          </>
                        )}
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {ests.map((est) => (
                          <EstablishmentCard
                            key={est.id}
                            establishment={est}
                            companyName={company.name}
                            isFavorite={favoriteIds.has(est.id)}
                            onAccess={() => onAccessEstablishment(est)}
                            onToggleFavorite={() =>
                              onToggleFavorite(est.id, !favoriteIds.has(est.id))
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EstablishmentCard({
  establishment,
  companyName,
  isFavorite,
  onAccess,
  onToggleFavorite,
}: {
  establishment: DashboardEstablishment;
  companyName?: string;
  isFavorite: boolean;
  onAccess: () => void;
  onToggleFavorite: () => void;
}) {
  const inactive = establishment.is_active === false;
  return (
    <Card
      className={cn(
        "group relative p-4 transition-all hover:shadow-md cursor-pointer border",
        inactive && "opacity-75 bg-muted/30",
      )}
      onClick={onAccess}
      onKeyDown={(e) => {
        if (e.key === "Enter") onAccess();
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex gap-3">
        <EstablishmentThumb establishment={establishment} />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-sm leading-tight truncate pr-6">{establishment.name}</p>
            <button
              type="button"
              className="absolute top-3 right-3 text-muted-foreground hover:text-amber-500"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite();
              }}
              aria-label={isFavorite ? "Remover dos favoritos" : "Favoritar"}
            >
              {isFavorite ? (
                <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
              ) : (
                <StarOff className="h-4 w-4 opacity-60 group-hover:opacity-100" />
              )}
            </button>
          </div>
          <p className="text-xs text-muted-foreground capitalize">
            {establishmentTypeLabel(establishment.type)}
            {companyName ? ` · ${companyName}` : ""}
          </p>
          {(establishment.city || establishment.state) && (
            <p className="text-xs text-muted-foreground">
              {[establishment.city, establishment.state].filter(Boolean).join(", ")}
            </p>
          )}
          <Badge
            variant={inactive ? "secondary" : "outline"}
            className="text-[10px] mt-1"
          >
            {inactive ? "Inativo" : "Ativo"}
          </Badge>
        </div>
      </div>
      <Button
        size="sm"
        className="w-full mt-3"
        variant="secondary"
        onClick={(e) => {
          e.stopPropagation();
          onAccess();
        }}
      >
        Acessar PMS
        <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
      </Button>
    </Card>
  );
}