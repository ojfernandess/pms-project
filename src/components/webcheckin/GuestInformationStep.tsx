import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Download, Loader2 } from "lucide-react";
import { useWebCheckin } from "@/hooks/useWebCheckin";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface GuestInformationStepProps {
  webCheckin: any;
  token: string;
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

export function GuestInformationStep({
  webCheckin,
  token,
  data,
  onNext,
  onBack,
  isFirstStep,
}: GuestInformationStepProps) {
  const { t } = useTranslation();
  const { saveGuests } = useWebCheckin();
  const reservation = webCheckin.reservation;
  
  // Debug: verificar dados da categoria
  console.log("🔍 Dados da reserva:", reservation);
  console.log("🔍 Categoria:", reservation?.room_categories);
  console.log("🔍 Capacity adults:", reservation?.room_categories?.capacity_adults);
  console.log("🔍 Capacity children:", reservation?.room_categories?.capacity_children);
  
  // Obter capacidade da categoria
  const maxCapacity = reservation?.room_categories?.capacity_adults !== undefined && reservation?.room_categories?.capacity_adults !== null
    ? (reservation.room_categories.capacity_adults + (reservation.room_categories.capacity_children || 0))
    : null;
  const maxAdults = reservation?.room_categories?.capacity_adults !== undefined && reservation?.room_categories?.capacity_adults !== null 
    ? reservation.room_categories.capacity_adults 
    : null;
  const maxChildren = reservation?.room_categories?.capacity_children !== undefined && reservation?.room_categories?.capacity_children !== null
    ? reservation.room_categories.capacity_children 
    : null;

  const [guests, setGuests] = useState<any[]>([
    {
      name: "",
      email: "",
      phone: "",
      cpf: "",
      birth_date: "",
      document_type: "cpf",
      document_number: "",
      nationality: "BR",
      country: "BR",
      zip_code: "",
      postal_code: "",
      street: "",
      number: "",
      complement: "",
      neighborhood: "",
      city: "",
      state: "",
      is_main_guest: true,
      use_main_guest_address: false,
    },
  ]);

  const [adults, setAdults] = useState(reservation?.adults || 1);
  const [children, setChildren] = useState(reservation?.children || 0);
  const [loadingCep, setLoadingCep] = useState<{ [key: number]: boolean }>({});

  // Carregar dados salvos quando o componente montar ou quando webCheckin mudar
  useEffect(() => {
    // Flag para evitar resetar se já temos dados no estado
    let hasLoadedData = false;
    
    // Tentar carregar de webCheckin.guest_data primeiro (JSONB)
    if (webCheckin?.guest_data?.guests && Array.isArray(webCheckin.guest_data.guests) && webCheckin.guest_data.guests.length > 0) {
      setGuests(webCheckin.guest_data.guests);
      hasLoadedData = true;
    }
    
    // Se não tiver em guest_data, tentar carregar de webCheckin.guests (da tabela)
    if (!hasLoadedData && webCheckin?.guests && Array.isArray(webCheckin.guests) && webCheckin.guests.length > 0) {
      // Converter formato da tabela para formato do formulário
      const formattedGuests = webCheckin.guests.map((g: any) => ({
        name: g.name || "",
        email: g.email || "",
        phone: g.phone || "",
        cpf: g.cpf || "",
        birth_date: g.birth_date || "",
        document_type: g.document_type || "cpf",
        document_number: g.document_number || "",
        nationality: g.nationality || "BR",
        country: g.country || g.nationality || "BR",
        zip_code: g.zip_code || "",
        postal_code: g.postal_code || "",
        street: g.street || "",
        number: g.number || "",
        complement: g.complement || "",
        neighborhood: g.neighborhood || "",
        city: g.city || "",
        state: g.state || "",
        is_main_guest: g.is_main_guest || false,
      }));
      setGuests(formattedGuests);
      hasLoadedData = true;
    }
    
    // Se não tiver dados salvos, usar dados do prop data (se vier de navegação)
    if (!hasLoadedData && data?.guests && Array.isArray(data.guests) && data.guests.length > 0) {
      setGuests(data.guests);
      hasLoadedData = true;
    }
    
    // Se não tiver nenhum dado salvo, manter o estado atual (não resetar)
  }, [webCheckin?.guest_data?.guests, webCheckin?.guests, data?.guests]);

  useEffect(() => {
    // Ajustar número de hóspedes baseado na reserva, respeitando a capacidade máxima
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
        zip_code: "",
        street: "",
        number: "",
        complement: "",
        neighborhood: "",
        city: "",
        state: "",
        is_main_guest: false,
        use_main_guest_address: false,
      }));
      setGuests(prevGuests => [...prevGuests, ...newGuests]);
    } else if (guests.length > maxAllowed) {
      setGuests(prevGuests => prevGuests.slice(0, maxAllowed));
    }
  }, [adults, children, maxCapacity]);

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
    if ((guest?.country || guest?.nationality || "BR") !== "BR") {
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
        toast.error(t("webCheckin.guests.errors.zipCodeNotFound"));
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
        updatedGuests.forEach((guest, idx) => {
          if (!guest.is_main_guest && guest.use_main_guest_address) {
            updatedGuests[idx] = {
              ...guest,
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
      toast.success(t("webCheckin.guests.errors.addressFilled"));
    } catch (error) {
      console.error("Erro ao buscar CEP:", error);
      toast.error(t("webCheckin.guests.errors.zipCodeError"));
    } finally {
      setLoadingCep({ ...loadingCep, [index]: false });
    }
  };

  const handleUseMainGuestAddress = (index: number, checked: boolean) => {
    const updatedGuests = [...guests];
    const mainGuest = guests.find((g) => g.is_main_guest);
    
    if (checked && mainGuest) {
      // Copiar dados de endereço do hóspede principal
      updatedGuests[index] = {
        ...updatedGuests[index],
        use_main_guest_address: true,
        country: mainGuest.country || mainGuest.nationality || "BR",
        zip_code: mainGuest.zip_code || "",
        postal_code: mainGuest.postal_code || "",
        street: mainGuest.street || "",
        number: mainGuest.number || "",
        complement: mainGuest.complement || "",
        neighborhood: mainGuest.neighborhood || "",
        city: mainGuest.city || "",
        state: mainGuest.state || "",
      };
    } else {
      // Limpar dados de endereço quando desmarcar
      updatedGuests[index] = {
        ...updatedGuests[index],
        use_main_guest_address: false,
        country: updatedGuests[index].nationality || "BR",
        zip_code: "",
        postal_code: "",
        street: "",
        number: "",
        complement: "",
        neighborhood: "",
        city: "",
        state: "",
      };
    }
    
    setGuests(updatedGuests);
  };

  const handleGuestChange = (index: number, field: string, value: any) => {
    const updatedGuests = [...guests];
    const currentGuest = updatedGuests[index];
    
    // Se for país, sincronizar com nacionalidade e limpar campos específicos do Brasil
    if (field === "country") {
      updatedGuests[index] = {
        ...updatedGuests[index],
        country: value,
        nationality: value, // Sincronizar nacionalidade com país
        // Limpar CEP se mudar para país estrangeiro, ou limpar código postal se mudar para Brasil
        zip_code: value === "BR" ? updatedGuests[index].zip_code : "",
        postal_code: value !== "BR" ? updatedGuests[index].postal_code : "",
        // Limpar estado se não for Brasil (não é obrigatório)
        state: value === "BR" ? updatedGuests[index].state : "",
      };
      
      // Se for hóspede principal e houver acompanhantes usando seu endereço, sincronizar
      if (currentGuest.is_main_guest) {
        updatedGuests.forEach((guest, idx) => {
          if (!guest.is_main_guest && guest.use_main_guest_address) {
            updatedGuests[idx] = {
              ...guest,
              country: value,
              nationality: value,
              zip_code: value === "BR" ? guest.zip_code : "",
              postal_code: value !== "BR" ? guest.postal_code : "",
              state: value === "BR" ? guest.state : "",
            };
          }
        });
      }
      
      setGuests(updatedGuests);
      return;
    }
    
    // Se for CEP, formatar e buscar endereço quando completo (apenas para Brasil)
    if (field === "zip_code") {
      const formattedCep = formatCEP(value);
      updatedGuests[index] = { ...updatedGuests[index], [field]: formattedCep };
      
      // Se for hóspede principal e houver acompanhantes usando seu endereço, sincronizar
      if (currentGuest.is_main_guest) {
        updatedGuests.forEach((guest, idx) => {
          if (!guest.is_main_guest && guest.use_main_guest_address) {
            updatedGuests[idx] = { ...guest, zip_code: formattedCep };
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
      updatedGuests[index] = { ...updatedGuests[index], [field]: value };
      
      // Se for hóspede principal e houver acompanhantes usando seu endereço, sincronizar campos de endereço
      if (currentGuest.is_main_guest && ["street", "number", "complement", "neighborhood", "city", "state", "postal_code"].includes(field)) {
        updatedGuests.forEach((guest, idx) => {
          if (!guest.is_main_guest && guest.use_main_guest_address) {
            updatedGuests[idx] = { ...guest, [field]: value };
          }
        });
      }
      
      setGuests(updatedGuests);
    }
  };

  const handleAddGuest = () => {
    // Verificar capacidade máxima - validação rigorosa
    if (maxCapacity !== null) {
      if (guests.length >= maxCapacity) {
        alert(`A capacidade máxima da categoria é de ${maxCapacity} hóspede(s). Não é possível adicionar mais hóspedes.`);
        return;
      }
      // Garantir que não exceda mesmo após adicionar
      if (guests.length + 1 > maxCapacity) {
        alert(`A capacidade máxima da categoria é de ${maxCapacity} hóspede(s). Você já tem ${guests.length} hóspede(s) cadastrado(s).`);
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
        nationality: "BR",
        country: "BR",
        zip_code: "",
        postal_code: "",
        street: "",
        number: "",
        complement: "",
        neighborhood: "",
        city: "",
        state: "",
        is_main_guest: false,
      },
    ]);
  };

  const handleRemoveGuest = (index: number) => {
    if (guests.length > 1) {
      const updatedGuests = guests.filter((_, i) => i !== index);
      // Garantir que pelo menos um seja o hóspede principal
      if (updatedGuests.length > 0 && !updatedGuests.some((g) => g.is_main_guest)) {
        updatedGuests[0].is_main_guest = true;
      }
      setGuests(updatedGuests);
    }
  };

  const handleFillFromReservation = () => {
    // Preencher apenas o hóspede principal (primeiro hóspede) com os dados da reserva
    if (guests.length > 0 && reservation) {
      const documentNumber = reservation?.guest?.document_number || reservation?.financial_responsible?.document_number || "";
      const documentType = reservation?.guest?.document_type?.toLowerCase() || reservation?.financial_responsible?.document_type?.toLowerCase() || "cpf";
      const nationality = reservation?.guest?.nationality || reservation?.financial_responsible?.nationality || "BR";
      const country = reservation?.guest?.country || reservation?.financial_responsible?.country || nationality || "BR";
      
      const guestData = reservation?.guest || reservation?.financial_responsible || {};
      
      const updatedGuests = [...guests];
      updatedGuests[0] = {
        ...updatedGuests[0],
        name: guestData.full_name || "",
        email: guestData.email || "",
        phone: guestData.phone || "",
        cpf: documentType === "cpf" ? documentNumber : "",
        document_type: documentType,
        document_number: documentNumber,
        nationality: nationality,
        country: country,
        zip_code: country === "BR" ? (guestData.postal_code || guestData.zip_code || "") : "",
        postal_code: country !== "BR" ? (guestData.postal_code || guestData.zip_code || "") : "",
        street: guestData.address || guestData.street || "",
        number: guestData.number || "",
        complement: guestData.complement || "",
        neighborhood: guestData.neighborhood || "",
        city: guestData.city || "",
        state: guestData.state || "",
        is_main_guest: true,
        use_main_guest_address: false,
      };
      setGuests(updatedGuests);
    }
  };

  const handleSubmit = async () => {
    // Validação básica
    const hasMainGuest = guests.some((g) => g.is_main_guest);
    if (!hasMainGuest) {
      alert("É necessário ter pelo menos um hóspede principal");
      return;
    }

    const mainGuest = guests.find((g) => g.is_main_guest);
    if (!mainGuest?.name || !mainGuest?.email) {
      alert("O hóspede principal deve ter nome e email preenchidos");
      return;
    }

    // Validar campos obrigatórios para todos os hóspedes
    const guestsWithNames = guests.filter((g) => g.name && g.name.trim() !== "");
    if (guestsWithNames.length === 0) {
      alert("É necessário cadastrar pelo menos um hóspede com nome preenchido.");
      return;
    }

    // Validar CPF, Telefone e Data de Nascimento para todos os hóspedes com nome
    for (let i = 0; i < guestsWithNames.length; i++) {
      const guest = guestsWithNames[i];
      const guestLabel = guest.is_main_guest ? "hóspede principal" : `hóspede ${i + 1}`;
      
      // Validar CPF (obrigatório) - verificar tanto cpf quanto document_number quando tipo é CPF
      const cpfValue = guest.document_type === "cpf" 
        ? (guest.document_number || guest.cpf || "")
        : (guest.cpf || "");
      
      if (!cpfValue || cpfValue.trim() === "") {
        alert(`O CPF do ${guestLabel} é obrigatório.`);
        return;
      }

      // Validar Telefone (obrigatório)
      if (!guest.phone || guest.phone.trim() === "") {
        alert(`O Telefone do ${guestLabel} é obrigatório.`);
        return;
      }

      // Validar Data de Nascimento (obrigatório)
      if (!guest.birth_date || guest.birth_date.trim() === "") {
        alert(`A Data de Nascimento do ${guestLabel} é obrigatória.`);
        return;
      }

      // Validar campos de endereço
      // Para hóspede principal: obrigatório
      // Para acompanhantes: obrigatório apenas se não estiver usando o endereço do principal
      if (guest.is_main_guest || !guest.use_main_guest_address) {
        // Obter país válido - verificar country primeiro, depois nationality, depois usar "BR" como padrão
        let countryValue = null;
        
        if (guest.country && 
            typeof guest.country === 'string' && 
            guest.country.trim() !== "" && 
            guest.country !== "OTHER") {
          countryValue = guest.country.trim();
        } else if (guest.nationality && 
                   typeof guest.nationality === 'string' && 
                   guest.nationality.trim() !== "" && 
                   guest.nationality !== "OTHER") {
          countryValue = guest.nationality.trim();
        }
        
        // Se não houver país válido, usar "BR" como padrão
        const finalCountry = countryValue || "BR";
        const isBrazil = finalCountry === "BR";
        
        // Validar país - apenas se for "OTHER" ou completamente ausente (mas aceitar "BR" como padrão)
        // Na prática, se chegou aqui sem país válido, usamos "BR", então não precisa validar
        // Mas vamos validar se o usuário selecionou "OTHER" sem preencher outro país
        if (guest.country === "OTHER" || guest.nationality === "OTHER") {
          alert(t("webCheckin.guests.errors.countryRequired", { guest: guestLabel }));
          return;
        }
        
        // Validar CEP (apenas para Brasil) ou Código Postal (outros países)
        if (isBrazil) {
          if (!guest.zip_code || guest.zip_code.trim() === "") {
            alert(t("webCheckin.guests.errors.zipCodeRequired", { guest: guestLabel }));
            return;
          }
        } else {
          if (!guest.postal_code || guest.postal_code.trim() === "") {
            alert(t("webCheckin.guests.errors.postalCodeRequired", { guest: guestLabel }));
            return;
          }
        }

        if (!guest.street || guest.street.trim() === "") {
          alert(t("webCheckin.guests.errors.streetRequired", { guest: guestLabel }));
          return;
        }

        if (!guest.number || guest.number.trim() === "") {
          alert(t("webCheckin.guests.errors.numberRequired", { guest: guestLabel }));
          return;
        }

        // Bairro/Neighborhood - obrigatório apenas para Brasil
        if (isBrazil) {
          if (!guest.neighborhood || guest.neighborhood.trim() === "") {
            alert(t("webCheckin.guests.errors.neighborhoodRequired", { guest: guestLabel }));
            return;
          }
        }

        if (!guest.city || guest.city.trim() === "") {
          alert(t("webCheckin.guests.errors.cityRequired", { guest: guestLabel }));
          return;
        }

        // Estado - obrigatório apenas para Brasil
        if (isBrazil) {
          if (!guest.state || guest.state.trim() === "") {
            alert(t("webCheckin.guests.errors.stateRequired", { guest: guestLabel }));
            return;
          }
        }
      }
    }

    // Validar capacidade máxima - validação rigorosa antes de salvar
    if (maxCapacity !== null) {
      if (guests.length > maxCapacity) {
        alert(`A capacidade máxima da categoria é de ${maxCapacity} hóspede(s). Você tem ${guests.length} hóspede(s) cadastrado(s). Por favor, remova ${guests.length - maxCapacity} hóspede(s) para continuar.`);
        // Forçar remoção dos hóspedes excedentes
        setGuests(prevGuests => prevGuests.slice(0, maxCapacity));
        return;
      }
      if (guests.length === 0) {
        alert("É necessário cadastrar pelo menos um hóspede.");
        return;
      }
    }

    saveGuests.mutate(
      { token, guests },
      {
        onSuccess: () => {
          onNext({ guests });
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              {t("webCheckin.guests.title")}
            </h2>
            <p className="text-slate-600">
              {t("webCheckin.guests.subtitle")}
            </p>
          </div>
          {reservation && (
            <Button
              type="button"
              variant="outline"
              onClick={handleFillFromReservation}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              {t("webCheckin.guests.useReservationData")}
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {guests.map((guest, index) => (
          <Card key={index} className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">
                {guest.is_main_guest ? t("webCheckin.guests.mainGuest") : `${t("webCheckin.guests.guest")} ${index + 1}`}
              </h3>
              {guests.length > 1 && !guest.is_main_guest && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveGuest(index)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor={`name-${index}`}>
                  {t("webCheckin.guests.fullName")} <span className="text-red-500">{t("webCheckin.guests.required")}</span>
                </Label>
                <Input
                  id={`name-${index}`}
                  value={guest.name}
                  onChange={(e) => handleGuestChange(index, "name", e.target.value)}
                  placeholder={t("webCheckin.guests.fullNamePlaceholder")}
                  required
                />
              </div>

              <div>
                <Label htmlFor={`email-${index}`}>
                  {t("webCheckin.guests.email")} {guest.is_main_guest && <span className="text-red-500">{t("webCheckin.guests.required")}</span>}
                </Label>
                <Input
                  id={`email-${index}`}
                  type="email"
                  value={guest.email}
                  onChange={(e) => handleGuestChange(index, "email", e.target.value)}
                  placeholder={t("webCheckin.guests.emailPlaceholder")}
                  required={guest.is_main_guest}
                />
              </div>

              <div>
                <Label htmlFor={`phone-${index}`}>
                  {t("webCheckin.guests.phone")} <span className="text-red-500">{t("webCheckin.guests.required")}</span>
                </Label>
                <Input
                  id={`phone-${index}`}
                  value={guest.phone}
                  onChange={(e) => handleGuestChange(index, "phone", e.target.value)}
                  placeholder={t("webCheckin.guests.phonePlaceholder")}
                  required
                />
              </div>

              <div>
                <Label htmlFor={`birth_date-${index}`}>
                  {t("webCheckin.guests.birthDate")} <span className="text-red-500">{t("webCheckin.guests.required")}</span>
                </Label>
                <Input
                  id={`birth_date-${index}`}
                  type="date"
                  value={guest.birth_date}
                  onChange={(e) => handleGuestChange(index, "birth_date", e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor={`document_type-${index}`}>{t("webCheckin.guests.documentType")}</Label>
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
                <Label htmlFor={`nationality-${index}`}>
                  {t("webCheckin.guests.nationality")} <span className="text-red-500">{t("webCheckin.guests.required")}</span>
                </Label>
                <Select
                  value={guest.nationality || "BR"}
                  onValueChange={(value) => {
                    const updatedGuests = [...guests];
                    const isBrazil = value === "BR";
                    updatedGuests[index] = {
                      ...updatedGuests[index],
                      nationality: value,
                      country: value, // Sincronizar país com nacionalidade
                      // Limpar CEP se mudar para país estrangeiro, ou limpar código postal se mudar para Brasil
                      zip_code: isBrazil ? updatedGuests[index].zip_code : "",
                      postal_code: !isBrazil ? updatedGuests[index].postal_code : "",
                      // Limpar estado se não for Brasil
                      state: isBrazil ? updatedGuests[index].state : "",
                    };
                    setGuests(updatedGuests);
                  }}
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
                    <SelectItem value="OTHER">{t("webCheckin.guests.otherCountry")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor={`document_number-${index}`}>
                  {guest.document_type === "cpf" ? (
                    <>
                      {t("webCheckin.guests.cpf")} <span className="text-red-500">{t("webCheckin.guests.required")}</span>
                    </>
                  ) : (
                    <>
                      {t("webCheckin.guests.documentNumber")}
                    </>
                  )}
                </Label>
                <Input
                  id={`document_number-${index}`}
                  value={guest.document_number || ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    const updatedGuests = [...guests];
                    updatedGuests[index] = {
                      ...updatedGuests[index],
                      document_number: value,
                      // Sincronizar com cpf se for CPF
                      cpf: guest.document_type === "cpf" ? value : updatedGuests[index].cpf,
                    };
                    setGuests(updatedGuests);
                  }}
                  placeholder={guest.document_type === "cpf" ? t("webCheckin.guests.cpfPlaceholder") : t("webCheckin.guests.documentNumberPlaceholder")}
                  required={guest.document_type === "cpf"}
                />
              </div>
            </div>

            {/* Seção de Endereço */}
            <div className="mt-6 pt-6 border-t border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold text-slate-900">
                  {t("webCheckin.guests.address")} {guest.is_main_guest && <span className="text-red-500">{t("webCheckin.guests.required")}</span>}
                </h4>
                {!guest.is_main_guest && (
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id={`use_main_guest_address-${index}`}
                      checked={guest.use_main_guest_address || false}
                      onCheckedChange={(checked) => handleUseMainGuestAddress(index, checked as boolean)}
                    />
                    <Label
                      htmlFor={`use_main_guest_address-${index}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {t("webCheckin.guests.useMainGuestAddress")}
                    </Label>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Campo de País */}
                <div>
                  <Label htmlFor={`country-${index}`}>
                    {t("webCheckin.guests.country")} {guest.is_main_guest || !guest.use_main_guest_address ? <span className="text-red-500">{t("webCheckin.guests.required")}</span> : null}
                  </Label>
                  <Select
                    value={guest.country || guest.nationality || "BR"}
                    onValueChange={(value) => handleGuestChange(index, "country", value)}
                    disabled={!guest.is_main_guest && guest.use_main_guest_address}
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
                      <SelectItem value="OTHER">{t("webCheckin.guests.otherCountry")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* CEP (apenas para Brasil) ou Código Postal (outros países) */}
                {(guest.country || guest.nationality || "BR") === "BR" ? (
                  <div>
                    <Label htmlFor={`zip_code-${index}`}>
                      {t("webCheckin.guests.zipCode")} {guest.is_main_guest || !guest.use_main_guest_address ? <span className="text-red-500">{t("webCheckin.guests.required")}</span> : null}
                    </Label>
                    <div className="relative">
                      <Input
                        id={`zip_code-${index}`}
                        value={guest.zip_code || ""}
                        onChange={(e) => handleGuestChange(index, "zip_code", e.target.value)}
                        placeholder={t("webCheckin.guests.zipCodePlaceholder")}
                        maxLength={9}
                        required={guest.is_main_guest || !guest.use_main_guest_address}
                        disabled={!guest.is_main_guest && guest.use_main_guest_address}
                      />
                      {loadingCep[index] && (
                        <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("webCheckin.guests.zipCodeHint")}
                    </p>
                  </div>
                ) : (
                  <div>
                    <Label htmlFor={`postal_code-${index}`}>
                      {t("webCheckin.guests.postalCode")} {guest.is_main_guest || !guest.use_main_guest_address ? <span className="text-red-500">{t("webCheckin.guests.required")}</span> : null}
                    </Label>
                    <Input
                      id={`postal_code-${index}`}
                      value={guest.postal_code || ""}
                      onChange={(e) => handleGuestChange(index, "postal_code", e.target.value)}
                      placeholder={t("webCheckin.guests.postalCodePlaceholder")}
                      required={guest.is_main_guest || !guest.use_main_guest_address}
                      disabled={!guest.is_main_guest && guest.use_main_guest_address}
                    />
                  </div>
                )}

                <div className="md:col-span-2">
                  <Label htmlFor={`street-${index}`}>
                    {t("webCheckin.guests.street")} {guest.is_main_guest || !guest.use_main_guest_address ? <span className="text-red-500">{t("webCheckin.guests.required")}</span> : null}
                  </Label>
                  <Input
                    id={`street-${index}`}
                    value={guest.street || ""}
                    onChange={(e) => handleGuestChange(index, "street", e.target.value)}
                    placeholder={t("webCheckin.guests.streetPlaceholder")}
                    required={guest.is_main_guest || !guest.use_main_guest_address}
                    disabled={!guest.is_main_guest && guest.use_main_guest_address}
                  />
                </div>

                <div>
                  <Label htmlFor={`number-${index}`}>
                    {t("webCheckin.guests.number")} {guest.is_main_guest || !guest.use_main_guest_address ? <span className="text-red-500">{t("webCheckin.guests.required")}</span> : null}
                  </Label>
                  <Input
                    id={`number-${index}`}
                    value={guest.number || ""}
                    onChange={(e) => handleGuestChange(index, "number", e.target.value)}
                    placeholder={t("webCheckin.guests.numberPlaceholder")}
                    required={guest.is_main_guest || !guest.use_main_guest_address}
                    disabled={!guest.is_main_guest && guest.use_main_guest_address}
                  />
                </div>

                <div>
                  <Label htmlFor={`complement-${index}`}>{t("webCheckin.guests.complement")}</Label>
                  <Input
                    id={`complement-${index}`}
                    value={guest.complement || ""}
                    onChange={(e) => handleGuestChange(index, "complement", e.target.value)}
                    placeholder={t("webCheckin.guests.complementPlaceholder")}
                    disabled={!guest.is_main_guest && guest.use_main_guest_address}
                  />
                </div>

                {/* Bairro - apenas para Brasil */}
                {(guest.country || guest.nationality || "BR") === "BR" && (
                  <div>
                    <Label htmlFor={`neighborhood-${index}`}>
                      {t("webCheckin.guests.neighborhood")} {guest.is_main_guest || !guest.use_main_guest_address ? <span className="text-red-500">{t("webCheckin.guests.required")}</span> : null}
                    </Label>
                    <Input
                      id={`neighborhood-${index}`}
                      value={guest.neighborhood || ""}
                      onChange={(e) => handleGuestChange(index, "neighborhood", e.target.value)}
                      placeholder={t("webCheckin.guests.neighborhoodPlaceholder")}
                      required={guest.is_main_guest || !guest.use_main_guest_address}
                      disabled={!guest.is_main_guest && guest.use_main_guest_address}
                    />
                  </div>
                )}

                <div>
                  <Label htmlFor={`city-${index}`}>
                    {t("webCheckin.guests.city")} {guest.is_main_guest || !guest.use_main_guest_address ? <span className="text-red-500">{t("webCheckin.guests.required")}</span> : null}
                  </Label>
                  <Input
                    id={`city-${index}`}
                    value={guest.city || ""}
                    onChange={(e) => handleGuestChange(index, "city", e.target.value)}
                    placeholder={t("webCheckin.guests.cityPlaceholder")}
                    required={guest.is_main_guest || !guest.use_main_guest_address}
                    disabled={!guest.is_main_guest && guest.use_main_guest_address}
                  />
                </div>

                {/* Estado/Província - Obrigatório apenas para Brasil */}
                {(guest.country || guest.nationality || "BR") === "BR" ? (
                  <div>
                    <Label htmlFor={`state-${index}`}>
                      {t("webCheckin.guests.state")} {guest.is_main_guest || !guest.use_main_guest_address ? <span className="text-red-500">{t("webCheckin.guests.required")}</span> : null}
                    </Label>
                    <Input
                      id={`state-${index}`}
                      value={guest.state || ""}
                      onChange={(e) => handleGuestChange(index, "state", e.target.value.toUpperCase())}
                      placeholder={t("webCheckin.guests.statePlaceholder")}
                      maxLength={2}
                      required={guest.is_main_guest || !guest.use_main_guest_address}
                      disabled={!guest.is_main_guest && guest.use_main_guest_address}
                    />
                  </div>
                ) : (
                  <div>
                    <Label htmlFor={`state-${index}`}>
                      {t("webCheckin.guests.stateProvince")}
                    </Label>
                    <Input
                      id={`state-${index}`}
                      value={guest.state || ""}
                      onChange={(e) => handleGuestChange(index, "state", e.target.value)}
                      placeholder={t("webCheckin.guests.stateProvincePlaceholder")}
                      disabled={!guest.is_main_guest && guest.use_main_guest_address}
                    />
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="space-y-2">
        {maxCapacity !== null && (
          <div className={`text-sm text-center p-3 rounded-lg ${
            guests.length >= maxCapacity 
              ? "bg-red-50 text-red-700 border border-red-200" 
              : "bg-slate-50 text-slate-600 border border-slate-200"
          }`}>
            <div className="font-semibold mb-1">
              {t("webCheckin.guests.capacity")} {maxCapacity} {t("webCheckin.guests.guests")}
            </div>
            {maxAdults !== null && maxChildren !== null && (
              <div className="text-xs text-slate-500 mb-1">
                ({maxAdults} {t("webCheckin.guests.adults")} + {maxChildren} {t("webCheckin.guests.children")})
              </div>
            )}
            <div className={`text-sm font-medium ${
              guests.length >= maxCapacity ? "text-red-700" : "text-slate-700"
            }`}>
              {guests.length} {t("webCheckin.guests.of")} {maxCapacity} {t("webCheckin.guests.registered")}
              {guests.length >= maxCapacity && ` - ${t("webCheckin.guests.limitReached")}`}
            </div>
          </div>
        )}
        {maxCapacity === null && (
          <div className="text-xs text-slate-500 text-center p-2 bg-yellow-50 border border-yellow-200 rounded">
            {t("webCheckin.guests.capacityNotAvailable")}
          </div>
        )}
        <Button 
          variant="outline" 
          onClick={handleAddGuest} 
          className="w-full"
          disabled={maxCapacity !== null && guests.length >= maxCapacity}
        >
          <Plus className="h-4 w-4 mr-2" />
          {maxCapacity !== null && guests.length >= maxCapacity ? t("webCheckin.guests.addGuestLimit") : t("webCheckin.guests.addGuest")}
        </Button>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack} disabled={isFirstStep}>
          {t("webCheckin.guests.back")}
        </Button>
        <Button onClick={handleSubmit} disabled={saveGuests.isPending}>
          {saveGuests.isPending ? t("webCheckin.guests.saving") : t("webCheckin.guests.continue")}
        </Button>
      </div>
    </div>
  );
}

