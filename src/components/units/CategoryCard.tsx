import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Maximize2, DollarSign, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CategoryCardProps {
  category: any;
  onClick?: () => void;
}

export const CategoryCard = ({ category, onClick }: CategoryCardProps) => {
  return (
    <Card 
      className={cn(
        "p-6 hover:shadow-lg transition-all",
        onClick && "cursor-pointer hover:scale-105"
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xl font-bold">{category.name}</h3>
        {category.buildings && (
          <Badge variant="outline" className="flex items-center gap-1">
            <Building2 className="h-3 w-3" />
            {category.buildings.name}
          </Badge>
        )}
      </div>
      {category.description && (
        <p className="text-sm text-muted-foreground mb-4">{category.description}</p>
      )}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span>{category.capacity_adults} adultos</span>
          {category.capacity_children > 0 && (
            <span className="text-muted-foreground">+ {category.capacity_children} crianças</span>
          )}
        </div>
        {category.size_sqm && (
          <div className="flex items-center gap-2 text-sm">
            <Maximize2 className="h-4 w-4 text-muted-foreground" />
            <span>{category.size_sqm}m²</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <span className="font-semibold">
            R$ {parseFloat(category.base_price).toFixed(2)}
          </span>
        </div>
        {category.bed_type && (
          <Badge variant="secondary">{category.bed_type}</Badge>
        )}
      </div>
    </Card>
  );
};
