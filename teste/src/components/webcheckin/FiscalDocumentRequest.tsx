import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FileText, Mail, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format, isAfter, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { validateCNPJ, formatCNPJ, generateReceiptPDF } from "@/lib/fiscalDocumentUtils";
import { sendFiscalDocumentRequestEmail } from "@/lib/emailService";

interface FiscalDocumentRequestProps {
  reservation: any;
  establishment?: any;
  onSuccess?: () => void;
}

export function FiscalDocumentRequest({ reservation, establishment, onSuccess }: FiscalDocumentRequestProps) {
  const [documentType, setDocumentType] = useState<"invoice" | "receipt" | "">("");
  const [requestType, setRequestType] = useState<"individual" | "company">("individual");
  const [companyName, setCompanyName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [hotelSettings, setHotelSettings] = useState<any>({ fiscal_document_type: "both" });
  const [companyData, setCompanyData] = useState<any>(null);
  const [detectedGuestName, setDetectedGuestName] = useState<string>("");
  const [detectedRoomNumber, setDetectedRoomNumber] = useState<string>("");
  const [detectedGuestAddress, setDetectedGuestAddress] = useState<string>("");

  // Buscar configurações do hotel e dados da empresa
  useEffect(() => {
    const fetchEstablishmentData = async () => {
      if (!reservation?.establishment_id) {
        // Se não tem establishment_id, definir hotelSettings como objeto vazio para não travar
        setHotelSettings({} as any);
        return;
      }

      try {
      // Buscar hotel_settings com mais campos
      const { data: settingsData, error: settingsError } = await supabase
        .from("hotel_settings")
          .select("fiscal_document_type, invoice_email, name, logo_url, signature_url, phone, street, number, neighborhood, city, state, zip_code, establishment_cnpj, show_establishment_cnpj, email")
        .eq("establishment_id", reservation.establishment_id)
        .maybeSingle();

      if (settingsError) {
        console.error("Erro ao buscar configurações:", settingsError);
          // Definir objeto vazio para não travar o componente
          setHotelSettings({ fiscal_document_type: "both" } as any);
      } else if (settingsData) {
          console.log("✅ Configurações do hotel carregadas:", {
            hasInvoiceEmail: !!settingsData.invoice_email,
            invoiceEmail: settingsData.invoice_email || "(não configurado)",
            fiscalDocumentType: settingsData.fiscal_document_type
          });
        setHotelSettings(settingsData);
        } else {
          // Se não encontrou configurações, definir valores padrão
          console.warn("⚠️ Nenhuma configuração encontrada para establishment_id:", reservation.establishment_id);
          setHotelSettings({ fiscal_document_type: "both" } as any);
        }
      } catch (error) {
        console.error("Erro ao buscar configurações:", error);
        // Definir valores padrão em caso de erro
        setHotelSettings({ fiscal_document_type: "both" } as any);
      }

      // Buscar dados da empresa através do establishment (não é crítico)
      try {
      const { data: establishmentData, error: establishmentError } = await supabase
        .from("establishments")
        .select(`
          company_id,
          companies!inner(cnpj)
        `)
        .eq("id", reservation.establishment_id)
        .maybeSingle();

        if (!establishmentError && establishmentData) {
        // A estrutura pode variar dependendo de como o Supabase retorna
        const companyInfo = (establishmentData as any).companies;
        if (companyInfo) {
          setCompanyData(Array.isArray(companyInfo) ? companyInfo[0] : companyInfo);
        }
        }
      } catch (error) {
        // Ignorar erro silenciosamente - não é crítico
        console.warn("Erro ao buscar dados da empresa:", error);
      }
    };

    fetchEstablishmentData();
  }, [reservation?.establishment_id]);

  // Verificar se o estabelecimento emite o tipo de documento selecionado
  const canRequestDocument = (type: "invoice" | "receipt"): boolean => {
    const currentSettings = hotelSettings || { fiscal_document_type: "both" } as any;
    const fiscalType = currentSettings.fiscal_document_type || "both";
    
    if (type === "invoice") {
      return fiscalType === "invoice" || fiscalType === "both";
    }
    
    if (type === "receipt") {
      return fiscalType === "receipt" || fiscalType === "both";
    }
    
    return false;
  };

  // Buscar automaticamente nome do hóspede e quarto
  useEffect(() => {
    const fetchGuestAndRoomData = async () => {
      if (!reservation) return;

      let guestName = "";
      let roomNumber = "";

      // 1. Tentar obter nome do hóspede de múltiplas fontes
      guestName = reservation.guest_name 
        || reservation.guest?.full_name 
        || (typeof reservation.guest === 'object' && reservation.guest?.full_name)
        || "";

      // 2. Buscar endereço do hóspede/responsável e nome (se necessário)
      let guestAddress = "";
      
      // Primeiro, buscar apenas o nome do hóspede
      if ((!guestName || guestName === "Hóspede") && reservation.guest_id) {
        try {
          const { data: guestData } = await supabase
            .from("clients")
            .select("full_name")
            .eq("id", reservation.guest_id)
            .maybeSingle();
          
          if (guestData?.full_name) {
            guestName = guestData.full_name;
          }
        } catch (error) {
          // Ignorar erro silenciosamente
        }
      }
      
      // Para pessoa jurídica, também buscar endereço do responsável financeiro (client_id)
      if (reservation.client_id) {
        try {
          const { data: clientData, error: clientError } = await supabase
            .from("clients")
            .select("*")
            .eq("id", reservation.client_id)
            .maybeSingle();
          
          if (!clientError && clientData) {
            const addressParts = [];
            if (clientData.street) {
              let streetLine = clientData.street;
              if (clientData.number) streetLine += `, ${clientData.number}`;
              if (clientData.complement) streetLine += ` - ${clientData.complement}`;
              addressParts.push(streetLine);
            }
            if (clientData.neighborhood) addressParts.push(clientData.neighborhood);
            if (clientData.city) {
              let cityLine = clientData.city;
              if (clientData.state) cityLine += ` - ${clientData.state}`;
              addressParts.push(cityLine);
            }
            if (clientData.zip_code) addressParts.push(`CEP: ${clientData.zip_code}`);
            
            if (addressParts.length > 0) {
              guestAddress = addressParts.join(", ");
            }
          }
        } catch (error: any) {
          // Ignorar erros silenciosamente
          if (error?.code !== 'PGRST116' && error?.code !== '42P01' && !error?.message?.includes('column')) {
            console.warn("Erro ao buscar endereço do responsável financeiro:", error);
          }
        }
      }
      
      // Depois, tentar buscar endereço do hóspede em clients (se os campos existirem)
      // Isso serve como fallback ou para pessoa física
      if (!guestAddress && reservation.guest_id) {
        try {
          // Tentar buscar campos de endereço - usar select com campos que podem não existir
          const { data: guestData, error: guestError } = await supabase
            .from("clients")
            .select("*")
            .eq("id", reservation.guest_id)
            .maybeSingle();
          
          if (!guestError && guestData) {
            // Montar endereço do hóspede apenas se os campos existirem
            const addressParts = [];
            
            // Verificar se os campos existem antes de usar
            if (guestData.street) {
              let streetLine = guestData.street;
              if (guestData.number) streetLine += `, ${guestData.number}`;
              if (guestData.complement) streetLine += ` - ${guestData.complement}`;
              addressParts.push(streetLine);
            }
            if (guestData.neighborhood) addressParts.push(guestData.neighborhood);
            if (guestData.city) {
              let cityLine = guestData.city;
              if (guestData.state) cityLine += ` - ${guestData.state}`;
              addressParts.push(cityLine);
            }
            if (guestData.zip_code) addressParts.push(`CEP: ${guestData.zip_code}`);
            
            if (addressParts.length > 0) {
              guestAddress = addressParts.join(", ");
            }
          }
        } catch (error: any) {
          // Ignorar erros silenciosamente - campos de endereço podem não existir na tabela clients
          if (error?.code !== 'PGRST116' && error?.code !== '42P01' && !error?.message?.includes('column')) {
            console.warn("Erro ao buscar endereço do hóspede:", error);
          }
        }
      }
      
      // 3. Se não encontrou endereço em clients, buscar em web_checkin_guests
      // A tabela web_checkin_guests não tem reservation_id diretamente, precisa buscar via web_checkin
      if (!guestAddress && reservation.id) {
        try {
          // Primeiro, buscar o web_checkin_id através do reservation_id
          const { data: webCheckin, error: webCheckinError } = await supabase
            .from("web_checkin")
            .select("id")
            .eq("reservation_id", reservation.id)
            .maybeSingle();
          
          if (webCheckinError) {
            // Ignorar erros silenciosamente
            if (webCheckinError.code !== 'PGRST116' && webCheckinError.code !== '42P01' && !webCheckinError.message?.includes('relation')) {
              console.warn("Erro ao buscar web_checkin:", webCheckinError);
            }
          } else if (webCheckin?.id) {
            // Agora buscar os dados do hóspede usando o web_checkin_id
            const { data: webCheckinData, error: guestError } = await supabase
              .from("web_checkin_guests")
              .select("street, number, complement, neighborhood, city, state, zip_code")
              .eq("web_checkin_id", webCheckin.id)
              .eq("is_main_guest", true) // Buscar apenas o hóspede principal
              .maybeSingle();
            
            if (guestError) {
              // Ignorar erros silenciosamente
              if (guestError.code !== 'PGRST116' && guestError.code !== '42P01' && !guestError.message?.includes('relation')) {
                console.warn("Erro ao buscar endereço do web_checkin_guests:", guestError);
              }
            } else if (webCheckinData) {
              const addressParts = [];
              if (webCheckinData.street) {
                let streetLine = webCheckinData.street;
                if (webCheckinData.number) streetLine += `, ${webCheckinData.number}`;
                if (webCheckinData.complement) streetLine += ` - ${webCheckinData.complement}`;
                addressParts.push(streetLine);
              }
              if (webCheckinData.neighborhood) addressParts.push(webCheckinData.neighborhood);
              if (webCheckinData.city) {
                let cityLine = webCheckinData.city;
                if (webCheckinData.state) cityLine += ` - ${webCheckinData.state}`;
                addressParts.push(cityLine);
              }
              if (webCheckinData.zip_code) addressParts.push(`CEP: ${webCheckinData.zip_code}`);
              guestAddress = addressParts.join(", ");
            }
          }
        } catch (error: any) {
          // Ignorar erros silenciosamente - não é crítico se não encontrar endereço
          if (error?.code !== 'PGRST116' && error?.code !== '42P01' && !error?.message?.includes('relation')) {
            console.warn("Erro ao buscar endereço do web_checkin:", error);
          }
        }
      }

      // 4. Tentar obter número do quarto de múltiplas fontes
      if (reservation.rooms) {
        if (typeof reservation.rooms === 'object' && !Array.isArray(reservation.rooms)) {
          roomNumber = reservation.rooms.room_number || reservation.rooms.name || "";
        } else if (Array.isArray(reservation.rooms) && reservation.rooms.length > 0) {
          roomNumber = reservation.rooms[0].room_number || reservation.rooms[0].name || "";
        }
      }

      // 5. Se não encontrou o quarto, buscar pelo room_id
      if (!roomNumber && reservation.room_id) {
        try {
          const { data: roomData } = await supabase
            .from("rooms")
            .select("room_number, name")
            .eq("id", reservation.room_id)
            .maybeSingle();
          
          if (roomData) {
            roomNumber = roomData.room_number || roomData.name || "";
          }
        } catch (error) {
          console.error("Erro ao buscar quarto:", error);
        }
      }

      // 6. Se ainda não encontrou, buscar através da reserva completa com relacionamentos
      if (!roomNumber && reservation.id) {
        try {
          const { data: reservationData } = await supabase
            .from("reservations")
            .select(`
              rooms:room_id (
                room_number,
                name
              ),
              guest:guest_id (
                full_name
              )
            `)
            .eq("id", reservation.id)
            .maybeSingle();
          
          if (reservationData) {
            // Buscar quarto
            if (reservationData.rooms) {
              const rooms = Array.isArray(reservationData.rooms) ? reservationData.rooms[0] : reservationData.rooms;
              if (rooms && !roomNumber) {
                roomNumber = rooms.room_number || rooms.name || "";
              }
            }
            
            // Buscar nome do hóspede se ainda não encontrou
            if (reservationData.guest && (!guestName || guestName === "Hóspede")) {
              const guest = Array.isArray(reservationData.guest) ? reservationData.guest[0] : reservationData.guest;
              if (guest?.full_name) {
                guestName = guest.full_name;
              }
            }
          }
        } catch (error) {
          console.error("Erro ao buscar dados completos da reserva:", error);
        }
      }

      // Atualizar estados com os valores detectados
      if (guestName && guestName !== "Hóspede") {
        setDetectedGuestName(guestName);
      }
      if (roomNumber) {
        setDetectedRoomNumber(roomNumber);
      }
      if (guestAddress) {
        setDetectedGuestAddress(guestAddress);
      }

      console.log("🔍 Dados detectados automaticamente:", {
        guestName,
        roomNumber,
        guestAddress,
        reservationId: reservation.id,
        guestId: reservation.guest_id,
        roomId: reservation.room_id,
      });
    };

    fetchGuestAndRoomData();
  }, [reservation]);

  // Buscar CNPJ do responsável financeiro se existir
  useEffect(() => {
    const fetchFinancialResponsible = async () => {
      if (!reservation?.client_id || requestType !== "company") return;

      const { data } = await supabase
        .from("clients")
        .select("document_number, document_type, full_name")
        .eq("id", reservation.client_id)
        .maybeSingle();

      if (data && data.document_type === "cnpj" && data.document_number) {
        setCnpj(data.document_number);
        if (!companyName && data.full_name) {
          setCompanyName(data.full_name);
        }
      }
    };

    fetchFinancialResponsible();
  }, [reservation?.client_id, requestType]);

  const handleSubmit = async () => {
    if (!documentType) {
      toast.error("Selecione o tipo de documento");
      return;
    }

    // Validar CNPJ se for pessoa jurídica
    if (requestType === "company") {
      if (!companyName.trim()) {
        toast.error("Informe o nome da empresa");
        return;
      }

      if (!cnpj.trim()) {
        toast.error("Informe o CNPJ");
        return;
      }

      const cleanCNPJ = cnpj.replace(/\D/g, "");
      if (!validateCNPJ(cleanCNPJ)) {
        toast.error("CNPJ inválido");
        return;
      }
    }

    // Verificar se pode solicitar o documento
    if (!canRequestDocument(documentType)) {
      toast.error(`Este estabelecimento não emite ${documentType === "invoice" ? "Nota Fiscal" : "Recibo"}`);
      return;
    }

    setIsSubmitting(true);

    try {
      // Usar nome detectado automaticamente ou fallback
      const guestName = detectedGuestName || reservation.guest_name || reservation.guest?.full_name || "Hóspede";
      const checkinDate = reservation.checkin_date;
      const checkoutDate = reservation.checkout_date;
      const paidAmount = reservation.paid_amount || 0;
      
      // Obter establishment_id de múltiplas fontes
      let establishmentId = reservation.establishment_id 
        || reservation.establishment?.id 
        || establishment?.id
        || null;
      
      // Se ainda não encontrou, tentar buscar da reserva completa
      if (!establishmentId && reservation.id) {
        try {
          const { data: reservationData } = await supabase
            .from("reservations")
            .select("establishment_id")
            .eq("id", reservation.id)
            .maybeSingle();
          
          if (reservationData?.establishment_id) {
            establishmentId = reservationData.establishment_id;
          }
        } catch (error) {
          console.warn("Erro ao buscar establishment_id:", error);
        }
      }
      
      // Validar que temos establishment_id antes de continuar
      if (!establishmentId) {
        toast.error("Erro: Não foi possível identificar o estabelecimento. Entre em contato com o suporte.");
        setIsSubmitting(false);
        return;
      }

      // Se for recibo, gerar PDF imediatamente
      if (documentType === "receipt") {
        const currentSettings = hotelSettings || {} as any;
        const establishmentName = currentSettings.name || establishment?.name || "Estabelecimento";
        
        // Montar endereço completo
        const addressParts = [];
        if (currentSettings.street) {
          addressParts.push(currentSettings.street);
          if (currentSettings.number) {
            addressParts[addressParts.length - 1] += `, ${currentSettings.number}`;
          }
        }
        if (currentSettings.neighborhood) addressParts.push(currentSettings.neighborhood);
        if (currentSettings.city) addressParts.push(currentSettings.city);
        if (currentSettings.state) addressParts.push(currentSettings.state);
        if (currentSettings.zip_code) addressParts.push(`CEP: ${currentSettings.zip_code}`);
        const establishmentAddress = addressParts.length > 0 
          ? addressParts.join(", ")
          : (establishment?.address || "");

        // CNPJ do estabelecimento - buscar de hotel_settings (configurado pelo usuário)
        let establishmentCNPJ = currentSettings.establishment_cnpj || null;
        
        // Se não encontrou no estado, buscar diretamente
        if (!establishmentCNPJ && establishmentId) {
          try {
            const { data: settingsData } = await supabase
              .from("hotel_settings")
              .select("establishment_cnpj")
              .eq("establishment_id", establishmentId)
              .maybeSingle();
            
            if (settingsData?.establishment_cnpj) {
              establishmentCNPJ = settingsData.establishment_cnpj;
            }
          } catch (error) {
            console.warn("Erro ao buscar CNPJ do estabelecimento:", error);
          }
        }
        
        // Fallback para CNPJ da empresa se não encontrou em hotel_settings
        if (!establishmentCNPJ) {
          establishmentCNPJ = companyData?.cnpj || null;
        }

        // Buscar dados de contato de diferentes fontes
        let establishmentPhone = null;
        let establishmentEmail = null;
        let establishmentWebsite = null;
        
        if (establishmentId) {
          try {
            // 1. Email vem de hotel_settings (página Informações de Contato)
            // Buscar usando select(*) para evitar erro se campos não existirem
            const { data: settingsData, error: settingsError } = await supabase
              .from("hotel_settings")
              .select("*")
              .eq("establishment_id", establishmentId)
              .maybeSingle();
            
            if (!settingsError && settingsData) {
              // Email de Informações Básicas e Contato (campo email)
              // Depois invoice_email (para nota fiscal), depois outros campos
              establishmentEmail = settingsData.email 
                || settingsData.invoice_email 
                || settingsData.contact_email
                || settingsData.contact_email_address
                || null;
              
              // Telefone de Informações Básicas e Contato
              establishmentPhone = settingsData.phone 
                || settingsData.telephone
                || settingsData.contact_phone
                || null;
              
              // Site de Informações Básicas e Contato
              establishmentWebsite = settingsData.website 
                || settingsData.site_url 
                || settingsData.url
                || settingsData.web_site
                || settingsData.site
                || null;
            }
            
            // Fallback para estado se não encontrou
            if (!establishmentEmail) {
              establishmentEmail = currentSettings.email 
                || currentSettings.invoice_email 
                || currentSettings.contact_email
                || null;
            }
            if (!establishmentPhone) {
              establishmentPhone = currentSettings.phone || null;
            }
            if (!establishmentWebsite) {
              establishmentWebsite = currentSettings.website 
                || currentSettings.site_url 
                || currentSettings.url
                || null;
            }
          } catch (error) {
            console.error("Erro ao buscar dados de contato:", error);
            // Fallback para dados do estado
            establishmentPhone = currentSettings.phone || null;
            establishmentEmail = currentSettings.email 
              || currentSettings.invoice_email 
              || currentSettings.contact_email
              || null;
            establishmentWebsite = currentSettings.website 
              || currentSettings.site_url 
              || currentSettings.url
              || null;
          }
        } else {
          // Se não tem establishmentId, usar dados do estado
          establishmentPhone = currentSettings.phone || null;
          establishmentEmail = currentSettings.email 
            || currentSettings.invoice_email 
            || currentSettings.contact_email
            || null;
          establishmentWebsite = currentSettings.website 
            || currentSettings.site_url 
            || currentSettings.url
            || null;
        }
        
        console.log("📞 Dados de contato (antes de gerar PDF):", {
          phone: establishmentPhone,
          email: establishmentEmail,
          website: establishmentWebsite,
          establishmentId,
          fonte: "hotel_settings (Informações Básicas e Contato)"
        });

        // Logo - buscar do estado ou fazer busca direta se não estiver disponível
        let establishmentLogo = currentSettings.logo_url || null;
        
        // Se não encontrou no estado, buscar diretamente
        if (!establishmentLogo && establishmentId) {
          try {
            const { data: settingsData } = await supabase
              .from("hotel_settings")
              .select("logo_url")
              .eq("establishment_id", establishmentId)
              .maybeSingle();
            
            if (settingsData?.logo_url) {
              establishmentLogo = settingsData.logo_url;
              // Atualizar o estado também
              if (hotelSettings) {
                setHotelSettings({ ...hotelSettings, logo_url: establishmentLogo });
              }
            }
          } catch (error) {
            console.error("Erro ao buscar logo:", error);
          }
        }

        // Assinatura digital - buscar do estado ou fazer busca direta se não estiver disponível
        let establishmentSignature = currentSettings.signature_url || null;

        // Se não encontrou no estado, buscar diretamente
        if (!establishmentSignature && establishmentId) {
          try {
            const { data: settingsData } = await supabase
              .from("hotel_settings")
              .select("signature_url")
              .eq("establishment_id", establishmentId)
              .maybeSingle();
            
            if (settingsData?.signature_url) {
              establishmentSignature = settingsData.signature_url;
              // Atualizar o estado também
              if (hotelSettings) {
                setHotelSettings({ ...hotelSettings, signature_url: establishmentSignature });
              }
            }
          } catch (error) {
            console.error("Erro ao buscar assinatura:", error);
          }
        }
        
        console.log("🖼️ Dados de logo e assinatura:", {
          establishmentId,
          logoFromState: currentSettings.logo_url,
          logoFinal: establishmentLogo,
          signatureFromState: currentSettings.signature_url,
          signatureFinal: establishmentSignature,
        });

        // Usar número do quarto detectado automaticamente ou fazer busca de fallback
        let roomNumber = detectedRoomNumber || "";
        let roomCategory = "";
        let bookingChannel = "";
        
        // Buscar dados completos do quarto e categoria
        if (reservation.room_id || reservation.category_id) {
          try {
            const { data: roomData } = await supabase
              .from("rooms")
              .select(`
                room_number,
                name,
                category_id,
                room_categories:category_id (
                  name
                )
              `)
              .eq("id", reservation.room_id || reservation.category_id)
              .maybeSingle();
            
            if (roomData) {
              if (!roomNumber) {
                roomNumber = roomData.room_number || roomData.name || "";
              }
              // Buscar categoria
              if (roomData.room_categories) {
                const categories = Array.isArray(roomData.room_categories) 
                  ? roomData.room_categories[0] 
                  : roomData.room_categories;
                if (categories?.name) {
                  roomCategory = categories.name;
                }
              }
            }
            
            // Se não encontrou categoria pelo quarto, buscar pelo category_id da reserva
            if (!roomCategory && reservation.category_id) {
              const { data: categoryData } = await supabase
                .from("room_categories")
                .select("name")
                .eq("id", reservation.category_id)
                .maybeSingle();
              
              if (categoryData?.name) {
                roomCategory = categoryData.name;
              }
            }
          } catch (error) {
            console.error("Erro ao buscar quarto e categoria:", error);
          }
        }
        
        // Buscar canal de reserva
        if (reservation.id) {
          try {
            // Verificar campos possíveis para canal de reserva nos dados já carregados
            bookingChannel = reservation.channel 
              || reservation.booking_channel 
              || reservation.source
              || reservation.booking_source
              || reservation.ota_name
              || reservation.booking_source_name
              || "";
            
            // Se não encontrou nos campos diretos, buscar da reserva completa usando select(*)
            if (!bookingChannel) {
              const { data: reservationData, error: reservationError } = await supabase
                .from("reservations")
                .select("*")
                .eq("id", reservation.id)
                .maybeSingle();
              
              if (!reservationError && reservationData) {
                bookingChannel = reservationData.channel 
                  || reservationData.booking_channel 
                  || reservationData.source
                  || reservationData.booking_source
                  || reservationData.ota_name
                  || reservationData.booking_source_name
                  || "";
              }
            }
            
            // Formatar canal de reserva
            if (bookingChannel) {
              const channelLower = bookingChannel.toLowerCase();
              if (channelLower.includes('balcão') || channelLower.includes('balcao')) {
                bookingChannel = "Balcão";
              } else if (channelLower.includes('pms') || channelLower.includes('direct') || channelLower.includes('direto') || channelLower.includes('manual')) {
                bookingChannel = "Balcão";
              } else {
                bookingChannel = `OTA: ${bookingChannel}`;
              }
            } else {
              bookingChannel = "Balcão"; // Padrão se não encontrar
            }
          } catch (error) {
            console.error("Erro ao buscar canal de reserva:", error);
            bookingChannel = "Balcão"; // Padrão em caso de erro
          }
        }
        
        // Buscar site da empresa (companies)
        if (!establishmentWebsite && establishmentId) {
          try {
            // Primeiro buscar o company_id do establishment
            const { data: establishmentData, error: establishmentError } = await supabase
              .from("establishments")
              .select("company_id")
              .eq("id", establishmentId)
              .maybeSingle();
            
            if (!establishmentError && establishmentData?.company_id) {
              // Buscar dados da empresa usando select(*)
              const { data: companyData, error: companyError } = await supabase
                .from("companies")
                .select("*")
                .eq("id", establishmentData.company_id)
                .maybeSingle();
              
              if (!companyError && companyData) {
                // Verificar múltiplos campos possíveis para site
                establishmentWebsite = companyData.website 
                  || companyData.site_url 
                  || companyData.url
                  || companyData.web_site
                  || companyData.site
                  || null;
              }
            }
          } catch (error) {
            console.warn("Erro ao buscar website da empresa:", error);
          }
        }
        
        if (!roomNumber && reservation.rooms) {
          if (typeof reservation.rooms === 'object' && !Array.isArray(reservation.rooms)) {
            roomNumber = reservation.rooms.room_number || reservation.rooms.name || "";
          } else if (Array.isArray(reservation.rooms) && reservation.rooms.length > 0) {
            roomNumber = reservation.rooms[0].room_number || reservation.rooms[0].name || "";
          }
        }
        
        // Se ainda não temos o quarto, tentar buscar diretamente
        if (!roomNumber && reservation.room_id) {
          try {
            const { data: roomData } = await supabase
              .from("rooms")
              .select("room_number, name")
              .eq("id", reservation.room_id)
              .maybeSingle();
            if (roomData) {
              roomNumber = roomData.room_number || roomData.name || "";
            }
          } catch (error) {
            console.error("Erro ao buscar quarto:", error);
          }
        }
        
        // Buscar CPF do hóspede
        let guestCPF = "";
        if (reservation.guest_id) {
          try {
            const { data: guestData } = await supabase
              .from("clients")
              .select("document_number, document_type")
              .eq("id", reservation.guest_id)
              .maybeSingle();
            
            if (guestData && guestData.document_type === "cpf" && guestData.document_number) {
              guestCPF = guestData.document_number.replace(/\D/g, ""); // Apenas números
            }
          } catch (error) {
            console.warn("Erro ao buscar CPF do hóspede:", error);
          }
        }
        
        // Se não encontrou, tentar buscar de web_checkin_guests
        if (!guestCPF && reservation.id) {
          try {
            const { data: webCheckin } = await supabase
              .from("web_checkin")
              .select("id")
              .eq("reservation_id", reservation.id)
              .maybeSingle();
            
            if (webCheckin?.id) {
              const { data: webCheckinGuest } = await supabase
                .from("web_checkin_guests")
                .select("document_number, document_type")
                .eq("web_checkin_id", webCheckin.id)
                .eq("is_main_guest", true)
                .maybeSingle();
              
              if (webCheckinGuest && webCheckinGuest.document_type === "cpf" && webCheckinGuest.document_number) {
                guestCPF = webCheckinGuest.document_number.replace(/\D/g, ""); // Apenas números
              }
            }
          } catch (error) {
            console.warn("Erro ao buscar CPF do web_checkin:", error);
          }
        }

        // Para pessoa jurídica, sempre mostrar o nome do hóspede, e adicionar nome da empresa separadamente
        await generateReceiptPDF({
          guestName: guestName, // Sempre usar o nome do hóspede
          guestCPF: guestCPF || undefined, // CPF do hóspede (se disponível)
          companyName: requestType === "company" ? companyName : undefined, // Nome da empresa (se pessoa jurídica)
          companyCNPJ: requestType === "company" ? (cnpj ? cnpj.replace(/\D/g, "") : undefined) : undefined, // CNPJ da empresa (apenas números, se pessoa jurídica)
          guestAddress: detectedGuestAddress || undefined, // Endereço (do hóspede ou responsável financeiro)
          checkinDate,
          checkoutDate,
          paidAmount,
          establishmentName,
          establishmentAddress,
          establishmentCNPJ,
          establishmentPhone,
          establishmentEmail, // Email de contato
          establishmentWebsite, // Site do estabelecimento
          establishmentLogo,
          establishmentSignature,
          roomNumber: roomNumber || undefined,
          roomCategory: roomCategory || undefined,
          bookingChannel: bookingChannel || undefined,
        });

        // Criar registro da solicitação
        const { error: insertError } = await supabase
          .from("fiscal_document_requests")
          .insert({
            reservation_id: reservation.id,
            establishment_id: establishmentId, // Garantir que não é null
            document_type: "receipt",
            request_type: requestType,
            guest_name: requestType === "company" ? companyName : guestName,
            checkin_date: checkinDate,
            checkout_date: checkoutDate,
            paid_amount: paidAmount,
            company_name: requestType === "company" ? companyName : null,
            cnpj: requestType === "company" ? cnpj.replace(/\D/g, "") : null,
            status: "completed",
            completed_at: new Date().toISOString(),
          });

        if (insertError) {
          console.error("Erro ao salvar solicitação:", insertError);
          toast.error("Erro ao salvar solicitação");
        } else {
          setIsSuccess(true);
          toast.success("Recibo gerado com sucesso!");
          if (onSuccess) onSuccess();
        }
      } else if (documentType === "invoice") {
        // Para Nota Fiscal, enviar e-mail para o departamento fiscal
        let invoiceEmail = "";
        
        // Tentar obter do estado primeiro
        const currentSettings = hotelSettings || {} as any;
        invoiceEmail = currentSettings.invoice_email;
        
        // Se não encontrou no estado, buscar diretamente do banco
        if (!invoiceEmail && establishmentId) {
          try {
            const { data: settingsData, error: settingsError } = await supabase
              .from("hotel_settings")
              .select("invoice_email")
              .eq("establishment_id", establishmentId)
              .maybeSingle();
            
            console.log("🔍 Busca direta de invoice_email:", {
              establishmentId,
              settingsData,
              settingsError,
              hasInvoiceEmail: !!settingsData?.invoice_email,
              invoiceEmail: settingsData?.invoice_email || "(não encontrado)"
            });
        
            if (!settingsError && settingsData?.invoice_email) {
              invoiceEmail = settingsData.invoice_email.trim();
              // Atualizar o estado também
              if (hotelSettings) {
                setHotelSettings({ ...hotelSettings, invoice_email: invoiceEmail });
              }
            }
          } catch (error) {
            console.error("Erro ao buscar invoice_email:", error);
          }
        }
        
        console.log("📧 Validação de invoice_email:", {
          invoiceEmail,
          isEmpty: !invoiceEmail || invoiceEmail.trim() === "",
          fromState: currentSettings.invoice_email,
          establishmentId
        });
        
        // Validar se o e-mail existe e não está vazio
        if (!invoiceEmail || invoiceEmail.trim() === "") {
          toast.error("E-mail do departamento fiscal não configurado. Entre em contato com o estabelecimento.");
          setIsSubmitting(false);
          return;
        }

        // Buscar e-mail do responsável financeiro
        let financialEmail = "";
        if (reservation.client_id) {
          const { data: financialData } = await supabase
            .from("clients")
            .select("email")
            .eq("id", reservation.client_id)
            .maybeSingle();
          
          financialEmail = financialData?.email || "";
        }

        // Criar registro da solicitação
        const { data: requestData, error: insertError } = await supabase
          .from("fiscal_document_requests")
          .insert({
            reservation_id: reservation.id,
            establishment_id: establishmentId,
            document_type: "invoice",
            request_type: requestType,
            guest_name: requestType === "company" ? companyName : guestName,
            checkin_date: checkinDate,
            checkout_date: checkoutDate,
            paid_amount: paidAmount,
            company_name: requestType === "company" ? companyName : null,
            cnpj: requestType === "company" ? cnpj.replace(/\D/g, "") : null,
            financial_responsible_email: financialEmail,
            status: "pending",
          })
          .select()
          .single();

        if (insertError) {
          console.error("Erro ao salvar solicitação:", insertError);
          toast.error("Erro ao salvar solicitação");
          setIsSubmitting(false);
          return;
        }

        // Usar os valores detectados automaticamente ou fazer busca de fallback
        // IMPORTANTE: Para pessoa jurídica, o actualGuestName deve ser o nome real do hóspede (quem se hospedou)
        // não o nome da empresa. O guestName será o nome da empresa, mas actualGuestName é quem realmente ficou no quarto.
        let actualGuestName = detectedGuestName || reservation.guest_name 
          || reservation.guest?.full_name 
          || (typeof reservation.guest === 'object' && reservation.guest?.full_name)
          || "";
        
        // Se ainda não temos o nome detectado, tentar buscar uma última vez
        if ((!actualGuestName || actualGuestName === "Hóspede") && reservation.guest_id) {
          try {
            const { data: guestData } = await supabase
              .from("clients")
              .select("full_name")
              .eq("id", reservation.guest_id)
              .maybeSingle();
            if (guestData?.full_name) {
              actualGuestName = guestData.full_name;
            }
          } catch (error) {
            console.error("Erro ao buscar hóspede:", error);
          }
        }
        
        // Se ainda não temos, usar guestName como fallback (mas para pessoa jurídica, guestName será companyName)
        if (!actualGuestName || actualGuestName === "Hóspede") {
          // Para pessoa física, usar guestName normal
          // Para pessoa jurídica, tentar buscar o nome real do hóspede da reserva
          if (requestType === "company") {
            // Para pessoa jurídica, o guestName será a empresa, mas precisamos do nome real
            actualGuestName = guestName; // Fallback temporário
          } else {
          actualGuestName = guestName;
        }
        }
        
        // Log para debug
        console.log("🔍 Nome do hóspede detectado:", {
          requestType,
          actualGuestName,
          guestName,
          companyName,
          detectedGuestName,
          reservationGuestName: reservation.guest_name,
          reservationGuestId: reservation.guest_id,
        });
        
        // Usar o número do quarto detectado ou fazer busca de fallback
        let roomNumber = detectedRoomNumber || "";
        
        // Tentar obter de múltiplas fontes da reserva
        if (!roomNumber && reservation.rooms) {
          if (typeof reservation.rooms === 'object' && !Array.isArray(reservation.rooms)) {
            roomNumber = reservation.rooms.room_number || reservation.rooms.name || "";
          } else if (Array.isArray(reservation.rooms) && reservation.rooms.length > 0) {
            roomNumber = reservation.rooms[0].room_number || reservation.rooms[0].name || "";
          }
        }
        
        // Se ainda não temos o quarto, tentar buscar diretamente pelo room_id
        if (!roomNumber && reservation.room_id) {
          try {
            const { data: roomData } = await supabase
              .from("rooms")
              .select("room_number, name")
              .eq("id", reservation.room_id)
              .maybeSingle();
            if (roomData) {
              roomNumber = roomData.room_number || roomData.name || "";
            }
          } catch (error) {
            console.error("Erro ao buscar quarto:", error);
          }
        }
        
        // Se ainda não encontrou, buscar através da reserva completa com relacionamento
        if (!roomNumber && reservation.id) {
          try {
            const { data: reservationData } = await supabase
              .from("reservations")
              .select(`
                rooms:room_id (
                  room_number,
                  name
                )
              `)
              .eq("id", reservation.id)
              .maybeSingle();
            
            if (reservationData?.rooms) {
              const rooms = Array.isArray(reservationData.rooms) ? reservationData.rooms[0] : reservationData.rooms;
              roomNumber = rooms?.room_number || rooms?.name || "";
            }
          } catch (error) {
            console.error("Erro ao buscar quarto através da reserva:", error);
          }
        }
        
        // Log para debug
        if (!roomNumber) {
          console.warn("⚠️ Número do quarto não encontrado para a reserva:", {
            reservationId: reservation.id,
            roomId: reservation.room_id,
            detectedRoomNumber,
            hasRooms: !!reservation.rooms,
          });
        }
        
        // Buscar endereço do hóspede/responsável se ainda não foi detectado
        // Para pessoa física: endereço do hóspede
        // Para pessoa jurídica: endereço do responsável financeiro (client_id) ou do hóspede
        let guestAddress = detectedGuestAddress || "";
        
        // Para pessoa jurídica, primeiro tentar buscar endereço do responsável financeiro
        if (requestType === "company" && !guestAddress && reservation.client_id) {
          try {
            const { data: clientData } = await supabase
              .from("clients")
              .select("*")
              .eq("id", reservation.client_id)
              .maybeSingle();
            
            if (clientData) {
              const addressParts = [];
              if (clientData.street) {
                let streetLine = clientData.street;
                if (clientData.number) streetLine += `, ${clientData.number}`;
                if (clientData.complement) streetLine += ` - ${clientData.complement}`;
                addressParts.push(streetLine);
              }
              if (clientData.neighborhood) addressParts.push(clientData.neighborhood);
              if (clientData.city) {
                let cityLine = clientData.city;
                if (clientData.state) cityLine += ` - ${clientData.state}`;
                addressParts.push(cityLine);
              }
              if (clientData.zip_code) addressParts.push(`CEP: ${clientData.zip_code}`);
              guestAddress = addressParts.join(", ");
            }
          } catch (error) {
            console.warn("Erro ao buscar endereço do responsável financeiro:", error);
          }
        }
        
        // Buscar endereço do hóspede (para pessoa física ou como fallback para pessoa jurídica)
        if (!guestAddress && reservation.guest_id) {
          try {
            // Buscar endereço em clients
            const { data: guestData } = await supabase
              .from("clients")
              .select("*")
              .eq("id", reservation.guest_id)
              .maybeSingle();
            
            if (guestData) {
              const addressParts = [];
              if (guestData.street) {
                let streetLine = guestData.street;
                if (guestData.number) streetLine += `, ${guestData.number}`;
                if (guestData.complement) streetLine += ` - ${guestData.complement}`;
                addressParts.push(streetLine);
              }
              if (guestData.neighborhood) addressParts.push(guestData.neighborhood);
              if (guestData.city) {
                let cityLine = guestData.city;
                if (guestData.state) cityLine += ` - ${guestData.state}`;
                addressParts.push(cityLine);
              }
              if (guestData.zip_code) addressParts.push(`CEP: ${guestData.zip_code}`);
              guestAddress = addressParts.join(", ");
            }
          } catch (error) {
            console.warn("Erro ao buscar endereço do hóspede:", error);
          }
        }
        
        // Se ainda não encontrou, tentar buscar em web_checkin_guests
        if (!guestAddress && reservation.id) {
          try {
            const { data: webCheckin } = await supabase
              .from("web_checkin")
              .select("id")
              .eq("reservation_id", reservation.id)
              .maybeSingle();
            
            if (webCheckin?.id) {
              const { data: webCheckinData } = await supabase
                .from("web_checkin_guests")
                .select("street, number, complement, neighborhood, city, state, zip_code")
                .eq("web_checkin_id", webCheckin.id)
                .eq("is_main_guest", true)
                .maybeSingle();
              
              if (webCheckinData) {
                const addressParts = [];
                if (webCheckinData.street) {
                  let streetLine = webCheckinData.street;
                  if (webCheckinData.number) streetLine += `, ${webCheckinData.number}`;
                  if (webCheckinData.complement) streetLine += ` - ${webCheckinData.complement}`;
                  addressParts.push(streetLine);
                }
                if (webCheckinData.neighborhood) addressParts.push(webCheckinData.neighborhood);
                if (webCheckinData.city) {
                  let cityLine = webCheckinData.city;
                  if (webCheckinData.state) cityLine += ` - ${webCheckinData.state}`;
                  addressParts.push(cityLine);
                }
                if (webCheckinData.zip_code) addressParts.push(`CEP: ${webCheckinData.zip_code}`);
                guestAddress = addressParts.join(", ");
              }
            }
          } catch (error) {
            console.warn("Erro ao buscar endereço do web_checkin:", error);
          }
        }
        
        console.log("📧 Dados para e-mail (usando detecção automática):", {
          actualGuestName,
          roomNumber,
          guestAddress: guestAddress || "(não encontrado)",
          detectedGuestName,
          detectedRoomNumber,
          detectedGuestAddress,
          guestName,
        });

        // Enviar e-mail para o departamento fiscal usando template
        const checkinFormatted = format(new Date(checkinDate), "dd/MM/yyyy", { locale: ptBR });
        const checkoutFormatted = format(new Date(checkoutDate), "dd/MM/yyyy", { locale: ptBR });

        try {
          await sendFiscalDocumentRequestEmail({
            requestId: requestData.id,
            reservationCode: reservation.reservation_code || reservation.id,
            // IMPORTANTE: guestName sempre deve ser o nome real do hóspede (quem se hospedou)
            // Para pessoa jurídica, o nome da empresa vai em companyName separadamente
            guestName: actualGuestName || guestName, // Nome real de quem se hospedou
            actualGuestName: actualGuestName, // Nome real de quem se hospedou (garantir que está preenchido)
            guestAddress: guestAddress || undefined, // Endereço (do hóspede ou responsável financeiro para pessoa jurídica)
            roomNumber: roomNumber, // Número do quarto
            checkinDate: checkinFormatted,
            checkoutDate: checkoutFormatted,
            paidAmount,
            requestType,
            companyName: requestType === "company" ? companyName : undefined,
            cnpj: requestType === "company" ? formatCNPJ(cnpj) : undefined,
            financialEmail: financialEmail || undefined,
            reservationId: reservation.id,
            recipientEmail: invoiceEmail,
          });

          setIsSuccess(true);
          toast.success("Solicitação de Nota Fiscal enviada com sucesso!");
          if (onSuccess) onSuccess();
        } catch (emailError) {
          console.error("Erro ao enviar e-mail:", emailError);
          toast.warning("Solicitação criada, mas houve erro ao enviar e-mail. Entre em contato com o estabelecimento.");
          setIsSuccess(true);
          if (onSuccess) onSuccess();
        }
      }
    } catch (error: any) {
      console.error("Erro ao processar solicitação:", error);
      toast.error(error.message || "Erro ao processar solicitação");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <Card className="p-6">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900">
            {documentType === "receipt" ? "Recibo Gerado!" : "Solicitação Enviada!"}
          </h3>
          <p className="text-slate-600">
            {documentType === "receipt"
              ? "O recibo foi gerado e baixado automaticamente."
              : "Sua solicitação de Nota Fiscal foi enviada para o departamento fiscal. Você receberá a nota fiscal por e-mail em breve."}
          </p>
        </div>
      </Card>
    );
  }

  // Verificar se a reserva já teve check-out
  const isCheckedOut = () => {
    const status = reservation?.status?.toLowerCase();
    const checkoutDate = reservation?.checkout_date;
    
    // Verificar por status
    if (status === "checkedout" || status === "checked_out") {
      return true;
    }
    
    // Verificar se a data de check-out já passou
    if (checkoutDate) {
      const checkout = startOfDay(new Date(checkoutDate));
      const today = startOfDay(new Date());
      return isAfter(today, checkout) || checkout.getTime() === today.getTime();
    }
    
    return false;
  };

  const hasCheckedOut = isCheckedOut();

  // Usar hotelSettings com valores padrão
  const settings = hotelSettings || { fiscal_document_type: "both" } as any;

  // Verificar se já teve check-out
  if (!hasCheckedOut) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-amber-600">
            <AlertCircle className="h-5 w-5" />
            <h3 className="font-semibold">Aguarde o check-out</h3>
          </div>
          <p className="text-slate-600">
            A solicitação de documentos fiscais (Recibo ou Nota Fiscal) só pode ser feita após o check-out da reserva.
          </p>
          {reservation?.checkout_date && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">
                <strong>Data de check-out prevista:</strong>{" "}
                {format(new Date(reservation.checkout_date), "dd/MM/yyyy", { locale: ptBR })}
              </p>
              <p className="text-xs text-amber-700 mt-2">
                Após realizar o check-out, você poderá solicitar seus documentos fiscais aqui mesmo.
              </p>
            </div>
          )}
          {!reservation?.checkout_date && (
            <div className="mt-4 p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-600">
                Entre em contato com o estabelecimento para mais informações sobre o check-out.
              </p>
            </div>
          )}
        </div>
      </Card>
    );
  }

  const fiscalType = settings.fiscal_document_type || "both";
  const canRequestInvoice = fiscalType === "invoice" || fiscalType === "both";
  const canRequestReceipt = fiscalType === "receipt" || fiscalType === "both";

  if (!canRequestInvoice && !canRequestReceipt) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 text-amber-600">
          <AlertCircle className="h-5 w-5" />
          <p>Este estabelecimento não emite documentos fiscais.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-slate-700" />
          <h3 className="text-xl font-semibold text-slate-900">Solicitar Documento Fiscal</h3>
        </div>

        {/* Tipo de Documento */}
        <div>
          <Label className="mb-2 block">Tipo de Documento *</Label>
          <Select value={documentType} onValueChange={(value: any) => setDocumentType(value)}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o tipo de documento" />
            </SelectTrigger>
            <SelectContent>
              {canRequestReceipt && <SelectItem value="receipt">Recibo</SelectItem>}
              {canRequestInvoice && <SelectItem value="invoice">Nota Fiscal</SelectItem>}
            </SelectContent>
          </Select>
        </div>

        {/* Tipo de Solicitação */}
        <div>
          <Label className="mb-3 block">Tipo de Solicitação *</Label>
          <RadioGroup value={requestType} onValueChange={(value: any) => setRequestType(value)}>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="individual" id="individual" />
              <Label htmlFor="individual" className="font-normal cursor-pointer">
                Pessoa Física
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="company" id="company" />
              <Label htmlFor="company" className="font-normal cursor-pointer">
                Pessoa Jurídica
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Campos para Pessoa Jurídica */}
        {requestType === "company" && (
          <div className="space-y-4 border-t pt-4">
            <div>
              <Label htmlFor="companyName">Razão Social *</Label>
              <Input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Nome da empresa"
                required
              />
            </div>
            <div>
              <Label htmlFor="cnpj">CNPJ *</Label>
              <Input
                id="cnpj"
                value={cnpj}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "");
                  if (value.length <= 14) {
                    setCnpj(formatCNPJ(value));
                  }
                }}
                placeholder="00.000.000/0000-00"
                maxLength={18}
                required
              />
              {cnpj && !validateCNPJ(cnpj) && (
                <p className="text-xs text-red-500 mt-1">CNPJ inválido</p>
              )}
            </div>
          </div>
        )}

        {/* Informações da Reserva */}
        <div className="border-t pt-4 space-y-2">
          <h4 className="font-semibold text-slate-900">Informações da Reserva</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Hóspede:</span>
              <p className="font-medium">
                {reservation.guest_name || reservation.guest?.full_name || "N/A"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Check-in:</span>
              <p className="font-medium">
                {reservation.checkin_date
                  ? format(new Date(reservation.checkin_date), "dd/MM/yyyy", { locale: ptBR })
                  : "N/A"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Check-out:</span>
              <p className="font-medium">
                {reservation.checkout_date
                  ? format(new Date(reservation.checkout_date), "dd/MM/yyyy", { locale: ptBR })
                  : "N/A"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Valor Pago:</span>
              <p className="font-medium">
                {new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                }).format(reservation.paid_amount || 0)}
              </p>
            </div>
          </div>
        </div>

        {/* Botão de Enviar */}
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || !documentType}
          className="w-full"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processando...
            </>
          ) : documentType === "receipt" ? (
            <>
              <FileText className="h-4 w-4 mr-2" />
              Gerar Recibo
            </>
          ) : (
            <>
              <Mail className="h-4 w-4 mr-2" />
              Solicitar Nota Fiscal
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}

