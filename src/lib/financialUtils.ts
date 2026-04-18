import { formatCurrency } from "./reservationUtils";

export { formatCurrency };

/**
 * Calcula a variação percentual entre dois valores
 */
export const calculatePercentageChange = (current: number, previous: number): number => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

/**
 * Formata variação percentual
 */
export const formatPercentageChange = (change: number): string => {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
};

/**
 * Obtém período do mês atual
 */
export const getCurrentMonthPeriod = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
};

/**
 * Obtém período da semana atual
 */
export const getCurrentWeekPeriod = () => {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Ajusta para segunda-feira
  const start = new Date(now.setDate(diff));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
};

/**
 * Obtém período do ano atual
 */
export const getCurrentYearPeriod = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear(), 11, 31);
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
};

/**
 * Formata nome do método de pagamento
 */
export const formatPaymentMethod = (method: string): string => {
  const methodMap: Record<string, string> = {
    credit_card: "Cartão de Crédito",
    debit_card: "Cartão de Débito",
    pix: "PIX",
    cash: "Dinheiro",
    bank_transfer: "Transferência Bancária",
    other: "Outro",
  };
  return methodMap[method.toLowerCase()] || method;
};

/**
 * Formata nome do canal
 */
export const formatChannel = (channel: string): string => {
  const channelMap: Record<string, string> = {
    direct: "Direto",
    booking: "Booking.com",
    airbnb: "Airbnb",
    expedia: "Expedia",
    other: "Outro",
  };
  return channelMap[channel.toLowerCase()] || channel;
};

/**
 * Exporta dados para CSV
 */
export const exportToCSV = (data: any[], filename: string) => {
  if (!data || data.length === 0) return;

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(","),
    ...data.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          if (value === null || value === undefined) return "";
          if (typeof value === "object") return JSON.stringify(value);
          return `"${String(value).replace(/"/g, '""')}"`;
        })
        .join(",")
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Exporta dados para XLSX (Excel)
 */
export const exportToXLSX = async (data: any[], filename: string, sheetName: string = "Dados") => {
  if (!data || data.length === 0) return;

  try {
    // Importação dinâmica da biblioteca xlsx
    const XLSX = await import("xlsx");
    
    // Converter dados para formato de planilha
    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // Criar workbook e adicionar worksheet
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    // Gerar arquivo Excel
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  } catch (error) {
    console.error("Erro ao exportar para XLSX:", error);
    throw error;
  }
};

/**
 * Exporta dados para PDF usando jsPDF
 */
export const exportToPDF = async (
  title: string,
  data: any[],
  columns: Array<{ key: string; label: string; width?: number }>,
  filename: string,
  additionalInfo?: { label: string; value: string }[]
) => {
  try {
    const jsPDF = (await import("jspdf")).default;
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    // Configurações
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const startY = margin + 20;
    let currentY = startY;

    // Título
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(title, margin, currentY);
    currentY += 10;

    // Informações adicionais (período, filtros, etc.)
    if (additionalInfo && additionalInfo.length > 0) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      additionalInfo.forEach((info) => {
        doc.text(`${info.label}: ${info.value}`, margin, currentY);
        currentY += 6;
      });
      currentY += 5;
    }

    // Cabeçalho da tabela
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    let xPosition = margin;
    columns.forEach((col) => {
      const width = col.width || 40;
      doc.text(col.label, xPosition, currentY);
      xPosition += width;
    });
    currentY += 7;

    // Linha separadora
    doc.setLineWidth(0.5);
    doc.line(margin, currentY - 2, pageWidth - margin, currentY - 2);
    currentY += 3;

    // Dados da tabela
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    data.forEach((row, index) => {
      // Verificar se precisa de nova página
      if (currentY > pageHeight - 20) {
        doc.addPage();
        currentY = margin + 10;
        
        // Redesenhar cabeçalho
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        xPosition = margin;
        columns.forEach((col) => {
          const width = col.width || 40;
          doc.text(col.label, xPosition, currentY);
          xPosition += width;
        });
        currentY += 7;
        doc.line(margin, currentY - 2, pageWidth - margin, currentY - 2);
        currentY += 3;
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
      }

      xPosition = margin;
      columns.forEach((col) => {
        const width = col.width || 40;
        const value = row[col.key] !== null && row[col.key] !== undefined 
          ? String(row[col.key]) 
          : "";
        // Truncar texto se muito longo
        const text = doc.splitTextToSize(value, width - 2);
        doc.text(text, xPosition, currentY);
        xPosition += width;
      });
      currentY += 7;
    });

    // Rodapé
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.text(
        `Página ${i} de ${totalPages}`,
        pageWidth - margin - 30,
        pageHeight - 10
      );
      doc.text(
        `Gerado em ${new Date().toLocaleString("pt-BR")}`,
        margin,
        pageHeight - 10
      );
    }

    // Salvar arquivo
    doc.save(`${filename}.pdf`);
  } catch (error) {
    console.error("Erro ao exportar para PDF:", error);
    throw error;
  }
};

