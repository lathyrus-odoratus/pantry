import type { DB } from "./supabase.js";

export type RoomRow = {
  id: string;
  name: string;
  created_at: string;
  created_by: string | null;
};

export class RoomsRepo {
  constructor(private db: DB) {}

  async findByName(name: string): Promise<RoomRow | null> {
    const { data, error } = await this.db
      .from("rooms")
      .select("*")
      .eq("name", name)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async create(name: string, createdBy?: string): Promise<RoomRow> {
    const { data, error } = await this.db
      .from("rooms")
      .insert({ name, created_by: createdBy ?? null })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  async list(): Promise<RoomRow[]> {
    const { data, error } = await this.db
      .from("rooms")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async deleteByName(name: string): Promise<void> {
    const { error } = await this.db.from("rooms").delete().eq("name", name);
    if (error) throw error;
  }
}
