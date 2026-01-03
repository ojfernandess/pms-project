import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <>
      <style>{`
        [data-sonner-toast] [data-close-button] {
          background-color: #1f2937 !important;
          border-radius: 50% !important;
          width: 24px !important;
          height: 24px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 0 !important;
          margin: 0 !important;
          transition: all 0.2s ease !important;
          opacity: 1 !important;
          border: none !important;
          cursor: pointer !important;
        }
        
        @media (min-width: 768px) {
          [data-sonner-toast] [data-close-button] {
            width: 28px !important;
            height: 28px !important;
          }
        }
        
        [data-sonner-toast] [data-close-button]:hover {
          background-color: #374151 !important;
          transform: scale(1.05);
        }
        
        [data-sonner-toast] [data-close-button]:active {
          transform: scale(0.95);
        }
        
        [data-sonner-toast] [data-close-button] svg {
          width: 14px !important;
          height: 14px !important;
          color: #f97316 !important;
          stroke-width: 2.5 !important;
        }
        
        @media (min-width: 768px) {
          [data-sonner-toast] [data-close-button] svg {
            width: 16px !important;
            height: 16px !important;
          }
        }
        
        /* Estilo customizado para toast de info com cor azul diferenciada */
        [data-sonner-toast][data-type="info"].bg-blue-50 [data-close-button] {
          background-color: #1f2937 !important;
          border-radius: 50% !important;
        }
        
        [data-sonner-toast][data-type="info"].bg-blue-50 [data-close-button]:hover {
          background-color: #374151 !important;
        }
        
        [data-sonner-toast][data-type="info"].bg-blue-50 [data-close-button] svg {
          color: #f97316 !important;
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
