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
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Alinhado com supabase/functions/aiosell-sync SYNC_DAYS_AHEAD */
const SYNC_DAYS_AHEAD = 180;

function pairKey(categoryId: string, planId: string | null) {
  return `${categoryId}\0${planId ?? ""}`;
}

function normPlanId(id: string | null | undefined) {
  return id?.trim() || null;
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
};

export function AiosellMappingPanel() {
  const establishmentId = getSelectedEstablishmentId();
  const queryClient = useQueryClient();
  const { channels, channelPricing } = useChannelManager();

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
    if (!pairsQuery.data || !channelId) return;
    setDrafts((prev) => {
      const next: Record<string, { room: string; rateplan: string; pricingId?: string }> = {};
      for (const pair of pairsQuery.data) {
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
          room: p !== undefined ? p.room : String(ex?.channel_room_code ?? "").trim(),
          rateplan: p !== undefined ? p.rateplan : String(ex?.channel_rate_plan_code ?? "").trim(),
          pricingId: ex?.id ?? p?.pricingId,
        };
      }
      return next;
    });
  }, [pairsQuery.data, channelId, existingForChannel]);

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
    const rateplan = d.rateplan.trim();
    if (!room || !rateplan) {
      if (!silent) toast.error("Preencha Room Code e Rate Plan Code (iguais ao painel Aiosell).");
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
    if (!pairsQuery.data) return;
    const toSave = pairsQuery.data.filter((p) => {
      const k = pairKey(p.category_id, p.pricing_plan_id);
      const d = drafts[k];
      return d && d.room.trim() && d.rateplan.trim();
    });
    if (toSave.length === 0) {
      toast.message("Nenhuma linha com Room Code e Rate Plan Code preenchidos.");
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

  const selectedChannel = aiosellChannels.find((c) => c.id === channelId);

  const suspiciousPairs = useMemo(() => {
    if (!pairsQuery.data) return [];
    return pairsQuery.data.filter((pair) => {
      const k = pairKey(pair.category_id, pair.pricing_plan_id);
      const d = drafts[k];
      const room = d?.room?.trim() ?? "";
      if (!room) return false;
      return mappingLooksSuspicious(pair.categoryName, room);
    });
  }, [pairsQuery.data, drafts]);

  if (aiosellChannels.length === 0) {
    return null;
  }

  return (
    <Card className="p-4 sm:p-6 space-y-4 border-slate-200/90">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Mapeamento Aiosell (PMS → Channel Manager)</h3>
        <p className="text-sm text-muted-foreground">
          Para cada <strong>categoria</strong> e <strong>plano de tarifa</strong> que existe no
          calendário (próximos {SYNC_DAYS_AHEAD} dias), indique os mesmos{" "}
          <strong>Room Code</strong> e <strong>Rate Plan Code</strong> que configurou no painel
          Aiosell (ex.: room <code className="text-xs bg-muted px-1 rounded">deluxe</code> e plano{" "}
          <code className="text-xs bg-muted px-1 rounded">deluxe-s-ep</code>). O nome do plano no
          PMS (ex. «Reembolsável») não precisa coincidir com o código Aiosell — o mapeamento é feito
          aqui.
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
          Cada <strong>Room Code</strong> e <strong>Rate Plan Code</strong> que envia aqui tem de
          existir no mapeamento do Channel Manager Aiosell (mesmos tipos de quarto e planos de
          tarifa). Se o CM só tiver, por exemplo, <code className="text-xs">deluxe</code> e{" "}
          <code className="text-xs">executivo</code>, não use códigos de outro tipo (ex.{" "}
          <code className="text-xs">standard-*</code>) até os criar no Aiosell.
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
      ) : !pairsQuery.data?.length ? (
        <p className="text-sm text-muted-foreground">
          Não há linhas no calendário de tarifas neste intervalo. Gere ou edite tarifas no sistema
          tarifário primeiro.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button type="button" variant="secondary" size="sm" onClick={() => saveAllFilled()}>
              Guardar todas as linhas preenchidas
            </Button>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria (PMS)</TableHead>
                  <TableHead>Plano (PMS)</TableHead>
                  <TableHead className="min-w-[140px]">Room Code (Aiosell)</TableHead>
                  <TableHead className="min-w-[160px]">Rate Plan Code (Aiosell)</TableHead>
                  <TableHead className="w-[100px]">Estado</TableHead>
                  <TableHead className="w-[120px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pairsQuery.data.map((pair) => {
                  const k = pairKey(pair.category_id, pair.pricing_plan_id);
                  const d = drafts[k] || { room: "", rateplan: "" };
                  const ok = d.room.trim() && d.rateplan.trim();
                  const suspicious =
                    ok && mappingLooksSuspicious(pair.categoryName, d.room);
                  return (
                    <TableRow key={k}>
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
                        <Input
                          className="font-mono text-sm h-9"
                          placeholder="ex. deluxe-s-ep"
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
                        <Button type="button" size="sm" variant="outline" onClick={() => savePair(pair)}>
                          Guardar
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </Card>
  );
}
