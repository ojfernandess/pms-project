import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { createNestSupabase } from "./nestClient";

export const supabase = createNestSupabase() as SupabaseClient<Database>;
