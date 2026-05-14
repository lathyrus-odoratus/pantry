import type { DB } from "./supabase.js";
import type { AuthProvider } from "@pantry/shared";
import { generateDiscriminator } from "../utils/discriminator.js";

export type UserRow = {
  id: string;
  auth_provider: AuthProvider;
  auth_subject: string;
  nickname: string;
  discriminator: string;
  color: string | null;
  created_at: string;
  updated_at: string;
};

const MAX_DISCRIMINATOR_RETRIES = 8;

function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  );
}

export class UsersRepo {
  constructor(private db: DB) {}

  async findByProviderSubject(
    provider: AuthProvider,
    subject: string,
  ): Promise<UserRow | null> {
    const { data, error } = await this.db
      .from("users")
      .select("*")
      .eq("auth_provider", provider)
      .eq("auth_subject", subject)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async findById(id: string): Promise<UserRow | null> {
    const { data, error } = await this.db
      .from("users")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /**
   * Insert a user with a fresh discriminator. Retries on (nickname, discriminator)
   * uniqueness collisions up to MAX_DISCRIMINATOR_RETRIES times.
   */
  async createWithDiscriminator(input: {
    provider: AuthProvider;
    subject: string;
    nickname: string;
  }): Promise<UserRow> {
    let lastError: unknown;
    for (let i = 0; i < MAX_DISCRIMINATOR_RETRIES; i++) {
      const discriminator = generateDiscriminator();
      const { data, error } = await this.db
        .from("users")
        .insert({
          auth_provider: input.provider,
          auth_subject: input.subject,
          nickname: input.nickname,
          discriminator,
        })
        .select("*")
        .single();
      if (!error && data) return data;
      if (isUniqueViolation(error)) {
        lastError = error;
        continue;
      }
      throw error;
    }
    throw new Error(
      `Failed to allocate discriminator after ${MAX_DISCRIMINATOR_RETRIES} attempts: ${String(lastError)}`,
    );
  }

  /**
   * Update nickname, retrying with new discriminator on (nickname, discriminator) collision.
   * Returns the updated row.
   */
  async renameWithDiscriminatorRetry(
    userId: string,
    newNickname: string,
  ): Promise<UserRow> {
    let lastError: unknown;
    // First try keeping the existing discriminator
    const current = await this.findById(userId);
    if (!current) throw new Error(`User ${userId} not found`);
    {
      const { data, error } = await this.db
        .from("users")
        .update({ nickname: newNickname, updated_at: new Date().toISOString() })
        .eq("id", userId)
        .select("*")
        .single();
      if (!error && data) return data;
      if (!isUniqueViolation(error)) throw error;
      lastError = error;
    }
    // Collision: retry with new discriminators
    for (let i = 0; i < MAX_DISCRIMINATOR_RETRIES; i++) {
      const discriminator = generateDiscriminator();
      const { data, error } = await this.db
        .from("users")
        .update({
          nickname: newNickname,
          discriminator,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select("*")
        .single();
      if (!error && data) return data;
      if (isUniqueViolation(error)) {
        lastError = error;
        continue;
      }
      throw error;
    }
    throw new Error(
      `Failed to rename user after ${MAX_DISCRIMINATOR_RETRIES} attempts: ${String(lastError)}`,
    );
  }

  async setColor(userId: string, color: string | null): Promise<void> {
    const { error } = await this.db
      .from("users")
      .update({ color, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (error) throw error;
  }

  async listByRoomActivity(roomId: string, limit = 200): Promise<UserRow[]> {
    // Simplified: most-recently-active users in a room (by their latest message).
    // For MVP admin tooling only. Falls back to all users if room empty.
    const { data: msgUsers, error } = await this.db
      .from("messages")
      .select("user_id, created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    const ids = Array.from(new Set((msgUsers ?? []).map((m) => m.user_id)));
    if (ids.length === 0) return [];
    const { data: users, error: usersErr } = await this.db
      .from("users")
      .select("*")
      .in("id", ids);
    if (usersErr) throw usersErr;
    return users ?? [];
  }
}
