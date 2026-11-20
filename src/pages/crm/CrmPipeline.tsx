import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { CrmFeatureGate } from "@/components/crm/CrmFeatureGate";
import {
  convertCrmDeal,
  createCrmDeal,
  getCrmBoard,
  moveCrmDeal,
  type CrmDeal,
  type CrmStage,
} from "@/lib/crm/crmDeals";
import { toast } from "sonner";
import { Plus, Link2, MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link, useParams } from "react-router-dom";
import { buildCrmCentralPath } from "@/lib/crm/crmCentral";

const money = (n: number | string) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function DealCard({
  deal,
  onConvert,
  establishmentPathId,
}: {
  deal: CrmDeal;
  onConvert: (deal: CrmDeal) => void;
  establishmentPathId: string | number;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
    data: { deal },
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-md border bg-background p-3 shadow-sm cursor-grab active:cursor-grabbing space-y-1",
        isDragging && "opacity-60",
      )}
      {...listeners}
      {...attributes}
    >
      <p className="font-medium text-sm leading-snug">{deal.title}</p>
      <p className="text-xs text-muted-foreground">
        {deal.crm_contact?.full_name || "Sem contato"} · {money(deal.amount)}
      </p>
      {deal.source && (
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{deal.source}</p>
      )}
      {(deal.crm_contact_id || deal.reservation_id) && (
        <Button asChild type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs">
          <Link
            to={buildCrmCentralPath(establishmentPathId, {
              contactId: deal.crm_contact_id || undefined,
              reservationId: deal.reservation_id || undefined,
            })}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <MessagesSquare className="h-3 w-3 mr-1" />
            Central
          </Link>
        </Button>
      )}
      {deal.reservation_id ? (
        <p className="text-[11px] text-emerald-700">Convertido</p>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onConvert(deal)}
        >
          <Link2 className="h-3 w-3 mr-1" />
          Vincular reserva
        </Button>
      )}
    </div>
  );
}

function StageColumn({
  stage,
  deals,
  onConvert,
  establishmentPathId,
}: {
  stage: CrmStage;
  deals: CrmDeal[];
  onConvert: (deal: CrmDeal) => void;
  establishmentPathId: string | number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, data: { stage } });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-w-[240px] w-[240px] rounded-lg border bg-muted/30 p-3 space-y-3",
        isOver && "ring-2 ring-primary/40",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{stage.name}</h3>
        <span className="text-xs text-muted-foreground">{deals.length}</span>
      </div>
      <div className="space-y-2 min-h-[120px]">
        {deals.map((deal) => (
          <DealCard
            key={deal.id}
            deal={deal}
            onConvert={onConvert}
            establishmentPathId={establishmentPathId}
          />
        ))}
      </div>
    </div>
  );
}

const CrmPipeline = () => {
  const { establishmentId } = useParams<{ establishmentId?: string }>();
  const { selectedEstablishment } = useEstablishment();
  const companyId = selectedEstablishment?.company_id;
  const pathId = establishmentId || selectedEstablishment?.numeric_id || "";
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [convertDeal, setConvertDeal] = useState<CrmDeal | null>(null);
  const [reservationId, setReservationId] = useState("");

  const { data: board, isLoading } = useQuery({
    queryKey: ["crm-board", companyId],
    queryFn: () => getCrmBoard(companyId!),
    enabled: !!companyId,
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const moveMutation = useMutation({
    mutationFn: ({ dealId, stageId }: { dealId: string; stageId: string }) =>
      moveCrmDeal(dealId, stageId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-board", companyId] }),
    onError: (e: Error) => toast.error(e.message || "Erro ao mover deal"),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createCrmDeal({
        companyId: companyId!,
        title: title.trim(),
        amount: Number(amount || 0),
        establishmentId: selectedEstablishment?.id,
        source: "manual",
      }),
    onSuccess: () => {
      toast.success("Deal criado");
      setCreateOpen(false);
      setTitle("");
      setAmount("");
      queryClient.invalidateQueries({ queryKey: ["crm-board", companyId] });
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao criar deal"),
  });

  const convertMutation = useMutation({
    mutationFn: () => convertCrmDeal(convertDeal!.id, reservationId.trim()),
    onSuccess: () => {
      toast.success("Deal convertido (reserva vinculada)");
      setConvertDeal(null);
      setReservationId("");
      queryClient.invalidateQueries({ queryKey: ["crm-board", companyId] });
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao converter"),
  });

  const columns = useMemo(() => board?.columns ?? [], [board]);

  const onDragEnd = (event: DragEndEvent) => {
    const dealId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId || !board) return;

    const stageIds = new Set(board.pipeline.stages.map((s) => s.id));
    let targetStageId = stageIds.has(overId) ? overId : null;
    if (!targetStageId) {
      for (const col of board.columns) {
        if (col.deals.some((d) => d.id === overId)) {
          targetStageId = col.stage.id;
          break;
        }
      }
    }
    if (!targetStageId) return;

    const current = board.columns.flatMap((c) => c.deals).find((d) => d.id === dealId);
    if (!current || current.stage_id === targetStageId) return;
    moveMutation.mutate({ dealId, stageId: targetStageId });
  };

  return (
    <CrmFeatureGate>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Pipeline</h1>
            <p className="text-muted-foreground">
              {board?.pipeline.name || "Kanban comercial"} · {board?.totalDeals ?? 0} oportunidades
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo deal
          </Button>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Carregando pipeline...</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
            <div className="flex gap-3 overflow-x-auto pb-4">
              {columns.map((col) => (
                <StageColumn
                  key={col.stage.id}
                  stage={col.stage}
                  deals={col.deals}
                  onConvert={setConvertDeal}
                  establishmentPathId={pathId}
                />
              ))}
            </div>
          </DndContext>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo deal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Valor</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <Button
              disabled={!title.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!convertDeal} onOpenChange={(o) => !o && setConvertDeal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular reserva existente</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Conversão CRM não cria reserva — informe o UUID da reserva já existente no PMS.
          </p>
          <div className="space-y-2">
            <Label>reservation_id</Label>
            <Input value={reservationId} onChange={(e) => setReservationId(e.target.value)} />
          </div>
          <Button
            disabled={!reservationId.trim() || convertMutation.isPending}
            onClick={() => convertMutation.mutate()}
          >
            Converter deal
          </Button>
        </DialogContent>
      </Dialog>
    </CrmFeatureGate>
  );
};

export default CrmPipeline;
