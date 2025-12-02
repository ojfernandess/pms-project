import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Loader2, Upload, X, CheckCircle2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useWebCheckin } from "@/hooks/useWebCheckin";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useReservations } from "@/hooks/useReservations";
import { logActivity } from "@/lib/activityLogger";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { ReuseDataDialog } from "@/components/webcheckin/ReuseDataDialog";

// Componente auxiliar para exibir imagem de documento
function DocumentImage({ filePath, onRemove }: { filePath: string; onRemove: () => void }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadImage = async () => {
      if (filePath.startsWith('http')) {
        setImageUrl(filePath);
        setLoading(false);
      } else {
        try {
          const { data, error } = await supabase.storage
            .from("documents")
            .createSignedUrl(filePath, 3600);
          
          if (!error && data) {
            setImageUrl(data.signedUrl);
          }
        } catch (error) {
          console.error("Erro ao gerar signed URL:", error);
        } finally {
          setLoading(false);
        }
      }
    };
    loadImage();
  }, [filePath]);

  if (loading) {
    return (
      <div className="w-full h-32 flex items-center justify-center border rounded">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!imageUrl) {
    return (
      <div className="w-full h-32 flex items-center justify-center border rounded text-xs text-muted-foreground">
        Erro ao carregar imagem
      </div>
    );
  }

  return (
    <div className="relative">
      <img
        src={imageUrl}
        alt="Documento"
        className="w-full h-32 object-cover rounded border"
        onError={() => setImageUrl(null)}
      />
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="absolute top-1 right-1"
        onClick={onRemove}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface ManualCheckinDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: any;
}

export function ManualCheckinDialog({ open, onOpenChange, reservation }: ManualCheckinDialogProps) {
  const { saveGuests, saveDocuments, savePreferences, completeWebCheckin, createWebCheckin } = useWebCheckin();
  const { checkIn } = useReservations();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReuseDataDialog, setShowReuseDataDialog] = useState(false);
  const [hasCheckedPreviousData, setHasCheckedPreviousData] = useState(false);
  const [isCheckingPreviousData, setIsCheckingPreviousData] = useState(false);
  
  // Dados dos hóspedes
  const [guests, setGuests] = useState<any[]>([
    {
      name: "",
      email: "",
      phone: "",
      cpf: "",
      birth_date: "",
      document_type: "cpf",
      document_number: "",
      is_main_guest: true,
    },
  ]);
  
  // Documentos
  const [documents, setDocuments] = useState<any[]>([]);
  const [uploading, setUploading] = useState<{ [key: string]: boolean }>({});
  
  // Preferências
  const [preferences, setPreferences] = useState<any>({
    checkin_time: "",
    special_requests: "",
    accessibility_needs: false,
    smoking_preference: false,
  });
  
  // Web check-in ID e token
  const [webCheckinId, setWebCheckinId] = useState<string | null>(null);
  const [webCheckinToken, setWebCheckinToken] = useState<string | null>(null);

  // Estado para armazenar dados de check-ins anteriores encontrados
  const [previousCheckinData, setPreviousCheckinData] = useState<any>(null);
  
  // Função para buscar check-ins anteriores manualmente
  const checkForPreviousCheckin = async (email: string | null, cpf: string | null) => {
    if (!email && !cpf) return null;
    
    setIsCheckingPreviousData(true);
    try {
      // Buscar check-ins anteriores onde o hóspede principal tem mesmo email ou CPF
      const { data: previousGuests, error: guestsError } = await supabase
        .from("web_checkin_guests")
        .select("web_checkin_id, web_checkin:web_checkin(reservation_id, status, completed_at, reservation:reservations(reservation_code, checkin_date, checkout_date))")
        .or(
          email && cpf
            ? `email.eq.${email},cpf.eq.${cpf}`
            : email
            ? `email.eq.${email}`
            : `cpf.eq.${cpf}`
        )
        .eq("is_main_guest", true)
        .limit(10);

      if (guestsError) {
        console.error("Erro ao buscar hóspedes anteriores:", guestsError);
        return null;
      }

      if (!previousGuests || previousGuests.length === 0) {
        return null;
      }

      // Obter reservation_ids únicos (excluindo a atual)
      const reservationIds = previousGuests
        .map((g: any) => g.web_checkin?.reservation_id)
        .filter((id: string) => id && id !== reservation?.id);

      if (reservationIds.length === 0) {
        return null;
      }

      // Buscar web_checkins completados dessas reservas
      const { data: previousCheckins, error: checkinError } = await supabase
        .from("web_checkin")
        .select(`
          id,
          reservation_id,
          status,
          completed_at,
          guests:web_checkin_guests(*),
          documents:web_checkin_documents(*),
          preferences,
          reservation:reservations(
            reservation_code,
            checkin_date,
            checkout_date
          )
        `)
        .in("reservation_id", reservationIds)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (checkinError) {
        console.error("Erro ao buscar check-ins anteriores:", checkinError);
        return null;
      }

      if (!previousCheckins || !previousCheckins.guests || previousCheckins.guests.length === 0) {
        return null;
      }

      // Formatar dados para reutilização
      const previousGuestsFormatted = (previousCheckins.guests as any[]).map((g) => ({
        name: g.name || "",
        email: g.email || "",
        phone: g.phone || "",
        cpf: g.cpf || "",
        birth_date: g.birth_date || "",
        document_type: g.document_type || "cpf",
        document_number: g.document_number || "",
        is_main_guest: g.is_main_guest || false,
      }));

      const previousDocuments = (previousCheckins.documents as any[]) || [];
      const previousPreferences = previousCheckins.preferences || {};

      return {
        guests: previousGuestsFormatted,
        documents: previousDocuments,
        preferences: previousPreferences,
        reservationCode: (previousCheckins.reservation as any)?.reservation_code,
        checkinDate: (previousCheckins.reservation as any)?.checkin_date,
        completedAt: previousCheckins.completed_at,
      };
    } catch (error) {
      console.error("Erro ao buscar check-ins anteriores:", error);
      return null;
    } finally {
      setIsCheckingPreviousData(false);
    }
  };

  // Função auxiliar para obter signed URL
  const getSignedUrl = async (filePath: string): Promise<string> => {
    try {
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(filePath, 3600);
      
      if (error) throw error;
      return data.signedUrl;
    } catch (error) {
      console.error("Erro ao gerar signed URL:", error);
      return filePath; // Retornar o caminho original se falhar
    }
  };

  // Obter capacidade da categoria (seguindo mesma lógica do check-in web)
  const maxCapacity = reservation?.room_categories?.capacity_adults !== undefined && reservation?.room_categories?.capacity_adults !== null
    ? (reservation.room_categories.capacity_adults + (reservation.room_categories.capacity_children || 0))
    : null;
  const maxAdults = reservation?.room_categories?.capacity_adults !== undefined && reservation?.room_categories?.capacity_adults !== null 
    ? reservation.room_categories.capacity_adults 
    : null;
  const maxChildren = reservation?.room_categories?.capacity_children !== undefined && reservation?.room_categories?.capacity_children !== null
    ? reservation.room_categories.capacity_children 
    : null;

  const [adults, setAdults] = useState(reservation?.adults || 1);
  const [children, setChildren] = useState(reservation?.children || 0);

  // Inicializar dados quando o dialog abrir
  useEffect(() => {
    if (open && reservation) {
      // Preencher primeiro hóspede com dados da reserva
      const documentNumber = reservation?.guest?.document_number || reservation?.financial_responsible?.document_number || "";
      const documentType = reservation?.guest?.document_type?.toLowerCase() || reservation?.financial_responsible?.document_type?.toLowerCase() || "cpf";
      
      const initialGuest = {
        name: reservation?.guest?.full_name || reservation?.financial_responsible?.full_name || "",
        email: reservation?.guest?.email || reservation?.financial_responsible?.email || "",
        phone: reservation?.guest?.phone || reservation?.financial_responsible?.phone || "",
        cpf: documentType === "cpf" ? documentNumber : "",
        birth_date: reservation?.guest?.birth_date || "",
        document_type: documentType,
        document_number: documentNumber,
        is_main_guest: true,
      };

      // Ajustar número de hóspedes baseado na reserva, respeitando a capacidade máxima
      const totalGuests = (adults || 1) + (children || 0);
      const maxAllowed = maxCapacity !== null ? Math.min(totalGuests, maxCapacity) : totalGuests;
      
      const initialGuests = [initialGuest];
      if (maxAllowed > 1) {
        const additionalGuests = Array.from({ length: maxAllowed - 1 }, () => ({
          name: "",
          email: "",
          phone: "",
          cpf: "",
          birth_date: "",
          document_type: "cpf",
          document_number: "",
          is_main_guest: false,
        }));
        initialGuests.push(...additionalGuests);
      }
      
      setGuests(initialGuests);
      
      // Verificar se já existe web check-in
      checkExistingWebCheckin();
    } else {
      // Resetar quando fechar
      setCurrentStep(0);
      setAdults(reservation?.adults || 1);
      setChildren(reservation?.children || 0);
      setGuests([{
        name: "",
        email: "",
        phone: "",
        cpf: "",
        birth_date: "",
        document_type: "cpf",
        document_number: "",
        is_main_guest: true,
      }]);
      setDocuments([]);
      setPreferences({
        checkin_time: "",
        special_requests: "",
        accessibility_needs: false,
        smoking_preference: false,
      });
      setWebCheckinId(null);
      setWebCheckinToken(null);
      setShowReuseDataDialog(false);
      setHasCheckedPreviousData(false);
      setPreviousCheckinData(null);
      setIsCheckingPreviousData(false);
    }
  }, [open, reservation]);

  // Ajustar número de hóspedes quando adults/children mudarem, respeitando capacidade máxima
  useEffect(() => {
    if (!open || !reservation) return;
    
    const totalGuests = (adults || 1) + (children || 0);
    const maxAllowed = maxCapacity !== null ? Math.min(totalGuests, maxCapacity) : totalGuests;
    
    // Sempre garantir que não exceda a capacidade máxima
    if (maxCapacity !== null && guests.length > maxCapacity) {
      setGuests(prevGuests => prevGuests.slice(0, maxCapacity));
      return;
    }
    
    if (guests.length < maxAllowed) {
      const newGuests = Array.from({ length: maxAllowed - guests.length }, (_, i) => ({
        name: "",
        email: "",
        phone: "",
        cpf: "",
        birth_date: "",
        document_type: "cpf",
        document_number: "",
        is_main_guest: false,
      }));
      setGuests(prevGuests => [...prevGuests, ...newGuests]);
    } else if (guests.length > maxAllowed) {
      setGuests(prevGuests => prevGuests.slice(0, maxAllowed));
    }
  }, [adults, children, maxCapacity, open, reservation]);


  const checkExistingWebCheckin = async () => {
    if (!reservation?.id) return;
    
    const { data: existing } = await supabase
      .from("web_checkin")
      .select("id, token, status")
      .eq("reservation_id", reservation.id)
      .maybeSingle();
    
    if (existing) {
      setWebCheckinId(existing.id);
      setWebCheckinToken(existing.token);
    }
  };

  const handleGuestChange = (index: number, field: string, value: any) => {
    const updatedGuests = [...guests];
    updatedGuests[index] = { ...updatedGuests[index], [field]: value };
    setGuests(updatedGuests);
  };

  const handleAddGuest = () => {
    // Verificar capacidade máxima - validação rigorosa (mesma lógica do check-in web)
    if (maxCapacity !== null) {
      if (guests.length >= maxCapacity) {
        toast.error(`A capacidade máxima da categoria é de ${maxCapacity} hóspede(s). Não é possível adicionar mais hóspedes.`);
        return;
      }
      // Garantir que não exceda mesmo após adicionar
      if (guests.length + 1 > maxCapacity) {
        toast.error(`A capacidade máxima da categoria é de ${maxCapacity} hóspede(s). Você já tem ${guests.length} hóspede(s) cadastrado(s).`);
        return;
      }
    }
    
    setGuests([
      ...guests,
      {
        name: "",
        email: "",
        phone: "",
        cpf: "",
        birth_date: "",
        document_type: "cpf",
        document_number: "",
        is_main_guest: false,
      },
    ]);
  };

  const handleRemoveGuest = (index: number) => {
    if (guests.length > 1) {
      const updatedGuests = guests.filter((_, i) => i !== index);
      if (updatedGuests.length > 0 && !updatedGuests.some((g) => g.is_main_guest)) {
        updatedGuests[0].is_main_guest = true;
      }
      setGuests(updatedGuests);
    }
  };

  const handleFileUpload = async (
    guestIndex: number,
    documentType: "front" | "back" | "selfie",
    file: File
  ) => {
    const guest = guests[guestIndex];
    if (!guest) return;

    // Criar web check-in se não existir
    let checkinId = webCheckinId;
    if (!checkinId && reservation?.id) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const establishmentId = reservation.establishment_id || localStorage.getItem("selectedEstablishmentId");

        const result = await createWebCheckin.mutateAsync({
          reservationId: reservation.id,
          establishmentId: establishmentId || undefined,
        });

        checkinId = result.id;
        setWebCheckinId(checkinId);
        setWebCheckinToken(result.token);
      } catch (error: any) {
        toast.error("Erro ao criar check-in: " + (error.message || "Erro desconhecido"));
        return;
      }
    }

    if (!checkinId) {
      toast.error("Erro: Não foi possível criar o check-in");
      return;
    }

    const key = `${guestIndex}-${documentType}`;
    setUploading((prev) => ({ ...prev, [key]: true }));

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${checkinId}/${guestIndex}-${documentType}-${Date.now()}.${fileExt}`;
      const filePath = `web-checkin/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Usar caminho relativo para armazenar (será usado para gerar signed URL quando necessário)
      const fileUrl = filePath;

      // Atualizar documentos
      const docIndex = documents.findIndex(
        (d) => d.guest_name === guest.name && d.document_type === guest.document_type
      );

      const updatedDocuments = [...documents];
      if (docIndex >= 0) {
        updatedDocuments[docIndex] = {
          ...updatedDocuments[docIndex],
          [`document_${documentType}_url`]: fileUrl,
        };
      } else {
        updatedDocuments.push({
          guest_name: guest.name,
          document_type: guest.document_type,
          document_number: guest.document_number || guest.cpf,
          [`document_${documentType}_url`]: fileUrl,
        });
      }

      setDocuments(updatedDocuments);
      toast.success("Documento enviado com sucesso!");
    } catch (error: any) {
      console.error("Erro ao fazer upload:", error);
      toast.error(error.message || "Erro ao fazer upload do documento");
    } finally {
      setUploading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleRemoveDocument = (guestIndex: number, documentType: "front" | "back" | "selfie") => {
    const guest = guests[guestIndex];
    if (!guest) return;

    const docIndex = documents.findIndex(
      (d) => d.guest_name === guest.name && d.document_type === guest.document_type
    );

    if (docIndex >= 0) {
      const updatedDocuments = [...documents];
      delete updatedDocuments[docIndex][`document_${documentType}_url`];
      setDocuments(updatedDocuments.filter(d => 
        d.document_front_url || d.document_back_url || d.selfie_url
      ));
    }
  };

  const handleSubmit = async () => {
    if (!reservation?.id) return;

    setIsSubmitting(true);

    try {
      // 1. Criar ou obter web check-in
      let token = webCheckinToken;
      let checkinId = webCheckinId;

      if (!token || !checkinId) {
        const { data: { user } } = await supabase.auth.getUser();
        const establishmentId = reservation.establishment_id || localStorage.getItem("selectedEstablishmentId");

        // Criar web check-in
        const result = await createWebCheckin.mutateAsync({
          reservationId: reservation.id,
          establishmentId: establishmentId || undefined,
        });

        token = result.token;
        checkinId = result.id;
        setWebCheckinToken(token);
        setWebCheckinId(checkinId);
      }

      // 2. Salvar hóspedes
      const guestsToSave = guests.map((guest, index) => ({
        name: guest.name,
        cpf: guest.cpf,
        birth_date: guest.birth_date || null,
        email: guest.email || null,
        phone: guest.phone || null,
        is_main_guest: guest.is_main_guest || false,
        document_type: guest.document_type,
        document_number: guest.document_number || guest.cpf,
        order: index,
      }));

      await saveGuests.mutateAsync({
        token: token!,
        guests: guestsToSave,
      });

      // 3. Salvar documentos (se houver)
      const validDocuments = documents.filter(doc => 
        doc.document_front_url || doc.document_back_url || doc.selfie_url
      );
      
      if (validDocuments.length > 0) {
        // Gerar signed URLs para os documentos antes de salvar
        const documentsToSave = await Promise.all(
          validDocuments.map(async (doc) => {
            const frontUrl = doc.document_front_url 
              ? (doc.document_front_url.startsWith('http') ? doc.document_front_url : await getSignedUrl(doc.document_front_url))
              : null;
            const backUrl = doc.document_back_url 
              ? (doc.document_back_url.startsWith('http') ? doc.document_back_url : await getSignedUrl(doc.document_back_url))
              : null;
            const selfieUrl = doc.selfie_url 
              ? (doc.selfie_url.startsWith('http') ? doc.selfie_url : await getSignedUrl(doc.selfie_url))
              : null;

            return {
              guest_name: doc.guest_name,
              document_type: doc.document_type,
              document_number: doc.document_number,
              document_front_url: frontUrl,
              document_back_url: backUrl,
              selfie_url: selfieUrl,
            };
          })
        );

        await saveDocuments.mutateAsync({
          token: token!,
          documents: documentsToSave,
        });
      }

      // 4. Salvar preferências (se houver)
      if (preferences.checkin_time || preferences.special_requests) {
        await savePreferences.mutateAsync({
          token: token!,
          preferences,
        });
      }

      // 5. Completar web check-in
      await completeWebCheckin.mutateAsync(token!);

      // 6. Realizar check-in da reserva (atualizar status para checkedin)
      if (reservation.status !== "checkedin") {
        await checkIn({
          id: reservation.id,
          roomId: reservation.room_id || undefined,
        });
      }

      // 7. Registrar log
      try {
        await logActivity({
          actionType: "checked_in",
          entityType: "reservation",
          entityId: reservation.id,
          entityCode: reservation.reservation_code,
          description: `Check-in manual realizado para reserva ${reservation.reservation_code}`,
          oldValues: { status: reservation.status },
          newValues: { status: "checkedin" },
          metadata: {
            checkin_type: "manual",
            guests_count: guests.length,
            has_documents: documents.length > 0,
          },
        });
      } catch (logError) {
        console.error("Erro ao registrar log:", logError);
      }

      // Invalidar queries para atualizar a UI
      queryClient.invalidateQueries({ queryKey: ["reservation", reservation.reservation_code] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["web_checkin"] });
      queryClient.invalidateQueries({ queryKey: ["activity_logs"] });

      toast.success("Check-in realizado com sucesso!");
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao realizar check-in:", error);
      toast.error(error.message || "Erro ao realizar check-in");
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps = [
    { id: "guests", title: "Dados dos Hóspedes" },
    { id: "documents", title: "Documentos (Opcional)" },
    { id: "preferences", title: "Preferências (Opcional)" },
    { id: "review", title: "Revisar" },
  ];

  // Handler para reutilizar dados anteriores
  const handleReuseData = (reusedData: any) => {
    if (reusedData.guests && Array.isArray(reusedData.guests)) {
      setGuests(reusedData.guests);
    }
    if (reusedData.documents && Array.isArray(reusedData.documents)) {
      setDocuments(reusedData.documents);
    }
    if (reusedData.preferences) {
      setPreferences((prev: any) => ({ ...prev, ...reusedData.preferences }));
    }
    toast.success("Dados reutilizados com sucesso! Você pode editar antes de confirmar.");
  };

  // Handler para pular reutilização
  const handleSkipReuse = () => {
    // Continuar com os dados já preenchidos da reserva
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Check-in Manual</DialogTitle>
          <DialogDescription>
            Preencha os dados dos hóspedes para realizar o check-in manual
          </DialogDescription>
        </DialogHeader>

        {/* Indicador de etapas */}
        <div className="flex items-center justify-between mb-6">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    index === currentStep
                      ? "bg-primary text-primary-foreground"
                      : index < currentStep
                      ? "bg-green-500 text-white"
                      : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {index < currentStep ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                <span className="text-xs mt-1 text-center">{step.title}</span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`h-1 flex-1 mx-2 ${
                    index < currentStep ? "bg-green-500" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Conteúdo das etapas */}
        <div className="space-y-4">
          {/* Etapa 1: Dados dos Hóspedes */}
          {currentStep === 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Dados dos Hóspedes</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddGuest}
                  className="gap-2"
                  disabled={maxCapacity !== null && guests.length >= maxCapacity}
                >
                  <Plus className="h-4 w-4" />
                  Adicionar Hóspede
                  {maxCapacity !== null && guests.length >= maxCapacity && " (Limite atingido)"}
                </Button>
              </div>

              {/* Indicador de capacidade (mesma lógica do check-in web) */}
              {maxCapacity !== null && (
                <div className={`text-sm text-center p-3 rounded-lg ${
                  guests.length >= maxCapacity 
                    ? "bg-red-50 text-red-700 border border-red-200" 
                    : "bg-slate-50 text-slate-600 border border-slate-200"
                }`}>
                  <div className="font-semibold mb-1">
                    Capacidade da categoria: {maxCapacity} hóspede(s)
                  </div>
                  {maxAdults !== null && maxChildren !== null && (
                    <div className="text-xs text-slate-500 mb-1">
                      ({maxAdults} adulto(s) + {maxChildren} criança(s))
                    </div>
                  )}
                  <div className={`text-sm font-medium ${
                    guests.length >= maxCapacity ? "text-red-700" : "text-slate-700"
                  }`}>
                    {guests.length} de {maxCapacity} cadastrado(s)
                    {guests.length >= maxCapacity && " - Limite atingido!"}
                  </div>
                </div>
              )}
              {maxCapacity === null && (
                <div className="text-xs text-slate-500 text-center p-2 bg-yellow-50 border border-yellow-200 rounded">
                  ⚠️ Capacidade da categoria não disponível
                </div>
              )}

              {guests.map((guest, index) => (
                <Card key={index} className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-medium">
                      Hóspede {index + 1} {guest.is_main_guest && "(Principal)"}
                    </h4>
                    {guests.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveGuest(index)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor={`name-${index}`}>Nome Completo *</Label>
                      <Input
                        id={`name-${index}`}
                        value={guest.name}
                        onChange={(e) => handleGuestChange(index, "name", e.target.value)}
                        placeholder="Nome completo"
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor={`cpf-${index}`}>CPF</Label>
                      <Input
                        id={`cpf-${index}`}
                        value={guest.cpf}
                        onChange={(e) => handleGuestChange(index, "cpf", e.target.value)}
                        placeholder="000.000.000-00"
                      />
                    </div>

                    <div>
                      <Label htmlFor={`birth_date-${index}`}>Data de Nascimento</Label>
                      <Input
                        id={`birth_date-${index}`}
                        type="date"
                        value={guest.birth_date}
                        onChange={(e) => handleGuestChange(index, "birth_date", e.target.value)}
                      />
                    </div>

                    <div>
                      <Label htmlFor={`email-${index}`}>E-mail</Label>
                      <Input
                        id={`email-${index}`}
                        type="email"
                        value={guest.email}
                        onChange={(e) => handleGuestChange(index, "email", e.target.value)}
                        placeholder="email@exemplo.com"
                      />
                    </div>

                    <div>
                      <Label htmlFor={`phone-${index}`}>Telefone</Label>
                      <Input
                        id={`phone-${index}`}
                        value={guest.phone}
                        onChange={(e) => handleGuestChange(index, "phone", e.target.value)}
                        placeholder="(00) 00000-0000"
                      />
                    </div>

                    <div>
                      <Label htmlFor={`document_type-${index}`}>Tipo de Documento</Label>
                      <Select
                        value={guest.document_type}
                        onValueChange={(value) => handleGuestChange(index, "document_type", value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cpf">CPF</SelectItem>
                          <SelectItem value="rg">RG</SelectItem>
                          <SelectItem value="cnh">CNH</SelectItem>
                          <SelectItem value="passport">Passaporte</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Etapa 2: Documentos */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Documentos (Opcional)</h3>
              <p className="text-sm text-muted-foreground">
                Você pode fazer upload de documentos dos hóspedes. Este passo é opcional.
              </p>

              {guests.map((guest, guestIndex) => {
                return (
                  <Card key={guestIndex} className="p-4">
                    <h4 className="font-medium mb-4">{guest.name || `Hóspede ${guestIndex + 1}`}</h4>
                    
                    <div className="grid grid-cols-3 gap-4">
                      {(["front", "back", "selfie"] as const).map((docType) => {
                        const doc = documents.find(
                          (d) => d.guest_name === guest.name && d.document_type === guest.document_type
                        );
                        const url = doc?.[`document_${docType}_url`];
                        const key = `${guestIndex}-${docType}`;
                        const isUploading = uploading[key];

                        return (
                          <div key={docType} className="space-y-2">
                            <Label>
                              {docType === "front" ? "Frente" : docType === "back" ? "Verso" : "Selfie"}
                            </Label>
                            {url ? (
                              <DocumentImage
                                filePath={url}
                                onRemove={() => handleRemoveDocument(guestIndex, docType)}
                              />
                            ) : (
                              <div className="border-2 border-dashed rounded p-4 text-center">
                                <input
                                  type="file"
                                  id={`file-${key}`}
                                  className="hidden"
                                  accept="image/*"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFileUpload(guestIndex, docType, file);
                                  }}
                                  disabled={isUploading}
                                />
                                <label
                                  htmlFor={`file-${key}`}
                                  className="cursor-pointer flex flex-col items-center gap-2"
                                >
                                  {isUploading ? (
                                    <Loader2 className="h-6 w-6 animate-spin" />
                                  ) : (
                                    <Upload className="h-6 w-6" />
                                  )}
                                  <span className="text-xs">Clique para enviar</span>
                                </label>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Etapa 3: Preferências */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Preferências (Opcional)</h3>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="checkin_time">Horário de Check-in Preferido</Label>
                  <Input
                    id="checkin_time"
                    type="time"
                    value={preferences.checkin_time}
                    onChange={(e) =>
                      setPreferences({ ...preferences, checkin_time: e.target.value })
                    }
                  />
                </div>

                <div>
                  <Label htmlFor="special_requests">Solicitações Especiais</Label>
                  <Textarea
                    id="special_requests"
                    value={preferences.special_requests}
                    onChange={(e) =>
                      setPreferences({ ...preferences, special_requests: e.target.value })
                    }
                    placeholder="Ex: Cama extra, quarto no térreo..."
                    rows={4}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Etapa 4: Revisar */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Revisar Informações</h3>

              <Card className="p-4">
                <h4 className="font-medium mb-4">Hóspedes</h4>
                <div className="space-y-2">
                  {guests.map((guest, index) => (
                    <div key={index} className="text-sm">
                      <strong>{guest.name || `Hóspede ${index + 1}`}</strong>
                      {guest.cpf && <span className="ml-2">CPF: {guest.cpf}</span>}
                      {guest.email && <span className="ml-2">Email: {guest.email}</span>}
                      {guest.is_main_guest && (
                        <span className="ml-2 text-primary">(Principal)</span>
                      )}
                    </div>
                  ))}
                </div>
              </Card>

              {documents.length > 0 && (
                <Card className="p-4">
                  <h4 className="font-medium mb-2">Documentos</h4>
                  <p className="text-sm text-muted-foreground">
                    {documents.length} documento(s) anexado(s)
                  </p>
                </Card>
              )}

              {preferences.checkin_time || preferences.special_requests ? (
                <Card className="p-4">
                  <h4 className="font-medium mb-2">Preferências</h4>
                  {preferences.checkin_time && (
                    <p className="text-sm">Horário preferido: {preferences.checkin_time}</p>
                  )}
                  {preferences.special_requests && (
                    <p className="text-sm">Solicitações: {preferences.special_requests}</p>
                  )}
                </Card>
              ) : null}
            </div>
          )}
        </div>

        {/* Botões de navegação */}
        <div className="flex justify-between pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0 || isSubmitting}
          >
            Voltar
          </Button>

          {currentStep < steps.length - 1 ? (
            <Button
              type="button"
              onClick={async () => {
                // Validar etapa atual antes de avançar
                if (currentStep === 0) {
                  // Validar que pelo menos o hóspede principal tem nome
                  const mainGuest = guests.find((g) => g.is_main_guest);
                  if (!mainGuest?.name) {
                    toast.error("O hóspede principal deve ter um nome");
                    return;
                  }
                  
                  // Buscar check-ins anteriores quando clicar em Próximo na primeira etapa
                  const emailToCheck = mainGuest.email || reservation?.guest?.email || reservation?.financial_responsible?.email;
                  const cpfToCheck = mainGuest.cpf || reservation?.guest?.document_number || reservation?.financial_responsible?.document_number;
                  
                  if (emailToCheck || cpfToCheck) {
                    // Buscar check-ins anteriores
                    const foundData = await checkForPreviousCheckin(emailToCheck, cpfToCheck);
                    
                    if (foundData && !hasCheckedPreviousData) {
                      // Encontrou dados anteriores - mostrar diálogo
                      setPreviousCheckinData(foundData);
                      setShowReuseDataDialog(true);
                      setHasCheckedPreviousData(true);
                      // Não avançar ainda - aguardar escolha do usuário
                      return;
                    }
                  }
                  
                  // Se não encontrou dados anteriores ou já verificou antes, avançar normalmente
                  setCurrentStep(currentStep + 1);
                } else {
                  // Para outras etapas, avançar normalmente
                  setCurrentStep(currentStep + 1);
                }
              }}
              disabled={isCheckingPreviousData}
            >
              {isCheckingPreviousData ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verificando...
                </>
              ) : (
                "Próximo"
              )}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                "Finalizar Check-in"
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* Dialog para reutilizar dados anteriores */}
    <ReuseDataDialog
      open={showReuseDataDialog}
      onOpenChange={setShowReuseDataDialog}
      previousData={previousCheckinData || null}
      onReuse={handleReuseData}
      onSkip={handleSkipReuse}
    />
    </>
  );
}

