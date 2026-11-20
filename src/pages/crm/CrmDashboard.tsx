import { Link, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ContactRound,
  Users,
  Kanban,
  MessagesSquare,
  Workflow,
  Building2,
  Award,
  BarChart3,
} from "lucide-react";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { useQuery } from "@tanstack/react-query";
import { getCrmReportsDashboard } from "@/lib/crm/crmAdvanced";
import { CrmFeatureGate } from "@/components/crm/CrmFeatureGate";

const CrmDashboard = () => {
  const { establishmentId } = useParams<{ establishmentId?: string }>();
  const { selectedEstablishment } = useEstablishment();
  const companyId = selectedEstablishment?.company_id;
  const base = `/${establishmentId || selectedEstablishment?.numeric_id}`;

  const { data } = useQuery({
    queryKey: ["crm-dashboard-summary", companyId],
    queryFn: () => getCrmReportsDashboard(companyId!),
    enabled: !!companyId,
  });

  const s = data?.summary;

  return (
    <CrmFeatureGate>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">CRM</h1>
          <p className="text-muted-foreground">Visão consolidada comercial e de relacionamento</p>
        </div>

        {s ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat label="Contatos" value={s.contactsTotal} />
            <MiniStat label="Deals abertos" value={s.opportunitiesOpen} />
            <MiniStat label="Conversão" value={`${s.conversionRate}%`} />
            <MiniStat
              label="Receita ganha"
              value={s.wonAmount.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            />
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <NavCard
            icon={<Users className="h-5 w-5" />}
            title="Contatos"
            description="Lista e perfil 360"
            to={`${base}/crm/contatos`}
            ctaIcon={<ContactRound className="h-4 w-4 mr-2" />}
            cta="Abrir contatos"
          />
          <NavCard
            icon={<Kanban className="h-5 w-5" />}
            title="Pipeline"
            description="Kanban e conversão para reserva"
            to={`${base}/crm/pipeline`}
            ctaIcon={<Kanban className="h-4 w-4 mr-2" />}
            cta="Abrir pipeline"
          />
          <NavCard
            icon={<MessagesSquare className="h-5 w-5" />}
            title="Central"
            description="Mensagens & Cobranças + 360"
            to={`${base}/crm/central`}
            ctaIcon={<MessagesSquare className="h-4 w-4 mr-2" />}
            cta="Abrir central"
          />
          <Card className="p-6 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Campanhas</p>
            <p className="text-sm text-muted-foreground">Segmentos + opt-in + fila BullMQ</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to={`${base}/crm/segmentos`}>Segmentos</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to={`${base}/crm/campanhas`}>Campanhas</Link>
              </Button>
            </div>
          </Card>
          <NavCard
            icon={<Workflow className="h-5 w-5" />}
            title="Automações"
            description="Templates, triggers e runs"
            to={`${base}/crm/automacoes`}
            ctaIcon={<Workflow className="h-4 w-4 mr-2" />}
            cta="Abrir automações"
          />
          <NavCard
            icon={<Building2 className="h-5 w-5" />}
            title="Empresas B2B"
            description="Agências, corporativo e parceiros"
            to={`${base}/crm/empresas`}
            ctaIcon={<Building2 className="h-4 w-4 mr-2" />}
            cta="Abrir empresas"
          />
          <NavCard
            icon={<Award className="h-5 w-5" />}
            title="Fidelidade"
            description="Tiers e pontos por hospedagem"
            to={`${base}/crm/fidelidade`}
            ctaIcon={<Award className="h-4 w-4 mr-2" />}
            cta="Abrir fidelidade"
          />
          <NavCard
            icon={<BarChart3 className="h-5 w-5" />}
            title="Relatórios"
            description="Indicadores e exportação CSV"
            to={`${base}/crm/relatorios`}
            ctaIcon={<BarChart3 className="h-4 w-4 mr-2" />}
            cta="Abrir relatórios"
          />
        </div>
      </div>
    </CrmFeatureGate>
  );
};

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </Card>
  );
}

function NavCard({
  icon,
  title,
  description,
  to,
  cta,
  ctaIcon,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  to: string;
  cta: string;
  ctaIcon: React.ReactNode;
}) {
  return (
    <Card className="p-6 space-y-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
      <Button asChild variant="outline">
        <Link to={to}>
          {ctaIcon}
          {cta}
        </Link>
      </Button>
    </Card>
  );
}

export default CrmDashboard;
