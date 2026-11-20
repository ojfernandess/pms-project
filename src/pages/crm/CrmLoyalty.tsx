import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CrmFeatureGate } from "@/components/crm/CrmFeatureGate";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { getCrmLoyaltyProgram, listCrmLoyaltyAccounts } from "@/lib/crm/crmAdvanced";
import { Award } from "lucide-react";

const CrmLoyalty = () => {
  const { establishmentId } = useParams<{ establishmentId?: string }>();
  const { selectedEstablishment } = useEstablishment();
  const companyId = selectedEstablishment?.company_id;
  const base = `/${establishmentId || selectedEstablishment?.numeric_id}`;

  const { data: program } = useQuery({
    queryKey: ["crm-loyalty-program", companyId],
    queryFn: () => getCrmLoyaltyProgram(companyId!),
    enabled: !!companyId,
  });

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["crm-loyalty-accounts", companyId],
    queryFn: () => listCrmLoyaltyAccounts(companyId!),
    enabled: !!companyId,
  });

  const tiers = Array.isArray(program?.tiers) ? program!.tiers : [];

  return (
    <CrmFeatureGate>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Fidelidade</h1>
            <p className="text-muted-foreground">
              Pontuação por hospedagem elegível — sem alterar tarifas do PMS
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to={`${base}/crm`}>CRM</Link>
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Award className="h-4 w-4" />
              <span className="text-sm font-medium">{program?.name || "Programa"}</span>
            </div>
            <p className="text-sm">
              Taxa: <strong>{Number(program?.points_per_currency ?? 1)}</strong> ponto(s) por R$ 1
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              {(tiers as Array<{ key: string; name: string; min_points: number }>).map((t) => (
                <Badge key={t.key} variant="secondary">
                  {t.name} ≥ {t.min_points}
                </Badge>
              ))}
            </div>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Membros</p>
            <p className="text-3xl font-semibold">{accounts.length}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Acúmulo via API <code>POST /crm/loyalty/earn</code> (idempotente por reserva)
            </p>
          </Card>
        </div>

        <Card className="p-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum saldo ainda. Credite pontos após hospedagens elegíveis.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contato</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Saldo</TableHead>
                  <TableHead>Lifetime</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link
                        className="font-medium hover:underline"
                        to={`${base}/crm/contatos/${a.crm_contact.id}`}
                      >
                        {a.crm_contact.full_name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {a.crm_contact.email || "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge>{a.tier_key}</Badge>
                    </TableCell>
                    <TableCell>{Number(a.points_balance).toLocaleString()}</TableCell>
                    <TableCell>{Number(a.lifetime_points).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </CrmFeatureGate>
  );
};

export default CrmLoyalty;
