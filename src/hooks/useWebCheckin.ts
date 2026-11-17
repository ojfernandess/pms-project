import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invokePmsFunction } from "@/lib/pmsApi";
import { toast } from "sonner";
import { triggerEmail } from "@/lib/emailService";
import { logActivity } from "@/lib/activityLogger";
import {
  reservationGuestContactFields,
  reservationGuestDisplayName,
} from "@/lib/reservationChannelDisplay";
import { computeWebCheckinExpiresAt } from "@/lib/webCheckinExpiry";

export const useWebCheckin = () => {
  const queryClient = useQueryClient();

  // Buscar informações do web check-in por localizador
  // SEGURANÇA: requireAuth - se true, só busca dados se o usuário estiver autenticado
  const getWebCheckinByLocator = (locator: string, requireAuth: boolean = false) => {
    return useQuery({
      queryKey: ["web_checkin", locator],
      refetchOnMount: false, // Não refazer automaticamente ao montar (evita múltiplas verificações)
      refetchOnWindowFocus: false, // Não refazer ao focar na janela (evita verificações desnecessárias)
      staleTime: 30 * 1000, // Considerar dados válidos por 30 segundos (evita refetches desnecessários)
      refetchInterval: false, // Desabilitar refetch automático (evita verificações repetidas)
      refetchIntervalInBackground: false, // Não refazer quando a página estiver em background
      enabled: !!locator && locator.trim() !== "" && (!requireAuth || (requireAuth && !!localStorage.getItem("guest_account_id"))), // SEGURANÇA: Só habilitar se tiver locator e (não requerer auth ou requerer e estiver autenticado)
      queryFn: async () => {
        if (!locator || locator.trim() === "") return null;
        
        // SEGURANÇA: Se requireAuth for true, não buscar dados sem autenticação
        if (requireAuth) {
          // Verificar se há sessão de hóspede
          const guestAccountId = localStorage.getItem("guest_account_id");
          if (!guestAccountId) {
            throw new Error("Autenticação necessária para acessar dados da reserva");
          }
        }
        
        // Primeiro buscar o web_checkin básico pelo locator
        let webCheckinData = null;
        const { data: webCheckinByLocator, error: webCheckinError } = await supabase
          .from("web_checkin")
          .select("*")
          .eq("locator", locator.trim())
          .maybeSingle();

        if (webCheckinError) {
          console.error("Erro ao buscar web_checkin pelo locator:", webCheckinError);
        } else if (webCheckinByLocator) {
          webCheckinData = webCheckinByLocator;
        }

        // Se não encontrou pelo locator, tentar buscar pela reserva usando o reservation_code
        if (!webCheckinData) {
          const { data: reservationData, error: reservationError } = await supabase
            .from("reservations")
            .select("id, reservation_code")
            .eq("reservation_code", locator.trim())
            .maybeSingle();

          if (!reservationError && reservationData) {
            // Buscar web_checkin pelo reservation_id
            const { data: webCheckinByReservation, error: webCheckinReservationError } = await supabase
              .from("web_checkin")
              .select("*")
              .eq("reservation_id", reservationData.id)
              .maybeSingle();

            if (!webCheckinReservationError && webCheckinByReservation) {
              webCheckinData = webCheckinByReservation;
              // Atualizar o locator se estiver diferente
              if (webCheckinData.locator !== locator.trim()) {
                await supabase
                  .from("web_checkin")
                  .update({ locator: locator.trim() })
                  .eq("id", webCheckinData.id);
                webCheckinData.locator = locator.trim();
              }
            } else if (!webCheckinReservationError && !webCheckinByReservation) {
              // Se não existe web_checkin, criar um novo
              const { locatorService } = await import("@/lib/locatorService");
              const token = locatorService.generateWebCheckinToken(
                reservationData.id,
                reservationData.reservation_code
              );

              // Buscar establishment_id da reserva
              const { data: reservationFull } = await supabase
                .from("reservations")
                .select("establishment_id, checkin_date, checkout_date")
                .eq("id", reservationData.id)
                .single();

              const checkinDate = reservationFull?.checkin_date ?? new Date().toISOString();
              const expiresAt = computeWebCheckinExpiresAt(
                checkinDate,
                reservationFull?.checkout_date ?? null
              );

              const { data: newWebCheckin, error: createError } = await supabase
                .from("web_checkin")
                .insert({
                  reservation_id: reservationData.id,
                  establishment_id: reservationFull?.establishment_id || null,
                  token: token,
                  locator: locator.trim(),
                  expires_at: expiresAt,
                  status: "pending",
                })
                .select()
                .single();

              if (!createError && newWebCheckin) {
                webCheckinData = newWebCheckin;
                console.log("✅ Web check-in criado automaticamente para localizador:", locator);
              }
            }
          }
        }

        if (!webCheckinData) return null;

        // Depois buscar os dados da reserva separadamente
        const { data: reservationFullData, error: reservationError } = await supabase
          .from("reservations")
          .select(`
            id,
            reservation_code,
            identification_number,
            checkin_date,
            checkout_date,
            checkin_time,
            checkout_time,
            total_amount,
            status,
            guest_id,
            client_id,
            room_id,
            category_id,
            ota_reservations(ota_guest_name, ota_guest_email, ota_guest_phone)
          `)
          .eq("id", webCheckinData.reservation_id)
          .maybeSingle();

        // VALIDAÇÃO DE SEGURANÇA: Verificar se a reserva está vinculada a outra conta
        // Esta validação será feita no componente WebCheckin usando o accountId do usuário logado
        // Retornamos um flag para indicar que precisa verificação
        const reservationId = reservationFullData?.id;

        if (reservationError) {
          console.error("Erro ao buscar reserva:", reservationError);
          return { ...webCheckinData, reservation: null };
        }

        if (!reservationFullData) {
          console.warn("Reserva não encontrada ou sem acesso:", webCheckinData.reservation_id);
          return { ...webCheckinData, reservation: null };
        }

        // Buscar dados do hóspede
        let guest = null;
        if (reservationFullData.guest_id) {
          const { data: guestData } = await supabase
            .from("clients")
            .select("full_name, email, phone")
            .eq("id", reservationFullData.guest_id)
            .single();
          guest = guestData;
        }

        // Buscar dados do responsável financeiro
        let financialResponsible = null;
        if (reservationFullData.client_id) {
          const { data: financialData } = await supabase
            .from("clients")
            .select("full_name, email, phone")
            .eq("id", reservationFullData.client_id)
            .single();
          financialResponsible = financialData;
        }

        const displayName = reservationGuestDisplayName({
          guest: guest as { full_name?: string | null } | null,
          financial_responsible: financialResponsible as { full_name?: string | null } | null,
          ota_reservations: (reservationFullData as any).ota_reservations ?? null,
          guest_name: null,
        });
        const contact = reservationGuestContactFields({
          guest: guest as { email?: string | null; phone?: string | null } | null,
          financial_responsible: financialResponsible as { email?: string | null; phone?: string | null } | null,
          ota_reservations: (reservationFullData as any).ota_reservations ?? null,
        });
        if (!guest && (displayName !== "Hóspede" || contact.email || contact.phone)) {
          guest = {
            full_name: displayName === "Hóspede" ? null : displayName,
            email: contact.email,
            phone: contact.phone,
          };
        }

        // Buscar dados do quarto
        let rooms = null;
        if (reservationFullData.room_id) {
          const { data: roomData } = await supabase
            .from("rooms")
            .select("room_number, name, fixed_password, authentication_type")
            .eq("id", reservationFullData.room_id)
            .single();
          rooms = roomData;
        }

        // Buscar dados da categoria (incluindo capacidade e building_id)
        let roomCategories = null;
        let building = null;
        if (reservationFullData.category_id) {
          const { data: categoryData } = await supabase
            .from("room_categories")
            .select("name, capacity_adults, capacity_children, building_id")
            .eq("id", reservationFullData.category_id)
            .single();
          roomCategories = categoryData;
          
          // Se a categoria tem um prédio associado, buscar dados do prédio
          if (categoryData?.building_id) {
            try {
              const { data: buildingData, error: buildingError } = await supabase
                .from("buildings")
                .select("id, name, street, number, neighborhood, city, state, zip_code")
                .eq("id", categoryData.building_id)
                .single();
              
              if (buildingError) {
                console.error("Erro ao buscar dados do prédio:", buildingError);
                // Continuar sem os dados do prédio se houver erro
              } else {
                building = buildingData;
              }
            } catch (error) {
              console.error("Erro ao buscar dados do prédio:", error);
              // Continuar sem os dados do prédio se houver erro
            }
          }
        }

        // Buscar dados do estabelecimento
        let establishment = null;
        let establishmentIdToUse = webCheckinData.establishment_id;
        
        // Se não tiver establishment_id no web_checkin, buscar pela reserva
        if (!establishmentIdToUse && reservationFullData) {
          const { data: reservationWithEstablishment } = await supabase
            .from("reservations")
            .select("establishment_id")
            .eq("id", reservationFullData.id)
            .single();
          establishmentIdToUse = reservationWithEstablishment?.establishment_id;
        }
        
        if (establishmentIdToUse) {
          try {
            // Buscar dados básicos do estabelecimento
            const { data: establishmentData, error: establishmentError } = await supabase
              .from("establishments")
              .select("id, name")
              .eq("id", establishmentIdToUse)
              .single();
            
            if (!establishmentError && establishmentData) {
              establishment = establishmentData;
              
              // Buscar endereço do hotel_settings
              // hotel_settings usa establishment_id (UUID), não numeric_id
              let hotelSettingsData = null;
              let hotelSettingsError = null;
              
              // Primeiro tenta buscar pelo establishment_id (UUID)
              const { data: hotelSettingsByEstablishment, error: errorByEstablishment } = await supabase
                .from("hotel_settings")
                .select("street, number, neighborhood, city, state, zip_code, whatsapp_ddi, whatsapp_number, whatsapp, phone, email")
                .eq("establishment_id", establishmentIdToUse)
                .maybeSingle();
              
              if (errorByEstablishment) {
                console.error("Erro ao buscar hotel_settings por establishment_id:", errorByEstablishment);
                hotelSettingsError = errorByEstablishment;
              } else if (hotelSettingsByEstablishment) {
                hotelSettingsData = hotelSettingsByEstablishment;
              } else {
                // Se não encontrou, tenta buscar um registro genérico (sem establishment_id)
                // Isso pode acontecer se o hotel_settings não foi vinculado ao establishment ainda
                console.warn("⚠️ Nenhum hotel_settings encontrado para establishment_id:", establishmentIdToUse);
                console.log("🔄 Tentando buscar hotel_settings genérico...");
                
                const { data: hotelSettingsGeneric, error: errorGeneric } = await supabase
                  .from("hotel_settings")
                  .select("street, number, neighborhood, city, state, zip_code, whatsapp_ddi, whatsapp_number, whatsapp, phone, email")
                  .is("establishment_id", null)
                  .maybeSingle();
                
                if (errorGeneric) {
                  console.error("Erro ao buscar hotel_settings genérico:", errorGeneric);
                } else if (hotelSettingsGeneric) {
                  console.log("✅ Hotel_settings genérico encontrado");
                  hotelSettingsData = hotelSettingsGeneric;
                } else {
                  // Último recurso: buscar qualquer registro
                  const { data: hotelSettingsAny, error: errorAny } = await supabase
                    .from("hotel_settings")
                    .select("street, number, neighborhood, city, state, zip_code, whatsapp_ddi, whatsapp_number, whatsapp, phone, email")
                    .limit(1)
                    .maybeSingle();
                  
                  if (!errorAny && hotelSettingsAny) {
                    console.log("✅ Hotel_settings encontrado (qualquer registro)");
                    hotelSettingsData = hotelSettingsAny;
                  } else {
                    console.warn("⚠️ Nenhum hotel_settings encontrado em nenhuma tentativa");
                  }
                }
              }
              
              if (hotelSettingsData) {
                console.log("📋 Dados do hotel_settings encontrados:", hotelSettingsData);
                // Montar endereço completo
                const addressParts = [];
                if (hotelSettingsData.street) {
                  addressParts.push(hotelSettingsData.street);
                  if (hotelSettingsData.number) {
                    addressParts[addressParts.length - 1] += `, ${hotelSettingsData.number}`;
                  }
                }
                if (hotelSettingsData.neighborhood) {
                  addressParts.push(hotelSettingsData.neighborhood);
                }
                
                establishment.address = addressParts.length > 0 ? addressParts.join(", ") : null;
                establishment.city = hotelSettingsData.city || null;
                establishment.state = hotelSettingsData.state || null;
                establishment.zip_code = hotelSettingsData.zip_code || null;
                // Se não tiver whatsapp_ddi e whatsapp_number separados, tentar extrair do campo whatsapp
                if (hotelSettingsData.whatsapp_ddi && hotelSettingsData.whatsapp_number) {
                  establishment.whatsapp_ddi = hotelSettingsData.whatsapp_ddi;
                  establishment.whatsapp_number = hotelSettingsData.whatsapp_number;
                } else if (hotelSettingsData.whatsapp) {
                  // Tentar extrair DDI e número do campo whatsapp completo
                  const whatsappClean = hotelSettingsData.whatsapp.replace(/\D/g, "");
                  if (whatsappClean.startsWith("55") && whatsappClean.length > 10) {
                    establishment.whatsapp_ddi = "+55";
                    establishment.whatsapp_number = whatsappClean.substring(2);
                  } else if (whatsappClean.length > 0) {
                    establishment.whatsapp_number = whatsappClean;
                  }
                } else {
                  establishment.whatsapp_ddi = hotelSettingsData.whatsapp_ddi || null;
                  establishment.whatsapp_number = hotelSettingsData.whatsapp_number || null;
                }
                establishment.phone = hotelSettingsData.phone || null;
                establishment.email = hotelSettingsData.email || null;
                
                console.log("🏢 Establishment com endereço:", establishment);
              } else {
                console.warn("⚠️ Nenhum hotel_settings encontrado em nenhuma tentativa");
              }
            } else if (establishmentError) {
              console.error("Erro ao buscar estabelecimento:", establishmentError);
            }
          } catch (error) {
            console.error("Erro ao buscar estabelecimento:", error);
          }
        }

        return {
          ...webCheckinData,
          reservation: {
            ...reservationFullData,
            guest,
            financial_responsible: financialResponsible,
            rooms,
            room_categories: roomCategories,
            building: building, // Adicionar dados do prédio
          },
          establishment,
        };
      },
    });
  };

  // Buscar web check-in por token
  // SEGURANÇA: requireAuth - se true, só busca dados se o usuário estiver autenticado
  const getWebCheckinByToken = (token: string, requireAuth: boolean = false) => {
    return useQuery({
      queryKey: ["web_checkin", "token", token],
      refetchOnMount: false, // Não refazer automaticamente ao montar (evita múltiplas verificações)
      refetchOnWindowFocus: false, // Não refazer ao focar na janela (evita verificações desnecessárias)
      staleTime: 30 * 1000, // Considerar dados válidos por 30 segundos (evita refetches desnecessários)
      refetchInterval: false, // Desabilitar refetch automático (evita verificações repetidas)
      refetchIntervalInBackground: false, // Não refazer quando a página estiver em background
      enabled: !!token && (!requireAuth || requireAuth), // SEGURANÇA: Só habilitar se tiver token e (não requerer auth ou requerer e estiver autenticado)
      queryFn: async () => {
        // SEGURANÇA: Se requireAuth for true, não buscar dados sem autenticação
        if (requireAuth) {
          // Verificar se há sessão de hóspede
          const guestAccountId = localStorage.getItem("guest_account_id");
          if (!guestAccountId) {
            throw new Error("Autenticação necessária para acessar dados da reserva");
          }
        }
        
        // Primeiro buscar o web_checkin básico
        const { data: webCheckinData, error: webCheckinError } = await supabase
          .from("web_checkin")
          .select("*")
          .eq("token", token)
          .maybeSingle(); // Usar maybeSingle ao invés de single

        if (webCheckinError) {
          console.error("Erro ao buscar web_checkin por token:", webCheckinError);
          throw webCheckinError;
        }
        if (!webCheckinData) return null;

        // Buscar documentos
        const { data: documents } = await supabase
          .from("web_checkin_documents")
          .select("*")
          .eq("web_checkin_id", webCheckinData.id);

        // Buscar hóspedes
        const { data: guests } = await supabase
          .from("web_checkin_guests")
          .select("*")
          .eq("web_checkin_id", webCheckinData.id)
          .order("order", { ascending: true });

        // Buscar dados da reserva separadamente (incluindo paid_amount e payment_status)
        const { data: reservationData, error: reservationError } = await supabase
          .from("reservations")
          .select(`
            id,
            reservation_code,
            identification_number,
            checkin_date,
            checkout_date,
            checkin_time,
            checkout_time,
            total_amount,
            paid_amount,
            payment_status,
            status,
            guest_id,
            client_id,
            room_id,
            category_id,
            ota_reservations(ota_guest_name, ota_guest_email, ota_guest_phone)
          `)
          .eq("id", webCheckinData.reservation_id)
          .maybeSingle();

        if (reservationError) {
          console.error("Erro ao buscar reserva:", reservationError);
          return {
            ...webCheckinData,
            reservation: null,
            documents: documents || [],
            guests: guests || [],
          };
        }

        if (!reservationData) {
          console.warn("Reserva não encontrada ou sem acesso:", webCheckinData.reservation_id);
          return {
            ...webCheckinData,
            reservation: null,
            documents: documents || [],
            guests: guests || [],
          };
        }

        // Buscar dados do hóspede
        let guest = null;
        if (reservationData.guest_id) {
          const { data: guestData } = await supabase
            .from("clients")
            .select("full_name, email, phone")
            .eq("id", reservationData.guest_id)
            .single();
          guest = guestData;
        }

        // Buscar dados do responsável financeiro
        let financialResponsible = null;
        if (reservationData.client_id) {
          const { data: financialData } = await supabase
            .from("clients")
            .select("full_name, email, phone")
            .eq("id", reservationData.client_id)
            .single();
          financialResponsible = financialData;
        }

        const displayName = reservationGuestDisplayName({
          guest: guest as { full_name?: string | null } | null,
          financial_responsible: financialResponsible as { full_name?: string | null } | null,
          ota_reservations: (reservationData as any).ota_reservations ?? null,
          guest_name: null,
        });
        const contact = reservationGuestContactFields({
          guest: guest as { email?: string | null; phone?: string | null } | null,
          financial_responsible: financialResponsible as { email?: string | null; phone?: string | null } | null,
          ota_reservations: (reservationData as any).ota_reservations ?? null,
        });
        if (!guest && (displayName !== "Hóspede" || contact.email || contact.phone)) {
          guest = {
            full_name: displayName === "Hóspede" ? null : displayName,
            email: contact.email,
            phone: contact.phone,
          };
        }

        // Buscar dados do quarto
        let rooms = null;
        if (reservationData.room_id) {
          const { data: roomData } = await supabase
            .from("rooms")
            .select("room_number, name, fixed_password, authentication_type")
            .eq("id", reservationData.room_id)
            .single();
          rooms = roomData;
        }

        // Buscar pagamentos da reserva
        const { data: paymentsData } = await supabase
          .from("payments")
          .select("id, amount, payment_date, notes")
          .eq("reservation_id", reservationData.id)
          .order("payment_date", { ascending: false });

        // Buscar taxas extras da reserva
        const { data: serviceFeesData } = await supabase
          .from("reservation_service_fees")
          .select(`
            *,
            service_fees!service_fee_id(name, description)
          `)
          .eq("reservation_id", reservationData.id);

        // Buscar dados da categoria (incluindo capacidade e building_id)
        let roomCategories = null;
        let building = null;
        if (reservationData.category_id) {
          const { data: categoryData } = await supabase
            .from("room_categories")
            .select("name, capacity_adults, capacity_children, building_id")
            .eq("id", reservationData.category_id)
            .single();
          roomCategories = categoryData;
          
          // Se a categoria tem um prédio associado, buscar dados do prédio
          if (categoryData?.building_id) {
            try {
              const { data: buildingData, error: buildingError } = await supabase
                .from("buildings")
                .select("id, name, street, number, neighborhood, city, state, zip_code")
                .eq("id", categoryData.building_id)
                .single();
              
              if (buildingError) {
                console.error("Erro ao buscar dados do prédio:", buildingError);
                // Continuar sem os dados do prédio se houver erro
              } else {
                building = buildingData;
              }
            } catch (error) {
              console.error("Erro ao buscar dados do prédio:", error);
              // Continuar sem os dados do prédio se houver erro
            }
          }
        }

        // Buscar dados do estabelecimento
        let establishment = null;
        let establishmentIdToUse = webCheckinData.establishment_id;
        
        // Se não tiver establishment_id no web_checkin, buscar pela reserva
        if (!establishmentIdToUse && reservationData) {
          const { data: reservationWithEstablishment } = await supabase
            .from("reservations")
            .select("establishment_id")
            .eq("id", reservationData.id)
            .single();
          establishmentIdToUse = reservationWithEstablishment?.establishment_id;
        }
        
        if (establishmentIdToUse) {
          try {
            // Buscar dados básicos do estabelecimento
            const { data: establishmentData, error: establishmentError } = await supabase
              .from("establishments")
              .select("id, name")
              .eq("id", establishmentIdToUse)
              .single();
            
            if (!establishmentError && establishmentData) {
              establishment = establishmentData;
              
              // Buscar endereço do hotel_settings
              // hotel_settings usa establishment_id (UUID), não numeric_id
              let hotelSettingsData = null;
              let hotelSettingsError = null;
              
              // Primeiro tenta buscar pelo establishment_id (UUID)
              const { data: hotelSettingsByEstablishment, error: errorByEstablishment } = await supabase
                .from("hotel_settings")
                .select("street, number, neighborhood, city, state, zip_code, whatsapp_ddi, whatsapp_number, whatsapp, phone, email")
                .eq("establishment_id", establishmentIdToUse)
                .maybeSingle();
              
              if (errorByEstablishment) {
                console.error("Erro ao buscar hotel_settings por establishment_id:", errorByEstablishment);
                hotelSettingsError = errorByEstablishment;
              } else if (hotelSettingsByEstablishment) {
                hotelSettingsData = hotelSettingsByEstablishment;
              } else {
                // Se não encontrou, tenta buscar um registro genérico (sem establishment_id)
                // Isso pode acontecer se o hotel_settings não foi vinculado ao establishment ainda
                console.warn("⚠️ Nenhum hotel_settings encontrado para establishment_id:", establishmentIdToUse);
                console.log("🔄 Tentando buscar hotel_settings genérico...");
                
                const { data: hotelSettingsGeneric, error: errorGeneric } = await supabase
                  .from("hotel_settings")
                  .select("street, number, neighborhood, city, state, zip_code, whatsapp_ddi, whatsapp_number, whatsapp, phone, email")
                  .is("establishment_id", null)
                  .maybeSingle();
                
                if (errorGeneric) {
                  console.error("Erro ao buscar hotel_settings genérico:", errorGeneric);
                } else if (hotelSettingsGeneric) {
                  console.log("✅ Hotel_settings genérico encontrado");
                  hotelSettingsData = hotelSettingsGeneric;
                } else {
                  // Último recurso: buscar qualquer registro
                  const { data: hotelSettingsAny, error: errorAny } = await supabase
                    .from("hotel_settings")
                    .select("street, number, neighborhood, city, state, zip_code, whatsapp_ddi, whatsapp_number, whatsapp, phone, email")
                    .limit(1)
                    .maybeSingle();
                  
                  if (!errorAny && hotelSettingsAny) {
                    console.log("✅ Hotel_settings encontrado (qualquer registro)");
                    hotelSettingsData = hotelSettingsAny;
                  } else {
                    console.warn("⚠️ Nenhum hotel_settings encontrado em nenhuma tentativa");
                  }
                }
              }
              
              if (hotelSettingsData) {
                console.log("📋 Dados do hotel_settings encontrados:", hotelSettingsData);
                // Montar endereço completo
                const addressParts = [];
                if (hotelSettingsData.street) {
                  addressParts.push(hotelSettingsData.street);
                  if (hotelSettingsData.number) {
                    addressParts[addressParts.length - 1] += `, ${hotelSettingsData.number}`;
                  }
                }
                if (hotelSettingsData.neighborhood) {
                  addressParts.push(hotelSettingsData.neighborhood);
                }
                
                establishment.address = addressParts.length > 0 ? addressParts.join(", ") : null;
                establishment.city = hotelSettingsData.city || null;
                establishment.state = hotelSettingsData.state || null;
                establishment.zip_code = hotelSettingsData.zip_code || null;
                // Se não tiver whatsapp_ddi e whatsapp_number separados, tentar extrair do campo whatsapp
                if (hotelSettingsData.whatsapp_ddi && hotelSettingsData.whatsapp_number) {
                  establishment.whatsapp_ddi = hotelSettingsData.whatsapp_ddi;
                  establishment.whatsapp_number = hotelSettingsData.whatsapp_number;
                } else if (hotelSettingsData.whatsapp) {
                  // Tentar extrair DDI e número do campo whatsapp completo
                  const whatsappClean = hotelSettingsData.whatsapp.replace(/\D/g, "");
                  if (whatsappClean.startsWith("55") && whatsappClean.length > 10) {
                    establishment.whatsapp_ddi = "+55";
                    establishment.whatsapp_number = whatsappClean.substring(2);
                  } else if (whatsappClean.length > 0) {
                    establishment.whatsapp_number = whatsappClean;
                  }
                } else {
                  establishment.whatsapp_ddi = hotelSettingsData.whatsapp_ddi || null;
                  establishment.whatsapp_number = hotelSettingsData.whatsapp_number || null;
                }
                establishment.phone = hotelSettingsData.phone || null;
                establishment.email = hotelSettingsData.email || null;
                
                console.log("🏢 Establishment com endereço:", establishment);
              } else {
                console.warn("⚠️ Nenhum hotel_settings encontrado em nenhuma tentativa");
              }
            } else if (establishmentError) {
              console.error("Erro ao buscar estabelecimento:", establishmentError);
            }
          } catch (error) {
            console.error("Erro ao buscar estabelecimento:", error);
          }
        }

        return {
          ...webCheckinData,
          reservation: {
            ...reservationData,
            guest,
            financial_responsible: financialResponsible,
            rooms,
            room_categories: roomCategories,
            building: building, // Adicionar dados do prédio
            payments: paymentsData || [],
            reservation_service_fees: serviceFeesData || [],
          },
          documents: documents || [],
          guests: guests || [],
          establishment,
        };
      },
    });
  };

  // Iniciar web check-in
  const startWebCheckin = useMutation({
    mutationFn: async ({ locator, ipAddress, userAgent }: { locator: string; ipAddress?: string; userAgent?: string }) => {
      // Buscar web check-in existente
      const { data: existing, error: fetchError } = await supabase
        .from("web_checkin")
        .select("*")
        .eq("locator", locator)
        .single();

      if (fetchError) {
        console.error("Erro ao buscar web check-in:", fetchError);
        throw new Error("Localizador não encontrado");
      }

      if (!existing) {
        throw new Error("Localizador não encontrado");
      }

      if (existing.status === "completed") {
        // Se já está completo, retornar os dados existentes
        return existing;
      }

      if (existing.status === "expired") {
        throw new Error("Link de check-in expirado");
      }

      // Se já está in_progress, retornar os dados existentes
      if (existing.status === "in_progress") {
        return existing;
      }

      // Atualizar status para in_progress apenas se estiver pending
      const { data, error } = await supabase
        .from("web_checkin")
        .update({
          status: "in_progress",
          started_at: new Date().toISOString(),
          ip_address: ipAddress || null,
          user_agent: userAgent || null,
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        console.error("Erro ao atualizar web check-in:", error);
        // Se falhar a atualização, retornar os dados existentes
        return existing;
      }
      
      return data || existing;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["web_checkin"] });
    },
  });

  // Salvar dados dos hóspedes
  const saveGuests = useMutation({
    mutationFn: async ({ token, guests }: { token: string; guests: any[] }) => {
      const { data: webCheckin } = await supabase
        .from("web_checkin")
        .select("id")
        .eq("token", token)
        .single();

      if (!webCheckin) throw new Error("Web check-in não encontrado");

      // Deletar hóspedes existentes
      await supabase
        .from("web_checkin_guests")
        .delete()
        .eq("web_checkin_id", webCheckin.id);

      // Inserir novos hóspedes
      const guestsToInsert = guests
        .filter((guest) => guest.name && guest.name.trim() !== "") // Filtrar hóspedes sem nome
        .map((guest, index) => {
          const guestData: Record<string, any> = {
            web_checkin_id: webCheckin.id,
            name: guest.name?.trim() || "",
            is_main_guest: guest.is_main_guest || index === 0,
            "order": index, // Usar aspas porque "order" é palavra reservada em SQL
          };

          // Adicionar campos opcionais apenas se tiverem valor
          if (guest.cpf?.trim()) guestData.cpf = guest.cpf.trim();
          if (guest.birth_date) guestData.birth_date = guest.birth_date;
          if (guest.email?.trim()) guestData.email = guest.email.trim();
          if (guest.phone?.trim()) guestData.phone = guest.phone.trim();
          if (guest.document_type) guestData.document_type = guest.document_type;
          if (guest.document_number?.trim()) guestData.document_number = guest.document_number.trim();
          if (guest.document_url) guestData.document_url = guest.document_url;
          
          // Adicionar campos de endereço
          if (guest.zip_code?.trim()) guestData.zip_code = guest.zip_code.trim();
          if (guest.postal_code?.trim()) guestData.postal_code = guest.postal_code.trim();
          if (guest.street?.trim()) guestData.street = guest.street.trim();
          if (guest.number?.trim()) guestData.number = guest.number.trim();
          if (guest.complement?.trim()) guestData.complement = guest.complement.trim();
          if (guest.neighborhood?.trim()) guestData.neighborhood = guest.neighborhood.trim();
          if (guest.city?.trim()) guestData.city = guest.city.trim();
          if (guest.state?.trim()) guestData.state = guest.state.trim();
          // Sempre salvar country e nationality, mesmo que vazios (para garantir que sejam atualizados)
          if (guest.country) {
            guestData.country = guest.country.trim();
          } else if (guest.nationality) {
            // Se country não estiver definido, usar nationality como fallback
            guestData.country = guest.nationality.trim();
          }
          if (guest.nationality) {
            guestData.nationality = guest.nationality.trim();
          } else if (guest.country) {
            // Se nationality não estiver definido, usar country como fallback
            guestData.nationality = guest.country.trim();
          }

          return guestData;
        });

      if (guestsToInsert.length === 0) {
        throw new Error("É necessário ter pelo menos um hóspede com nome preenchido");
      }

      const { data, error } = await supabase
        .from("web_checkin_guests")
        .insert(guestsToInsert)
        .select();

      if (error) {
        console.error("Erro ao inserir hóspedes:", error);
        console.error("Dados que tentaram ser inseridos:", guestsToInsert);
        throw error;
      }

      // Atualizar guest_data no web_checkin
      await supabase
        .from("web_checkin")
        .update({ guest_data: { guests } })
        .eq("id", webCheckin.id);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["web_checkin"] });
      toast.success("Dados dos hóspedes salvos com sucesso!", {
        dismissible: true,
        duration: 4000,
      });
    },
  });

  // Salvar documentos
  const saveDocuments = useMutation({
    mutationFn: async ({ token, documents }: { token: string; documents: any[] }) => {
      const { data: webCheckin } = await supabase
        .from("web_checkin")
        .select("id")
        .eq("token", token)
        .single();

      if (!webCheckin) throw new Error("Web check-in não encontrado");

      // Deletar documentos existentes
      await supabase
        .from("web_checkin_documents")
        .delete()
        .eq("web_checkin_id", webCheckin.id);

      // Inserir novos documentos - filtrar apenas documentos válidos (com guest_name e URLs)
      const documentsToInsert = documents
        .filter((doc) => doc && doc.guest_name && doc.guest_name.trim() !== "" && (doc.document_front_url || doc.selfie_url))
        .map((doc) => ({
          web_checkin_id: webCheckin.id,
          guest_name: doc.guest_name.trim(),
          document_type: doc.document_type || "cpf",
          document_number: doc.document_number || "",
          document_front_url: doc.document_front_url || null,
          document_back_url: doc.document_back_url || null,
          selfie_url: doc.selfie_url || null,
          is_main_guest: doc.is_main_guest || false,
          "order": doc.order !== undefined ? doc.order : (doc.is_main_guest ? 0 : 1), // Usar aspas porque "order" é palavra reservada
        }));

      const { data, error } = await supabase
        .from("web_checkin_documents")
        .insert(documentsToInsert)
        .select();

      if (error) throw error;

      // Atualizar documents no web_checkin
      await supabase
        .from("web_checkin")
        .update({ documents })
        .eq("id", webCheckin.id);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["web_checkin"] });
      toast.success("Documentos enviados com sucesso!", {
        dismissible: true,
        duration: 4000,
      });
    },
  });

  // Salvar preferências
  const savePreferences = useMutation({
    mutationFn: async ({ token, preferences }: { token: string; preferences: any }) => {
      const { data: webCheckin } = await supabase
        .from("web_checkin")
        .select("id")
        .eq("token", token)
        .single();

      if (!webCheckin) throw new Error("Web check-in não encontrado");

      const { data, error } = await supabase
        .from("web_checkin")
        .update({ preferences })
        .eq("id", webCheckin.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["web_checkin"] });
      toast.success("Preferências salvas!", {
        dismissible: true,
        duration: 4000,
      });
    },
  });

  // Aceitar termos
  const acceptTerms = useMutation({
    mutationFn: async (token: string) => {
      const { data, error } = await supabase
        .from("web_checkin")
        .update({
          terms_accepted: true,
          terms_accepted_at: new Date().toISOString(),
        })
        .eq("token", token)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["web_checkin"] });
    },
  });

  // Completar web check-in
  const completeWebCheckin = useMutation({
    mutationFn: async (
      arg: string | { token: string; skipFnrhInvoke?: boolean },
    ) => {
      const token = typeof arg === "string" ? arg : arg.token;
      const skipFnrhInvoke =
        typeof arg === "object" && arg.skipFnrhInvoke === true;

      const { data: webCheckin } = await supabase
        .from("web_checkin")
        .select(`
          *,
          reservation:reservations(
            id,
            reservation_code,
            guest:clients!guest_id(id, full_name),
            financial_responsible:clients!client_id(id, full_name)
          )
        `)
        .eq("token", token)
        .single();

      if (!webCheckin) throw new Error("Web check-in não encontrado");

      const reservation = webCheckin.reservation as any;
      const reservationId = reservation?.id;
      const reservationCode = reservation?.reservation_code;
      const guestName = reservation?.guest?.full_name || reservation?.financial_responsible?.full_name || "Hóspede";

      // Buscar nome do hóspede principal do web check-in
      let mainGuestName = guestName;
      try {
        const { data: mainGuest } = await supabase
          .from("web_checkin_guests")
          .select("name")
          .eq("web_checkin_id", webCheckin.id)
          .eq("is_main_guest", true)
          .maybeSingle();
        
        if (mainGuest?.name) {
          mainGuestName = mainGuest.name;
        }
      } catch (error) {
        console.warn("⚠️ Erro ao buscar nome do hóspede principal:", error);
      }

      // Atualizar status do web check-in
      const { data, error } = await supabase
        .from("web_checkin")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", webCheckin.id)
        .select()
        .single();

      if (error) throw error;

      // Atualizar status da reserva para "confirmed" se ainda estiver pendente
      if (reservationId) {
        await supabase
          .from("reservations")
          .update({ status: "confirmed" })
          .eq("id", reservationId)
          .in("status", ["pending", "preregistration"]);
      }

      // Registrar log de atividade
      if (reservationId) {
        try {
          // Buscar establishment_id da reserva se não estiver no web_checkin
          let establishmentId = webCheckin.establishment_id;
          if (!establishmentId && reservationId) {
            const { data: reservationData } = await supabase
              .from("reservations")
              .select("establishment_id")
              .eq("id", reservationId)
              .single();
            establishmentId = reservationData?.establishment_id || null;
          }

          if (establishmentId) {
            // Usar a função RPC diretamente para garantir que o log seja criado
            // mesmo durante o web check-in (quando não há usuário logado no sistema)
            const { error: logError } = await supabase.rpc("log_activity", {
              p_establishment_id: establishmentId,
              p_user_id: null, // Web check-in é feito pelo hóspede, não por usuário do sistema
              p_action_type: "checked_in",
              p_entity_type: "reservation",
              p_description: `Check-in web concluído${reservationCode ? ` para reserva ${reservationCode}` : ""} - Realizado pelo hóspede: ${mainGuestName}`,
              p_entity_id: reservationId,
              p_entity_code: reservationCode || null,
              p_old_values: { status: "pending" },
              p_new_values: {
                status: "confirmed",
                checkin_method: "web",
                web_checkin_id: webCheckin.id,
                completed_at: new Date().toISOString(),
                performed_by: mainGuestName,
                performed_by_type: "guest",
              },
              p_metadata: {
                web_checkin_id: webCheckin.id,
                locator: webCheckin.locator,
                ip_address: webCheckin.ip_address,
                user_agent: webCheckin.user_agent,
                guest_name: mainGuestName,
                performed_by: "guest",
              },
            });

            if (logError) {
              console.error("❌ Erro ao registrar log de atividade do web check-in:", logError);
            } else {
              console.log("✅ Log de atividade do web check-in registrado com sucesso");
            }
          } else {
            console.warn("⚠️ Não foi possível registrar log: establishment_id não encontrado");
          }
        } catch (logError) {
          console.error("❌ Erro ao registrar log de atividade do web check-in:", logError);
          // Não lançar erro para não interromper o fluxo principal
        }
      }

      // FNRH: fluxo hóspede (web). Exige auto_submit_on_web_checkin na Edge.
      // Check-in manual na recepção usa skipFnrhInvoke e dispara fnrh-submit com source staff depois.
      try {
        if (reservationId && !skipFnrhInvoke) {
          const { error: fnrhInvokeErr } = await invokePmsFunction(
            "fnrh-submit",
            {
              body: {
                reservation_id: reservationId,
                source: "web",
                web_checkin_token: token,
                commit_checkin: false,
              },
            },
          );
          if (fnrhInvokeErr) {
            console.warn("FNRH após web check-in:", fnrhInvokeErr);
          }
        }
      } catch (fnrhCatch) {
        console.warn("FNRH após web check-in:", fnrhCatch);
      }

      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["activity_logs"] });
      return data;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ["web_checkin"] });
      queryClient.invalidateQueries({ queryKey: ["activity_logs"] });
      
      // Disparar email de confirmação automaticamente após concluir o check-in
      try {
        if (data?.reservation_id) {
          // Buscar dados completos da reserva para o email
          const { data: reservation, error: reservationError } = await supabase
            .from("reservations")
            .select(`
              *,
              guest:clients!guest_id(*),
              financial_responsible:clients!client_id(*),
              rooms(
                id, 
                room_number, 
                name, 
                fixed_password, 
                authentication_type,
                room_categories(id, name, description, building_id)
              ),
              room_categories(id, name, description, building_id)
            `)
            .eq("id", data.reservation_id)
            .single();

          if (!reservationError && reservation) {
            // Disparar email de check-in confirmado para o hóspede
            const emailQueueId = await triggerEmail('checkin.confirmed', reservation);
            
            if (emailQueueId) {
              console.log('✅ Email de confirmação de check-in enviado automaticamente:', { queueId: emailQueueId });
            } else {
              console.warn('⚠️ Email de confirmação não foi enviado. Verifique se o template está configurado e as configurações de e-mail estão ativas.');
            }

            // Enviar email para portaria com informações do check-in, foto selfie e documentos
            try {
              // Buscar dados completos do web check-in (incluindo fotos e documentos)
              const { data: webCheckinData, error: webCheckinError } = await supabase
                .from("web_checkin")
                .select(`
                  *,
                  guests:web_checkin_guests(*),
                  documents:web_checkin_documents(*)
                `)
                .eq("reservation_id", reservation.id)
                .eq("status", "completed")
                .order("completed_at", { ascending: false })
                .limit(1)
                .maybeSingle();

              if (!webCheckinError && webCheckinData) {
                // Buscar email da portaria (pode estar em establishments ou buildings)
                let receptionEmail: string | null = null;
                
                // Tentar buscar do establishment primeiro
                if (reservation.establishment_id) {
                  const { data: establishment } = await supabase
                    .from("establishments")
                    .select("reception_email")
                    .eq("id", reservation.establishment_id)
                    .maybeSingle();
                  
                  receptionEmail = establishment?.reception_email || null;
                }

                // Se não encontrou no establishment, tentar buscar do building
                // O building_id pode estar em room_categories (direto da reserva ou através de rooms)
                if (!receptionEmail) {
                  let buildingId: string | null = null;
                  
                  // Forma 1: building_id direto de room_categories da reserva
                  if (reservation.room_categories?.building_id) {
                    buildingId = reservation.room_categories.building_id;
                    console.log('🔍 building_id encontrado em room_categories da reserva:', buildingId);
                  }
                  // Forma 2: building_id através de rooms -> room_categories
                  else if (reservation.rooms) {
                    const room = Array.isArray(reservation.rooms) ? reservation.rooms[0] : reservation.rooms;
                    if (room?.room_categories?.building_id) {
                      buildingId = room.room_categories.building_id;
                      console.log('🔍 building_id encontrado em rooms -> room_categories:', buildingId);
                    }
                  }
                  
                  // Forma 3: Se ainda não encontrou, buscar diretamente usando category_id da reserva
                  if (!buildingId && reservation.category_id) {
                    const { data: categoryData } = await supabase
                      .from("room_categories")
                      .select("building_id")
                      .eq("id", reservation.category_id)
                      .maybeSingle();
                    
                    buildingId = categoryData?.building_id || null;
                    if (buildingId) {
                      console.log('🔍 building_id encontrado através de category_id:', buildingId);
                    }
                  }
                  
                  if (buildingId) {
                    console.log('🔍 Buscando email da portaria do building:', { buildingId });
                  const { data: building } = await supabase
                    .from("buildings")
                    .select("reception_email")
                      .eq("id", buildingId)
                    .maybeSingle();
                  
                  receptionEmail = building?.reception_email || null;
                    console.log('✅ Email da portaria encontrado no building:', { 
                      buildingId, 
                      receptionEmail,
                      hasBuilding: !!building 
                    });
                  } else {
                    console.warn('⚠️ building_id não encontrado na reserva:', {
                      hasRoomCategories: !!reservation.room_categories,
                      hasRooms: !!reservation.rooms,
                      categoryId: reservation.category_id,
                      roomId: reservation.room_id
                    });
                  }
                }

                if (receptionEmail) {
                  // Preparar variáveis adicionais com dados do web check-in
                  const mainGuest = webCheckinData.guests?.find((g: any) => g.is_main_guest) || webCheckinData.guests?.[0];
                  const additionalGuests = webCheckinData.guests?.filter((g: any) => !g.is_main_guest) || [];
                  
                  // Buscar selfie do hóspede principal (pode estar em guests ou documents)
                  let selfieUrl = mainGuest?.selfie_url || null;
                  if (!selfieUrl && webCheckinData.documents?.length > 0) {
                    const mainGuestDoc = webCheckinData.documents.find((d: any) => 
                      d.guest_name === mainGuest?.name || d.guest_name === reservation.guest?.full_name
                    );
                    selfieUrl = mainGuestDoc?.selfie_url || null;
                  }

                  const receptionVariables = {
                    selfie_url: selfieUrl,
                    documents: webCheckinData.documents?.map((doc: any) => ({
                      guest_name: doc.guest_name,
                      document_type: doc.document_type,
                      document_number: doc.document_number,
                      selfie_url: doc.selfie_url,
                      document_front_url: doc.document_front_url,
                      document_back_url: doc.document_back_url,
                    })) || [],
                    main_guest: mainGuest ? {
                      name: mainGuest.name || reservation.guest?.full_name,
                      email: mainGuest.email || reservation.guest?.email,
                      phone: mainGuest.phone || reservation.guest?.phone,
                      birth_date: mainGuest.birth_date,
                      document_type: mainGuest.document_type,
                      document_number: mainGuest.document_number || mainGuest.cpf,
                      cpf: mainGuest.cpf || mainGuest.document_number,
                    } : null,
                    additional_guests: additionalGuests.map((g: any) => ({
                      name: g.name,
                      document_type: g.document_type,
                      document_number: g.document_number || g.cpf,
                      cpf: g.cpf || g.document_number,
                    })),
                    checkin_completed_at: webCheckinData.completed_at ? new Date(webCheckinData.completed_at).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR'),
                  };

                  // Enviar email para portaria
                  const receptionEmailQueueId = await triggerEmail(
                    'checkin.reception.notification',
                    reservation,
                    receptionVariables,
                    receptionEmail
                  );

                  if (receptionEmailQueueId) {
                    console.log('✅ Email de notificação para portaria enviado:', { 
                      queueId: receptionEmailQueueId,
                      receptionEmail 
                    });
                  } else {
                    console.warn('⚠️ Email para portaria não foi enviado. Verifique se o template está configurado.');
                  }
                } else {
                  console.warn('⚠️ Email da portaria não configurado. Email de notificação não será enviado.');
                }
              } else {
                console.warn('⚠️ Dados do web check-in não encontrados para enviar email à portaria:', webCheckinError);
              }
            } catch (receptionEmailError) {
              // Não bloquear o sucesso do check-in se o email para portaria falhar
              console.error('❌ Erro ao enviar email para portaria:', receptionEmailError);
            }
          } else {
            console.warn('⚠️ Não foi possível buscar dados da reserva para enviar o email:', reservationError);
          }
        }
      } catch (emailError) {
        // Não bloquear o sucesso do check-in se o email falhar
        console.error('❌ Erro ao enviar email de confirmação:', emailError);
      }
      
      toast.success("Check-in concluído com sucesso!", {
        dismissible: true,
        duration: 5000,
      });
    },
  });

  // Criar web check-in para uma reserva
  const createWebCheckin = useMutation({
    mutationFn: async ({ reservationId, establishmentId }: { reservationId: string; establishmentId?: string }) => {
      const { locatorService } = await import("@/lib/locatorService");
      
      // Buscar reserva
      const { data: reservation } = await supabase
        .from("reservations")
        .select("checkin_date, checkout_date, reservation_code")
        .eq("id", reservationId)
        .single();

      if (!reservation) throw new Error("Reserva não encontrada");

      // Gerar localizador único
      const locator = await locatorService.ensureUniqueLocator();
      
      // Gerar token
      const token = locatorService.generateWebCheckinToken(reservationId, locator);

      const expiresAt = computeWebCheckinExpiresAt(
        reservation.checkin_date,
        reservation.checkout_date ?? null
      );

      const { data, error } = await supabase
        .from("web_checkin")
        .insert({
          reservation_id: reservationId,
          establishment_id: establishmentId,
          token,
          locator,
          expires_at: expiresAt,
          status: "pending",
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["web_checkin"] });
    },
  });

  // Buscar dados de check-ins anteriores do hóspede
  // Pode buscar por guestAccountId (para web check-in) ou por email/CPF/document_number (para check-in manual)
  const getPreviousCheckinData = (
    guestAccountId: string | null, 
    currentReservationId?: string,
    guestEmail?: string | null,
    guestCpf?: string | null,
    guestDocumentNumber?: string | null
  ) => {
    return useQuery({
      queryKey: ["previous_checkin_data", guestAccountId, currentReservationId, guestEmail, guestCpf, guestDocumentNumber],
      queryFn: async () => {
        // Se não tem nenhum identificador, não buscar
        if (!guestAccountId && !guestEmail && !guestCpf && !guestDocumentNumber) return null;

        let allReservationIds: string[] = [];
        const reservationIdSet = new Set<string>();

        // Buscar check-ins anteriores diretamente da tabela web_checkin_guests
        // Isso garante consistência entre web check-in e manual check-in
        // Ambos buscam da mesma fonte: check-ins completos (status = "completed")
        
        // 1. Buscar por guestAccountId (web check-in) através dos hóspedes
        if (guestAccountId && !guestEmail && !guestCpf && !guestDocumentNumber) {
          // Buscar primeiro os hóspedes associados ao guestAccountId
          const { data: guestAccounts, error: accountError } = await supabase
            .from("guest_accounts")
            .select("id, email")
            .eq("id", guestAccountId)
            .limit(1);

          if (accountError) {
            console.error("Erro ao buscar conta do hóspede:", accountError);
          } else if (guestAccounts && guestAccounts.length > 0) {
            const accountEmail = guestAccounts[0].email;
            
            // Buscar check-ins completos através do email da conta
            if (accountEmail) {
              const { data: previousGuests, error: guestsError } = await supabase
                .from("web_checkin_guests")
                .select(`
                  web_checkin_id,
                  web_checkin:web_checkin!inner(
                    reservation_id,
                    status,
                    completed_at
                  )
                `)
                .eq("email", accountEmail.trim())
                .eq("web_checkin.status", "completed");

              if (guestsError) {
                console.error("Erro ao buscar check-ins por conta:", guestsError);
              } else if (previousGuests && previousGuests.length > 0) {
                // Ordenar por completed_at (mais recente primeiro) e pegar apenas o primeiro
                const sortedGuests = previousGuests.sort((a: any, b: any) => {
                  const dateA = a.web_checkin?.completed_at ? new Date(a.web_checkin.completed_at).getTime() : 0;
                  const dateB = b.web_checkin?.completed_at ? new Date(b.web_checkin.completed_at).getTime() : 0;
                  return dateB - dateA;
                });
                
                // Pegar apenas o check-in mais recente
                const mostRecentGuest = sortedGuests[0];
                const reservationId = mostRecentGuest?.web_checkin?.reservation_id;
                if (reservationId && reservationId !== currentReservationId) {
                  reservationIdSet.add(reservationId);
                }
              }
            }
          }
        }

        // 2. Buscar por email, CPF ou document_number nos hóspedes (check-in manual)
        // IMPORTANTE: Buscar apenas pelo campo específico informado, não usar OR
        // Isso garante que cada busca retorne apenas hóspedes com o documento específico
        // E apenas de check-ins completos (status = "completed")
        if (guestEmail || guestCpf || guestDocumentNumber) {
          let query = supabase
              .from("web_checkin_guests")
              .select(`
                web_checkin_id,
                is_main_guest,
                web_checkin:web_checkin!inner(
                  reservation_id,
                  status,
                  completed_at
                )
            `);

          // Buscar apenas pelo campo específico informado (não usar OR)
          // Prioridade: email > CPF > document_number
          if (guestEmail) {
            query = query.eq("email", guestEmail.trim());
          } else if (guestCpf) {
            query = query.eq("cpf", guestCpf.trim());
          } else if (guestDocumentNumber) {
            query = query.eq("document_number", guestDocumentNumber.trim());
          }

          // Filtrar apenas check-ins completos na query
          query = query.eq("web_checkin.status", "completed");

          const { data: previousGuests, error: guestsError } = await query;

          if (guestsError) {
            console.error("Erro ao buscar hóspedes anteriores:", guestsError);
          } else if (previousGuests && previousGuests.length > 0) {
            // Ordenar por completed_at (mais recente primeiro) e pegar apenas o primeiro
            const sortedGuests = previousGuests.sort((a: any, b: any) => {
              const dateA = a.web_checkin?.completed_at ? new Date(a.web_checkin.completed_at).getTime() : 0;
              const dateB = b.web_checkin?.completed_at ? new Date(b.web_checkin.completed_at).getTime() : 0;
              return dateB - dateA;
            });
            
            // Pegar apenas o check-in mais recente
            const mostRecentGuest = sortedGuests[0];
            const reservationId = mostRecentGuest?.web_checkin?.reservation_id;
            if (reservationId && reservationId !== currentReservationId) {
              reservationIdSet.add(reservationId);
            }
          }
        }

        // Converter Set para Array
        allReservationIds = Array.from(reservationIdSet);

        if (allReservationIds.length === 0) {
          console.log("ℹ️ Nenhum check-in anterior encontrado");
          return null;
        }

        console.log(`🔍 Encontrados ${allReservationIds.length} check-ins anteriores para reutilização`);

        // 3. Buscar apenas o check-in completo mais recente (único)
        const { data: previousCheckins, error: checkinError } = await supabase
          .from("web_checkin")
          .select(`
            id,
            reservation_id,
            status,
            completed_at,
            guests:web_checkin_guests(*),
            documents:web_checkin_documents(*),
            preferences,
            reservation:reservations(
              reservation_code,
              checkin_date,
              checkout_date
            )
          `)
          .in("reservation_id", allReservationIds)
          .eq("status", "completed")
          .order("completed_at", { ascending: false })
          .limit(1); // Buscar apenas o check-in mais recente

        if (checkinError) {
          console.error("Erro ao buscar check-ins anteriores:", checkinError);
          return null;
        }

        if (!previousCheckins || previousCheckins.length === 0) {
          console.log("ℹ️ Nenhum check-in completo encontrado");
          return null;
        }

        // 4. Usar o único check-in retornado (mais recente)
        const selectedCheckin = previousCheckins[0];

        // Verificar se tem dados válidos de hóspedes
        if (!selectedCheckin.guests || !Array.isArray(selectedCheckin.guests) || selectedCheckin.guests.length === 0) {
          console.log("ℹ️ Check-in encontrado mas sem dados de hóspedes");
          return null;
        }

        // Verificar se tem pelo menos um hóspede com dados válidos
        const hasValidGuest = selectedCheckin.guests.some((g: any) => 
          g.name && g.name.trim() !== ""
        );
        
        if (!hasValidGuest) {
          console.log("ℹ️ Nenhum check-in com dados válidos de hóspedes encontrado");
          return null;
        }

        console.log(`✅ Check-in selecionado para reutilização: ${selectedCheckin.reservation?.reservation_code || selectedCheckin.id} (completado em ${selectedCheckin.completed_at})`);

        // Formatar dados para reutilização (incluindo endereço)
        const previousGuests = (selectedCheckin.guests as any[]).map((g) => ({
          name: g.name || "",
          email: g.email || "",
          phone: g.phone || "",
          cpf: g.cpf || "",
          birth_date: g.birth_date || "",
          document_type: g.document_type || "cpf",
          document_number: g.document_number || "",
          is_main_guest: g.is_main_guest || false,
          // Incluir campos de endereço
          zip_code: g.zip_code || "",
          postal_code: g.postal_code || "",
          street: g.street || "",
          number: g.number || "",
          complement: g.complement || "",
          neighborhood: g.neighborhood || "",
          city: g.city || "",
          state: g.state || "",
          country: g.country || g.nationality || "BR",
          nationality: g.nationality || g.country || "BR",
          use_main_guest_address: false,
        }));

        const previousDocuments = (selectedCheckin.documents as any[]) || [];
        const previousPreferences = selectedCheckin.preferences || {};

        return {
          guests: previousGuests,
          documents: previousDocuments,
          preferences: previousPreferences,
          reservationCode: (selectedCheckin.reservation as any)?.reservation_code,
          checkinDate: (selectedCheckin.reservation as any)?.checkin_date,
          completedAt: selectedCheckin.completed_at,
        };
      },
      enabled: !!(guestAccountId || guestEmail || guestCpf || guestDocumentNumber),
      staleTime: 0, // Não usar cache para garantir busca sempre atualizada
      refetchOnMount: true,
      refetchOnWindowFocus: false, // Não refazer ao focar na janela (evita verificações desnecessárias)
      refetchInterval: false, // Não refazer automaticamente
    });
  };

  return {
    getWebCheckinByLocator,
    getWebCheckinByToken,
    startWebCheckin,
    saveGuests,
    saveDocuments,
    savePreferences,
    acceptTerms,
    completeWebCheckin,
    createWebCheckin,
    getPreviousCheckinData,
  };
};

