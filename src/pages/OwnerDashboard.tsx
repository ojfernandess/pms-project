import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DollarSign,
  Users,
  Bed,
  TrendingUp,
  TrendingDown,
  XCircle,
  Lock,
  Wrench,
  AlertTriangle,
  Loader2,
  Calendar,
  ArrowRight,
  Eye,
} from "lucide-react";
import { useOwnerDashboard } from "@/hooks/useOwnerDashboard";
import { formatCurrency, toFiniteNumber } from "@/lib/reservationUtils";
import { formatDate } from "@/lib/reservationUtils";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { OccupancyChart } from "@/components/dashboard/OccupancyChart";
import { useNavigate } from "react-router-dom";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useEffect } from "react";
import { useCurrentEmployeeRole } from "@/hooks/useEmployees";

const OwnerDashboard = () => {
  const navigate = useNavigate();
  const { data, isLoading } = useOwnerDashboard();
  const { role, isLoading: isLoadingRole } = useCurrentEmployeeRole();
  const establishmentId = getSelectedEstablishmentId();

  // Verificar se o usuário é proprietário
  useEffect(() => {
    if (!isLoadingRole) {
      const userIsOwner = role?.code === "owner";
      if (!userIsOwner) {
        // Redirecionar para o dashboard principal se não for proprietário
        if (establishmentId) {
          navigate(`/${establishmentId}`);
        } else {
          navigate("/user-dashboard");
        }
      }
    }
  }, [role, isLoadingRole, navigate, establishmentId]);

  // Mostrar loading enquanto verifica permissões
  if (isLoadingRole) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Verificar se é proprietário
  if (role?.code !== "owner") {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Acesso negado. Apenas proprietários podem acessar este dashboard.</p>
      </div>
    );
  }

  const getTrend = (change: number): "up" | "down" | "neutral" => {
    if (change > 0) return "up";
    if (change < 0) return "down";
    return "neutral";
  };

  const formatChange = (change: number | string | null | undefined) => {
    const n = toFiniteNumber(change);
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(1)}%`;
  };

  const getPriorityBadge = (priority: string) => {
    const priorityMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
      low: { label: "Baixa", variant: "outline" },
      medium: { label: "Média", variant: "secondary" },
      high: { label: "Alta", variant: "default" },
      urgent: { label: "Urgente", variant: "destructive" },
    };
    const priorityInfo = priorityMap[priority] || { label: priority, variant: "outline" };
    return <Badge variant={priorityInfo.variant}>{priorityInfo.label}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
      open: { label: "Aberto", variant: "secondary" },
      in_progress: { label: "Em Progresso", variant: "default" },
      completed: { label: "Concluído", variant: "outline" },
    };
    const statusInfo = statusMap[status] || { label: status, variant: "outline" };
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Nenhum dado disponível</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard do Proprietário</h1>
        <p className="text-muted-foreground">Visão completa do seu estabelecimento</p>
      </div>

      {/* Cards de Métricas Principais */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Faturamento Hoje"
          value={formatCurrency(data.revenue.today)}
          description={`${formatChange(data.revenue.change)} vs mês anterior`}
          icon={DollarSign}
          trend={getTrend(data.revenue.change)}
        />
        <StatsCard
          title="Taxa de Ocupação"
          value={`${data.occupancy.rate}%`}
          description={`${data.occupancy.occupied} de ${data.occupancy.total} quartos`}
          icon={Bed}
          trend="neutral"
        />
        <StatsCard
          title="Reservas Confirmadas"
          value={String(data.reservations.confirmed)}
          description={`${data.reservations.pending} pendentes`}
          icon={Users}
          trend="neutral"
        />
        <StatsCard
          title="Faturamento Mensal"
          value={formatCurrency(data.revenue.month)}
          description={`${formatCurrency(data.revenue.year)} no ano`}
          icon={TrendingUp}
          trend="neutral"
        />
      </div>

      {/* Tabs com Informações Detalhadas */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="reservations">Reservas</TabsTrigger>
          <TabsTrigger value="cancellations">Cancelamentos</TabsTrigger>
          <TabsTrigger value="blocks">Bloqueios</TabsTrigger>
          <TabsTrigger value="maintenance">Manutenção</TabsTrigger>
        </TabsList>

        {/* Visão Geral */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Faturamento (30 dias)</h3>
              <RevenueChart data={data.revenueHistory} />
            </Card>
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Ocupação (30 dias)</h3>
              <OccupancyChart data={data.occupancyHistory} />
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Reservas</h3>
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold">{data.reservations.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Confirmadas</span>
                  <span className="font-semibold text-success">{data.reservations.confirmed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pendentes</span>
                  <span className="font-semibold text-warning">{data.reservations.pending}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Hoje</span>
                  <span className="font-semibold">{data.reservations.today}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Este Mês</span>
                  <span className="font-semibold">{data.reservations.thisMonth}</span>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Cancelamentos</h3>
                <XCircle className="h-5 w-5 text-destructive" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Hoje</span>
                  <span className="font-semibold">{data.cancellations.today}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Este Mês</span>
                  <span className="font-semibold">{data.cancellations.thisMonth}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Este Ano</span>
                  <span className="font-semibold">{data.cancellations.thisYear}</span>
                </div>
                <div className="pt-2 border-t">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Receita Perdida</span>
                    <span className="font-semibold text-destructive">
                      {formatCurrency(data.cancellations.revenueLost)}
                    </span>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Manutenção</h3>
                <Wrench className="h-5 w-5 text-maintenance" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Abertos</span>
                  <span className="font-semibold">{data.maintenance.open}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Em Progresso</span>
                  <span className="font-semibold">{data.maintenance.inProgress}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Urgentes</span>
                  <span className="font-semibold text-destructive">{data.maintenance.urgent}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Concluídos</span>
                  <span className="font-semibold text-success">{data.maintenance.completed}</span>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* Reservas */}
        <TabsContent value="reservations" className="space-y-4">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Estatísticas de Reservas</h3>
              {establishmentId && (
                <Button
                  variant="outline"
                  onClick={() => navigate(`/${establishmentId}/reservas`)}
                >
                  Ver Todas as Reservas
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{data.reservations.total}</p>
              </div>
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">Confirmadas</p>
                <p className="text-2xl font-bold text-success">{data.reservations.confirmed}</p>
              </div>
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">Pendentes</p>
                <p className="text-2xl font-bold text-warning">{data.reservations.pending}</p>
              </div>
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">Hoje</p>
                <p className="text-2xl font-bold">{data.reservations.today}</p>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Cancelamentos */}
        <TabsContent value="cancellations" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Cancelamentos Hoje</p>
                  <p className="text-2xl font-bold mt-2">{data.cancellations.today}</p>
                </div>
                <XCircle className="h-8 w-8 text-destructive" />
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Este Mês</p>
                  <p className="text-2xl font-bold mt-2">{data.cancellations.thisMonth}</p>
                </div>
                <Calendar className="h-8 w-8 text-primary" />
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Este Ano</p>
                  <p className="text-2xl font-bold mt-2">{data.cancellations.thisYear}</p>
                </div>
                <TrendingDown className="h-8 w-8 text-warning" />
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Receita Perdida</p>
                  <p className="text-2xl font-bold mt-2 text-destructive">
                    {formatCurrency(data.cancellations.revenueLost)}
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-destructive" />
              </div>
            </Card>
          </div>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Cancelamentos Recentes</h3>
            {data.cancellations.recent.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum cancelamento recente
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Hóspede</TableHead>
                    <TableHead>Check-in</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Cancelado em</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.cancellations.recent.map((cancellation) => (
                    <TableRow key={cancellation.id}>
                      <TableCell className="font-medium">
                        {cancellation.reservation_code || "N/A"}
                      </TableCell>
                      <TableCell>{cancellation.guest_name}</TableCell>
                      <TableCell>{formatDate(cancellation.checkin_date)}</TableCell>
                      <TableCell>{formatCurrency(cancellation.total_amount)}</TableCell>
                      <TableCell>
                        {cancellation.cancelled_at
                          ? format(parseISO(cancellation.cancelled_at), "dd/MM/yyyy HH:mm", {
                              locale: ptBR,
                            })
                          : "-"}
                      </TableCell>
                      <TableCell>
                        {establishmentId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              navigate(`/${establishmentId}/reservas/${cancellation.reservation_code}`)
                            }
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Histórico de Cancelamentos (30 dias)</h3>
            <div className="h-64">
              <RevenueChart
                data={data.cancellationsHistory.map((item) => ({
                  date: item.date,
                  revenue: item.revenue,
                }))}
              />
            </div>
          </Card>
        </TabsContent>

        {/* Bloqueios */}
        <TabsContent value="blocks" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Bloqueios Ativos</p>
                  <p className="text-2xl font-bold mt-2">{data.blocks.active}</p>
                </div>
                <Lock className="h-8 w-8 text-gray-800" />
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Este Mês</p>
                  <p className="text-2xl font-bold mt-2">{data.blocks.thisMonth}</p>
                </div>
                <Calendar className="h-8 w-8 text-primary" />
              </div>
            </Card>
          </div>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Bloqueios Recentes</h3>
            {data.blocks.recent.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum bloqueio recente
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quarto</TableHead>
                    <TableHead>Check-in</TableHead>
                    <TableHead>Check-out</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.blocks.recent.map((block) => (
                    <TableRow key={block.id}>
                      <TableCell className="font-medium">{block.room_number}</TableCell>
                      <TableCell>{formatDate(block.checkin_date)}</TableCell>
                      <TableCell>{formatDate(block.checkout_date)}</TableCell>
                      <TableCell>{block.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        {/* Manutenção */}
        <TabsContent value="maintenance" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Abertos</p>
                  <p className="text-2xl font-bold mt-2">{data.maintenance.open}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-warning" />
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Em Progresso</p>
                  <p className="text-2xl font-bold mt-2">{data.maintenance.inProgress}</p>
                </div>
                <Wrench className="h-8 w-8 text-primary" />
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Urgentes</p>
                  <p className="text-2xl font-bold mt-2 text-destructive">
                    {data.maintenance.urgent}
                  </p>
                </div>
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
            </Card>
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Concluídos</p>
                  <p className="text-2xl font-bold mt-2 text-success">
                    {data.maintenance.completed}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-success" />
              </div>
            </Card>
          </div>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Tickets Recentes</h3>
              {establishmentId && (
                <Button
                  variant="outline"
                  onClick={() => navigate(`/${establishmentId}/manutencao`)}
                >
                  Ver Todos os Tickets
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              )}
            </div>
            {data.maintenance.recent.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum ticket de manutenção
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quarto</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Aberto em</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.maintenance.recent.map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell className="font-medium">{ticket.room_number}</TableCell>
                      <TableCell>{ticket.title}</TableCell>
                      <TableCell>{getPriorityBadge(ticket.priority)}</TableCell>
                      <TableCell>{getStatusBadge(ticket.status)}</TableCell>
                      <TableCell>
                        {format(parseISO(ticket.opened_at), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        {establishmentId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/${establishmentId}/manutencao`)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default OwnerDashboard;

