import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, MapPin, Phone, Mail, Wifi, Car, UtensilsCrossed, Waves, Wind, Tv, Coffee, Bed, Users, Calendar, DollarSign, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useSiteSettings } from "@/hooks/useSiteSettings";

const QuoteRoomSelection = () => {
  const { selectionToken } = useParams<{ selectionToken: string }>();
  const navigate = useNavigate();
  const [quoteData, setQuoteData] = useState<any>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [establishmentServices, setEstablishmentServices] = useState<any[]>([]);
  const [hotelSettings, setHotelSettings] = useState<any>(null);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pmsLogoUrl, setPmsLogoUrl] = useState<string | null>(null);
  const { settings: siteSettings } = useSiteSettings();

  useEffect(() => {
    if (selectionToken) {
      loadData();
    }
  }, [selectionToken]);

  const loadData = async () => {
    try {
      setIsLoading(true);

      // Buscar quote pelo room_selection_link
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .select(`
          *,
          category:room_categories(*),
          establishment:establishments(*)
        `)
        .eq("room_selection_link", selectionToken)
        .maybeSingle();

      if (quoteError || !quote) {
        toast.error("Orçamento não encontrado ou link inválido");
        setIsLoading(false);
        return;
      }

      // Verificar se o quote ainda está válido
      if (quote.status !== 'pending' && quote.status !== 'sent') {
        toast.error("Este orçamento já foi processado");
        setIsLoading(false);
        return;
      }

      setQuoteData(quote);

      // Buscar configurações do hotel
      const { data: hotel } = await supabase
        .from("hotel_settings")
        .select("*")
        .eq("establishment_id", quote.establishment_id)
        .maybeSingle();

      if (hotel) {
        setHotelSettings(hotel);
      }

      // Buscar serviços do estabelecimento
      const { data: services } = await supabase
        .from("establishment_services")
        .select("*")
        .eq("establishment_id", quote.establishment_id)
        .eq("is_active", true)
        .order("name");

      if (services) {
        setEstablishmentServices(services);
      }

      // Buscar quartos disponíveis da mesma categoria
      const { data: availableRooms, error: roomsError } = await supabase
        .from("rooms")
        .select(`
          *,
          category:room_categories(*)
        `)
        .eq("category_id", quote.category_id)
        .eq("is_active", true)
        .eq("show_in_public", true)
        .order("room_number");

      if (!roomsError && availableRooms) {
        setRooms(availableRooms);
      }

      // Buscar todas as categorias do estabelecimento para exibição
      const { data: allCategories, error: categoriesError } = await supabase
        .from("room_categories")
        .select("*")
        .eq("establishment_id", quote.establishment_id)
        .eq("show_in_public", true)
        .order("display_order")
        .order("name");

      if (!categoriesError && allCategories) {
        setCategories(allCategories);
      }

      // Buscar logo do PMS
      if (siteSettings?.logo_url) {
        setPmsLogoUrl(siteSettings.logo_url);
      }
    } catch (error: any) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar informações do orçamento");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectRoom = async (roomId: string) => {
    if (!quoteData) return;

    setIsSubmitting(true);
    try {
      // Atualizar o quote com o quarto selecionado
      const { error: updateError } = await supabase
        .from("quotes")
        .update({ room_id: roomId })
        .eq("id", quoteData.id);

      if (updateError) {
        throw updateError;
      }

      toast.success("Quarto selecionado com sucesso!");
      setSelectedRoom(roomId);
      
      // Redirecionar para página de pagamento após 1 segundo
      setTimeout(() => {
        if (quoteData.payment_link) {
          window.location.href = quoteData.payment_link;
        } else {
          toast.error("Link de pagamento não disponível");
        }
      }, 1000);
    } catch (error: any) {
      console.error("Erro ao selecionar quarto:", error);
      toast.error("Erro ao selecionar quarto. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '';
    const dateOnly = dateString.split('T')[0];
    const parts = dateOnly.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateString;
  };

  const getFeatureIcon = (feature: string) => {
    const lowerFeature = feature.toLowerCase();
    if (lowerFeature.includes('wifi') || lowerFeature.includes('wi-fi') || lowerFeature.includes('internet')) return <Wifi className="w-4 h-4" />;
    if (lowerFeature.includes('estacionamento') || lowerFeature.includes('parking')) return <Car className="w-4 h-4" />;
    if (lowerFeature.includes('restaurante') || lowerFeature.includes('café') || lowerFeature.includes('cafe')) return <UtensilsCrossed className="w-4 h-4" />;
    if (lowerFeature.includes('piscina') || lowerFeature.includes('pool')) return <Waves className="w-4 h-4" />;
    if (lowerFeature.includes('ar condicionado') || lowerFeature.includes('ar-condicionado')) return <Wind className="w-4 h-4" />;
    if (lowerFeature.includes('tv')) return <Tv className="w-4 h-4" />;
    if (lowerFeature.includes('café') || lowerFeature.includes('cafe')) return <Coffee className="w-4 h-4" />;
    return <CheckCircle2 className="w-4 h-4" />;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Carregando informações...</p>
        </div>
      </div>
    );
  }

  if (!quoteData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <Card className="p-8 max-w-md">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Orçamento não encontrado</h2>
            <p className="text-gray-600 mb-4">O link de seleção de quartos é inválido ou expirado.</p>
          </div>
        </Card>
      </div>
    );
  }

  const checkinDate = formatDate(quoteData.checkin_date);
  const checkoutDate = formatDate(quoteData.checkout_date);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            {pmsLogoUrl && (
              <img src={pmsLogoUrl} alt="Logo" className="h-12" />
            )}
            <div className="text-right">
              <h1 className="text-2xl font-bold">{hotelSettings?.name || quoteData.establishment?.name || 'Estabelecimento'}</h1>
              {hotelSettings?.street && (
                <p className="text-blue-100 text-sm flex items-center justify-end gap-1 mt-1">
                  <MapPin className="w-4 h-4" />
                  {hotelSettings.street}
                  {hotelSettings.number && `, ${hotelSettings.number}`}
                  {hotelSettings.city && ` - ${hotelSettings.city}`}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Coluna Esquerda - Informações do Estabelecimento */}
          <div className="lg:col-span-1 space-y-6">
            {/* Informações do Orçamento */}
            <Card className="p-6 bg-white shadow-lg">
              <h2 className="text-xl font-bold mb-4 text-gray-800">Sua Reserva</h2>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-gray-700">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="font-semibold">Check-in</p>
                    <p>{checkinDate}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-gray-700">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="font-semibold">Check-out</p>
                    <p>{checkoutDate}</p>
                  </div>
                </div>
                <Separator />
                <div className="flex items-center gap-2 text-gray-700">
                  <Users className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="font-semibold">Hóspedes</p>
                    <p>{quoteData.adults} adulto(s){quoteData.children > 0 ? `, ${quoteData.children} criança(s)` : ''}</p>
                  </div>
                </div>
                <Separator />
                <div className="flex items-center gap-2 text-gray-700">
                  <DollarSign className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="font-semibold">Valor Total</p>
                    <p className="text-xl font-bold text-green-600">
                      R$ {Number(quoteData.total_amount).toFixed(2).replace('.', ',')}
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Serviços do Estabelecimento */}
            {establishmentServices.length > 0 && (
              <Card className="p-6 bg-white shadow-lg">
                <h2 className="text-xl font-bold mb-4 text-gray-800">Serviços Disponíveis</h2>
                <div className="space-y-2">
                  {establishmentServices.map((service) => (
                    <div key={service.id} className="flex items-center gap-2 text-gray-700">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span>{service.name}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Contato */}
            {(hotelSettings?.email || hotelSettings?.phone) && (
              <Card className="p-6 bg-white shadow-lg">
                <h2 className="text-xl font-bold mb-4 text-gray-800">Entre em Contato</h2>
                <div className="space-y-2">
                  {hotelSettings?.email && (
                    <div className="flex items-center gap-2 text-gray-700">
                      <Mail className="w-4 h-4 text-blue-600" />
                      <a href={`mailto:${hotelSettings.email}`} className="hover:underline">
                        {hotelSettings.email}
                      </a>
                    </div>
                  )}
                  {hotelSettings?.phone && (
                    <div className="flex items-center gap-2 text-gray-700">
                      <Phone className="w-4 h-4 text-blue-600" />
                      <a href={`tel:${hotelSettings.phone}`} className="hover:underline">
                        {hotelSettings.phone}
                      </a>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>

          {/* Coluna Direita - Seleção de Quartos */}
          <div className="lg:col-span-2">
            <Card className="p-6 bg-white shadow-lg mb-6">
              <h2 className="text-2xl font-bold mb-2 text-gray-800">Selecione seu Quarto</h2>
              <p className="text-gray-600">Escolha o quarto que melhor atende suas necessidades</p>
            </Card>

            {rooms.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-gray-600">Nenhum quarto disponível para esta categoria no momento.</p>
              </Card>
            ) : (
              <div className="space-y-6">
                {rooms.map((room) => {
                  const roomPhotos = room.display_photos && room.display_photos.length > 0 
                    ? room.display_photos 
                    : (room.category?.display_photos || []);
                  const roomFeatures = room.display_features && room.display_features.length > 0
                    ? room.display_features
                    : (room.category?.display_features || []);
                  const roomDescription = room.display_description || room.category?.display_description || '';

                  return (
                    <Card key={room.id} className={`overflow-hidden transition-all ${selectedRoom === room.id ? 'ring-2 ring-blue-500' : ''}`}>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Foto do Quarto */}
                        <div className="md:col-span-1">
                          {roomPhotos && roomPhotos.length > 0 ? (
                            <img 
                              src={roomPhotos[0]} 
                              alt={room.name || room.room_number}
                              className="w-full h-48 object-cover"
                            />
                          ) : (
                            <div className="w-full h-48 bg-gradient-to-br from-blue-100 to-indigo-200 flex items-center justify-center">
                              <Bed className="w-16 h-16 text-blue-400" />
                            </div>
                          )}
                        </div>

                        {/* Informações do Quarto */}
                        <div className="md:col-span-2 p-6">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <h3 className="text-xl font-bold text-gray-800">
                                {room.name || `Quarto ${room.room_number}`}
                              </h3>
                              {room.room_number && (
                                <p className="text-gray-600 text-sm">Nº {room.room_number}</p>
                              )}
                            </div>
                            {selectedRoom === room.id && (
                              <Badge variant="success" className="bg-green-500">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Selecionado
                              </Badge>
                            )}
                          </div>

                          {roomDescription && (
                            <p className="text-gray-700 mb-4">{roomDescription}</p>
                          )}

                          {/* Características */}
                          {roomFeatures && roomFeatures.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-4">
                              {roomFeatures.map((feature: string, index: number) => (
                                <Badge key={index} variant="outline" className="flex items-center gap-1">
                                  {getFeatureIcon(feature)}
                                  {feature}
                                </Badge>
                              ))}
                            </div>
                          )}

                          {/* Botão de Seleção */}
                          <Button
                            onClick={() => handleSelectRoom(room.id)}
                            disabled={isSubmitting || selectedRoom === room.id}
                            className="w-full md:w-auto"
                            variant={selectedRoom === room.id ? "outline" : "default"}
                          >
                            {isSubmitting && selectedRoom === room.id ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Processando...
                              </>
                            ) : selectedRoom === room.id ? (
                              <>
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                Quarto Selecionado
                              </>
                            ) : (
                              "Selecionar este Quarto"
                            )}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-800 text-white py-4 mt-12">
        <div className="container mx-auto px-4 text-center text-sm">
          <p>Provido por Artaxnet - CNPJ: 29.508.004/0001-67</p>
        </div>
      </div>
    </div>
  );
};

export default QuoteRoomSelection;

