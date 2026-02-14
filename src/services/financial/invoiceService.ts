/**
 * Serviço de Faturas
 */

import { supabase } from "@/integrations/supabase/client";

export interface Invoice {
  id: string;
  establishment_id: string;
  reservation_id?: string;
  client_id?: string;
  accounts_receivable_id?: string;
  invoice_number: string;
  series: string;
  issue_date: string;
  due_date: string;
  total_amount: number;
  paid_amount: number;
  type: 'reservation' | 'penalty' | 'service' | 'refund' | 'other';
  status: 'draft' | 'issued' | 'paid' | 'cancelled' | 'overdue';
  client_name: string;
  client_document?: string;
  client_email?: string;
  client_address?: any;
  items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total: number;
  }>;
  metadata?: any;
  notes?: string;
  pdf_url?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  issued_by?: string;
  issued_at?: string;
}

export interface CreateInvoiceParams {
  establishment_id: string;
  reservation_id?: string;
  client_id?: string;
  accounts_receivable_id?: string;
  issue_date?: string;
  due_date: string;
  type: Invoice['type'];
  client_name: string;
  client_document?: string;
  client_email?: string;
  client_address?: any;
  items: Invoice['items'];
  notes?: string;
  metadata?: any;
}

/**
 * Gerar número de fatura (sequencial)
 */
async function generateInvoiceNumber(
  establishmentId: string,
  series: string = 'A'
): Promise<string> {
  try {
    // Buscar última fatura da série
    const { data: lastInvoice } = await supabase
      .from("invoices")
      .select("invoice_number")
      .eq("establishment_id", establishmentId)
      .eq("series", series)
      .order("invoice_number", { ascending: false })
      .limit(1)
      .single();

    let nextNumber = 1;
    if (lastInvoice?.invoice_number) {
      const lastNumber = parseInt(lastInvoice.invoice_number.replace(/\D/g, '')) || 0;
      nextNumber = lastNumber + 1;
    }

    // Formato: 000001, 000002, etc.
    return nextNumber.toString().padStart(6, '0');
  } catch (error) {
    // Se não houver fatura anterior, começar do 1
    return '000001';
  }
}

/**
 * Criar fatura
 */
export async function createInvoice(
  params: CreateInvoiceParams
): Promise<{ success: boolean; data?: Invoice; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    // Calcular total dos itens
    const totalAmount = params.items.reduce((sum, item) => sum + item.total, 0);

    // Gerar número da fatura
    const invoiceNumber = await generateInvoiceNumber(params.establishment_id);

    const { data, error } = await supabase
      .from("invoices")
      .insert({
        ...params,
        invoice_number: invoiceNumber,
        series: 'A',
        issue_date: params.issue_date || new Date().toISOString().split('T')[0],
        total_amount: totalAmount,
        paid_amount: 0,
        status: 'draft',
        created_by: user?.id,
      })
      .select()
      .single();

    if (error) throw error;

    return { success: true, data };
  } catch (error: any) {
    console.error("Erro ao criar fatura:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Criar fatura a partir de conta a receber
 */
export async function createInvoiceFromReceivable(
  receivableId: string
): Promise<{ success: boolean; data?: Invoice; error?: string }> {
  try {
    // Buscar conta a receber
    const { data: receivable, error: recError } = await supabase
      .from("accounts_receivable")
      .select(`
        *,
        reservation:reservations(*),
        client:clients(*)
      `)
      .eq("id", receivableId)
      .single();

    if (recError) throw recError;
    if (!receivable) throw new Error("Conta a receber não encontrada");

    // Buscar dados do cliente
    const clientName = (receivable as any).client?.full_name || 
                      (receivable as any).reservation?.guest_name || 
                      "Cliente";
    const clientDocument = (receivable as any).client?.document;
    const clientEmail = (receivable as any).client?.email;

    // Criar itens da fatura
    const items = [{
      description: receivable.description,
      quantity: 1,
      unit_price: receivable.amount,
      total: receivable.amount,
    }];

    const invoice = await createInvoice({
      establishment_id: receivable.establishment_id,
      reservation_id: receivable.reservation_id || undefined,
      client_id: receivable.client_id || undefined,
      accounts_receivable_id: receivableId,
      due_date: receivable.due_date,
      type: receivable.type === 'reservation' ? 'reservation' : 
            receivable.origin.includes('penalty') ? 'penalty' : 'service',
      client_name: clientName,
      client_document: clientDocument,
      client_email: clientEmail,
      items,
    });

    if (invoice.success && invoice.data) {
      // Atualizar conta a receber com ID da fatura
      await supabase
        .from("accounts_receivable")
        .update({
          metadata: {
            ...(receivable.metadata || {}),
            invoice_id: invoice.data.id,
          },
        })
        .eq("id", receivableId);
    }

    return invoice;
  } catch (error: any) {
    console.error("Erro ao criar fatura de conta a receber:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Emitir fatura
 */
export async function issueInvoice(
  invoiceId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("invoices")
      .update({
        status: 'issued',
        issued_by: user?.id,
        issued_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error("Erro ao emitir fatura:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Registrar pagamento de fatura
 */
export async function payInvoice(
  invoiceId: string,
  amount: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: invoice, error: fetchError } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (fetchError) throw fetchError;
    if (!invoice) throw new Error("Fatura não encontrada");

    const newPaidAmount = Number(invoice.paid_amount || 0) + amount;
    const totalAmount = Number(invoice.total_amount);

    let newStatus: Invoice['status'] = invoice.status;
    if (newPaidAmount >= totalAmount) {
      newStatus = 'paid';
    }

    const { error } = await supabase
      .from("invoices")
      .update({
        paid_amount: newPaidAmount,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    if (error) throw error;

    // Se houver conta a receber vinculada, atualizar também
    if (invoice.accounts_receivable_id) {
      await supabase
        .from("accounts_receivable")
        .update({
          paid_amount: newPaidAmount,
          status: newStatus === 'paid' ? 'paid' : 'partial',
          paid_date: newStatus === 'paid' ? new Date().toISOString().split('T')[0] : null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoice.accounts_receivable_id);
    }

    return { success: true };
  } catch (error: any) {
    console.error("Erro ao registrar pagamento:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Buscar faturas
 */
export async function getInvoices(
  establishmentId: string,
  filters?: {
    status?: Invoice['status'];
    type?: Invoice['type'];
    startDate?: string;
    endDate?: string;
  }
): Promise<{ success: boolean; data?: Invoice[]; error?: string }> {
  try {
    let query = supabase
      .from("invoices")
      .select("*")
      .eq("establishment_id", establishmentId);

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    if (filters?.type) {
      query = query.eq("type", filters.type);
    }

    if (filters?.startDate) {
      query = query.gte("issue_date", filters.startDate);
    }

    if (filters?.endDate) {
      query = query.lte("issue_date", filters.endDate);
    }

    query = query.order("issue_date", { ascending: false });

    const { data, error } = await query;

    if (error) throw error;

    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error("Erro ao buscar faturas:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Cancelar fatura
 */
export async function cancelInvoice(
  invoiceId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("invoices")
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);

    if (error) throw error;

    return { success: true };
  } catch (error: any) {
    console.error("Erro ao cancelar fatura:", error);
    return { success: false, error: error.message };
  }
}

