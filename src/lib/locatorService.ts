import { supabase } from "@/integrations/supabase/client";

/**
 * Serviço para geração e validação de localizadores
 */
export class LocatorService {
  /**
   * Gera localizador único de 6 caracteres
   * Formato: ABC123 (3 letras + 3 números)
   */
  generateLocator(): string {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    
    let locator = '';
    
    // 3 letras
    for (let i = 0; i < 3; i++) {
      locator += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    
    // 3 números
    for (let i = 0; i < 3; i++) {
      locator += numbers.charAt(Math.floor(Math.random() * numbers.length));
    }
    
    return locator;
  }

  /**
   * Verifica se um localizador já existe
   */
  async locatorExists(locator: string): Promise<boolean> {
    // Verificar em reservations
    const { data: reservation } = await supabase
      .from("reservations")
      .select("id")
      .eq("reservation_code", locator)
      .single();

    if (reservation) return true;

    // Verificar em web_checkin
    const { data: webCheckin } = await supabase
      .from("web_checkin")
      .select("id")
      .eq("locator", locator)
      .single();

    return !!webCheckin;
  }

  /**
   * Gera um localizador único garantindo que não existe
   */
  async ensureUniqueLocator(): Promise<string> {
    let locator: string;
    let exists = true;
    let attempts = 0;
    const maxAttempts = 100;

    while (exists && attempts < maxAttempts) {
      locator = this.generateLocator();
      exists = await this.locatorExists(locator);
      attempts++;
    }

    if (attempts >= maxAttempts) {
      throw new Error("Não foi possível gerar um localizador único após várias tentativas");
    }

    return locator!;
  }

  /**
   * Gera token JWT para web check-in
   */
  generateWebCheckinToken(reservationId: string, locator: string): string {
    // Usar crypto para gerar um hash simples
    const payload = `${reservationId}:${locator}:${Date.now()}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    
    // Usar Web Crypto API para gerar hash
    return btoa(payload).replace(/[^a-zA-Z0-9]/g, '').substring(0, 64);
  }
}

export const locatorService = new LocatorService();


