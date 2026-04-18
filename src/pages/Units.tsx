import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Edit, Trash2, Building2 } from "lucide-react";
import { CategoryDialog } from "@/components/units/CategoryDialog";
import { RoomDialog } from "@/components/units/RoomDialog";
import { CategoryCard } from "@/components/units/CategoryCard";
import { RoomCard } from "@/components/units/RoomCard";
import { BuildingDialog } from "@/components/units/BuildingDialog";
import { useBuildings } from "@/hooks/useBuildings";
import { useOccupancyMap } from "@/hooks/useOccupancyMap";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { toast } from "sonner";

const Units = () => {
  const queryClient = useQueryClient();
  const { selectedEstablishment } = useEstablishment();
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [buildingDialogOpen, setBuildingDialogOpen] = useState(false);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | undefined>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteBuildingId, setDeleteBuildingId] = useState<string | null>(null);

  const { buildings, deleteBuilding, isLoading: isLoadingBuildings } = useBuildings();

  // Garantir que o establishmentId está disponível no localStorage
  useEffect(() => {
    if (selectedEstablishment?.id) {
      localStorage.setItem("selectedEstablishmentId", selectedEstablishment.id);
    }
  }, [selectedEstablishment]);

  const { data: categories, refetch: refetchCategories } = useQuery({
    queryKey: ["room_categories", selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = selectedEstablishment?.id;
      let query = supabase
        .from("room_categories")
        .select("*, buildings(*)");
      
      if (establishmentId) {
        query = query.eq("establishment_id", establishmentId);
      }
      
      const { data, error } = await query.order("name");

      if (error) {
        toast.error("Erro ao carregar categorias");
        throw error;
      }

      return data;
    },
    enabled: !!selectedEstablishment?.id,
  });

  const { data: rooms, refetch: refetchRooms } = useQuery({
    queryKey: ["rooms", selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = selectedEstablishment?.id;
      let query = supabase
        .from("rooms")
        .select("*, room_categories(*)");
      
      if (establishmentId) {
        query = query.eq("establishment_id", establishmentId);
      }
      
      const { data, error } = await query.order("room_number");

      if (error) {
        toast.error("Erro ao carregar quartos");
        throw error;
      }

      return data;
    },
  });

  // Usar o hook useOccupancyMap para obter o status correto dos quartos (considerando reservas)
  // Isso garante que o status exibido seja o mesmo do mapa de ocupação
  const { rooms: occupancyRooms } = useOccupancyMap(new Date());
  
  // Criar um mapa de status por quarto ID para acesso rápido
  const roomStatusMap = useMemo(() => {
    const statusMap: Record<string, any> = {};
    occupancyRooms.forEach((room) => {
      statusMap[room.id] = room.status;
    });
    return statusMap;
  }, [occupancyRooms]);

  // Agrupar quartos por categoria
  const roomsByCategory = useMemo(() => {
    if (!rooms || !categories) return {};
    
    const grouped: Record<string, { category: any; rooms: any[] }> = {};
    
    // Inicializar todas as categorias
    categories.forEach((category: any) => {
      grouped[category.id] = {
        category,
        rooms: []
      };
    });
    
    // Agrupar quartos por categoria
    rooms.forEach((room: any) => {
      const categoryId = room.category_id || "uncategorized";
      if (grouped[categoryId]) {
        grouped[categoryId].rooms.push(room);
      } else {
        // Se a categoria não existir mais, criar grupo "uncategorized"
        if (!grouped["uncategorized"]) {
          grouped["uncategorized"] = {
            category: { id: "uncategorized", name: "Sem Categoria", room_categories: null },
            rooms: []
          };
        }
        grouped["uncategorized"].rooms.push(room);
      }
    });
    
    // Ordenar quartos dentro de cada categoria por número do quarto
    Object.keys(grouped).forEach((categoryId) => {
      grouped[categoryId].rooms.sort((a, b) => {
        const numA = parseInt(a.room_number) || 0;
        const numB = parseInt(b.room_number) || 0;
        return numA - numB;
      });
    });
    
    return grouped;
  }, [rooms, categories]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Unidades</h1>
          <p className="text-muted-foreground">Gerencie categorias e quartos</p>
        </div>
      </div>

      <Tabs defaultValue="buildings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="buildings">Prédios</TabsTrigger>
          <TabsTrigger value="categories">Categorias</TabsTrigger>
          <TabsTrigger value="rooms">Quartos</TabsTrigger>
        </TabsList>

        <TabsContent value="buildings" className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setSelectedBuildingId(undefined);
                setBuildingDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Novo Prédio
            </Button>
          </div>

          {isLoadingBuildings ? (
            <Card className="p-8 text-center text-muted-foreground">
              Carregando prédios...
            </Card>
          ) : buildings.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              Nenhum prédio cadastrado
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>E-mail Recepção</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {buildings.map((building: any) => (
                  <TableRow key={building.id}>
                    <TableCell className="font-medium">{building.name}</TableCell>
                    <TableCell>{building.description}</TableCell>
                    <TableCell>{building.city || "-"}</TableCell>
                    <TableCell>{building.reception_email || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={building.is_active ? "default" : "secondary"}>
                        {building.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedBuildingId(building.id);
                            setBuildingDialogOpen(true);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setDeleteBuildingId(building.id);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="categories" className="space-y-4">
          <div className="flex justify-end">
            <Button 
              onClick={() => {
                setSelectedCategoryId(null);
                setCategoryDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nova Categoria
            </Button>
          </div>

          {categories && categories.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map((category) => (
                <CategoryCard 
                  key={category.id} 
                  category={category}
                  onClick={() => {
                    setSelectedCategoryId(category.id);
                    setCategoryDialogOpen(true);
                  }}
                />
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center text-muted-foreground">
              Nenhuma categoria cadastrada
            </Card>
          )}
        </TabsContent>

        <TabsContent value="rooms" className="space-y-4">
          <div className="flex justify-end">
            <Button 
              onClick={() => {
                setSelectedRoomId(null);
                setRoomDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Novo Quarto
            </Button>
          </div>

          {rooms && rooms.length > 0 ? (
            <div className="space-y-6">
              {Object.keys(roomsByCategory)
                .sort((a, b) => {
                  // Ordenar categorias: primeiro as categorias normais (alfabética), depois "Sem Categoria"
                  if (a === "uncategorized") return 1;
                  if (b === "uncategorized") return -1;
                  const nameA = roomsByCategory[a].category.name || "";
                  const nameB = roomsByCategory[b].category.name || "";
                  return nameA.localeCompare(nameB, "pt-BR");
                })
                .map((categoryId) => {
                  const { category, rooms: categoryRooms } = roomsByCategory[categoryId];
                  
                  // Pular categorias sem quartos
                  if (categoryRooms.length === 0) return null;
                  
                  return (
                    <div key={categoryId} className="space-y-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg font-semibold text-foreground">
                            {category.name || "Sem Categoria"}
                          </h3>
                          {category.buildings && typeof category.buildings === 'object' && !Array.isArray(category.buildings) && category.buildings.name && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Building2 className="h-4 w-4" />
                              <span className="font-medium">{category.buildings.name}</span>
                            </div>
                          )}
                        </div>
                        <Badge variant="secondary" className="ml-2">
                          {categoryRooms.length} {categoryRooms.length === 1 ? "quarto" : "quartos"}
                        </Badge>
                      </div>
                      <Separator />
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {categoryRooms.map((room) => {
                          // Obter o status correto do mapa de ocupação (considera reservas)
                          // Se não houver status no mapa, usar o status do banco como fallback
                          const occupancyStatus = roomStatusMap[room.id];
                          const roomWithStatus = {
                            ...room,
                            // Mapear o status do mapa de ocupação para o formato do RoomCard
                            // O RoomCard espera: 'available', 'occupied', 'cleaning', 'maintenance', 'blocked'
                            status: occupancyStatus 
                              ? (occupancyStatus === 'dirty' || occupancyStatus === 'dirty_priority' 
                                  ? 'cleaning' 
                                  : occupancyStatus === 'reserved' 
                                    ? 'available' 
                                    : occupancyStatus === 'inspection'
                                      ? 'available'
                                      : occupancyStatus)
                              : room.status || 'available'
                          };
                          
                          return (
                            <RoomCard 
                              key={room.id} 
                              room={roomWithStatus}
                              onClick={() => {
                                setSelectedRoomId(room.id);
                                setRoomDialogOpen(true);
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <Card className="p-8 text-center text-muted-foreground">
              Nenhum quarto cadastrado
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <BuildingDialog
        open={buildingDialogOpen}
        onOpenChange={setBuildingDialogOpen}
        onSuccess={() => {
          refetchCategories();
          setBuildingDialogOpen(false);
          setSelectedBuildingId(undefined);
        }}
        buildingId={selectedBuildingId}
      />

      <CategoryDialog
        open={categoryDialogOpen}
        onOpenChange={(open) => {
          setCategoryDialogOpen(open);
          if (!open) {
            setSelectedCategoryId(null);
          }
        }}
        onSuccess={() => {
          refetchCategories();
          setCategoryDialogOpen(false);
          setSelectedCategoryId(null);
        }}
        buildings={buildings}
        categoryId={selectedCategoryId}
      />

      <RoomDialog
        open={roomDialogOpen}
        onOpenChange={(open) => {
          setRoomDialogOpen(open);
          if (!open) {
            setSelectedRoomId(null);
          }
        }}
        onSuccess={() => {
          refetchRooms();
          // Invalidar queries do mapa de reservas para atualizar o status de interdição
          queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
          queryClient.invalidateQueries({ queryKey: ["rooms"] });
          setRoomDialogOpen(false);
          setSelectedRoomId(null);
        }}
        categories={categories || []}
        roomId={selectedRoomId}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este prédio? Esta ação não pode ser desfeita.
              Categorias associadas a este prédio terão o prédio removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteBuildingId) return;
                try {
                  await deleteBuilding(deleteBuildingId);
                  setDeleteDialogOpen(false);
                  setDeleteBuildingId(null);
                } catch (error) {
                  console.error(error);
                }
              }}
              className="bg-destructive text-destructive-foreground"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Units;
