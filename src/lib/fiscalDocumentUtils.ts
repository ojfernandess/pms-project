import jsPDF from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Valida CNPJ
 */
export function validateCNPJ(cnpj: string): boolean {
  const cleanCNPJ = cnpj.replace(/\D/g, "");
  
  if (cleanCNPJ.length !== 14) return false;
  
  // Verificar se todos os dígitos são iguais
  if (/^(\d)\1+$/.test(cleanCNPJ)) return false;
  
  // Validar dígitos verificadores
  let length = cleanCNPJ.length - 2;
  let numbers = cleanCNPJ.substring(0, length);
  const digits = cleanCNPJ.substring(length);
  let sum = 0;
  let pos = length - 7;
  
  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;
  
  length = length + 1;
  numbers = cleanCNPJ.substring(0, length);
  sum = 0;
  pos = length - 7;
  
  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(1))) return false;
  
  return true;
}

/**
 * Formata CNPJ
 */
export function formatCNPJ(cnpj: string): string {
  const cleanCNPJ = cnpj.replace(/\D/g, "");
  if (cleanCNPJ.length !== 14) return cnpj;
  return cleanCNPJ.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

/**
 * Gera PDF do recibo
 */
/**
 * Formata CPF
 */
function formatCPF(cpf: string): string {
  const cleanCPF = cpf.replace(/\D/g, "");
  if (cleanCPF.length !== 11) return cpf;
  return cleanCPF.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

export async function generateReceiptPDF(data: {
  guestName: string;
  guestCPF?: string; // CPF do hóspede
  companyName?: string; // Nome da empresa (para pessoa jurídica)
  companyCNPJ?: string; // CNPJ da empresa (para pessoa jurídica)
  guestAddress?: string;
  checkinDate: string;
  checkoutDate: string;
  paidAmount: number;
  establishmentName: string;
  establishmentAddress?: string;
  establishmentCNPJ?: string;
  establishmentPhone?: string;
  establishmentEmail?: string; // Email de contato
  establishmentWebsite?: string; // Site do estabelecimento
  establishmentLogo?: string;
  establishmentSignature?: string;
  showEstablishmentCNPJ?: boolean; // Mostrar CNPJ do estabelecimento no recibo
  roomNumber?: string;
  roomCategory?: string; // Categoria do quarto
  bookingChannel?: string; // Canal de reserva (PMS/Balcão ou OTA)
}): Promise<void> {
  const doc = new jsPDF();
  
  // Configurações
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  let yPosition = margin;
  
  // Logo do estabelecimento (se disponível) - menor e mais compacto
  if (data.establishmentLogo) {
    console.log("🖼️ Tentando carregar logo:", data.establishmentLogo);
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      await new Promise<void>((resolve) => {
        img.onload = () => {
          try {
            console.log("✅ Logo carregado com sucesso:", { width: img.width, height: img.height });
            // Redimensionar logo para caber no cabeçalho (máximo 25px de altura)
            const maxHeight = 25;
            const maxWidth = 70;
            let imgWidth = img.width;
            let imgHeight = img.height;
            
            const ratio = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
            imgWidth = imgWidth * ratio;
            imgHeight = imgHeight * ratio;
            
            // Centralizar logo
            const logoX = (pageWidth - imgWidth) / 2;
            doc.addImage(img, "PNG", logoX, yPosition, imgWidth, imgHeight);
            yPosition += imgHeight + 8;
            console.log("✅ Logo adicionado ao PDF");
          } catch (error) {
            console.error("❌ Erro ao adicionar logo:", error);
          }
          resolve();
        };
        img.onerror = (error) => {
          console.error("❌ Erro ao carregar logo:", error, "URL:", data.establishmentLogo);
          resolve();
        };
        img.src = data.establishmentLogo;
      });
    } catch (error) {
      console.error("❌ Erro ao processar logo:", error);
    }
  } else {
    console.warn("⚠️ Logo não fornecido ou vazio");
  }
  
  // Título - mais compacto
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("RECIBO", pageWidth / 2, yPosition, { align: "center" });
  yPosition += 8;
  
  // Linha separadora fina
  doc.setLineWidth(0.3);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 6;
  
  // Cabeçalho do estabelecimento - mais compacto
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(data.establishmentName, margin, yPosition);
  yPosition += 5;
  
  // Informações do estabelecimento em formato compacto
    doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  
  // CNPJ do estabelecimento (se a opção estiver habilitada)
  if (data.showEstablishmentCNPJ !== false && data.establishmentCNPJ) {
    const formattedCNPJ = formatCNPJ(data.establishmentCNPJ);
    doc.text(`CNPJ: ${formattedCNPJ}`, margin, yPosition);
    yPosition += 4;
  }
  
  // Endereço completo do estabelecimento
  if (data.establishmentAddress) {
    const addressLines = doc.splitTextToSize(data.establishmentAddress, pageWidth - 2 * margin);
    doc.text(addressLines, margin, yPosition);
    yPosition += addressLines.length * 4;
  }
  
  // Telefone, email e site em linhas compactas
  console.log("📞 Dados de contato recebidos no PDF:", {
    phone: data.establishmentPhone,
    email: data.establishmentEmail,
    website: data.establishmentWebsite,
  });
  
  const contactInfo = [];
  if (data.establishmentPhone) {
    contactInfo.push(`Tel: ${data.establishmentPhone}`);
  }
  if (data.establishmentEmail) {
    contactInfo.push(`Email: ${data.establishmentEmail}`);
  }
  if (data.establishmentWebsite) {
    // Remover http:// ou https:// se presente para exibição mais limpa
    const cleanWebsite = data.establishmentWebsite.replace(/^https?:\/\//, '');
    contactInfo.push(`Site: ${cleanWebsite}`);
  }
  
  // Se houver informações de contato, exibir em linhas separadas para melhor legibilidade
  if (contactInfo.length > 0) {
    contactInfo.forEach((info, index) => {
      doc.text(info, margin, yPosition);
      yPosition += 4;
    });
    console.log("✅ Informações de contato adicionadas ao PDF:", contactInfo);
  } else {
    console.warn("⚠️ Nenhuma informação de contato para exibir no PDF");
  }
  
  // Espaço menor
  yPosition += 3;
  
  // Linha separadora antes dos dados do recibo
  doc.setLineWidth(0.3);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 6;
  
  // Dados do recibo - formato compacto
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  
  const checkinFormatted = format(new Date(data.checkinDate), "dd/MM/yyyy", { locale: ptBR });
  const checkoutFormatted = format(new Date(data.checkoutDate), "dd/MM/yyyy", { locale: ptBR });
  
  // Para pessoa jurídica, mostrar nome do hóspede, nome da empresa e CNPJ
  if (data.companyName) {
    doc.text(`Hóspede: ${data.guestName}`, margin, yPosition);
    yPosition += 5;
    // CPF do hóspede (se disponível)
    if (data.guestCPF) {
      doc.setFontSize(9);
      const formattedCPF = formatCPF(data.guestCPF);
      doc.text(`CPF: ${formattedCPF}`, margin, yPosition);
      yPosition += 5;
    }
    doc.setFontSize(9);
    doc.text(`Empresa: ${data.companyName}`, margin, yPosition);
    yPosition += 5;
    if (data.companyCNPJ) {
      const formattedCNPJ = formatCNPJ(data.companyCNPJ);
      doc.text(`CNPJ: ${formattedCNPJ}`, margin, yPosition);
      yPosition += 5;
    }
  } else {
    doc.text(`Hóspede: ${data.guestName}`, margin, yPosition);
    yPosition += 5;
    // CPF do hóspede (se disponível)
    if (data.guestCPF) {
      doc.setFontSize(9);
      const formattedCPF = formatCPF(data.guestCPF);
      doc.text(`CPF: ${formattedCPF}`, margin, yPosition);
      yPosition += 5;
    }
  }
  
  // Endereço do hóspede (se disponível) - mais compacto
  if (data.guestAddress) {
    doc.setFontSize(9);
    const addressLines = doc.splitTextToSize(data.guestAddress, pageWidth - 2 * margin);
    doc.text(addressLines, margin, yPosition);
    yPosition += addressLines.length * 4;
  }
  
  // Informações da hospedagem em formato compacto
  doc.setFontSize(9);
  const stayInfo = [];
  if (data.roomNumber) {
    stayInfo.push(`Quarto: ${data.roomNumber}`);
  }
  if (data.roomCategory) {
    stayInfo.push(`Categoria: ${data.roomCategory}`);
  }
  stayInfo.push(`Check-in: ${checkinFormatted}`);
  stayInfo.push(`Check-out: ${checkoutFormatted}`);
  if (data.bookingChannel) {
    stayInfo.push(`Canal: ${data.bookingChannel}`);
  }
  
  // Mostrar informações em linhas separadas mas compactas
  stayInfo.forEach((info) => {
    doc.text(info, margin, yPosition);
    yPosition += 4;
  });
  
  // Valor - destacado
  yPosition += 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const formattedAmount = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(data.paidAmount);
  
  doc.text(`Valor pago: ${formattedAmount}`, margin, yPosition);
  yPosition += 10;
  
  // Linha separadora fina
  doc.setLineWidth(0.3);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 6;
  
  // Data e assinatura - mais compacto
  const today = format(new Date(), "dd/MM/yyyy", { locale: ptBR });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Data de emissão: ${today}`, margin, yPosition);
  yPosition += 10;
  
  // Assinatura digital (se disponível)
  if (data.establishmentSignature) {
    console.log("✍️ Tentando carregar assinatura:", data.establishmentSignature);
    try {
      const signatureImg = new Image();
      signatureImg.crossOrigin = "anonymous";
      
      await new Promise<void>((resolve) => {
        signatureImg.onload = () => {
          try {
            console.log("✅ Assinatura carregada com sucesso:", { width: signatureImg.width, height: signatureImg.height });
            // Tamanho máximo da assinatura: 35px de altura, largura proporcional (mais compacto)
            const maxHeight = 35;
            const maxWidth = 100;
            let imgWidth = signatureImg.width;
            let imgHeight = signatureImg.height;
            
            const ratio = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
            imgWidth = imgWidth * ratio;
            imgHeight = imgHeight * ratio;
            
            // Posicionar assinatura centralizada ou à esquerda (no campo de assinatura)
            const signatureX = margin;
            doc.addImage(signatureImg, "PNG", signatureX, yPosition, imgWidth, imgHeight);
            yPosition += imgHeight + 5;
            
            // Adicionar texto "Assinatura" abaixo da imagem
            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.text("Assinatura", margin, yPosition);
            console.log("✅ Assinatura adicionada ao PDF");
          } catch (error) {
            console.error("❌ Erro ao adicionar assinatura:", error);
            // Fallback para linha de assinatura
            doc.text("_________________________", margin, yPosition);
            yPosition += 5;
            doc.text("Assinatura", margin, yPosition);
          }
          resolve();
        };
        signatureImg.onerror = (error) => {
          console.error("❌ Erro ao carregar assinatura:", error, "URL:", data.establishmentSignature);
          // Fallback para linha de assinatura
          doc.text("_________________________", margin, yPosition);
          yPosition += 5;
          doc.text("Assinatura", margin, yPosition);
          resolve();
        };
        signatureImg.src = data.establishmentSignature;
      });
    } catch (error) {
      console.error("❌ Erro ao processar assinatura:", error);
      // Fallback para linha de assinatura
      doc.text("_________________________", margin, yPosition);
      yPosition += 5;
      doc.text("Assinatura", margin, yPosition);
    }
  } else {
    console.warn("⚠️ Assinatura não fornecida ou vazia");
    // Se não houver assinatura digital, usar linha de assinatura
  doc.text("_________________________", margin, yPosition);
  yPosition += 5;
  doc.text("Assinatura", margin, yPosition);
  }
  
  // Baixar PDF
  doc.save(`recibo-${data.guestName.replace(/\s/g, "-")}-${today.replace(/\//g, "-")}.pdf`);
}

