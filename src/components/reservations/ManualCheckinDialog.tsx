import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Loader2, Upload, X, CheckCircle2, Search } from "lucide-react";
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
  const { saveGuests, saveDocuments, savePreferences, completeWebCheckin, createWebCheckin, getPreviousCheckinData } = useWebCheckin();
  const { checkIn } = useReservations();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showReuseDataDialog, setShowReuseDataDialog] = useState(false);
  const [hasCheckedPreviousData, setHasCheckedPreviousData] = useState(false);
  
  // Estados para busca inicial de hóspede
  const [searchType, setSearchType] = useState<"cpf" | "email" | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [isSearchingGuest, setIsSearchingGuest] = useState(false);
  const [hasSearchedGuest, setHasSearchedGuest] = useState(false);
  const [skipSearch, setSkipSearch] = useState(false);
  const [loadingCep, setLoadingCep] = useState<{ [key: number]: boolean }>({});
  const [shouldFillReservationData, setShouldFillReservationData] = useState(true);
  const [hasReusedData, setHasReusedData] = useState(false);
  
  // Dados dos hóspedes (incluindo endereço)
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
      // Campos de endereço
      zip_code: "",
      postal_code: "",
      street: "",
      number: "",
      complement: "",
      neighborhood: "",
      city: "",
      state: "",
      country: "BR",
      nationality: "BR",
      use_main_guest_address: false,
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

  // Obter email/CPF/document_number do hóspede principal para buscar dados anteriores
  // IMPORTANTE: Quando há busca inicial, usar APENAS o campo específico da busca
  // Isso garante que a busca seja feita apenas pelo documento informado
  const mainGuestEmail = searchType === "email" && searchValue && hasSearchedGuest ? searchValue.trim() : null;
  const mainGuestCpf = searchType === "cpf" && searchValue && hasSearchedGuest ? searchValue.trim() : null;
  const mainGuestDocumentNumber = null; // Não usar document_number na busca inicial, apenas CPF ou email
  
  // Usar o hook getPreviousCheckinData apenas quando houver busca inicial com valor válido
  const shouldSearchPreviousData = !!(mainGuestEmail || mainGuestCpf) && !skipSearch && hasSearchedGuest;
  
  const { data: previousCheckinData, refetch: refetchPreviousCheckinData } = getPreviousCheckinData(
    null, // guestAccountId (não disponível no check-in manual)
    reservation?.id,
    shouldSearchPreviousData ? mainGuestEmail : null,
    shouldSearchPreviousData ? mainGuestCpf : null,
    shouldSearchPreviousData ? mainGuestDocumentNumber : null
  );

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
      // Só preencher dados da reserva se shouldFillReservationData for true
      if (shouldFillReservationData) {
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
          // Campos de endereço
          zip_code: "",
          postal_code: "",
          street: "",
          number: "",
          complement: "",
          neighborhood: "",
          city: "",
          state: "",
          country: "BR",
          nationality: "BR",
          use_main_guest_address: false,
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
            // Campos de endereço
            zip_code: "",
            postal_code: "",
            street: "",
            number: "",
            complement: "",
            neighborhood: "",
            city: "",
            state: "",
            country: "BR",
            nationality: "BR",
            use_main_guest_address: false,
          }));
          initialGuests.push(...additionalGuests);
        }
        
        setGuests(initialGuests);
      } else {
        // Se não deve preencher, criar hóspedes vazios
        const totalGuests = (adults || 1) + (children || 0);
        const maxAllowed = maxCapacity !== null ? Math.min(totalGuests, maxCapacity) : totalGuests;
        
        const emptyGuests = Array.from({ length: maxAllowed }, (_, index) => ({
          name: "",
          email: "",
          phone: "",
          cpf: "",
          birth_date: "",
          document_type: "cpf",
          document_number: "",
          is_main_guest: index === 0,
          // Campos de endereço
          zip_code: "",
          postal_code: "",
          street: "",
          number: "",
          complement: "",
          neighborhood: "",
          city: "",
          state: "",
          country: "BR",
          nationality: "BR",
          use_main_guest_address: false,
        }));
        
        setGuests(emptyGuests);
      }
      
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
        // Campos de endereço
        zip_code: "",
        postal_code: "",
        street: "",
        number: "",
        complement: "",
        neighborhood: "",
        city: "",
        state: "",
        country: "BR",
        nationality: "BR",
        use_main_guest_address: false,
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
      // Resetar busca inicial
      setSearchType(null);
      setSearchValue("");
      setIsSearchingGuest(false);
      setHasSearchedGuest(false);
      setSkipSearch(false);
      setShouldFillReservationData(true);
      setHasReusedData(false);
    }
  }, [open, reservation]);

  // Buscar dados anteriores quando o usuário clicar no botão de busca
  // A busca não é automática, apenas quando o usuário clicar no botão

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
        // Campos de endereço
        zip_code: "",
        postal_code: "",
        street: "",
        number: "",
        complement: "",
        neighborhood: "",
        city: "",
        state: "",
        country: "BR",
        nationality: "BR",
        use_main_guest_address: false,
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

  // Função para formatar CEP
  const formatCEP = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    if (numbers.length <= 5) return numbers;
    return `${numbers.slice(0, 5)}-${numbers.slice(5, 8)}`;
  };

  // Função para buscar endereço por CEP usando ViaCEP (apenas para Brasil)
  const fetchAddressByCEP = async (cep: string, index: number) => {
    const guest = guests[index];
    // Só buscar CEP se o país for Brasil
    if ((guest?.country || "BR") !== "BR") {
      return;
    }
    
    const cleanCep = cep.replace(/\D/g, "");
    
    if (cleanCep.length !== 8) {
      return;
    }

    setLoadingCep({ ...loadingCep, [index]: true });

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();

      if (data.erro) {
        toast.error("CEP não encontrado");
        setLoadingCep({ ...loadingCep, [index]: false });
        return;
      }

      const updatedGuests = [...guests];
      const currentGuest = updatedGuests[index];
      
      updatedGuests[index] = {
        ...updatedGuests[index],
        zip_code: formatCEP(cleanCep),
        street: data.logradouro || "",
        neighborhood: data.bairro || "",
        city: data.localidade || "",
        state: data.uf || "",
      };
      
      // Se for hóspede principal e houver acompanhantes usando seu endereço, sincronizar
      if (currentGuest.is_main_guest) {
        updatedGuests.forEach((g, idx) => {
          if (!g.is_main_guest && g.use_main_guest_address) {
            updatedGuests[idx] = {
              ...g,
              zip_code: formatCEP(cleanCep),
              street: data.logradouro || "",
              neighborhood: data.bairro || "",
              city: data.localidade || "",
              state: data.uf || "",
            };
          }
        });
      }
      
      setGuests(updatedGuests);
      toast.success("Endereço preenchido automaticamente");
    } catch (error) {
      console.error("Erro ao buscar CEP:", error);
      toast.error("Erro ao buscar CEP");
    } finally {
      setLoadingCep({ ...loadingCep, [index]: false });
    }
  };

  const handleGuestChange = (index: number, field: string, value: any) => {
    const updatedGuests = [...guests];
    const currentGuest = updatedGuests[index];
    
    // Se for país, limpar campos específicos do Brasil (sem sincronizar com nacionalidade)
    if (field === "country") {
      const isBrazil = value === "BR";
      updatedGuests[index] = {
        ...updatedGuests[index],
        country: value,
        // Limpar CEP se mudar para país estrangeiro, ou limpar código postal se mudar para Brasil
        zip_code: isBrazil ? updatedGuests[index].zip_code : "",
        postal_code: !isBrazil ? updatedGuests[index].postal_code : "",
        // Limpar estado se não for Brasil
        state: isBrazil ? updatedGuests[index].state : "",
      };
      
      // Sincronizar com outros hóspedes que usam o endereço do principal (apenas país e campos de endereço)
      if (currentGuest.is_main_guest) {
        updatedGuests.forEach((g, idx) => {
          if (!g.is_main_guest && g.use_main_guest_address) {
            updatedGuests[idx] = {
              ...g,
              country: value,
              zip_code: value === "BR" ? g.zip_code : "",
              postal_code: value !== "BR" ? g.postal_code : "",
              state: value === "BR" ? g.state : "",
            };
          }
        });
      }
    } else if (field === "nationality") {
      // Apenas atualizar nacionalidade, sem sincronizar com país
      updatedGuests[index] = {
        ...updatedGuests[index],
        nationality: value,
      };
    } else if (field === "zip_code") {
      // Se for CEP, formatar e buscar endereço quando completo (apenas para Brasil)
      const formattedCep = formatCEP(value);
      updatedGuests[index] = { ...updatedGuests[index], [field]: formattedCep };
      
      // Se for hóspede principal e houver acompanhantes usando seu endereço, sincronizar CEP
      if (currentGuest.is_main_guest) {
        updatedGuests.forEach((g, idx) => {
          if (!g.is_main_guest && g.use_main_guest_address) {
            updatedGuests[idx] = { ...g, zip_code: formattedCep };
          }
        });
      }
      
      setGuests(updatedGuests);
      
      // Buscar endereço quando CEP estiver completo (8 dígitos) e país for Brasil
      const cleanCep = value.replace(/\D/g, "");
      if (cleanCep.length === 8 && (currentGuest.country || currentGuest.nationality || "BR") === "BR") {
        fetchAddressByCEP(formattedCep, index);
      }
    } else {
      // Para outros campos, atualizar normalmente
      updatedGuests[index] = { ...updatedGuests[index], [field]: value };
      
      // Se for hóspede principal e houver acompanhantes usando seu endereço, sincronizar campos de endereço
      if (currentGuest.is_main_guest && ["street", "number", "complement", "neighborhood", "city", "state", "postal_code"].includes(field)) {
        updatedGuests.forEach((g, idx) => {
          if (!g.is_main_guest && g.use_main_guest_address) {
            updatedGuests[idx] = { ...g, [field]: value };
          }
        });
      }
    }
    
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
        // Campos de endereço
        zip_code: "",
        postal_code: "",
        street: "",
        number: "",
        complement: "",
        neighborhood: "",
        city: "",
        state: "",
        country: "BR",
        nationality: "BR",
        use_main_guest_address: false,
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

    // Validar campos obrigatórios antes de submeter
    const guestsWithNames = guests.filter((g) => g.name && g.name.trim() !== "");
    if (guestsWithNames.length === 0) {
      toast.error("É necessário cadastrar pelo menos um hóspede com nome preenchido.");
      return;
    }

    // Validar campos obrigatórios para todos os hóspedes com nome
    for (let i = 0; i < guestsWithNames.length; i++) {
      const guest = guestsWithNames[i];
      const guestLabel = guest.name && guest.name.trim() 
        ? guest.name.trim() 
        : (guest.is_main_guest ? "hóspede principal" : `hóspede ${i + 1}`);
      
      // Validar CPF
      const cpfValue = guest.document_type === "cpf" 
        ? (guest.document_number || guest.cpf || "")
        : (guest.cpf || "");
      
      if (!cpfValue || cpfValue.trim() === "") {
        toast.error(`O CPF do ${guestLabel} é obrigatório.`);
        return;
      }

      // Validar Data de Nascimento
      if (!guest.birth_date || guest.birth_date.trim() === "") {
        toast.error(`A Data de Nascimento do ${guestLabel} é obrigatória.`);
        return;
      }

      // Validar Email
      if (!guest.email || guest.email.trim() === "") {
        toast.error(`O E-mail do ${guestLabel} é obrigatório.`);
        return;
      }

      // Validar Telefone
      if (!guest.phone || guest.phone.trim() === "") {
        toast.error(`O Telefone do ${guestLabel} é obrigatório.`);
        return;
      }

      // Validar Endereço
      const isBrazil = (guest.country || "BR") === "BR";
      if (isBrazil) {
        const zipCode = guest.zip_code || "";
        if (!zipCode || zipCode.trim() === "") {
          toast.error(`O CEP do ${guestLabel} é obrigatório.`);
          return;
        }
      } else {
        const postalCode = guest.postal_code || "";
        if (!postalCode || postalCode.trim() === "") {
          toast.error(`O Código Postal do ${guestLabel} é obrigatório.`);
          return;
        }
      }

      if (!guest.street || guest.street.trim() === "") {
        toast.error(`A Rua/Logradouro do ${guestLabel} é obrigatória.`);
        return;
      }

      if (!guest.number || guest.number.trim() === "") {
        toast.error(`O Número do endereço do ${guestLabel} é obrigatório.`);
        return;
      }

      if (!guest.neighborhood || guest.neighborhood.trim() === "") {
        toast.error(`O Bairro do ${guestLabel} é obrigatório.`);
        return;
      }

      if (!guest.city || guest.city.trim() === "") {
        toast.error(`A Cidade do ${guestLabel} é obrigatória.`);
        return;
      }

      // Validar Estado apenas se for Brasil (reutilizar isBrazil já declarado acima)
      if (isBrazil && (!guest.state || guest.state.trim() === "")) {
        toast.error(`O Estado do ${guestLabel} é obrigatório.`);
        return;
      }
    }

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

      // 2. Salvar hóspedes (incluindo endereço)
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
        // Campos de endereço
        zip_code: guest.zip_code || guest.postal_code || null,
        postal_code: guest.postal_code || guest.zip_code || null,
        street: guest.street || null,
        number: guest.number || null,
        complement: guest.complement || null,
        neighborhood: guest.neighborhood || null,
        city: guest.city || null,
        state: guest.state || null,
        country: guest.country || "BR",
        nationality: guest.nationality || "BR",
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
      // skipEmail: true porque o email já foi enviado pelo completeWebCheckin
      if (reservation.status !== "checkedin") {
        await checkIn({
          id: reservation.id,
          roomId: reservation.room_id || undefined,
          skipEmail: true, // Email já foi enviado pelo completeWebCheckin
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

  // Handler para reutilizar dados anteriores (mesma lógica do web check-in)
  const handleReuseData = (reusedData: any) => {
    // Aplicar dados reutilizados (incluindo endereço) - mesma lógica do web check-in
    if (reusedData.guests && Array.isArray(reusedData.guests)) {
      // Garantir que todos os campos de endereço estejam presentes
      const guestsWithAddress = reusedData.guests.map((g: any) => ({
        ...g,
        zip_code: g.zip_code || "",
        postal_code: g.postal_code || "",
        street: g.street || "",
        number: g.number || "",
        complement: g.complement || "",
        neighborhood: g.neighborhood || "",
        city: g.city || "",
        state: g.state || "",
        country: g.country || g.nationality || "BR",
        nationality: g.nationality || g.country || "BR",
        use_main_guest_address: g.use_main_guest_address || false,
      }));
      setGuests(guestsWithAddress);
    }
    if (reusedData.documents && Array.isArray(reusedData.documents)) {
      setDocuments(reusedData.documents);
    }
    if (reusedData.preferences) {
      setPreferences((prev: any) => ({ ...prev, ...reusedData.preferences }));
    }
    
    setShowReuseDataDialog(false);
    setSkipSearch(true);
    setHasSearchedGuest(true);
    setHasReusedData(true); // Marcar que os dados foram reutilizados
    toast.success("Dados reutilizados com sucesso! Você pode editar antes de confirmar.");
  };

  // Handler para pular reutilização (mesma lógica do web check-in)
  const handleSkipReuse = () => {
    // Continuar com os dados já preenchidos da reserva
    setShowReuseDataDialog(false);
    setSkipSearch(true);
    setHasSearchedGuest(true);
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
              {/* Busca inicial de hóspede - só mostra se ainda não buscou ou não pulou */}
              {!skipSearch && (
                <Card className="p-6 bg-blue-50/50 border-blue-200">
                  <div className="space-y-4">
                    <div>
                      <h4 className="text-lg font-semibold mb-2">Buscar Hóspede</h4>
                      <p className="text-sm text-muted-foreground">
                        Digite o CPF ou e-mail do hóspede para verificar se já realizou check-in anteriormente
                      </p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="search-type">Tipo de Busca *</Label>
                        <Select
                          value={searchType || ""}
                          onValueChange={(value) => {
                            setSearchType(value as "cpf" | "email");
                            setSearchValue("");
                            setHasSearchedGuest(false);
                          }}
                        >
                          <SelectTrigger id="search-type">
                            <SelectValue placeholder="Selecione o tipo" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cpf">CPF</SelectItem>
                            <SelectItem value="email">E-mail</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label htmlFor="search-value">
                          {searchType === "cpf" ? "CPF *" : searchType === "email" ? "E-mail *" : "Valor *"}
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            id="search-value"
                            value={searchValue}
                            onChange={(e) => {
                              setSearchValue(e.target.value);
                              setHasSearchedGuest(false);
                            }}
                            placeholder={searchType === "cpf" ? "000.000.000-00" : "email@exemplo.com"}
                            disabled={!searchType || isSearchingGuest}
                          />
                          <Button
                            type="button"
                            onClick={async () => {
                              if (!searchType || !searchValue.trim()) {
                                toast.error("Selecione o tipo e digite o valor para buscar");
                                return;
                              }
                              setIsSearchingGuest(true);
                              queryClient.invalidateQueries({ queryKey: ["previous_checkin_data"] });
                              try {
                                await refetchPreviousCheckinData();
                                setHasSearchedGuest(true);
                              } catch (error) {
                                console.error("Erro ao buscar:", error);
                              } finally {
                                setIsSearchingGuest(false);
                              }
                            }}
                            disabled={!searchType || !searchValue.trim() || isSearchingGuest}
                          >
                            {isSearchingGuest ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Search className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                    
                    {previousCheckinData && hasSearchedGuest && (
                      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-sm text-green-800 font-medium mb-2">
                          ✓ Hóspede encontrado! Clique em "Reutilizar Dados" para preencher automaticamente.
                        </p>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              setShowReuseDataDialog(true);
                            }}
                          >
                            Reutilizar Dados
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSkipSearch(true);
                              setHasSearchedGuest(true);
                              // Preencher o campo correspondente no primeiro hóspede
                              if (searchType === "cpf") {
                                handleGuestChange(0, "cpf", searchValue);
                              } else if (searchType === "email") {
                                handleGuestChange(0, "email", searchValue);
                              }
                            }}
                          >
                            Continuar sem Reutilizar
                          </Button>
                        </div>
                      </div>
                    )}
                    
                    {!previousCheckinData && hasSearchedGuest && !isSearchingGuest && (
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-sm text-amber-800">
                          ℹ️ Nenhum check-in anterior encontrado. Você pode continuar com o cadastro manual.
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={() => {
                            setSkipSearch(true);
                            setHasSearchedGuest(true);
                            // Preencher o campo correspondente no primeiro hóspede
                            if (searchType === "cpf") {
                              handleGuestChange(0, "cpf", searchValue);
                            } else if (searchType === "email") {
                              handleGuestChange(0, "email", searchValue);
                            }
                          }}
                        >
                          Continuar com Cadastro
                        </Button>
                      </div>
                    )}
                    
                    <div className="pt-2 border-t">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShouldFillReservationData(false);
                          setSkipSearch(true);
                          setHasSearchedGuest(true);
                          // Limpar dados dos hóspedes
                          const totalGuests = (adults || 1) + (children || 0);
                          const maxAllowed = maxCapacity !== null ? Math.min(totalGuests, maxCapacity) : totalGuests;
                          
                          const emptyGuests = Array.from({ length: maxAllowed }, (_, index) => ({
                            name: "",
                            email: "",
                            phone: "",
                            cpf: "",
                            birth_date: "",
                            document_type: "cpf",
                            document_number: "",
                            is_main_guest: index === 0,
                            // Campos de endereço
                            zip_code: "",
                            postal_code: "",
                            street: "",
                            number: "",
                            complement: "",
                            neighborhood: "",
                            city: "",
                            state: "",
                            country: "BR",
                            nationality: "BR",
                            use_main_guest_address: false,
                          }));
                          
                          setGuests(emptyGuests);
                        }}
                      >
                        Pular busca e cadastrar manualmente
                      </Button>
                    </div>
                  </div>
                </Card>
              )}
              
              {/* Formulário de Dados dos Hóspedes - só mostra quando skipSearch for true */}
              {skipSearch && (
                <>
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
                      <Label htmlFor={`cpf-${index}`}>CPF *</Label>
                      <Input
                        id={`cpf-${index}`}
                        value={guest.cpf}
                        onChange={(e) => handleGuestChange(index, "cpf", e.target.value)}
                        placeholder="000.000.000-00"
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor={`birth_date-${index}`}>Data de Nascimento *</Label>
                      <Input
                        id={`birth_date-${index}`}
                        type="date"
                        value={guest.birth_date}
                        onChange={(e) => handleGuestChange(index, "birth_date", e.target.value)}
                        max={new Date().toISOString().split('T')[0]}
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor={`email-${index}`}>E-mail *</Label>
                      <Input
                        id={`email-${index}`}
                        type="email"
                        value={guest.email}
                        onChange={(e) => handleGuestChange(index, "email", e.target.value)}
                        placeholder="email@exemplo.com"
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor={`phone-${index}`}>Telefone *</Label>
                      <Input
                        id={`phone-${index}`}
                        value={guest.phone}
                        onChange={(e) => handleGuestChange(index, "phone", e.target.value)}
                        placeholder="(00) 00000-0000"
                        required
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

                    <div>
                      <Label htmlFor={`nationality-${index}`}>Nacionalidade *</Label>
                      <Select
                        value={guest.nationality || "BR"}
                        onValueChange={(value) => handleGuestChange(index, "nationality", value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="BR">Brasil</SelectItem>
                          <SelectItem value="US">Estados Unidos</SelectItem>
                          <SelectItem value="AR">Argentina</SelectItem>
                          <SelectItem value="CL">Chile</SelectItem>
                          <SelectItem value="CO">Colômbia</SelectItem>
                          <SelectItem value="PE">Peru</SelectItem>
                          <SelectItem value="UY">Uruguai</SelectItem>
                          <SelectItem value="PY">Paraguai</SelectItem>
                          <SelectItem value="MX">México</SelectItem>
                          <SelectItem value="PT">Portugal</SelectItem>
                          <SelectItem value="ES">Espanha</SelectItem>
                          <SelectItem value="FR">França</SelectItem>
                          <SelectItem value="IT">Itália</SelectItem>
                          <SelectItem value="DE">Alemanha</SelectItem>
                          <SelectItem value="GB">Reino Unido</SelectItem>
                          <SelectItem value="CA">Canadá</SelectItem>
                          <SelectItem value="AU">Austrália</SelectItem>
                          <SelectItem value="JP">Japão</SelectItem>
                          <SelectItem value="CN">China</SelectItem>
                          <SelectItem value="OTHER">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Campos de Endereço */}
                  <div className="mt-4 pt-4 border-t">
                    <h5 className="text-sm font-medium mb-3">Endereço *</h5>
                    <div className="grid grid-cols-2 gap-4">
                      {/* País */}
                      <div>
                        <Label htmlFor={`country-${index}`}>País *</Label>
                        <Select
                          value={guest.country || "BR"}
                          onValueChange={(value) => handleGuestChange(index, "country", value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="BR">Brasil</SelectItem>
                            <SelectItem value="US">Estados Unidos</SelectItem>
                            <SelectItem value="AR">Argentina</SelectItem>
                            <SelectItem value="CL">Chile</SelectItem>
                            <SelectItem value="CO">Colômbia</SelectItem>
                            <SelectItem value="PE">Peru</SelectItem>
                            <SelectItem value="UY">Uruguai</SelectItem>
                            <SelectItem value="PY">Paraguai</SelectItem>
                            <SelectItem value="MX">México</SelectItem>
                            <SelectItem value="PT">Portugal</SelectItem>
                            <SelectItem value="ES">Espanha</SelectItem>
                            <SelectItem value="FR">França</SelectItem>
                            <SelectItem value="IT">Itália</SelectItem>
                            <SelectItem value="DE">Alemanha</SelectItem>
                            <SelectItem value="GB">Reino Unido</SelectItem>
                            <SelectItem value="CA">Canadá</SelectItem>
                            <SelectItem value="AU">Austrália</SelectItem>
                            <SelectItem value="JP">Japão</SelectItem>
                            <SelectItem value="CN">China</SelectItem>
                            <SelectItem value="OTHER">Outro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* CEP (apenas para Brasil) ou Código Postal (outros países) */}
                      {(guest.country || "BR") === "BR" ? (
                        <div>
                          <Label htmlFor={`zip_code-${index}`}>CEP *</Label>
                          <div className="relative">
                            <Input
                              id={`zip_code-${index}`}
                              value={guest.zip_code || ""}
                              onChange={(e) => handleGuestChange(index, "zip_code", e.target.value)}
                              placeholder="00000-000"
                              maxLength={9}
                              required
                            />
                            {loadingCep[index] && (
                              <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <Label htmlFor={`postal_code-${index}`}>Código Postal *</Label>
                          <Input
                            id={`postal_code-${index}`}
                            value={guest.postal_code || ""}
                            onChange={(e) => handleGuestChange(index, "postal_code", e.target.value)}
                            placeholder="Código postal"
                            required
                          />
                        </div>
                      )}

                      <div>
                        <Label htmlFor={`street-${index}`}>Rua/Logradouro *</Label>
                        <Input
                          id={`street-${index}`}
                          value={guest.street || ""}
                          onChange={(e) => handleGuestChange(index, "street", e.target.value)}
                          placeholder="Nome da rua"
                          required
                        />
                      </div>

                      <div>
                        <Label htmlFor={`number-${index}`}>Número *</Label>
                        <Input
                          id={`number-${index}`}
                          value={guest.number || ""}
                          onChange={(e) => handleGuestChange(index, "number", e.target.value)}
                          placeholder="123"
                          required
                        />
                      </div>

                      <div>
                        <Label htmlFor={`complement-${index}`}>Complemento</Label>
                        <Input
                          id={`complement-${index}`}
                          value={guest.complement || ""}
                          onChange={(e) => handleGuestChange(index, "complement", e.target.value)}
                          placeholder="Apto, Bloco, etc."
                        />
                      </div>

                      <div>
                        <Label htmlFor={`neighborhood-${index}`}>Bairro *</Label>
                        <Input
                          id={`neighborhood-${index}`}
                          value={guest.neighborhood || ""}
                          onChange={(e) => handleGuestChange(index, "neighborhood", e.target.value)}
                          placeholder="Nome do bairro"
                          required
                        />
                      </div>

                      <div>
                        <Label htmlFor={`city-${index}`}>Cidade *</Label>
                        <Input
                          id={`city-${index}`}
                          value={guest.city || ""}
                          onChange={(e) => handleGuestChange(index, "city", e.target.value)}
                          placeholder="Nome da cidade"
                          required
                        />
                      </div>

                      {/* Estado (apenas para Brasil) */}
                      {(guest.country || "BR") === "BR" && (
                        <div>
                          <Label htmlFor={`state-${index}`}>Estado *</Label>
                          <Input
                            id={`state-${index}`}
                            value={guest.state || ""}
                            onChange={(e) => handleGuestChange(index, "state", e.target.value)}
                            placeholder="UF"
                            maxLength={2}
                            required
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
                </>
              )}
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
                  // Validar todos os hóspedes com nome preenchido
                  const guestsWithNames = guests.filter((g) => g.name && g.name.trim() !== "");
                  if (guestsWithNames.length === 0) {
                    toast.error("É necessário cadastrar pelo menos um hóspede com nome preenchido.");
                    return;
                  }

                  // Validar campos obrigatórios para todos os hóspedes com nome
                  for (let i = 0; i < guestsWithNames.length; i++) {
                    const guest = guestsWithNames[i];
                    const guestLabel = guest.name && guest.name.trim() 
                      ? guest.name.trim() 
                      : (guest.is_main_guest ? "hóspede principal" : `hóspede ${i + 1}`);
                    
                    // Validar CPF
                    const cpfValue = guest.document_type === "cpf" 
                      ? (guest.document_number || guest.cpf || "")
                      : (guest.cpf || "");
                    
                    if (!cpfValue || cpfValue.trim() === "") {
                      toast.error(`O CPF do ${guestLabel} é obrigatório.`);
                      return;
                    }

                    // Validar Data de Nascimento
                    if (!guest.birth_date || guest.birth_date.trim() === "") {
                      toast.error(`A Data de Nascimento do ${guestLabel} é obrigatória.`);
                      return;
                    }

                    // Validar Email
                    if (!guest.email || guest.email.trim() === "") {
                      toast.error(`O E-mail do ${guestLabel} é obrigatório.`);
                      return;
                    }

                    // Validar Telefone
                    if (!guest.phone || guest.phone.trim() === "") {
                      toast.error(`O Telefone do ${guestLabel} é obrigatório.`);
                      return;
                    }

                    // Validar Endereço
                    const isBrazil = (guest.country || "BR") === "BR";
                    if (isBrazil) {
                      const zipCode = guest.zip_code || "";
                      if (!zipCode || zipCode.trim() === "") {
                        toast.error(`O CEP do ${guestLabel} é obrigatório.`);
                        return;
                      }
                    } else {
                      const postalCode = guest.postal_code || "";
                      if (!postalCode || postalCode.trim() === "") {
                        toast.error(`O Código Postal do ${guestLabel} é obrigatório.`);
                        return;
                      }
                    }

                    if (!guest.street || guest.street.trim() === "") {
                      toast.error(`A Rua/Logradouro do ${guestLabel} é obrigatória.`);
                      return;
                    }

                    if (!guest.number || guest.number.trim() === "") {
                      toast.error(`O Número do endereço do ${guestLabel} é obrigatório.`);
                      return;
                    }

                    if (!guest.neighborhood || guest.neighborhood.trim() === "") {
                      toast.error(`O Bairro do ${guestLabel} é obrigatório.`);
                      return;
                    }

                    if (!guest.city || guest.city.trim() === "") {
                      toast.error(`A Cidade do ${guestLabel} é obrigatória.`);
                      return;
                    }

                    // Validar Estado apenas se for Brasil (reutilizar isBrazil já declarado acima)
                    if (isBrazil && (!guest.state || guest.state.trim() === "")) {
                      toast.error(`O Estado do ${guestLabel} é obrigatório.`);
                      return;
                    }
                  }
                  
                  // Se o usuário pulou a busca e não reutilizou dados, verificar se algum hóspede já realizou check-in anteriormente
                  // IMPORTANTE: Não validar se os dados foram reutilizados
                  if (skipSearch && !hasReusedData) {
                    try {
                      for (let i = 0; i < guestsWithNames.length; i++) {
                        const guest = guestsWithNames[i];
                        const guestLabel = guest.name && guest.name.trim() 
                          ? guest.name.trim() 
                          : (guest.is_main_guest ? "hóspede principal" : `hóspede ${i + 1}`);
                        
                        // Obter CPF e email do hóspede
                        const cpfValue = guest.document_type === "cpf" 
                          ? (guest.document_number || guest.cpf || "")
                          : (guest.cpf || "");
                        const emailValue = guest.email || "";
                        
                        // Buscar check-ins anteriores por CPF ou email
                        if (cpfValue || emailValue) {
                          // Construir condições de busca
                          const conditions: string[] = [];
                          if (cpfValue) conditions.push(`cpf.eq.${cpfValue}`);
                          if (emailValue) conditions.push(`email.eq.${emailValue}`);
                          
                          if (conditions.length > 0) {
                            // Buscar em web_checkin_guests com join em web_checkin
                            const { data: previousGuests, error: guestsError } = await supabase
                              .from("web_checkin_guests")
                              .select(`
                                web_checkin_id,
                                web_checkin:web_checkin!inner(
                                  reservation_id,
                                  status,
                                  completed_at
                                )
                              `)
                              .or(conditions.join(","))
                              .limit(10);
                            
                            if (guestsError) {
                              console.error("Erro ao buscar check-ins anteriores:", guestsError);
                            } else if (previousGuests && previousGuests.length > 0) {
                              // Verificar se algum check-in está completo
                              const completedCheckins = previousGuests.filter(
                                (g: any) => g.web_checkin?.status === "completed"
                              );
                              
                              if (completedCheckins.length > 0 && !hasReusedData) {
                                toast.error(
                                  `O ${guestLabel} (${cpfValue || emailValue}) já realizou check-in anteriormente. Por favor, use a busca inicial para reutilizar os dados.`,
                                  { duration: 5000 }
                                );
                                return;
                              }
                            }
                            
                            // Buscar também em guest_stay_history
                            const { data: stayHistory, error: historyError } = await supabase
                              .from("guest_stay_history")
                              .select("reservation_id")
                              .or(conditions.join(","))
                              .limit(1);
                            
                            if (historyError) {
                              console.error("Erro ao buscar histórico:", historyError);
                            } else if (stayHistory && stayHistory.length > 0 && !hasReusedData) {
                              toast.error(
                                `O ${guestLabel} (${cpfValue || emailValue}) já realizou check-in anteriormente. Por favor, use a busca inicial para reutilizar os dados.`,
                                { duration: 5000 }
                              );
                              return;
                            }
                          }
                        }
                      }
                    } catch (error) {
                      console.error("Erro ao verificar check-ins anteriores:", error);
                      // Em caso de erro, permitir continuar (não bloquear o fluxo)
                    }
                  }
                  
                  // Avançar normalmente
                  setCurrentStep(currentStep + 1);
                } else {
                  // Para outras etapas, avançar normalmente
                  setCurrentStep(currentStep + 1);
                }
              }}
              disabled={false}
            >
              Próximo
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

