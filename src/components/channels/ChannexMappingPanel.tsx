import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Loader2, CheckCircle2, AlertCircle, Plus, Trash2, RefreshCw } from "lucide-react";
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

const SYNC_DAYS_AHEAD = 365;

function normPlanId(id: string | null | undefined) {
  return id?.trim() || null;
}

function pairKey(categoryId: string, planId: string | null | undefined) {
  const p = normPlanId(planId);
  return `${categoryId}\0${p ?? ""}`;
}

type CalendarPair = {
  category_id: string;
  pricing_plan_id: string | null;
  categoryName: string;
  planName: string;
  planCode: string | null;
  source?: "calendar" | "channel_only";
};

type ChannexRoomTypeOption = {
  id: string;
  title: string;
  property_id?: string;
};

type ChannexRatePlanOption = {
  id: string;
  title: string;
  room_type_id?: string;
  property_id?: string;
};

export function ChannexMappingPanel() {
  const establishmentId = getSelectedEstablishmentId();
  const queryClient = useQueryClient();
  const { channels, channelPricing, deleteChannelPricing } = useChannelManager();

  const channexChannels = useMemo(
    () =>
      (channels as { id: string; name: string; channex_property_id?: string | null }[]).filter(
        (c) => (c as { channel_manager_type?: string }).channel_manager_type === "channex"
      ),
    [channels]
  );

  const [channelId, setChannelId] = useState<string>("");

  useEffect(() => {
    if (!channelId && channexChannels.length > 0) {
      setChannelId(channexChannels[0].id);
    }
  }, [channexChannels, channelId]);

  const pairsQuery = useQuery({
    queryKey: ["channex_mapping_pairs", establishmentId, SYNC_DAYS_AHEAD],
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

  const channexOptionsQuery = useQuery({
    queryKey: ["channex_remote_options", establishmentId, channelId],
    enabled: !!establishmentId && !!channelId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("channex-mapping-options", {
        body: {
          channel_id: channelId,
          establishment_id: establishmentId,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro ao carregar opções do Channex");
      return {
        roomTypes: (data.room_types || []) as ChannexRoomTypeOption[],
        ratePlans: (data.rate_plans || []) as ChannexRatePlanOption[],
      };
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
    for (const p of pairsQuery.data || []) s.add(pairKey(p.category_id, p.pricing_plan_id));
    return s;
  }, [pairsQuery.data]);

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

  const displayPairs = useMemo(() => [...(pairsQuery.data || []), ...channelOnlyPairs], [pairsQuery.data, channelOnlyPairs]);

  const [drafts, setDrafts] = useState<Record<string, { roomTypeId: string; ratePlanId: string; pricingId?: string }>>({});

  const findExistingRow = (categoryId: string, planId: string | null) => {
    const want = normPlanId(planId);
    return existingForChannel.find(
      (p) =>
        p.category_id === categoryId && normPlanId(p.pricing_plan_id as string | null) === want
    );
  };

  useEffect(() => {
    if (!channelId) return;
    if (displayPairs.length === 0) {
      setDrafts({});
      return;
    }
    setDrafts((prev) => {
      const next: Record<string, { roomTypeId: string; ratePlanId: string; pricingId?: string }> = {};
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
        next[k] = {
          roomTypeId: p !== undefined ? p.roomTypeId : String(ex?.channel_room_code ?? "").trim(),
          ratePlanId: p !== undefined ? p.ratePlanId : String(ex?.channel_rate_plan_code ?? "").trim(),
          pricingId: ex?.id ?? p?.pricingId,
        };
      }
      return next;
    });
  }, [displayPairs, channelId, existingForChannel]);

  const updateDraft = (pair: CalendarPair, field: "roomTypeId" | "ratePlanId", value: string) => {
    const k = pairKey(pair.category_id, pair.pricing_plan_id);
    setDrafts((prev) => {
      const cur = prev[k];
      return {
        ...prev,
        [k]: {
          roomTypeId: field === "roomTypeId" ? value : (cur?.roomTypeId ?? ""),
          ratePlanId: field === "ratePlanId" ? value : (cur?.ratePlanId ?? ""),
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

    const roomTypeId = d.roomTypeId.trim();
    const ratePlanId = d.ratePlanId.trim();
    if (!roomTypeId || !ratePlanId) {
      if (!silent) toast.error("Preencha Room Type ID e Rate Plan ID do Channex.");
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
            channel_room_code: roomTypeId,
            channel_rate_plan_code: ratePlanId,
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
            channel_room_code: roomTypeId,
            channel_rate_plan_code: ratePlanId,
          })
          .select("id")
          .single();
        if (error) throw error;
        if (created?.id) {
          setDrafts((prev) => ({ ...prev, [k]: { ...prev[k], pricingId: created.id } }));
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
    const toSave = displayPairs.filter((p) => {
      const k = pairKey(p.category_id, p.pricing_plan_id);
      const d = drafts[k];
      return d && d.roomTypeId.trim() && d.ratePlanId.trim();
    });
    if (toSave.length === 0) {
      toast.message("Nenhuma linha com Room Type ID e Rate Plan ID preenchidos.");
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
    if (failed > 0) toast.error(`${failed} linha(s) não foram guardadas.`);
    if (ok > 0) toast.success(`Guardadas ${ok} linha(s) de mapeamento.`);
  };

  const categoriesForAdd = useQuery({
    queryKey: ["channex_mapping_categories", establishmentId],
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
    queryKey: ["channex_mapping_plans", establishmentId],
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
  const [addRoomTypeId, setAddRoomTypeId] = useState("");
  const [addRatePlanId, setAddRatePlanId] = useState("");
  const [addSaving, setAddSaving] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pairToDelete, setPairToDelete] = useState<CalendarPair | null>(null);

  const saveNewLine = async () => {
    if (!channelId) return;
    if (!addCategoryId || !addRoomTypeId.trim() || !addRatePlanId.trim()) {
      toast.error("Selecione categoria e preencha Room Type ID e Rate Plan ID.");
      return;
    }
    const planId = addPlanId === "__all__" ? null : addPlanId;
    const k = pairKey(addCategoryId, planId);
    if (displayPairs.some((p) => pairKey(p.category_id, p.pricing_plan_id) === k)) {
      toast.error("Esta combinação de categoria e plano já existe.");
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
        channel_room_code: addRoomTypeId.trim(),
        channel_rate_plan_code: addRatePlanId.trim(),
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["channel_pricing"] });
      await queryClient.invalidateQueries({ queryKey: ["channex_mapping_pairs"] });
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
    const ex = findExistingRow(pair.category_id, pair.pricing_plan_id) as { id?: string } | undefined;
    const id = ex?.id ?? drafts[k]?.pricingId;
    if (!id) {
      toast.error("Não há linha guardada para eliminar.");
      setDeleteOpen(false);
      setPairToDelete(null);
      return;
    }
    try {
      await deleteChannelPricing(id);
      await queryClient.invalidateQueries({ queryKey: ["channel_pricing"] });
      await queryClient.invalidateQueries({ queryKey: ["channex_mapping_pairs"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao eliminar");
    } finally {
      setDeleteOpen(false);
      setPairToDelete(null);
    }
  };

  const selectedChannel = channexChannels.find((c) => c.id === channelId);
  const roomTypeOptions = channexOptionsQuery.data?.roomTypes || [];
  const ratePlanOptions = channexOptionsQuery.data?.ratePlans || [];

  if (channexChannels.length === 0) return null;

  return (
    <Card className="p-4 sm:p-6 space-y-4 border-violet-200/90">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Mapeamento Channex (PMS → Channel Manager)</h3>
        <p className="text-sm text-muted-foreground">
          Para cada categoria/plano no calendário, informe o <strong>Room Type ID</strong> e o{" "}
          <strong>Rate Plan ID</strong> existentes no Channex.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Canal Channex</Label>
          <Select value={channelId} onValueChange={setChannelId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o canal" />
            </SelectTrigger>
            <SelectContent>
              {channexChannels.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Property ID</Label>
          <Input
            readOnly
            className="font-mono text-sm bg-muted/50"
            value={(selectedChannel as { channex_property_id?: string })?.channex_property_id || "—"}
          />
        </div>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>IDs obrigatórios do Channex</AlertTitle>
        <AlertDescription className="text-sm">
          O sync ARI usa diretamente esses IDs. Se houver mismatch, o envio de disponibilidade/tarifa será ignorado
          para a linha.
        </AlertDescription>
      </Alert>

      {channexOptionsQuery.error ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar Room Types/Rate Plans do Channex para seleção automática.
        </p>
      ) : null}

      {pairsQuery.isLoading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          A carregar combinações do calendário…
        </div>
      ) : pairsQuery.error ? (
        <p className="text-sm text-destructive">Erro ao carregar o calendário.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void channexOptionsQuery.refetch();
              }}
              disabled={channexOptionsQuery.isFetching}
            >
              {channexOptionsQuery.isFetching ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Recarregar inventário Channex
            </Button>
            <Button type="button" variant="default" size="sm" onClick={() => setAddOpen(true)}>
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
                  <TableHead className="min-w-[220px]">Room Type ID (Channex)</TableHead>
                  <TableHead className="min-w-[220px]">Rate Plan ID (Channex)</TableHead>
                  <TableHead className="w-[100px]">Estado</TableHead>
                  <TableHead className="min-w-[140px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayPairs.map((pair) => {
                  const k = pairKey(pair.category_id, pair.pricing_plan_id);
                  const d = drafts[k] || { roomTypeId: "", ratePlanId: "" };
                  const ok = d.roomTypeId.trim().length > 0 && d.ratePlanId.trim().length > 0;
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
                            <span className="text-xs text-muted-foreground font-mono">{pair.planCode}</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1.5">
                          <Input
                            className="font-mono text-sm h-9"
                            placeholder="UUID room_type"
                            value={d.roomTypeId}
                            onChange={(e) => updateDraft(pair, "roomTypeId", e.target.value)}
                          />
                          {roomTypeOptions.length > 0 ? (
                            <Select value={d.roomTypeId || "__none__"} onValueChange={(v) => updateDraft(pair, "roomTypeId", v === "__none__" ? "" : v)}>
                              <SelectTrigger className="h-8">
                                <SelectValue placeholder="Selecionar room type do Channex" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Sem seleção</SelectItem>
                                {roomTypeOptions.map((rt) => (
                                  <SelectItem key={rt.id} value={rt.id}>
                                    {rt.title || rt.id}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1.5">
                          <Input
                            className="font-mono text-sm h-9"
                            placeholder="UUID rate_plan"
                            value={d.ratePlanId}
                            onChange={(e) => updateDraft(pair, "ratePlanId", e.target.value)}
                          />
                          {ratePlanOptions.length > 0 ? (
                            <Select value={d.ratePlanId || "__none__"} onValueChange={(v) => updateDraft(pair, "ratePlanId", v === "__none__" ? "" : v)}>
                              <SelectTrigger className="h-8">
                                <SelectValue placeholder="Selecionar rate plan do Channex" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Sem seleção</SelectItem>
                                {ratePlanOptions
                                  .filter((rp) => !d.roomTypeId || rp.room_type_id === d.roomTypeId)
                                  .map((rp) => (
                                    <SelectItem key={rp.id} value={rp.id}>
                                      {rp.title || rp.id}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {ok ? (
                          <Badge variant="outline" className="gap-1 text-emerald-700 border-emerald-300">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Pronto
                          </Badge>
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
            <DialogTitle>Adicionar mapeamento Channex</DialogTitle>
            <DialogDescription>
              Cria uma linha em Tarifas por canal com IDs de room_type e rate_plan do Channex.
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
              <Label>Room Type ID (Channex)</Label>
              <Input
                className="font-mono text-sm"
                placeholder="UUID room_type"
                value={addRoomTypeId}
                onChange={(e) => setAddRoomTypeId(e.target.value)}
              />
              {roomTypeOptions.length > 0 ? (
                <Select value={addRoomTypeId || "__none__"} onValueChange={(v) => setAddRoomTypeId(v === "__none__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar room type do Channex" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem seleção</SelectItem>
                    {roomTypeOptions.map((rt) => (
                      <SelectItem key={rt.id} value={rt.id}>
                        {rt.title || rt.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Rate Plan ID (Channex)</Label>
              <Input
                className="font-mono text-sm"
                placeholder="UUID rate_plan"
                value={addRatePlanId}
                onChange={(e) => setAddRatePlanId(e.target.value)}
              />
              {ratePlanOptions.length > 0 ? (
                <Select value={addRatePlanId || "__none__"} onValueChange={(v) => setAddRatePlanId(v === "__none__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar rate plan do Channex" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem seleção</SelectItem>
                    {ratePlanOptions
                      .filter((rp) => !addRoomTypeId || rp.room_type_id === addRoomTypeId)
                      .map((rp) => (
                        <SelectItem key={rp.id} value={rp.id}>
                          {rp.title || rp.id}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : null}
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
                  Esta ação remove a linha para <strong>{pairToDelete.categoryName}</strong> —{" "}
                  {pairToDelete.planName}.
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

