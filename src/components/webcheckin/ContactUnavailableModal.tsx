import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Phone, MessageCircle, Building2, Hotel } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";

interface ContactUnavailableModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId?: string;
  establishmentId?: string;
}

export const ContactUnavailableModal = ({
  open,
  onOpenChange,
  categoryId,
  establishmentId,
}: ContactUnavailableModalProps) => {
  const [contactInfo, setContactInfo] = useState<{
    phone?: string;
    whatsapp?: string;
    name?: string;
    type: "establishment" | "building";
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open && (categoryId || establishmentId)) {
      loadContactInfo();
    }
  }, [open, categoryId, establishmentId]);

  const loadContactInfo = async () => {
    setLoading(true);
    try {
      // Se não temos establishmentId, tentar buscar da categoria
      if (!establishmentId && categoryId) {
        // Buscar categoria para obter establishment_id
        const { data: category, error: categoryError } = await supabase
          .from("room_categories")
          .select("establishment_id, building_id")
          .eq("id", categoryId)
          .single();

        if (categoryError) {
          console.error("Erro ao buscar categoria:", categoryError);
        }

        // Se a categoria tem establishment_id, usar
        if (category && (category as any).establishment_id) {
          establishmentId = (category as any).establishment_id;
        } else if (category && (category as any).building_id) {
          // Se não tem establishment_id direto, buscar do prédio
          const buildingId = (category as any).building_id;
          const { data: building, error: buildingError } = await supabase
            .from("buildings")
            .select("establishment_id")
            .eq("id", buildingId)
            .single();

          if (!buildingError && building && building.establishment_id) {
            establishmentId = building.establishment_id;
          }
        }
      }

      // Buscar informações do estabelecimento
      // Prioridade: hotel_settings (configurações do PMS) > establishments
      if (establishmentId) {
        // Primeiro, buscar de hotel_settings (configurações do PMS)
        // Usar select("*") para evitar problemas com colunas específicas
        const { data: hotelSettings, error: hotelSettingsError } = await supabase
          .from("hotel_settings")
          .select("*")
          .eq("establishment_id", establishmentId)
          .maybeSingle();

        if (hotelSettingsError) {
          console.error("Erro ao buscar hotel_settings:", hotelSettingsError);
        }

        if (hotelSettings) {
          const settingsAny = hotelSettings as any;
          // Priorizar campos únicos 'phone' e 'whatsapp', senão montar dos campos antigos
          const phone = settingsAny.phone || 
            (settingsAny.phone_ddi && settingsAny.phone_number 
              ? `${settingsAny.phone_ddi} ${settingsAny.phone_number}`.trim()
              : settingsAny.phone_number || '');
          const whatsapp = settingsAny.whatsapp || 
            (settingsAny.whatsapp_ddi && settingsAny.whatsapp_number 
              ? `${settingsAny.whatsapp_ddi} ${settingsAny.whatsapp_number}`.trim()
              : settingsAny.whatsapp_number || '');
          
          if (phone || whatsapp) {
            setContactInfo({
              phone: phone || undefined,
              whatsapp: whatsapp || undefined,
              name: settingsAny.hotel_name || settingsAny.name || undefined,
              type: "establishment",
            });
            setLoading(false);
            return;
          }
        }

        // Se não encontrou em hotel_settings, buscar da tabela establishments
        // Usar select("*") para evitar problemas com colunas específicas
        const { data: establishment, error: establishmentError } = await supabase
          .from("establishments")
          .select("*")
          .eq("id", establishmentId)
          .maybeSingle();

        if (establishmentError) {
          console.error("Erro ao buscar establishment:", establishmentError);
        }

        // Se encontrou establishment, mostrar informações disponíveis
        if (establishment) {
          const establishmentAny = establishment as any;
          setContactInfo({
            phone: establishmentAny.phone || 
              (establishmentAny.phone_ddi && establishmentAny.phone_number 
                ? `${establishmentAny.phone_ddi} ${establishmentAny.phone_number}`.trim()
                : establishmentAny.phone_number || '') || undefined,
            whatsapp: establishmentAny.whatsapp || 
              (establishmentAny.whatsapp_ddi && establishmentAny.whatsapp_number 
                ? `${establishmentAny.whatsapp_ddi} ${establishmentAny.whatsapp_number}`.trim()
                : establishmentAny.whatsapp_number || '') || undefined,
            name: establishmentAny.name || undefined,
            type: "establishment",
          });
          setLoading(false);
          return;
        }
      }
    } catch (error) {
      console.error("Erro ao carregar informações de contato:", error);
    } finally {
      setLoading(false);
    }
  };

  // phone e whatsapp já vêm completos (com DDI incluído se necessário)
  const phone = contactInfo?.phone || '';
  const whatsapp = contactInfo?.whatsapp || '';
  const whatsappLink = whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, '')}` : '';
  const phoneLink = phone ? `tel:${phone.replace(/\D/g, '')}` : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-orange-500" />
            Não há disponibilidade no período
          </DialogTitle>
          <DialogDescription>
            Para solicitar uma extensão de reserva, entre em contato com nosso atendimento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {loading ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">Carregando informações de contato...</p>
            </div>
          ) : contactInfo ? (
            <>
              <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  {contactInfo.type === "building" ? (
                    <Building2 className="w-4 h-4" />
                  ) : (
                    <Hotel className="w-4 h-4" />
                  )}
                  <span>{contactInfo.name || (contactInfo.type === "building" ? "Prédio" : "Estabelecimento")}</span>
                </div>

                {phone && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Phone className="w-4 h-4" />
                      <span>Telefone:</span>
                      <span className="font-medium">{phone}</span>
                    </div>
                    {phoneLink && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(phoneLink, "_blank")}
                      >
                        <Phone className="w-4 h-4 mr-1" />
                        Ligar
                      </Button>
                    )}
                  </div>
                )}

                {whatsapp && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <MessageCircle className="w-4 h-4" />
                      <span>WhatsApp:</span>
                      <span className="font-medium">{whatsapp}</span>
                    </div>
                    {whatsappLink && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(whatsappLink, "_blank")}
                        className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
                      >
                        <MessageCircle className="w-4 h-4 mr-1" />
                        WhatsApp
                      </Button>
                    )}
                  </div>
                )}

                {!phone && !whatsapp && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    Informações de contato não disponíveis.
                  </p>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>Importante:</strong> Entre em contato para verificar a disponibilidade e solicitar a extensão da sua reserva.
                </p>
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground">
                Informações de contato não disponíveis. Por favor, entre em contato com o estabelecimento através dos canais habituais.
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

