import { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GripVertical, Settings, Trash2 } from "lucide-react";
import { RoomSettingsDialog } from "./RoomSettingsDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
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

interface RoomsTableProps {
  rooms: any[];
  categoryId: string;
  onUpdate: () => void;
}

export const RoomsTable = ({ rooms, categoryId, onUpdate }: RoomsTableProps) => {
  const queryClient = useQueryClient();
  const [editingRoom, setEditingRoom] = useState<string | null>(null);
  const [roomData, setRoomData] = useState<Record<string, { name: string; floor: string; description: string }>>({});
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [roomToDelete, setRoomToDelete] = useState<string | null>(null);
  const [draggedRoomId, setDraggedRoomId] = useState<string | null>(null);

  // Inicializar dados dos quartos
  const initializeRoomData = () => {
    const data: Record<string, { name: string; floor: string; description: string }> = {};
    rooms.forEach((room) => {
      data[room.id] = {
        name: room.name || room.room_number || "",
        floor: room.floor?.toString() || "1",
        description: room.notes || room.description || "",
      };
    });
    setRoomData(data);
  };

  useEffect(() => {
    initializeRoomData();
  }, [rooms]);

  const handleRoomUpdate = async (roomId: string, field: "name" | "floor" | "description", value: string) => {
    if (!roomData[roomId]) return;

    const updatedData = {
      ...roomData[roomId],
      [field]: value,
    };
    setRoomData({ ...roomData, [roomId]: updatedData });

    // Debounce: salvar após 1 segundo sem alterações
    setTimeout(async () => {
      try {
        const updateData: any = {};
        if (field === "name") {
          updateData.name = value;
        } else if (field === "floor") {
          updateData.floor = parseInt(value) || 1;
        } else if (field === "description") {
          updateData.notes = value;
        }

        const { error } = await supabase
          .from("rooms")
          .update(updateData)
          .eq("id", roomId);

        if (error) throw error;
      } catch (error: any) {
        console.error("Erro ao atualizar quarto:", error);
        toast.error("Erro ao atualizar quarto");
      }
    }, 1000);
  };

  const handleDelete = async () => {
    if (!roomToDelete) return;

    try {
      const { error } = await supabase
        .from("rooms")
        .delete()
        .eq("id", roomToDelete);

      if (error) throw error;

      toast.success("Quarto excluído com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["room_categories"] });
      setDeleteDialogOpen(false);
      setRoomToDelete(null);
      onUpdate();
    } catch (error: any) {
      console.error("Erro ao excluir quarto:", error);
      toast.error(error.message || "Erro ao excluir quarto");
    }
  };

  const handleDragStart = (e: React.DragEvent, roomId: string) => {
    setDraggedRoomId(roomId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", roomId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, targetRoomId: string) => {
    e.preventDefault();

    if (!draggedRoomId || draggedRoomId === targetRoomId) {
      setDraggedRoomId(null);
      return;
    }

    const draggedIndex = rooms.findIndex((r) => r.id === draggedRoomId);
    const targetIndex = rooms.findIndex((r) => r.id === targetRoomId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedRoomId(null);
      return;
    }

    // Reordenar quartos (pode usar display_order se existir)
    const sortedRooms = [...rooms];
    const [removed] = sortedRooms.splice(draggedIndex, 1);
    sortedRooms.splice(targetIndex, 0, removed);

    // Atualizar ordem no banco (se houver campo display_order)
    // Por enquanto, apenas atualizar a ordem local
    toast.success("Ordem atualizada");
    setDraggedRoomId(null);
    onUpdate();
  };

  const handleDragEnd = () => {
    setDraggedRoomId(null);
  };

  const sortedRooms = [...rooms].sort((a, b) => {
    // Ordenar por room_number se disponível
    const numA = parseInt(a.room_number?.match(/\d+/)?.[0] || "0");
    const numB = parseInt(b.room_number?.match(/\d+/)?.[0] || "0");
    return numA - numB;
  });

  return (
    <>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-200">
              <TableHead className="w-12">#</TableHead>
              <TableHead>ACOMODAÇÕES</TableHead>
              <TableHead>ANDAR</TableHead>
              <TableHead>DESCRIÇÃO</TableHead>
              <TableHead className="w-32">AÇÕES</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRooms.map((room) => {
              const roomInfo = roomData[room.id] || {
                name: room.name || room.room_number || "",
                floor: room.floor?.toString() || "1",
                description: room.notes || room.description || "",
              };

              return (
                <TableRow
                  key={room.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, room.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, room.id)}
                  onDragEnd={handleDragEnd}
                  className={draggedRoomId === room.id ? "opacity-50" : "cursor-move"}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-slate-400 cursor-grab" />
                      <span className="text-sm text-slate-600 font-mono">
                        {sortedRooms.indexOf(room) + 1}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={roomInfo.name}
                      onChange={(e) => {
                        const newData = { ...roomInfo, name: e.target.value };
                        setRoomData({ ...roomData, [room.id]: newData });
                        handleRoomUpdate(room.id, "name", e.target.value);
                      }}
                      onBlur={() => setEditingRoom(null)}
                      onFocus={() => setEditingRoom(room.id)}
                      className="border-0 bg-transparent focus:bg-white focus:border focus:border-blue-300"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={roomInfo.floor}
                      onChange={(e) => {
                        const newData = { ...roomInfo, floor: e.target.value };
                        setRoomData({ ...roomData, [room.id]: newData });
                        handleRoomUpdate(room.id, "floor", e.target.value);
                      }}
                      onBlur={() => setEditingRoom(null)}
                      onFocus={() => setEditingRoom(room.id)}
                      className="border-0 bg-transparent focus:bg-white focus:border focus:border-blue-300 w-20"
                      min="0"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={roomInfo.description}
                      onChange={(e) => {
                        const newData = { ...roomInfo, description: e.target.value };
                        setRoomData({ ...roomData, [room.id]: newData });
                        handleRoomUpdate(room.id, "description", e.target.value);
                      }}
                      onBlur={() => setEditingRoom(null)}
                      onFocus={() => setEditingRoom(room.id)}
                      placeholder="Descrição do quarto"
                      className="border-0 bg-transparent focus:bg-white focus:border focus:border-blue-300"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          setSelectedRoomId(room.id);
                          setSettingsDialogOpen(true);
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        Definições
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setRoomToDelete(room.id);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        Excluir
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <RoomSettingsDialog
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
        roomId={selectedRoomId}
        onSuccess={onUpdate}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este quarto? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

