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

