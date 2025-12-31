import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Star, 
  Search, 
  Filter, 
  Loader2,
  Eye,
  EyeOff,
  BarChart3,
  MessageSquare,
  Calendar,
  User,
  Settings
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStayReviews } from "@/hooks/useStayReviews";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { isFeatureEnabledForEstablishment } from "@/lib/featureAccess";
import { ReviewSettingsDialog } from "@/components/reviews/ReviewSettingsDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

export default function StayReviews() {
  const { selectedEstablishment } = useEstablishment();
  const { settings } = useSiteSettings();
  const establishmentId = selectedEstablishment?.id;
  
  // TODOS OS HOOKS DEVEM SER CHAMADOS ANTES DE QUALQUER RETURN CONDICIONAL
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPublished, setFilterPublished] = useState<boolean | undefined>(undefined);
  const [selectedReview, setSelectedReview] = useState<any>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);

  const { 
    useGetReviews, 
    useGetReviewStatistics, 
    moderateReview 
  } = useStayReviews();

  const { data: reviews, isLoading } = useGetReviews(
    establishmentId || "",
    { is_published: filterPublished }
  );

  const { data: statistics, isLoading: isLoadingStats } = useGetReviewStatistics(
    establishmentId || ""
  );
  
  // Verificar se o feature flag está habilitado e se há establishmentId
  if (!establishmentId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Selecione um estabelecimento</p>
      </div>
    );
  }
  
  // Verificar se o feature flag está habilitado para este estabelecimento (DEPOIS dos hooks)
  const isStayReviewsEnabled = isFeatureEnabledForEstablishment(
    settings?.features_enabled?.stay_reviews,
    establishmentId
  );
  
  if (!isStayReviewsEnabled) {
    return (
      <div className="flex items-center justify-center h-64">
        <Card className="p-8 max-w-md text-center">
          <p className="text-muted-foreground">
            O sistema de avaliações está desabilitado. Ative-o no painel Super Admin &gt; Funcionalidades.
          </p>
        </Card>
      </div>
    );
  }

  // Filtrar avaliações por termo de busca
  const filteredReviews = reviews?.filter((review: any) => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    const reservation = review.reservation as any;
    const guestName = reservation?.guest?.full_name || "";
    // Lidar com rooms que pode ser array ou objeto único
    const roomsData = Array.isArray(reservation?.rooms) 
      ? reservation.rooms[0] 
      : reservation?.rooms;
    const roomNumber = roomsData?.room_number || roomsData?.name || "";
    const comment = review.comment || "";
    
    return (
      guestName.toLowerCase().includes(searchLower) ||
      roomNumber.toLowerCase().includes(searchLower) ||
      comment.toLowerCase().includes(searchLower) ||
      reservation?.reservation_code?.toLowerCase().includes(searchLower)
    );
  }) || [];

  // Preparar dados para gráficos
  const ratingDistribution = statistics?.distribution?.stars || {};
  const distributionData = Object.entries(ratingDistribution).map(([key, value]) => ({
    name: `${key} ${key === "1" ? "estrela" : "estrelas"}`,
    value: value as number,
  }));

  const categoryAverages = statistics ? [
    { name: "Quarto", value: statistics.averageRoom },
    { name: "Conforto", value: statistics.averageComfort },
    { name: "Atendimento", value: statistics.averageService },
    { name: "Limpeza", value: statistics.averageCleanliness },
  ] : [];

  const handleTogglePublish = async (reviewId: string, currentStatus: boolean) => {
    await moderateReview.mutateAsync({
      reviewId,
      is_published: !currentStatus,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Avaliações da Estadia</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie e visualize as avaliações dos hóspedes
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setSettingsDialogOpen(true)}
          className="flex items-center gap-2"
        >
          <Settings className="h-4 w-4" />
          Configurações
        </Button>
      </div>

      <Tabs defaultValue="reviews" className="space-y-4">
        <TabsList>
          <TabsTrigger value="reviews">Avaliações</TabsTrigger>
          <TabsTrigger value="statistics">Estatísticas</TabsTrigger>
        </TabsList>

        {/* Aba: Avaliações */}
        <TabsContent value="reviews" className="space-y-4">
          {/* Filtros */}
          <Card className="p-4">
            <div className="flex gap-4 items-center">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Buscar por hóspede, quarto, comentário..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">
                    <Filter className="h-4 w-4 mr-2" />
                    Filtros
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64">
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Status</label>
                      <Select
                        value={filterPublished === undefined ? "all" : filterPublished ? "published" : "unpublished"}
                        onValueChange={(value) => {
                          if (value === "all") setFilterPublished(undefined);
                          else setFilterPublished(value === "published");
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="published">Publicadas</SelectItem>
                          <SelectItem value="unpublished">Não Publicadas</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </Card>

          {/* Lista de Avaliações */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredReviews.length === 0 ? (
            <Card className="p-12 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhuma avaliação encontrada</p>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredReviews.map((review: any) => {
                const reservation = review.reservation as any;
                const guestName = reservation?.guest?.full_name || "Hóspede";
                // Lidar com rooms que pode ser array ou objeto único
                const roomsData = Array.isArray(reservation?.rooms) 
                  ? reservation.rooms[0] 
                  : reservation?.rooms;
                const roomNumber = roomsData?.room_number || roomsData?.name || "N/A";
                const roomCategory = roomsData?.room_categories;
                const building = roomCategory?.buildings;
                const buildingName = building?.name;
                
                return (
                  <Card key={review.id} className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-semibold">
                            {review.is_anonymous ? "Avaliação Anônima" : guestName}
                          </span>
                          {review.is_anonymous && (
                            <Badge variant="secondary" className="text-xs">Anônimo</Badge>
                          )}
                          {!review.is_published && (
                            <Badge variant="outline" className="text-xs">Não Publicada</Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4 flex-wrap">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(review.submitted_at), "dd/MM/yyyy", { locale: ptBR })}
                          </div>
                          <div>Quarto: {roomNumber}</div>
                          {buildingName && (
                            <div>Prédio: {buildingName}</div>
                          )}
                          <div>Reserva: {reservation?.reservation_code}</div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                          {review.room_rating && (
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Quarto</div>
                              <div className="flex items-center gap-1">
                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                <span className="font-semibold">{review.room_rating}</span>
                              </div>
                            </div>
                          )}
                          {review.comfort_rating && (
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Conforto</div>
                              <div className="flex items-center gap-1">
                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                <span className="font-semibold">{review.comfort_rating}</span>
                              </div>
                            </div>
                          )}
                          {review.service_rating && (
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Atendimento</div>
                              <div className="flex items-center gap-1">
                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                <span className="font-semibold">{review.service_rating}</span>
                              </div>
                            </div>
                          )}
                          {review.cleanliness_rating && (
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Limpeza</div>
                              <div className="flex items-center gap-1">
                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                <span className="font-semibold">{review.cleanliness_rating}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {review.comment && (
                          <div className="mt-4">
                            <p className="text-sm text-muted-foreground">{review.comment}</p>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedReview(review);
                            setReviewDialogOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTogglePublish(review.id, review.is_published)}
                          disabled={moderateReview.isPending}
                        >
                          {review.is_published ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Aba: Estatísticas */}
        <TabsContent value="statistics" className="space-y-4">
          {isLoadingStats ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !statistics || statistics.total === 0 ? (
            <Card className="p-12 text-center">
              <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Nenhuma avaliação disponível para estatísticas</p>
            </Card>
          ) : (
            <>
              {/* Cards de Resumo */}
              <div className="grid gap-4 md:grid-cols-5">
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground mb-1">Total de Avaliações</div>
                  <div className="text-2xl font-bold">{statistics.total}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground mb-1">Média Geral</div>
                  <div className="text-2xl font-bold">{statistics.averageOverall.toFixed(1)}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground mb-1">Quarto</div>
                  <div className="text-2xl font-bold">{statistics.averageRoom.toFixed(1)}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground mb-1">Conforto</div>
                  <div className="text-2xl font-bold">{statistics.averageComfort.toFixed(1)}</div>
                </Card>
                <Card className="p-4">
                  <div className="text-sm text-muted-foreground mb-1">Atendimento</div>
                  <div className="text-2xl font-bold">{statistics.averageService.toFixed(1)}</div>
                </Card>
              </div>

              {/* Gráficos */}
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Médias por Categoria</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={categoryAverages}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis domain={[0, 5]} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#3B82F6" />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Distribuição de Avaliações</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={distributionData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {distributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog de Detalhes */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes da Avaliação</DialogTitle>
          </DialogHeader>
          {selectedReview && (() => {
            const reservation = selectedReview.reservation as any;
            // Lidar com rooms que pode ser array ou objeto único
            const roomsData = Array.isArray(reservation?.rooms) 
              ? reservation.rooms[0] 
              : reservation?.rooms;
            const roomNumber = roomsData?.room_number || roomsData?.name || "N/A";
            const roomCategory = roomsData?.room_categories;
            const building = roomCategory?.buildings;
            const buildingName = building?.name;
            
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Hóspede</div>
                    <div className="font-semibold">
                      {selectedReview.is_anonymous 
                        ? "Avaliação Anônima" 
                        : reservation?.guest?.full_name || "N/A"}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Data</div>
                    <div className="font-semibold">
                      {format(new Date(selectedReview.submitted_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Quarto</div>
                    <div className="font-semibold">{roomNumber}</div>
                  </div>
                  {buildingName && (
                    <div>
                      <div className="text-sm text-muted-foreground">Prédio</div>
                      <div className="font-semibold">{buildingName}</div>
                    </div>
                  )}
                </div>
              
                <div className="grid grid-cols-2 gap-4">
                  {selectedReview.room_rating && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Quarto</div>
                      <div className="flex items-center gap-1">
                        <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                        <span className="text-xl font-bold">{selectedReview.room_rating}</span>
                      </div>
                    </div>
                  )}
                  {selectedReview.comfort_rating && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Conforto</div>
                      <div className="flex items-center gap-1">
                        <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                        <span className="text-xl font-bold">{selectedReview.comfort_rating}</span>
                      </div>
                    </div>
                  )}
                  {selectedReview.service_rating && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Atendimento</div>
                      <div className="flex items-center gap-1">
                        <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                        <span className="text-xl font-bold">{selectedReview.service_rating}</span>
                      </div>
                    </div>
                  )}
                  {selectedReview.cleanliness_rating && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Limpeza</div>
                      <div className="flex items-center gap-1">
                        <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                        <span className="text-xl font-bold">{selectedReview.cleanliness_rating}</span>
                      </div>
                    </div>
                  )}
                </div>

                {selectedReview.comment && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-2">Comentário</div>
                    <Textarea value={selectedReview.comment} readOnly rows={4} />
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Dialog: Configurações de Avaliação */}
      {selectedEstablishment && establishmentId && (
        <ReviewSettingsDialog
          open={settingsDialogOpen}
          onOpenChange={setSettingsDialogOpen}
          establishmentId={establishmentId}
          establishmentName={selectedEstablishment.name || "Estabelecimento"}
        />
      )}
    </div>
  );
}

