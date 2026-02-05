import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuotes } from "@/hooks/useQuotes";
import { usePricing } from "@/hooks/usePricing";
import { useRateSystem } from "@/hooks/useRateSystem";
import { Loader2, Mail, Send, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { Switch } from "@/components/ui/switch";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";

interface QuoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  quoteId?: string; // Para edição
  initialData?: {
    checkin_date?: string;
    checkout_date?: string;
    category_id?: string;
    pricing_plan_id?: string;
    adults?: number;
    children?: number;
  };
}

export const QuoteDialog = ({
  open,
  onOpenChange,
  onSuccess,
  quoteId,
  initialData,
}: QuoteDialogProps) => {
  const { createQuote, updateQuote, generatePaymentLink, sendQuoteEmail, isCreating, isUpdating, isGeneratingLink, isSendingEmail } = useQuotes();
  const { calculatePrice } = usePricing();
  const { ratePlans } = useRateSystem();
  const [loading, setLoading] = useState(false);
  const [calculatedTotal, setCalculatedTotal] = useState<number>(0);
  const [isManualPrice, setIsManualPrice] = useState(false);
  const [calculatingPrice, setCalculatingPrice] = useState(false);
  const [sendEmailOnCreate, setSendEmailOnCreate] = useState(false);

  const [formData, setFormData] = useState({
    guest_name: "",
    guest_email: "",
    guest_phone: "",
    category_id: initialData?.category_id || "",
    room_id: "",
    checkin_date: initialData?.checkin_date || "",
    checkout_date: initialData?.checkout_date || "",
    adults: initialData?.adults || 1,
    children: initialData?.children || 0,
    channel: "direct",
    pricing_plan_id: initialData?.pricing_plan_id || "",
    notes: "",
  });

  // Buscar categorias
  const { data: categories } = useQuery({
    queryKey: ["room_categories", getSelectedEstablishmentId()],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      if (!establishmentId) return [];

      const { data, error } = await supabase
        .from("room_categories")
        .select("*")
        .eq("establishment_id", establishmentId)
        .order("name");

      if (error) throw error;
      return data;
    },
  });

  // Buscar quartos disponíveis quando categoria e datas são selecionadas
  const { data: availableRooms } = useQuery({
    queryKey: ["available_rooms", formData.category_id, formData.checkin_date, formData.checkout_date],
    queryFn: async () => {
      if (!formData.category_id || !formData.checkin_date || !formData.checkout_date) {
        return [];
      }

      const establishmentId = getSelectedEstablishmentId();
      if (!establishmentId) return [];

      // Buscar quartos da categoria
      const { data: rooms, error: roomsError } = await supabase
        .from("rooms")
        .select("*")
        .eq("category_id", formData.category_id)
        .eq("establishment_id", establishmentId);

      if (roomsError) throw roomsError;

      // Verificar disponibilidade (simplificado - pode ser melhorado)
      return rooms || [];
    },
    enabled: !!formData.category_id && !!formData.checkin_date && !!formData.checkout_date,
  });

  // Carregar dados do orçamento se estiver editando
  useEffect(() => {
    if (quoteId && open) {
      const loadQuote = async () => {
        setLoading(true);
        try {
          const { data, error } = await supabase
            .from("quotes")
            .select("*")
            .eq("id", quoteId)
            .single();

          if (error) throw error;

          if (data) {
            // Garantir que as datas sejam strings no formato YYYY-MM-DD
            // Se vier como Date object, converter para string no formato correto
            let checkinDateStr = data.checkin_date;
            let checkoutDateStr = data.checkout_date;
            
            // Se for um objeto Date, converter para string YYYY-MM-DD usando métodos locais
            if (checkinDateStr instanceof Date) {
              const year = checkinDateStr.getFullYear();
              const month = String(checkinDateStr.getMonth() + 1).padStart(2, '0');
              const day = String(checkinDateStr.getDate()).padStart(2, '0');
              checkinDateStr = `${year}-${month}-${day}`;
            } else if (typeof checkinDateStr === 'string' && checkinDateStr.includes('T')) {
              // Se for uma string ISO com hora, extrair apenas a data
              checkinDateStr = checkinDateStr.split('T')[0];
            }
            
            if (checkoutDateStr instanceof Date) {
              const year = checkoutDateStr.getFullYear();
              const month = String(checkoutDateStr.getMonth() + 1).padStart(2, '0');
              const day = String(checkoutDateStr.getDate()).padStart(2, '0');
              checkoutDateStr = `${year}-${month}-${day}`;
            } else if (typeof checkoutDateStr === 'string' && checkoutDateStr.includes('T')) {
              // Se for uma string ISO com hora, extrair apenas a data
              checkoutDateStr = checkoutDateStr.split('T')[0];
            }
            
            setFormData({
              guest_name: data.guest_name || "",
              guest_email: data.guest_email || "",
              guest_phone: data.guest_phone || "",
              category_id: data.category_id,
              room_id: data.room_id || "",
              checkin_date: checkinDateStr,
              checkout_date: checkoutDateStr,
              adults: data.adults || 1,
              children: data.children || 0,
              channel: data.channel || "direct",
              pricing_plan_id: data.pricing_plan_id || "",
              notes: data.notes || "",
            });
            setCalculatedTotal(data.total_amount || 0);
            setIsManualPrice(true);
          }
        } catch (error: any) {
          toast.error("Erro ao carregar orçamento");
          console.error(error);
        } finally {
          setLoading(false);
        }
      };

      loadQuote();
    } else if (!quoteId && open) {
      // Resetar formulário ao criar novo
      setFormData({
        guest_name: "",
        guest_email: "",
        guest_phone: "",
        category_id: initialData?.category_id || "",
        room_id: "",
        checkin_date: initialData?.checkin_date || "",
        checkout_date: initialData?.checkout_date || "",
        adults: initialData?.adults || 1,
        children: initialData?.children || 0,
        channel: "direct",
        pricing_plan_id: initialData?.pricing_plan_id || "",
        notes: "",
      });
      setCalculatedTotal(0);
      setIsManualPrice(false);
      setSendEmailOnCreate(false);
    }
  }, [quoteId, open, initialData]);

  // Ref para controlar se há cálculo em andamento
  const calculatingRef = useRef(false);
  const lastCalculationKeyRef = useRef<string>("");

  // Calcular preço quando dados mudarem (com debounce e cache)
  useEffect(() => {
    // Criar chave única para esta combinação de parâmetros
    const calculationKey = `${formData.category_id}-${formData.checkin_date}-${formData.checkout_date}-${formData.pricing_plan_id || 'none'}-${formData.adults}-${formData.children}`;
    
    // Se já calculamos com estes parâmetros, não recalcular
    if (lastCalculationKeyRef.current === calculationKey) {
      return;
    }

    // Verificar se deve calcular
    if (
      !isManualPrice &&
      formData.category_id &&
      formData.checkin_date &&
      formData.checkout_date &&
      formData.checkin_date < formData.checkout_date &&
      !calculatingRef.current
    ) {
      // Debounce: aguardar 500ms após a última mudança
      const timeoutId = setTimeout(async () => {
        // Verificar novamente antes de calcular (pode ter mudado durante o timeout)
        const currentKey = `${formData.category_id}-${formData.checkin_date}-${formData.checkout_date}-${formData.pricing_plan_id || 'none'}-${formData.adults}-${formData.children}`;
        
        if (
          lastCalculationKeyRef.current !== currentKey &&
          !calculatingRef.current &&
          !isManualPrice &&
          formData.category_id &&
          formData.checkin_date &&
          formData.checkout_date &&
          formData.checkin_date < formData.checkout_date
        ) {
          calculatingRef.current = true;
          setCalculatingPrice(true);
          
          try {
            const price = await calculatePrice(
              formData.category_id,
              formData.checkin_date,
              formData.checkout_date,
              undefined,
              formData.pricing_plan_id || undefined,
              formData.channel || undefined,
              formData.adults,
              formData.children
            );
            
            // Só atualizar se ainda estamos com os mesmos parâmetros
            const finalKey = `${formData.category_id}-${formData.checkin_date}-${formData.checkout_date}-${formData.pricing_plan_id || 'none'}-${formData.adults}-${formData.children}`;
            if (finalKey === currentKey) {
              setCalculatedTotal(price);
              lastCalculationKeyRef.current = currentKey;
            }
          } catch (error) {
            console.error("Erro ao calcular preço:", error);
            // Não atualizar lastCalculationKeyRef em caso de erro para permitir retry
          } finally {
            calculatingRef.current = false;
            setCalculatingPrice(false);
          }
        }
      }, 500); // Debounce de 500ms

      return () => {
        clearTimeout(timeoutId);
      };
    } else if (!formData.category_id || !formData.checkin_date || !formData.checkout_date) {
      // Resetar cache se dados incompletos
      lastCalculationKeyRef.current = "";
      setCalculatedTotal(0);
    }
  }, [
    formData.category_id,
    formData.checkin_date,
    formData.checkout_date,
    formData.pricing_plan_id,
    formData.channel,
    formData.adults,
    formData.children,
    isManualPrice,
    // Remover calculatePrice das dependências para evitar recriação constante
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.guest_name || !formData.guest_email) {
      toast.error("Nome e email do hóspede são obrigatórios");
      return;
    }

    if (!formData.category_id || !formData.checkin_date || !formData.checkout_date) {
      toast.error("Categoria, check-in e check-out são obrigatórios");
      return;
    }

    if (formData.checkin_date >= formData.checkout_date) {
      toast.error("Data de check-out deve ser posterior à data de check-in");
      return;
    }

    setLoading(true);
    try {
      // Garantir que as datas sejam strings no formato YYYY-MM-DD sem conversão de timezone
      // IMPORTANTE: O input type="date" retorna uma string no formato YYYY-MM-DD
      // que representa a data no timezone local do usuário. Precisamos garantir
      // que essa string seja enviada diretamente ao banco sem conversão.
      let checkinDateStr = formData.checkin_date.trim();
      let checkoutDateStr = formData.checkout_date.trim();
      
      // Validar formato das datas
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(checkinDateStr) || !dateRegex.test(checkoutDateStr)) {
        toast.error("Formato de data inválido");
        setLoading(false);
        return;
      }
      
      // Garantir que as datas estão no formato correto (sem hora, sem timezone)
      // Se por algum motivo vier com hora, remover
      if (checkinDateStr.includes('T')) {
        checkinDateStr = checkinDateStr.split('T')[0];
      }
      if (checkoutDateStr.includes('T')) {
        checkoutDateStr = checkoutDateStr.split('T')[0];
      }
      
      // Validar que as datas são válidas
      const checkinDateObj = new Date(checkinDateStr + 'T12:00:00'); // Usar meio-dia para evitar problemas de timezone
      const checkoutDateObj = new Date(checkoutDateStr + 'T12:00:00');
      
      if (isNaN(checkinDateObj.getTime()) || isNaN(checkoutDateObj.getTime())) {
        toast.error("Datas inválidas");
        setLoading(false);
        return;
      }
      
      // Verificar se check-out é posterior ao check-in
      if (checkoutDateObj <= checkinDateObj) {
        toast.error("Data de check-out deve ser posterior à data de check-in");
        setLoading(false);
        return;
      }
      
      // Usar as strings originais (YYYY-MM-DD) para garantir que não há conversão de timezone
      // O PostgreSQL DATE armazena apenas a data sem hora/timezone, então a string YYYY-MM-DD
      // será interpretada corretamente como a data literal que o usuário selecionou

      const quoteData = {
        guest_name: formData.guest_name,
        guest_email: formData.guest_email,
        guest_phone: formData.guest_phone || null,
        category_id: formData.category_id,
        room_id: formData.room_id || null,
        checkin_date: checkinDateStr, // Usar string diretamente, sem conversão
        checkout_date: checkoutDateStr, // Usar string diretamente, sem conversão
        adults: formData.adults,
        children: formData.children,
        channel: formData.channel,
        pricing_plan_id: formData.pricing_plan_id || null,
        notes: formData.notes || null,
        total_amount: calculatedTotal || 0,
      };

      let createdQuote;
      if (quoteId) {
        createdQuote = await updateQuote({ id: quoteId, ...quoteData });
      } else {
        createdQuote = await createQuote(quoteData as any);
      }

      // Se solicitado, gerar e enviar link de pagamento
      if (sendEmailOnCreate && createdQuote?.id) {
        try {
          // Gerar link de pagamento
          const paymentLink = await generatePaymentLink(createdQuote.id);
          
          if (paymentLink && createdQuote.guest_email) {
            // Enviar email com o link de pagamento
            await sendQuoteEmail({ 
              quoteId: createdQuote.id, 
              paymentLink 
            });
            toast.success("Orçamento criado e link de pagamento enviado por email");
          } else {
            toast.success("Orçamento criado, mas email não foi enviado (email do hóspede não informado)");
          }
        } catch (error: any) {
          console.error("Erro ao gerar/enviar link de pagamento:", error);
          toast.error(error.message || "Orçamento criado, mas erro ao enviar email");
        }
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar orçamento");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{quoteId ? "Editar Orçamento" : "Novo Orçamento"}</DialogTitle>
          <DialogDescription>
            {quoteId
              ? "Edite as informações do orçamento"
              : "Preencha os dados para criar um novo orçamento"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Informações do Hóspede */}
          <div className="space-y-4 border-b pb-4">
            <h3 className="font-semibold">Informações do Hóspede</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="guest_name">Nome *</Label>
                <Input
                  id="guest_name"
                  value={formData.guest_name}
                  onChange={(e) => setFormData({ ...formData, guest_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="guest_email">E-mail *</Label>
                <Input
                  id="guest_email"
                  type="email"
                  value={formData.guest_email}
                  onChange={(e) => setFormData({ ...formData, guest_email: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="guest_phone">WhatsApp</Label>
                <Input
                  id="guest_phone"
                  value={formData.guest_phone}
                  onChange={(e) => setFormData({ ...formData, guest_phone: e.target.value })}
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>
          </div>

          {/* Informações da Reserva */}
          <div className="space-y-4 border-b pb-4">
            <h3 className="font-semibold">Informações da Reserva</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category_id">Acomodação *</Label>
                <Select
                  value={formData.category_id}
                  onValueChange={(value) => {
                    setFormData({ ...formData, category_id: value, room_id: "" });
                    setIsManualPrice(false);
                  }}
                >
                  <SelectTrigger id="category_id">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories?.map((category: any) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="pricing_plan_id">Plano Tarifário</Label>
                <Select
                  value={formData.pricing_plan_id || "__none__"}
                  onValueChange={(value) => {
                    setFormData({
                      ...formData,
                      pricing_plan_id: value === "__none__" ? "" : value,
                    });
                    setIsManualPrice(false);
                  }}
                >
                  <SelectTrigger id="pricing_plan_id">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum (Usar padrão)</SelectItem>
                    {ratePlans
                      ?.filter((plan) => plan.is_active)
                      .map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name} {plan.code ? `(${plan.code})` : ""}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="checkin_date">Check-in *</Label>
                <Input
                  id="checkin_date"
                  type="date"
                  value={formData.checkin_date}
                  onChange={(e) => {
                    setFormData({ ...formData, checkin_date: e.target.value });
                    setIsManualPrice(false);
                  }}
                  min={new Date().toISOString().split("T")[0]}
                  required
                />
              </div>

              <div>
                <Label htmlFor="checkout_date">Check-out *</Label>
                <Input
                  id="checkout_date"
                  type="date"
                  value={formData.checkout_date}
                  onChange={(e) => {
                    setFormData({ ...formData, checkout_date: e.target.value });
                    setIsManualPrice(false);
                  }}
                  min={formData.checkin_date || new Date().toISOString().split("T")[0]}
                  required
                />
              </div>

              <div>
                <Label htmlFor="adults">Adultos</Label>
                <Input
                  id="adults"
                  type="number"
                  min="1"
                  value={formData.adults}
                  onChange={(e) => {
                    setFormData({ ...formData, adults: parseInt(e.target.value) || 1 });
                    setIsManualPrice(false);
                  }}
                />
              </div>

              <div>
                <Label htmlFor="children">Crianças</Label>
                <Input
                  id="children"
                  type="number"
                  min="0"
                  value={formData.children}
                  onChange={(e) => {
                    setFormData({ ...formData, children: parseInt(e.target.value) || 0 });
                    setIsManualPrice(false);
                  }}
                />
              </div>

              {availableRooms && availableRooms.length > 0 && (
                <div className="col-span-2">
                  <Label htmlFor="room_id">Quarto (Opcional)</Label>
                  <Select
                    value={formData.room_id || "__none__"}
                    onValueChange={(value) => setFormData({ ...formData, room_id: value === "__none__" ? "" : value })}
                  >
                    <SelectTrigger id="room_id">
                      <SelectValue placeholder="Selecione um quarto (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhum (Atribuir automaticamente)</SelectItem>
                      {availableRooms.map((room: any) => (
                        <SelectItem key={room.id} value={room.id}>
                          {room.room_number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          {/* Valor Total */}
          <div className="space-y-2 border-b pb-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="total_amount">Valor Total</Label>
              {calculatingPrice && (
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Calculando...
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="total_amount"
                type="number"
                step="0.01"
                min="0"
                value={calculatedTotal.toFixed(2)}
                onChange={(e) => {
                  setCalculatedTotal(parseFloat(e.target.value) || 0);
                  setIsManualPrice(true);
                }}
                className="text-lg font-semibold"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsManualPrice(false);
                  // Limpar cache para forçar recálculo
                  lastCalculationKeyRef.current = "";
                }}
                disabled={calculatingPrice}
              >
                {calculatingPrice ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Calculando...
                  </>
                ) : (
                  "Recalcular"
                )}
              </Button>
            </div>
          </div>

          {/* Observações */}
          <div>
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>

          {/* Opções */}
          {!quoteId && (
            <div className="flex items-center space-x-2 border-t pt-4">
              <Switch
                id="send_email"
                checked={sendEmailOnCreate}
                onCheckedChange={setSendEmailOnCreate}
              />
              <Label htmlFor="send_email" className="cursor-pointer">
                Enviar link de pagamento por email ao criar
              </Label>
            </div>
          )}

          {/* Botões */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading || isCreating || isUpdating || isGeneratingLink || isSendingEmail}>
              {(loading || isCreating || isUpdating || isGeneratingLink || isSendingEmail) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {quoteId ? "Salvar" : (isSendingEmail ? "Enviando..." : "Criar Orçamento")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

