import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { useChannelManager } from "@/hooks/useChannelManager";
import { Loader2, CheckCircle2, AlertCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  normalizeAiosellRatePlanCodesStored,
  splitAiosellRatePlanCodes,
} from "@/lib/aiosellRatePlanCodes";

/** Alinhado com supabase/functions/aiosell-sync SYNC_DAYS_AHEAD */
const SYNC_DAYS_AHEAD = 365;

function normPlanId(id: string | null | undefined) {
  return id?.trim() || null;
}

function pairKey(categoryId: string, planId: string | null | undefined) {
  const p = normPlanId(planId);
  return `${categoryId}\0${p ?? ""}`;
}

/** Normaliza para comparação simples (acentos removidos). */
function normCat(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/**
 * Categoria PMS vs Room Code Aiosell claramente incoerentes (ex.: Standard no PMS com room
 * `executivo` — típico quando o CM só tem deluxe/executivo e não há tipo Standard).
 */
function mappingLooksSuspicious(categoryName: string, roomCode: string): boolean {
  const cat = normCat(categoryName);
  const rm = roomCode.trim().toLowerCase();
  if (!rm) return false;
  if (cat.includes("standard") && (rm === "executivo" || rm === "deluxe")) return true;
  if (cat.includes("deluxe") && rm === "executivo") return true;
  if (cat.includes("execut") && !cat.includes("deluxe") && rm === "deluxe") return true;
  return false;
}

type CalendarPair = {
  category_id: string;
  pricing_plan_id: string | null;
  categoryName: string;
  planName: string;
  planCode: string | null;
  /** Linha criada só em Tarifas por canal (ainda sem datas no calendário no intervalo). */
  source?: "calendar" | "channel_only";
};

export function AiosellMappingPanel() {
  const establishmentId = getSelectedEstablishmentId();
  const queryClient = useQueryClient();
  const { channels, channelPricing, deleteChannelPricing } = useChannelManager();

  const aiosellChannels = useMemo(
    () =>
      (channels as { id: string; name: string; aiosell_hotel_code?: string | null }[]).filter(
        (c) => (c as { channel_manager_type?: string }).channel_manager_type === "aiosell"
      ),
    [channels]
  );

  const [channelId, setChannelId] = useState<string>("");

  useEffect(() => {
    if (!channelId && aiosellChannels.length > 0) {
      setChannelId(aiosellChannels[0].id);
    }
  }, [aiosellChannels, channelId]);

  const pairsQuery = useQuery({
    queryKey: ["aiosell_mapping_pairs", establishmentId, SYNC_DAYS_AHEAD],
    enabled: !!establishmentId,
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const end = new Date();
      end.setDate(end.getDate() + SYNC_DAYS_AHEAD);
      const endStr = end.toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("rate_calendar")
        .select(
          `
          category_id,
          pricing_plan_id,
          room_categories (id, name),
          pricing_plans (id, code, name)
        `
        )
        .eq("establishment_id", establishmentId!)
        .gte("date", today)
        .lte("date", endStr);

      if (error) throw error;

      const seen = new Map<string, CalendarPair>();
      for (const row of data || []) {
        const r = row as {
          category_id: string;
          pricing_plan_id: string | null;
          room_categories: { name?: string } | null;
          pricing_plans: { code?: string; name?: string } | null;
        };
        const pid = normPlanId(r.pricing_plan_id);
        const k = pairKey(r.category_id, pid);
        if (seen.has(k)) continue;
        seen.set(k, {
          category_id: r.category_id,
          pricing_plan_id: pid,
          categoryName: r.room_categories?.name || r.category_id,
          planName: r.pricing_plans?.name || (pid ? "Plano" : "—"),
          planCode: r.pricing_plans?.code || null,
          source: "calendar",
        });
      }
      return Array.from(seen.values()).sort((a, b) =>
        `${a.categoryName}\0${a.planName}`.localeCompare(`${b.categoryName}\0${b.planName}`)
      );
    },
  });

  const existingForChannel = useMemo(() => {
    if (!channelId) return [];
    return (channelPricing as Record<string, unknown>[]).filter(
      (p) => p.ota_channel_id === channelId
    );
  }, [channelPricing, channelId]);

  const calendarPairKeys = useMemo(() => {
    const s = new Set<string>();
    for (const p of pairsQuery.data || []) {
      s.add(pairKey(p.category_id, p.pricing_plan_id));
    }
    return s;
  }, [pairsQuery.data]);

  /** Mapeamentos guardados para este canal que ainda não aparecem no intervalo do calendário. */
  const channelOnlyPairs = useMemo((): CalendarPair[] => {
    if (!channelId || pairsQuery.isLoading) return [];
    const out: CalendarPair[] = [];
    for (const p of existingForChannel) {
      const cid = p.category_id as string;
      const pid = normPlanId(p.pricing_plan_id as string | null);
      const k = pairKey(cid, pid);
      if (calendarPairKeys.has(k)) continue;
      const rc = p.room_categories as { name?: string } | undefined;
      const pp = p.pricing_plans as { name?: string; code?: string } | undefined;
      out.push({
        category_id: cid,
        pricing_plan_id: pid,
        categoryName: rc?.name || cid,
        planName: pid ? pp?.name || "Plano" : "Todos os planos (categoria)",
        planCode: pp?.code || null,
        source: "channel_only",
      });
    }
    return out.sort((a, b) =>
      `${a.categoryName}\0${a.planName}`.localeCompare(`${b.categoryName}\0${b.planName}`)
    );
  }, [channelId, existingForChannel, calendarPairKeys, pairsQuery.isLoading]);

  const displayPairs = useMemo(() => {
    const cal = pairsQuery.data || [];
    return [...cal, ...channelOnlyPairs];
  }, [pairsQuery.data, channelOnlyPairs]);

  const categoriesForAdd = useQuery({
    queryKey: ["aiosell_mapping_categories", establishmentId],
    enabled: !!establishmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("room_categories")
        .select("id, name")
        .eq("establishment_id", establishmentId!)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const plansForAdd = useQuery({
    queryKey: ["aiosell_mapping_plans", establishmentId],
    enabled: !!establishmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_plans")
        .select("id, name, code")
        .eq("establishment_id", establishmentId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const [addOpen, setAddOpen] = useState(false);
  const [addCategoryId, setAddCategoryId] = useState("");
  const [addPlanId, setAddPlanId] = useState<string>("__all__");
  const [addRoom, setAddRoom] = useState("");
  const [addRateplan, setAddRateplan] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pairToDelete, setPairToDelete] = useState<CalendarPair | null>(null);

  /** Só correspondência exata: uma linha na BD por (categoria + plano), alinhada com a sincronização. */
  const findExistingRow = (categoryId: string, planId: string | null) => {
    const want = normPlanId(planId);
    return existingForChannel.find(
      (p) =>
        p.category_id === categoryId && normPlanId(p.pricing_plan_id as string | null) === want
    );
  };

  const [drafts, setDrafts] = useState<
    Record<string, { room: string; rateplan: string; pricingId?: string }>
  >({});

  useEffect(() => {
    if (!channelId) return;
    if (displayPairs.length === 0) {
      setDrafts({});
      return;
    }
    setDrafts((prev) => {
      const next: Record<string, { room: string; rateplan: string; pricingId?: string }> = {};
      for (const pair of displayPairs) {
        const k = pairKey(pair.category_id, pair.pricing_plan_id);
        const ex = findExistingRow(pair.category_id, pair.pricing_plan_id) as
          | {
              id?: string;
              channel_room_code?: string | null;
              channel_rate_plan_code?: string | null;
            }
          | undefined;
        const p = prev[k];
        const storedRp = String(ex?.channel_rate_plan_code ?? "").trim();
        next[k] = {
          room: p !== undefined ? p.room : String(ex?.channel_room_code ?? "").trim(),
          rateplan: p !== undefined ? p.rateplan : storedRp,
          pricingId: ex?.id ?? p?.pricingId,
        };
      }
      return next;
    });
  }, [displayPairs, channelId, existingForChannel]);

  const updateDraft = (
    pair: CalendarPair,
    field: "room" | "rateplan",
    value: string
  ) => {
    const k = pairKey(pair.category_id, pair.pricing_plan_id);
    setDrafts((prev) => {
      const cur = prev[k];
      return {
        ...prev,
        [k]: {
          room: field === "room" ? value : (cur?.room ?? ""),
          rateplan: field === "rateplan" ? value : (cur?.rateplan ?? ""),
          pricingId: cur?.pricingId,
        },
      };
    });
  };

  const savePair = async (pair: CalendarPair, options?: { silent?: boolean }) => {
    const silent = options?.silent;
    const k = pairKey(pair.category_id, pair.pricing_plan_id);
    const d = drafts[k];
    if (!d || !channelId) return;

    const room = d.room.trim();
    const rateplan = normalizeAiosellRatePlanCodesStored(d.rateplan);
    if (!room || splitAiosellRatePlanCodes(rateplan).length === 0) {
      if (!silent) {
        toast.error(
          "Preencha Room Code e pelo menos um Rate Plan Code (códigos do Channel Manager Aiosell, separados por vírgula se forem vários)."
        );
      }
      return;
    }

    try {
      if (d.pricingId) {
        const { error } = await supabase
          .from("channel_pricing")
          .update({
            ota_channel_id: channelId,
            category_id: pair.category_id,
            pricing_plan_id: pair.pricing_plan_id,
            price_multiplier: 1,
            is_active: true,
            channel_room_code: room,
            channel_rate_plan_code: rateplan,
          })
          .eq("id", d.pricingId);
        if (error) throw error;
      } else {
        const { data: created, error } = await supabase
          .from("channel_pricing")
          .insert({
            ota_channel_id: channelId,
            category_id: pair.category_id,
            pricing_plan_id: pair.pricing_plan_id,
            price_multiplier: 1,
            is_active: true,
            channel_room_code: room,
            channel_rate_plan_code: rateplan,
          })
          .select("id")
          .single();
        if (error) throw error;
        if (created?.id) {
          setDrafts((prev) => ({
            ...prev,
            [k]: { ...prev[k], pricingId: created.id },
          }));
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["channel_pricing"] });
      if (!silent) toast.success("Mapeamento guardado.");
    } catch (e: unknown) {
      if (!silent) toast.error(e instanceof Error ? e.message : "Erro ao guardar");
      throw e;
    }
  };

  const saveAllFilled = async () => {
    if (!displayPairs.length) return;
    const toSave = displayPairs.filter((p) => {
      const k = pairKey(p.category_id, p.pricing_plan_id);
      const d = drafts[k];
      return d && d.room.trim() && splitAiosellRatePlanCodes(d.rateplan).length > 0;
    });
    if (toSave.length === 0) {
      toast.message("Nenhuma linha com Room Code e pelo menos um Rate Plan Code preenchidos.");
      return;
    }
    let ok = 0;
    let failed = 0;
    for (const pair of toSave) {
      try {
        await savePair(pair, { silent: true });
        ok++;
      } catch {
        failed++;
      }
    }
    await queryClient.invalidateQueries({ queryKey: ["channel_pricing"] });
    if (failed > 0) {
      toast.error(`${failed} linha(s) não foram guardadas (ver consola ou tente uma a uma).`);
    }
    if (ok > 0) {
      toast.success(`Guardadas ${ok} linha(s) de mapeamento.`);
    }
  };

  const openAddDialog = () => {
    if (!channelId) {
      toast.error("Selecione um canal Aiosell.");
      return;
    }
    setAddCategoryId("");
    setAddPlanId("__all__");
    setAddRoom("");
    setAddRateplan("");
    setAddOpen(true);
  };

  const saveNewLine = async () => {
    if (!channelId) return;
    const room = addRoom.trim();
    const rateplan = normalizeAiosellRatePlanCodesStored(addRateplan);
    if (!addCategoryId || !room || splitAiosellRatePlanCodes(rateplan).length === 0) {
      toast.error(
        "Selecione a categoria e preencha Room Code e pelo menos um Rate Plan Code (vários: separados por vírgula)."
      );
      return;
    }
    const planId = addPlanId === "__all__" ? null : addPlanId;
    const k = pairKey(addCategoryId, planId);
    if (displayPairs.some((p) => pairKey(p.category_id, p.pricing_plan_id) === k)) {
      toast.error("Esta combinação de categoria e plano já existe na tabela.");
      return;
    }
    setAddSaving(true);
    try {
      const { error } = await supabase.from("channel_pricing").insert({
        ota_channel_id: channelId,
        category_id: addCategoryId,
        pricing_plan_id: planId,
        price_multiplier: 1,
        is_active: true,
        channel_room_code: room,
        channel_rate_plan_code: rateplan,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["channel_pricing"] });
      await queryClient.invalidateQueries({ queryKey: ["aiosell_mapping_pairs"] });
      toast.success("Linha de mapeamento adicionada.");
      setAddOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao adicionar");
    } finally {
      setAddSaving(false);
    }
  };

  const confirmDeleteRow = async () => {
    const pair = pairToDelete;
    if (!pair) return;
    const k = pairKey(pair.category_id, pair.pricing_plan_id);
    const ex = findExistingRow(pair.category_id, pair.pricing_plan_id) as
      | { id?: string }
      | undefined;
    const id = ex?.id ?? drafts[k]?.pricingId;
    if (!id) {
      toast.error("Não há linha guardada na base de dados para eliminar.");
      setDeleteOpen(false);
      setPairToDelete(null);
      return;
    }
    try {
      await deleteChannelPricing(id);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["channel_pricing"] });
      await queryClient.refetchQueries({ queryKey: ["channel_pricing"] });
      await queryClient.invalidateQueries({ queryKey: ["aiosell_mapping_pairs"] });
      await queryClient.refetchQueries({ queryKey: ["aiosell_mapping_pairs"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao eliminar");
    } finally {
      setDeleteOpen(false);
      setPairToDelete(null);
    }
  };

  const selectedChannel = aiosellChannels.find((c) => c.id === channelId);

  const suspiciousPairs = useMemo(() => {
    if (!displayPairs.length) return [];
    return displayPairs.filter((pair) => {
      const k = pairKey(pair.category_id, pair.pricing_plan_id);
      const d = drafts[k];
      const room = d?.room?.trim() ?? "";
      if (!room) return false;
      return mappingLooksSuspicious(pair.categoryName, room);
    });
  }, [displayPairs, drafts]);

  if (aiosellChannels.length === 0) {
    return null;
  }

  return (
    <Card className="p-4 sm:p-6 space-y-4 border-slate-200/90">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Mapeamento Aiosell (PMS → Channel Manager)</h3>
        <p className="text-sm text-muted-foreground">
          Para cada <strong>categoria</strong> e <strong>plano de tarifa</strong> no calendário
          (próximos {SYNC_DAYS_AHEAD} dias), indique o <strong>Room Code</strong> e um ou mais{" "}
          <strong>Rate Plan Codes</strong> do Channel Manager Aiosell que devem usar o mesmo preço
          PMS (ex.: <code className="text-xs">deluxe-s-ep, deluxe-d-ep</code>). Pode{" "}
          <strong>adicionar</strong> linhas manualmente ou <strong>eliminar</strong> mapeamentos
          guardados. O nome do plano no PMS não precisa coincidir com o código Aiosell.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Canal Aiosell</Label>
          <Select value={channelId} onValueChange={setChannelId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o canal" />
            </SelectTrigger>
            <SelectContent>
              {aiosellChannels.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Hotel Code no PMS (deve coincidir com o CM)</Label>
          <Input
            readOnly
            className="font-mono text-sm bg-muted/50"
            value={(selectedChannel as { aiosell_hotel_code?: string })?.aiosell_hotel_code || "—"}
          />
        </div>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Room e rate plan no painel Aiosell</AlertTitle>
        <AlertDescription className="text-sm">
          Cada código que listar em <strong>Rate Plan Code</strong> tem de existir no Channel
          Manager Aiosell. Vários códigos na mesma linha: separados por vírgula, ponto e vírgula ou
          nova linha; a sincronização envia o mesmo preço para todos. O <strong>Room Code</strong>{" "}
          é o <strong>tipo de quarto no CM</strong> (ex. deluxe, executivo);{" "}
          <strong>Rate Plan Code</strong> é o <strong>plano de tarifa no CM</strong> (ex. deluxe-s-ep).
          Não coloque nomes de planos do PMS (reembolsável / não reembolsável) no campo Room Code — isso
          inverte o que a API Aiosell espera. O preço enviado ao CM segue a coluna x1–x4 do tarifário ARI
          configurada no canal OTA (preço padrão = x2, duas pessoas).
        </AlertDescription>
      </Alert>

      {suspiciousPairs.length > 0 ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Rever mapeamento</AlertTitle>
          <AlertDescription className="text-sm space-y-2">
            <p>
              As linhas abaixo indicam categoria no PMS e Room Code Aiosell que parecem não
              corresponder (ex.: categoria Standard com room <code className="text-xs">executivo</code>
              ). Isto costuma levar a rejeição da API Aiosell («Payload Parsing Failed»).
            </p>
            <ul className="list-disc pl-5 space-y-1">
              {suspiciousPairs.map((p) => (
                <li key={pairKey(p.category_id, p.pricing_plan_id)}>
                  <span className="font-medium">{p.categoryName}</span>
                  {" → "}
                  <code className="text-xs">
                    {drafts[pairKey(p.category_id, p.pricing_plan_id)]?.room?.trim() || "—"}
                  </code>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {pairsQuery.isLoading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          A carregar combinações do calendário…
        </div>
      ) : pairsQuery.error ? (
        <p className="text-sm text-destructive">Erro ao carregar o calendário.</p>
      ) : displayPairs.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Não há linhas no calendário neste intervalo nem mapeamentos guardados para este canal.
            Adicione uma linha abaixo ou crie tarifas no tarifário.
          </p>
          <Button type="button" size="sm" variant="default" onClick={openAddDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar linha de mapeamento
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button type="button" variant="default" size="sm" onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar linha
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => saveAllFilled()}>
              Guardar todas as linhas preenchidas
            </Button>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Origem</TableHead>
                  <TableHead>Categoria (PMS)</TableHead>
                  <TableHead>Plano (PMS)</TableHead>
                  <TableHead className="min-w-[140px]">Room Code (Aiosell)</TableHead>
                  <TableHead className="min-w-[200px]">Rate Plan Code(s) (Aiosell)</TableHead>
                  <TableHead className="w-[100px]">Estado</TableHead>
                  <TableHead className="min-w-[140px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayPairs.map((pair) => {
                  const k = pairKey(pair.category_id, pair.pricing_plan_id);
                  const d = drafts[k] || { room: "", rateplan: "" };
                  const ok =
                    d.room.trim().length > 0 &&
                    splitAiosellRatePlanCodes(d.rateplan).length > 0;
                  const suspicious =
                    ok && mappingLooksSuspicious(pair.categoryName, d.room);
                  return (
                    <TableRow key={k}>
                      <TableCell>
                        {pair.source === "channel_only" ? (
                          <Badge variant="secondary" className="text-xs font-normal">
                            Só canal
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs font-normal">
                            Calendário
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{pair.categoryName}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span>{pair.planName}</span>
                          {pair.planCode ? (
                            <span className="text-xs text-muted-foreground font-mono">
                              {pair.planCode}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          className="font-mono text-sm h-9"
                          placeholder="ex. deluxe"
                          value={d.room}
                          onChange={(e) => updateDraft(pair, "room", e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Textarea
                          className="font-mono text-sm min-h-[44px] max-h-28 resize-y"
                          placeholder={"ex. deluxe-s-ep, deluxe-d-ep"}
                          rows={2}
                          value={d.rateplan}
                          onChange={(e) => updateDraft(pair, "rateplan", e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        {ok ? (
                          suspicious ? (
                            <Badge
                              variant="outline"
                              className="gap-1 text-destructive border-destructive/60"
                            >
                              <AlertCircle className="h-3.5 w-3.5" />
                              Rever
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-emerald-700 border-emerald-300">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Pronto
                            </Badge>
                          )
                        ) : (
                          <Badge variant="outline" className="gap-1 text-amber-800 border-amber-300">
                            <AlertCircle className="h-3.5 w-3.5" />
                            Falta
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <Button type="button" size="sm" variant="outline" onClick={() => savePair(pair)}>
                            Guardar
                          </Button>
                          {d.pricingId ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                setPairToDelete(pair);
                                setDeleteOpen(true);
                              }}
                              title="Eliminar mapeamento guardado"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar mapeamento Aiosell</DialogTitle>
            <DialogDescription>
              Cria uma linha em Tarifas por canal. Room Code e um ou mais Rate Plan Codes do CM
              (separados por vírgula).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label>Categoria (quarto)</Label>
              <Select value={addCategoryId} onValueChange={setAddCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {(categoriesForAdd.data || []).map((c: { id: string; name: string }) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Plano de tarifa</Label>
              <Select value={addPlanId} onValueChange={setAddPlanId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os planos (uma linha por categoria)</SelectItem>
                  {(plansForAdd.data || []).map((p: { id: string; name: string; code?: string }) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.code ? ` (${p.code})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Room Code (Aiosell)</Label>
              <Input
                className="font-mono text-sm"
                placeholder="ex. deluxe"
                value={addRoom}
                onChange={(e) => setAddRoom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Rate Plan Code(s) (Aiosell)</Label>
              <Textarea
                className="font-mono text-sm min-h-[72px]"
                placeholder="ex. deluxe-s-ep, deluxe-d-ep"
                rows={3}
                value={addRateplan}
                onChange={(e) => setAddRateplan(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => saveNewLine()} disabled={addSaving}>
              {addSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Guardar linha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar mapeamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {pairToDelete ? (
                <>
                  Esta ação remove a linha de Tarifas por canal para{" "}
                  <strong>{pairToDelete.categoryName}</strong> — {pairToDelete.planName}. A
                  sincronização deixará de enviar estes códigos até voltar a criar o mapeamento.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                void confirmDeleteRow();
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
