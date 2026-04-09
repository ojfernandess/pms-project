import { useMemo, useState, type ReactNode } from "react";
import type { CSSProperties } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye, GripVertical, Image as ImageIcon } from "lucide-react";
import { format, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export type MaintenanceKanbanStatus = "open" | "in_progress" | "completed" | "cancelled";

const COLUMNS: { status: MaintenanceKanbanStatus; title: string; subtitle: string; accent: string }[] = [
  { status: "open", title: "Aberto", subtitle: "Aguardando início", accent: "border-amber-200 bg-amber-50/40" },
  { status: "in_progress", title: "Em progresso", subtitle: "Em execução", accent: "border-blue-200 bg-blue-50/40" },
  { status: "completed", title: "Concluído", subtitle: "Encerrado", accent: "border-emerald-200 bg-emerald-50/40" },
  { status: "cancelled", title: "Cancelado", subtitle: "Descartado", accent: "border-slate-200 bg-slate-50/60" },
];

function getSLA(openedAt: string) {
  const opened = new Date(openedAt);
  const now = new Date();
  const hours = differenceInHours(now, opened);
  if (hours < 1) return "Agora";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function priorityBadge(priority: string) {
  const map: Record<string, { label: string; className: string }> = {
    low: { label: "Baixa", className: "bg-slate-100 text-slate-700 border-slate-200" },
    medium: { label: "Média", className: "bg-blue-50 text-blue-700 border-blue-200" },
    high: { label: "Alta", className: "bg-orange-50 text-orange-700 border-orange-200" },
    urgent: { label: "Urgente", className: "bg-red-50 text-red-700 border-red-200" },
  };
  const p = map[priority] || { label: priority, className: "bg-slate-100 text-slate-700" };
  return (
    <Badge variant="outline" className={cn("text-[10px] font-medium border", p.className)}>
      {p.label}
    </Badge>
  );
}

function resolveDropColumn(overId: string | number | undefined, tickets: any[]): MaintenanceKanbanStatus | null {
  if (overId == null) return null;
  const idStr = String(overId);
  if (idStr.startsWith("col-")) {
    const s = idStr.slice("col-".length) as MaintenanceKanbanStatus;
    if (COLUMNS.some((c) => c.status === s)) return s;
    return null;
  }
  const t = tickets.find((x) => String(x.id) === idStr);
  if (t && COLUMNS.some((c) => c.status === t.status)) return t.status as MaintenanceKanbanStatus;
  return null;
}

/** Colunas largas + cartões dentro quebram closestCorners; pointerWithin resolve o alvo pelo cursor. */
const kanbanCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) return pointerHits;
  return rectIntersection(args);
};

function KanbanColumnDroppable({
  status,
  title,
  subtitle,
  accent,
  count,
  children,
}: {
  status: MaintenanceKanbanStatus;
  title: string;
  subtitle: string;
  accent: string;
  count: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${status}` });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[420px] w-[280px] shrink-0 flex-col rounded-xl border-2 border-dashed p-3 transition-colors",
        accent,
        isOver && "ring-2 ring-blue-400/60 ring-offset-2"
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium text-slate-600 shadow-sm">{count}</span>
      </div>
      <div className="flex min-h-[300px] flex-1 flex-col gap-2 overflow-y-auto pr-0.5">{children}</div>
    </div>
  );
}

function KanbanTicketCard({
  ticket,
  canDrag,
  onViewDetails,
}: {
  ticket: any;
  canDrag: boolean;
  onViewDetails: (t: any) => void;
}) {
  const isCancelled = ticket.status === "cancelled";
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: String(ticket.id),
    disabled: !canDrag || isCancelled,
    data: { ticket },
  });

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.35 : 1,
  };

  const roomNum = ticket.rooms?.room_number ?? "—";
  const attachCount = ticket.maintenance_ticket_attachments?.length ?? 0;
  const dragEnabled = canDrag && !isCancelled;
  const isCompleted = ticket.status === "completed";

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "border border-slate-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md",
        (isCompleted || isCancelled) && "opacity-95",
        dragEnabled && "cursor-grab touch-none active:cursor-grabbing"
      )}
      {...(dragEnabled ? { ...listeners, ...attributes } : {})}
    >
      <div className="flex items-start gap-2">
        {dragEnabled && (
          <div
            className="mt-0.5 shrink-0 text-slate-400"
            aria-hidden
          >
            <GripVertical className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {priorityBadge(ticket.priority)}
            <span className="text-[10px] font-mono text-slate-400">{(ticket.id || "").slice(0, 8).toUpperCase()}</span>
          </div>
          <p className="text-xs font-medium text-slate-500">Quarto {roomNum}</p>
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{ticket.title}</p>
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <span className="text-[10px] text-slate-500">{getSLA(ticket.opened_at)} atrás</span>
            <div className="flex items-center gap-1">
              {attachCount > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-slate-400" title="Anexos">
                  <ImageIcon className="h-3 w-3" />
                  {attachCount}
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => onViewDetails(ticket)}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                title="Detalhes"
              >
                <Eye className="h-3.5 w-3.5 text-slate-600" />
              </Button>
            </div>
          </div>
          <p className="text-[10px] text-slate-400">
            {format(new Date(ticket.opened_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </p>
        </div>
      </div>
    </Card>
  );
}

export interface MaintenanceKanbanBoardProps {
  tickets: any[];
  canDrag: boolean;
  onViewDetails: (ticket: any) => void;
  onStatusChange: (ticketId: string, fromStatus: string, toStatus: MaintenanceKanbanStatus) => Promise<void>;
}

export function MaintenanceKanbanBoard({ tickets, canDrag, onViewDetails, onStatusChange }: MaintenanceKanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const byColumn = useMemo(() => {
    const map: Record<string, any[]> = { open: [], in_progress: [], completed: [], cancelled: [] };
    for (const t of tickets) {
      const s = t.status as string;
      if (map[s]) map[s].push(t);
      else map.open.push(t);
    }
    return map;
  }, [tickets]);

  const activeTicket = activeId ? tickets.find((t) => String(t.id) === activeId) : null;

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const tid = String(e.active.id);
    const ticket = tickets.find((t) => String(t.id) === tid);
    if (!ticket) return;

    const target = resolveDropColumn(e.over?.id, tickets);
    if (!target || target === ticket.status) return;

    try {
      await onStatusChange(tid, ticket.status, target);
    } catch {
      /* toast no hook / pai */
    }
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={kanbanCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => (
          <KanbanColumnDroppable
            key={col.status}
            status={col.status}
            title={col.title}
            subtitle={col.subtitle}
            accent={col.accent}
            count={byColumn[col.status]?.length ?? 0}
          >
            {(byColumn[col.status] || []).map((ticket: any) => (
              <KanbanTicketCard
                key={ticket.id}
                ticket={ticket}
                canDrag={canDrag}
                onViewDetails={onViewDetails}
              />
            ))}
          </KanbanColumnDroppable>
        ))}
      </div>

      <DragOverlay dropAnimation={null} style={{ pointerEvents: "none" }}>
        {activeTicket ? (
          <Card className="w-[260px] border-2 border-blue-300 bg-white p-3 shadow-lg">
            <p className="text-xs font-medium text-slate-500">Quarto {activeTicket.rooms?.room_number ?? "—"}</p>
            <p className="text-sm font-semibold text-slate-900">{activeTicket.title}</p>
          </Card>
        ) : null}
      </DragOverlay>

      {!canDrag && (
        <p className="mt-2 text-center text-xs text-slate-500">Sem permissão para alterar status. Visualização apenas.</p>
      )}
    </DndContext>
  );
}
