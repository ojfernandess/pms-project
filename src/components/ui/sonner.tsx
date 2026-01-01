import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <>
      <style>{`
        [data-sonner-toast] [data-close-button] {
          color: rgb(37 99 235) !important;
          opacity: 0.8;
          transition: all 0.2s ease;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        @media (min-width: 768px) {
          [data-sonner-toast] [data-close-button] {
            width: 24px;
            height: 24px;
          }
        }
        
        [data-sonner-toast] [data-close-button]:hover {
          color: rgb(29 78 216) !important;
          opacity: 1;
        }
        
        [data-sonner-toast] [data-close-button] svg {
          width: 16px;
          height: 16px;
        }
        
        @media (min-width: 768px) {
          [data-sonner-toast] [data-close-button] svg {
            width: 20px;
            height: 20px;
          }
        }
        
        /* Estilo customizado para toast de info com cor azul diferenciada */
        [data-sonner-toast][data-type="info"].bg-blue-50 [data-close-button] {
          color: rgb(30 58 138) !important;
          opacity: 1 !important;
          background-color: rgba(255, 255, 255, 0.5);
          border-radius: 4px;
          padding: 2px;
        }
        
        [data-sonner-toast][data-type="info"].bg-blue-50 [data-close-button]:hover {
          color: rgb(15 23 42) !important;
          background-color: rgba(255, 255, 255, 0.8);
        }
      `}</style>
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
        closeButton
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
            closeButton: "group-[.toast]:bg-transparent",
        },
      }}
      {...props}
    />
    </>
  );
};

export { Toaster, toast };
