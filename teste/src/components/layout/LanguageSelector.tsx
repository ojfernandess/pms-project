import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";
import "flag-icons/css/flag-icons.min.css";

const languages = [
  { code: "pt-BR", label: "Português (BR)", flagCode: "br" },
  { code: "en", label: "English", flagCode: "us" },
  { code: "es", label: "Español", flagCode: "es" },
];

export const LanguageSelector = () => {
  const { i18n, t } = useTranslation();

  const currentLanguage = languages.find((lang) => lang.code === i18n.language) || languages[0];

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode);
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground hidden sm:inline-block">
              {t("languageSelector.chooseLanguage")}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 flex items-center justify-center hover:bg-accent/50 transition-colors" aria-label={t("languageSelector.tooltip")}>
                  <span 
                    className={`fi fi-${currentLanguage.flagCode} fis`} 
                    style={{ 
                      fontSize: '1.5rem',
                      borderRadius: '4px',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
                      border: '1px solid rgba(0, 0, 0, 0.08)',
                      display: 'inline-block',
                      overflow: 'hidden'
                    }}
                  ></span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {languages.map((lang) => (
                  <DropdownMenuItem
                    key={lang.code}
                    onClick={() => handleLanguageChange(lang.code)}
                    className={`flex items-center gap-3 py-2.5 ${i18n.language === lang.code ? "bg-accent font-medium" : ""}`}
                  >
                    <span 
                      className={`fi fi-${lang.flagCode} fis flex-shrink-0`} 
                      style={{ 
                        fontSize: '1.25rem',
                        borderRadius: '4px',
                        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08)',
                        border: '1px solid rgba(0, 0, 0, 0.06)',
                        display: 'inline-block',
                        overflow: 'hidden',
                        width: '1.75rem',
                        height: '1.25rem',
                        objectFit: 'cover'
                      }}
                    ></span>
                    <span className="flex-1">{lang.label}</span>
                    {i18n.language === lang.code && (
                      <span className="ml-auto text-xs text-primary font-semibold">✓</span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end">
          <p className="text-xs">{t("languageSelector.tooltip")}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

