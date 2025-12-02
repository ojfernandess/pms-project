import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Bed, Wrench, Lock, Sparkles } from "lucide-react";

interface RoomCardProps {
  room: any;
  onClick?: () => void;
}

const statusConfig = {
  available: {
    label: "Disponível",
    color: "bg-available text-available-foreground",
    icon: Bed,
  },
  occupied: {
    label: "Ocupado",
    color: "bg-occupied text-white",
    icon: Bed,
  },
  cleaning: {
    label: "Limpeza",
    color: "bg-cleaning text-cleaning-foreground",
    icon: Sparkles,
  },
  maintenance: {
    label: "Manutenção",
    color: "bg-maintenance text-maintenance-foreground",
    icon: Wrench,
  },
  blocked: {
    label: "Bloqueado",
    color: "bg-blocked text-white",
    icon: Lock,
  },
};

export const RoomCard = ({ room, onClick }: RoomCardProps) => {
  const config = statusConfig[room.status as keyof typeof statusConfig];
  const Icon = config.icon;
  const isBlocked = room.is_blocked === true;

  return (
    <Card 
      className={cn(
        "p-4 hover:shadow-lg transition-all cursor-pointer relative", 
        config.color,
        isBlocked && "opacity-75 border-2 border-red-500",
        onClick && "hover:scale-105"
      )}
      onClick={onClick}
    >
      {isBlocked && (
        <div className="absolute top-2 right-2 bg-red-600 text-white rounded-full p-1.5">
          <Lock className="h-4 w-4" />
        </div>
      )}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-2xl font-bold">{room.name || room.room_number}</h3>
          <p className="text-sm opacity-90">{room.room_categories?.name}</p>
        </div>
        <Icon className="h-5 w-5" />
      </div>
      <div className="mt-3 pt-3 border-t border-current/20">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-xs">
            {config.label}
          </Badge>
          {isBlocked && (
            <Badge variant="destructive" className="text-xs flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Interditado
            </Badge>
          )}
        </div>
        {room.floor && (
          <p className="text-xs mt-2 opacity-75">Andar {room.floor}</p>
        )}
      </div>
    </Card>
  );
};
