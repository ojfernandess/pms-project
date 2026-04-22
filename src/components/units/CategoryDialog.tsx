import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { toast } from "sonner";
import { slugFromName } from "@/lib/slugUtils";
import { useSlugValidation } from "@/hooks/useSlugValidation";
import { useQueryClient } from "@tanstack/react-query";
import { scheduleChannelSyncAfterRateEdit } from "@/lib/channelSyncAfterRates";
import { Save, Trash2 } from "lucide-react";
import { RoomsTable } from "./RoomsTable";

interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  buildings?: any[];
  categoryId?: string | null;
}

export const CategoryDialog = ({ open, onOpenChange, onSuccess, buildings = [], categoryId }: CategoryDialogProps) => {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("informations");
  const [showRoomsTable, setShowRoomsTable] = useState(false);
  const [createdRooms, setCreatedRooms] = useState<any[]>([]);
  const [savedCategoryId, setSavedCategoryId] = useState<string | null>(null);
  const [publicDisplayData, setPublicDisplayData] = useState<{
    features: string[];
    photos: string[];
  }>({
    features: [],
    photos: [],
  });
  const establishmentId = getSelectedEstablishmentId();
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    type: "Double",
    building_id: "",
    abbreviation: "",
    size_sqm: "",
    color: "#445d85",
    privacy: "Quarto Privado",
    day_use: false,
    standard_occupancy: "2",
    minimum_occupancy: "1",
    capacity_adults: "2",
    capacity_children: "1",
    courtesy_age: "2",
    maximum_occupancy: "2",
    accommodation_quantity: "10",
    courtesy_limit: "1",
    base_price: "0,00",
    rich_description: "",
  });
  const slugValidation = useSlugValidation({
    entityType: "room_category",
    slug: formData.slug,
    excludeId: categoryId ?? null,
    establishmentId: establishmentId ?? null,
  });

  // Carregar dados da categoria se estiver editando
  useEffect(() => {
    if (open && categoryId) {
      loadCategoryData();
      setShowRoomsTable(false);
      setSavedCategoryId(categoryId);
    } else if (open && !categoryId) {
      // Resetar formulário para nova categoria
      setFormData({
        name: "",
        slug: "",
        type: "Double",
        building_id: "",
        abbreviation: "",
        size_sqm: "",
        color: "#445d85",
        privacy: "Quarto Privado",
        day_use: false,
        standard_occupancy: "2",
        minimum_occupancy: "1",
        capacity_adults: "2",
        capacity_children: "1",
        courtesy_age: "2",
        maximum_occupancy: "2",
        accommodation_quantity: "10",
        courtesy_limit: "1",
        base_price: "0,00",
        rich_description: "",
      });
      setShowRoomsTable(false);
      setSavedCategoryId(null);
      setPublicDisplayData({ features: [], photos: [] });
    }
  }, [open, categoryId]);

  // Carregar quartos quando mostrar a tabela
  useEffect(() => {
    if (showRoomsTable && savedCategoryId) {
      loadRooms();
    }
  }, [showRoomsTable, savedCategoryId]);

  const loadRooms = async () => {
    if (!savedCategoryId) return;

    try {
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("category_id", savedCategoryId)
        .order("room_number");

      if (error) throw error;
      setCreatedRooms(data || []);
    } catch (error: any) {
      console.error("Erro ao carregar quartos:", error);
      toast.error("Erro ao carregar quartos");
    }
  };

  const loadCategoryData = async () => {
    if (!categoryId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("room_categories")
        .select("*")
        .eq("id", categoryId)
        .single();

      if (error) throw error;

      if (data) {
        setFormData({
          name: data.name || "",
          slug: data.slug ?? "",
          type: data.type || "Double",
          building_id: data.building_id || "",
          abbreviation: data.abbreviation || "",
          size_sqm: data.size_sqm?.toString() || "",
          color: data.color || "#445d85",
          privacy: data.privacy || "Quarto Privado",
          day_use: data.day_use || false,
          standard_occupancy: data.standard_occupancy?.toString() || data.capacity_adults?.toString() || "2",
          minimum_occupancy: data.minimum_occupancy?.toString() || "1",
          capacity_adults: data.capacity_adults?.toString() || "2",
          capacity_children: data.capacity_children?.toString() || "1",
          courtesy_age: data.courtesy_age?.toString() || "2",
          maximum_occupancy: data.maximum_occupancy?.toString() || data.capacity_adults?.toString() || "2",
          accommodation_quantity: data.accommodation_quantity?.toString() || "10",
          courtesy_limit: data.courtesy_limit?.toString() || "1",
          base_price: data.base_price ? (typeof data.base_price === 'number' ? data.base_price.toFixed(2).replace('.', ',') : data.base_price) : "0,00",
          rich_description: data.rich_description || data.display_description || "",
        });
        setPublicDisplayData({
          features: Array.isArray(data.display_features) ? data.display_features : [],
          photos: Array.isArray(data.display_photos) ? data.display_photos : [],
        });

        // Verificar se há quartos e carregá-los
        const { data: roomsData } = await supabase
          .from("rooms")
          .select("*")
          .eq("category_id", categoryId)
          .order("room_number");

        if (roomsData && roomsData.length > 0) {
          setCreatedRooms(roomsData);
          setShowRoomsTable(true);
          setSavedCategoryId(categoryId);
        }
      }
    } catch (error: any) {
      console.error("Erro ao carregar categoria:", error);
      toast.error("Erro ao carregar dados da categoria");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Converter valores
      const basePriceValue = parseFloat(formData.base_price.replace(',', '.')) || 0;

      if (formData.slug?.trim() && slugValidation.isDuplicate) {
        toast.error("Esta URL amigável já está em uso neste estabelecimento. Escolha outra.");
        setLoading(false);
        return;
      }
      const categoryData: any = {
        name: formData.name,
        slug: formData.slug?.trim() || null,
        type: formData.type || "Double",
        building_id: formData.building_id || null,
        abbreviation: formData.abbreviation || null,
        size_sqm: formData.size_sqm ? parseFloat(formData.size_sqm.replace(',', '.')) : null,
        color: formData.color,
        privacy: formData.privacy,
        day_use: formData.day_use,
        standard_occupancy: parseInt(formData.standard_occupancy) || parseInt(formData.capacity_adults) || 2,
        minimum_occupancy: parseInt(formData.minimum_occupancy) || 1,
        capacity_adults: parseInt(formData.capacity_adults) || 2,
        capacity_children: parseInt(formData.capacity_children) || 1,
        courtesy_age: parseInt(formData.courtesy_age) || 2,
        maximum_occupancy: parseInt(formData.maximum_occupancy) || parseInt(formData.capacity_adults) || 2,
        accommodation_quantity: parseInt(formData.accommodation_quantity) || 1,
        courtesy_limit: parseInt(formData.courtesy_limit) || 1,
        base_price: basePriceValue,
        rich_description: formData.rich_description || null,
        establishment_id: establishmentId || undefined,
      };

      let savedCategoryId = categoryId;
      const accommodationQuantity = parseInt(formData.accommodation_quantity) || 0;

      if (categoryId) {
        // Atualizar categoria existente
        const { error } = await supabase
          .from("room_categories")
          .update(categoryData)
          .eq("id", categoryId);

        if (error) throw error;

        // Verificar se precisa criar quartos adicionais
        if (accommodationQuantity > 0) {
          // Contar quartos existentes desta categoria
          const { count: existingRoomsCount } = await supabase
            .from("rooms")
            .select("*", { count: "exact", head: true })
            .eq("category_id", categoryId)
            .eq("establishment_id", establishmentId || "");

          const existingCount = existingRoomsCount || 0;
          const roomsToCreate = accommodationQuantity - existingCount;

          if (roomsToCreate > 0) {
            // Buscar o maior número de quarto existente para continuar a sequência
            const { data: existingRooms } = await supabase
              .from("rooms")
              .select("room_number")
              .eq("category_id", categoryId)
              .eq("establishment_id", establishmentId || "")
              .order("room_number", { ascending: false })
              .limit(1);

            let nextRoomNumber = 1;
            if (existingRooms && existingRooms.length > 0) {
              const lastRoomNumber = existingRooms[0].room_number;
              // Extrair número do último quarto (pode ser "101", "Suite 1", etc)
              const match = lastRoomNumber.match(/(\d+)$/);
              if (match) {
                nextRoomNumber = parseInt(match[1]) + 1;
              } else {
                nextRoomNumber = existingCount + 1;
              }
            }

            // Criar os quartos adicionais
            const roomsToInsert = [];
            const categoryAbbreviation = formData.abbreviation || formData.name.substring(0, 3).toUpperCase().replace(/\s+/g, '');
            
            // Verificar números de quarto existentes para evitar duplicatas
            const { data: allExistingRooms } = await supabase
              .from("rooms")
              .select("room_number")
              .eq("establishment_id", establishmentId || "");

            const existingRoomNumbers = new Set((allExistingRooms || []).map((r: any) => r.room_number.toLowerCase()));
            
            for (let i = 0; i < roomsToCreate; i++) {
              let roomNumber = "";
              let attempts = 0;
              const maxAttempts = 100;
              
              // Tentar encontrar um número único
              while (attempts < maxAttempts) {
                const num = nextRoomNumber + i + attempts;
                roomNumber = categoryAbbreviation 
                  ? `${categoryAbbreviation}${num}`
                  : `${num}`;
                
                if (!existingRoomNumbers.has(roomNumber.toLowerCase())) {
                  existingRoomNumbers.add(roomNumber.toLowerCase());
                  break;
                }
                attempts++;
              }
              
              if (attempts >= maxAttempts) {
                // Fallback: usar UUID curto se não conseguir número único
                roomNumber = categoryAbbreviation 
                  ? `${categoryAbbreviation}${Date.now()}${i}`
                  : `Q${Date.now()}${i}`;
              }
              
              roomsToInsert.push({
                room_number: roomNumber,
                category_id: categoryId,
                establishment_id: establishmentId || undefined,
                status: "available",
              });
            }

            if (roomsToInsert.length > 0) {
              const { error: roomsError } = await supabase
                .from("rooms")
                .insert(roomsToInsert);

              if (roomsError) {
                console.error("Erro ao criar quartos:", roomsError);
                toast.warning(`Categoria atualizada, mas houve erro ao criar ${roomsToCreate} quartos: ${roomsError.message}`);
              } else {
                toast.success(`Categoria atualizada e ${roomsToCreate} quarto(s) criado(s) com sucesso!`);
                // Buscar todos os quartos da categoria e mostrar a tabela
                const { data: allRoomsData } = await supabase
                  .from("rooms")
                  .select("*")
                  .eq("category_id", categoryId)
                  .order("room_number");
                
                if (allRoomsData) {
                  setCreatedRooms(allRoomsData);
                  setShowRoomsTable(true);
                  setActiveTab("rooms");
                }
              }
            }
          } else {
            toast.success("Categoria atualizada com sucesso!");
          }
        } else {
          toast.success("Categoria atualizada com sucesso!");
        }
      } else {
        // Criar nova categoria
        const { data: newCategory, error } = await supabase
          .from("room_categories")
          .insert([categoryData])
          .select()
          .single();

        if (error) throw error;

        const newCategoryId = newCategory.id;
        setSavedCategoryId(newCategoryId);
        toast.success("Categoria criada com sucesso!");

        // Criar quartos automaticamente se quantidade foi especificada
        if (accommodationQuantity > 0 && newCategoryId) {
          const roomsToInsert = [];
          const categoryAbbreviation = formData.abbreviation || formData.name.substring(0, 3).toUpperCase().replace(/\s+/g, '');
          
          // Verificar números de quarto existentes para evitar duplicatas
          const { data: allExistingRooms } = await supabase
            .from("rooms")
            .select("room_number")
            .eq("establishment_id", establishmentId || "");

          const existingRoomNumbers = new Set((allExistingRooms || []).map((r: any) => r.room_number.toLowerCase()));
          
          for (let i = 1; i <= accommodationQuantity; i++) {
            let roomNumber = "";
            let attempts = 0;
            const maxAttempts = 100;
            
            // Tentar encontrar um número único
            while (attempts < maxAttempts) {
              const num = i + attempts;
              roomNumber = categoryAbbreviation 
                ? `${categoryAbbreviation}${num}`
                : `${num}`;
              
              if (!existingRoomNumbers.has(roomNumber.toLowerCase())) {
                existingRoomNumbers.add(roomNumber.toLowerCase());
                break;
              }
              attempts++;
            }
            
            if (attempts >= maxAttempts) {
              // Fallback: usar timestamp se não conseguir número único
              roomNumber = categoryAbbreviation 
                ? `${categoryAbbreviation}${Date.now()}${i}`
                : `Q${Date.now()}${i}`;
            }
            
            roomsToInsert.push({
              room_number: roomNumber,
              category_id: savedCategoryId,
              establishment_id: establishmentId || undefined,
              status: "available",
            });
          }

          if (roomsToInsert.length > 0) {
            const { error: roomsError } = await supabase
              .from("rooms")
              .insert(roomsToInsert);

            if (roomsError) {
              console.error("Erro ao criar quartos:", roomsError);
              toast.warning(`Categoria criada, mas houve erro ao criar ${accommodationQuantity} quartos: ${roomsError.message}`);
            } else {
              toast.success(`${accommodationQuantity} quarto(s) criado(s) automaticamente!`);
              // Buscar os quartos criados e mostrar a tabela
              const { data: createdRoomsData } = await supabase
                .from("rooms")
                .select("*")
                .eq("category_id", newCategoryId)
                .order("room_number");
              
              if (createdRoomsData) {
                setCreatedRooms(createdRoomsData);
                setShowRoomsTable(true);
                setActiveTab("rooms");
              }
            }
          }
        }
      }

      // Invalidar todas as queries de categorias e quartos
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return key === "room_categories" || 
                 key === "room_categories_with_rooms" || 
                 key === "occupancy_map_rooms" ||
                 key === "rooms";
        }
      });

      scheduleChannelSyncAfterRateEdit(establishmentId ?? null);

      // Se quartos foram criados e a tabela está sendo mostrada, não fechar o dialog
      if (showRoomsTable && createdRooms.length > 0) {
        // Não fechar o dialog, apenas atualizar
        onSuccess();
        return;
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao salvar categoria:", error);
      toast.error(error.message || "Erro ao salvar categoria");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!categoryId) return;
    
    if (!confirm("Tem certeza que deseja deletar esta categoria? Esta ação não pode ser desfeita.")) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("room_categories")
        .delete()
        .eq("id", categoryId);

      if (error) throw error;

      toast.success("Categoria deletada com sucesso!");
      
      // Invalidar queries
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return key === "room_categories" || key === "room_categories_with_rooms" || key === "occupancy_map_rooms";
        }
      });

      scheduleChannelSyncAfterRateEdit(establishmentId ?? null);

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao deletar categoria:", error);
      toast.error(error.message || "Erro ao deletar categoria");
    } finally {
      setLoading(false);
    }
  };

  // Gerar opções de hóspedes (1 a 20)
  const guestOptions = Array.from({ length: 20 }, (_, i) => i + 1).map(num => ({
    value: num.toString(),
    label: num === 1 ? "1 Hóspede" : `${num} Hóspedes`
  }));

  // Gerar opções de crianças (0 a 10)
  const childrenOptions = Array.from({ length: 11 }, (_, i) => i).map(num => ({
    value: num.toString(),
    label: num === 0 ? "0" : num === 1 ? "1 criança" : `${num} crianças`
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-xl font-bold text-blue-600">
            {categoryId ? "Alterar Categoria" : "Criação de Categoria"}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className={createdRooms.length > 0 ? "grid w-full grid-cols-4" : "grid w-full grid-cols-3"}>
            <TabsTrigger value="informations">Informações</TabsTrigger>
            <TabsTrigger value="facilities">Instalações</TabsTrigger>
            <TabsTrigger value="images">Imagens</TabsTrigger>
            {createdRooms.length > 0 && (
              <TabsTrigger value="rooms">Quartos ({createdRooms.length})</TabsTrigger>
            )}
          </TabsList>

          <form onSubmit={handleSubmit} className="space-y-6 mt-6">
            <TabsContent value="informations" className="space-y-6">
              {/* Grid de 3 colunas */}
              <div className="grid grid-cols-3 gap-4">
                {/* Coluna 1 */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name" className="text-sm font-medium">
                      Nome da categoria: <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Suite Executiva"
                      required
                      disabled={loading}
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="slug" className="text-sm font-medium">
                      URL amigável (slug)
                    </Label>
                    <div className="flex gap-2 mt-2">
                      <Input
                        id="slug"
                        value={formData.slug}
                        onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                        placeholder="suite-executiva"
                        disabled={loading}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setFormData((prev) => ({ ...prev, slug: slugFromName(prev.name || "") }))}
                      >
                        Gerar do nome
                      </Button>
                    </div>
                    {formData.slug && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {slugValidation.isLoading ? "Verificando..." : slugValidation.isDuplicate ? "Esta URL já está em uso neste estabelecimento." : "URL disponível."}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="type" className="text-sm font-medium">
                      Tipo de acomodação:
                    </Label>
                    <Select
                      value={formData.type}
                      onValueChange={(value) => setFormData({ ...formData, type: value })}
                      disabled={loading}
                    >
                      <SelectTrigger id="type" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Alojamento">Alojamento</SelectItem>
                        <SelectItem value="Apartment">Apartment</SelectItem>
                        <SelectItem value="Bed in Dormitory">Bed in Dormitory</SelectItem>
                        <SelectItem value="Bungalow">Bungalow</SelectItem>
                        <SelectItem value="Casa 1 quarto">Casa 1 quarto</SelectItem>
                        <SelectItem value="Casa 2 quartos">Casa 2 quartos</SelectItem>
                        <SelectItem value="Casa 3 quartos">Casa 3 quartos</SelectItem>
                        <SelectItem value="Casa 4 quartos">Casa 4 quartos</SelectItem>
                        <SelectItem value="Casa 5 quartos">Casa 5 quartos</SelectItem>
                        <SelectItem value="Chalet">Chalet</SelectItem>
                        <SelectItem value="Double">Double</SelectItem>
                        <SelectItem value="Dormitory room">Dormitory room</SelectItem>
                        <SelectItem value="Familia">Familia</SelectItem>
                        <SelectItem value="Holiday home">Holiday home</SelectItem>
                        <SelectItem value="Mobile home">Mobile home</SelectItem>
                        <SelectItem value="Quadruplo">Quadruplo</SelectItem>
                        <SelectItem value="Single">Single</SelectItem>
                        <SelectItem value="Studio">Studio</SelectItem>
                        <SelectItem value="Suite">Suite</SelectItem>
                        <SelectItem value="Tent">Tent</SelectItem>
                        <SelectItem value="Triple">Triple</SelectItem>
                        <SelectItem value="Twin">Twin</SelectItem>
                        <SelectItem value="Twin/Double">Twin/Double</SelectItem>
                        <SelectItem value="Villa">Villa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="standard_occupancy" className="text-sm font-medium">
                      Ocupação padrão:
                    </Label>
                    <Select
                      value={formData.standard_occupancy}
                      onValueChange={(value) => setFormData({ ...formData, standard_occupancy: value })}
                      disabled={loading}
                    >
                      <SelectTrigger id="standard_occupancy" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {guestOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="capacity_adults" className="text-sm font-medium">
                      Máximo de Adultos:
                    </Label>
                    <Select
                      value={formData.capacity_adults}
                      onValueChange={(value) => setFormData({ ...formData, capacity_adults: value })}
                      disabled={loading}
                    >
                      <SelectTrigger id="capacity_adults" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {guestOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Coluna 2 */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="abbreviation" className="text-sm font-medium">
                      Abreviatura da categoria:
                    </Label>
                    <Input
                      id="abbreviation"
                      value={formData.abbreviation}
                      onChange={(e) => setFormData({ ...formData, abbreviation: e.target.value })}
                      placeholder="Executiva"
                      disabled={loading}
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="size_sqm" className="text-sm font-medium">
                      Tamanho (m²):
                    </Label>
                    <Input
                      id="size_sqm"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.size_sqm}
                      onChange={(e) => setFormData({ ...formData, size_sqm: e.target.value })}
                      placeholder="14"
                      disabled={loading}
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="minimum_occupancy" className="text-sm font-medium">
                      Ocupação Mínima:
                    </Label>
                    <Select
                      value={formData.minimum_occupancy}
                      onValueChange={(value) => setFormData({ ...formData, minimum_occupancy: value })}
                      disabled={loading}
                    >
                      <SelectTrigger id="minimum_occupancy" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {guestOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="capacity_children" className="text-sm font-medium">
                      Máximo de Crianças:
                    </Label>
                    <Select
                      value={formData.capacity_children}
                      onValueChange={(value) => setFormData({ ...formData, capacity_children: value })}
                      disabled={loading}
                    >
                      <SelectTrigger id="capacity_children" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {childrenOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="courtesy_age" className="text-sm font-medium">
                      Idade Cortesia:
                    </Label>
                    <Input
                      id="courtesy_age"
                      type="number"
                      min="0"
                      max="18"
                      value={formData.courtesy_age}
                      onChange={(e) => setFormData({ ...formData, courtesy_age: e.target.value })}
                      placeholder="2"
                      disabled={loading}
                      className="mt-2"
                    />
                  </div>
                </div>

                {/* Coluna 3 */}
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="day_use" className="text-sm font-medium">
                      Day Use:
                    </Label>
                    <Select
                      value={formData.day_use ? "Sim" : "Não"}
                      onValueChange={(value) => setFormData({ ...formData, day_use: value === "Sim" })}
                      disabled={loading}
                    >
                      <SelectTrigger id="day_use" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Não">Não</SelectItem>
                        <SelectItem value="Sim">Sim</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="color" className="text-sm font-medium">
                      Cor:
                    </Label>
                    <div className="flex gap-2 mt-2">
                      <Input
                        id="color"
                        type="color"
                        value={formData.color}
                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                        disabled={loading}
                        className="w-20 h-10"
                      />
                      <Input
                        type="text"
                        value={formData.color}
                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                        placeholder="#445d85"
                        disabled={loading}
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="privacy" className="text-sm font-medium">
                      Privacidade:
                    </Label>
                    <Select
                      value={formData.privacy}
                      onValueChange={(value) => setFormData({ ...formData, privacy: value })}
                      disabled={loading}
                    >
                      <SelectTrigger id="privacy" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Quarto Privado">Quarto Privado</SelectItem>
                        <SelectItem value="Quarto Compartilhado">Quarto Compartilhado</SelectItem>
                        <SelectItem value="Dormitório">Dormitório</SelectItem>
                        <SelectItem value="Outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="accommodation_quantity" className="text-sm font-medium">
                      Quantidade de Acomodação:
                    </Label>
                    <Input
                      id="accommodation_quantity"
                      type="number"
                      min="1"
                      value={formData.accommodation_quantity}
                      onChange={(e) => setFormData({ ...formData, accommodation_quantity: e.target.value })}
                      placeholder="10"
                      disabled={loading}
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="maximum_occupancy" className="text-sm font-medium">
                      Ocupação Máxima:
                    </Label>
                    <Select
                      value={formData.maximum_occupancy}
                      onValueChange={(value) => setFormData({ ...formData, maximum_occupancy: value })}
                      disabled={loading}
                    >
                      <SelectTrigger id="maximum_occupancy" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {guestOptions.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="courtesy_limit" className="text-sm font-medium">
                      Limite de Cortesia:
                    </Label>
                    <Select
                      value={formData.courtesy_limit}
                      onValueChange={(value) => setFormData({ ...formData, courtesy_limit: value })}
                      disabled={loading}
                    >
                      <SelectTrigger id="courtesy_limit" className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 11 }, (_, i) => i).map(num => (
                          <SelectItem key={num} value={num.toString()}>
                            {num}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Prédio */}
              <div>
                <Label htmlFor="building_id" className="text-sm font-medium">
                  Prédio:
                </Label>
                <Select
                  value={formData.building_id || undefined}
                  onValueChange={(value) => setFormData({ ...formData, building_id: value === "none" ? "" : value })}
                  disabled={loading}
                >
                  <SelectTrigger id="building_id" className="mt-2">
                    <SelectValue placeholder="Selecione um prédio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {buildings
                      .filter((b: any) => b.is_active)
                      .map((building: any) => (
                        <SelectItem key={building.id} value={building.id}>
                          {building.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Descrição da categoria */}
              <div>
                <Label htmlFor="rich_description" className="text-sm font-medium">
                  Descrição da categoria (Informações publicadas no motor de reservas):
                </Label>
                <Textarea
                  id="rich_description"
                  value={formData.rich_description}
                  onChange={(e) => setFormData({ ...formData, rich_description: e.target.value })}
                  placeholder="Descreva a categoria..."
                  disabled={loading}
                  className="mt-2 min-h-[200px]"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Esta descrição será exibida no motor de reservas e na página pública
                </p>
              </div>

              {/* Preço mínimo do Tarifário */}
              <div>
                <Label htmlFor="base_price" className="text-sm font-medium">
                  Preço mínimo do Tarifário:
                </Label>
                <div className="relative mt-2">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-600 font-semibold">
                    R$
                  </span>
                  <Input
                    id="base_price"
                    type="text"
                    value={formData.base_price}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^\d.,]/g, "");
                      setFormData({ ...formData, base_price: value });
                    }}
                    placeholder="0,00"
                    disabled={loading}
                    className="pl-10"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="facilities" className="space-y-4">
              <div className="p-4 border rounded-lg">
                {publicDisplayData.features.length > 0 ? (
                  <>
                    <p className="text-sm text-muted-foreground mb-3">
                      Instalações configuradas na seção "Configuração da Página Pública de Reservas":
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {publicDisplayData.features.map((feature, index) => (
                        <span
                          key={`${feature}-${index}`}
                          className="inline-flex items-center rounded-md border px-2 py-1 text-xs text-slate-700 bg-slate-50"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma instalação configurada para esta categoria na Página Pública de Reservas.
                  </p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="images" className="space-y-4">
              <div className="p-4 border rounded-lg">
                {publicDisplayData.photos.length > 0 ? (
                  <>
                    <p className="text-sm text-muted-foreground mb-3">
                      Imagens configuradas na seção "Configuração da Página Pública de Reservas":
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {publicDisplayData.photos.map((photoUrl, index) => (
                        <img
                          key={`${photoUrl}-${index}`}
                          src={photoUrl}
                          alt={`Imagem da categoria ${index + 1}`}
                          className="w-full h-24 object-cover rounded-md border"
                        />
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma imagem configurada para esta categoria na Página Pública de Reservas.
                  </p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="rooms" className="space-y-4">
              {savedCategoryId && createdRooms.length > 0 ? (
                <RoomsTable
                  rooms={createdRooms}
                  categoryId={savedCategoryId}
                  onUpdate={() => {
                    loadRooms();
                    queryClient.invalidateQueries({ queryKey: ["rooms"] });
                  }}
                />
              ) : (
                <div className="p-4 border rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Crie a categoria com uma quantidade de acomodações para ver os quartos aqui.
                  </p>
                </div>
              )}
            </TabsContent>

            {/* Botões */}
            <div className="flex items-center justify-between pt-4 border-t">
              <div>
                {categoryId && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={loading}
                    className="bg-pink-500 hover:bg-pink-600"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Deletar
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={loading || !formData.name}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {loading ? (
                    "Salvando..."
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Salvar
                    </>
                  )}
                </Button>
              </div>
            </div>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
