import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Config } from "../config.js";

export function createSupabaseClient(config: Config): SupabaseClient {
  return createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "X-Client-Info": "chat-room-backend" } },
  });
}

export type DB = SupabaseClient;
