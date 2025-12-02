import { Menu, Search, User, Settings, LogOut, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useParams } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { NotificationsDropdown } from "./NotificationsDropdown";
import { LanguageSelector } from "./LanguageSelector";
import { useTranslation } from "react-i18next";

interface HeaderProps {
  onMenuClick: () => void;
}

export const Header = ({ onMenuClick }: HeaderProps) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { establishmentId } = useParams<{ establishmentId?: string }>();
  const { selectedEstablishment } = useEstablishment();
  const { t } = useTranslation();
  
  // Usar establishmentId da URL ou do contexto (numeric_id)
  const currentEstablishmentId = establishmentId || (selectedEstablishment?.numeric_id?.toString());
  
  // Extrair nome do usuário do email ou metadata
  const getUserName = () => {
    if (user?.user_metadata?.full_name) {
      return user.user_metadata.full_name;
    }
    if (user?.email) {
      return user.email.split("@")[0];
    }
    return t("header.user");
  };

  // Obter iniciais para o avatar
  const getInitials = () => {
    const name = getUserName();
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  const handleProfile = () => {
    if (currentEstablishmentId) {
      navigate(`/${currentEstablishmentId}/perfil`);
    } else {
      navigate("/user-dashboard");
    }
  };

  const handleSettings = () => {
    if (currentEstablishmentId) {
      navigate(`/${currentEstablishmentId}/configuracoes`);
    } else {
      navigate("/user-dashboard");
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };
  
  return (
    <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 sticky top-0 z-30">
      <div className="flex items-center gap-4 flex-1">
        <Button variant="ghost" size="icon" onClick={onMenuClick}>
          <Menu className="h-5 w-5" />
        </Button>
        <div className="relative max-w-md w-full">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder={t("header.searchPlaceholder")} 
            className="pl-10"
          />
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <LanguageSelector />
        <NotificationsDropdown />
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full h-9 w-9">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="font-medium">{getUserName()}</span>
                <span className="text-xs text-muted-foreground">{user?.email || t("header.noEmail")}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleProfile}>
              <UserCircle className="h-4 w-4 mr-2" />
              {t("header.myProfile")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleSettings}>
              <Settings className="h-4 w-4 mr-2" />
              {t("header.settings")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleSignOut} className="text-destructive">
              <LogOut className="h-4 w-4 mr-2" />
              {t("header.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};
