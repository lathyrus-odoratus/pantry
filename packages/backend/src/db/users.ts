import type { DB } from "./client.js";
import type { AuthProvider } from "@pantry/shared";
import { generateDiscriminator } from "../utils/discriminator.js";

export type UserRow = {
  id: string;
  auth_provider: AuthProvider;
  auth_subject: string;
  nickname: string;
  discriminator: string;
  color: string | null;
  is_admin: boolean;
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
    const [row] = await this.db<UserRow[]>`
      SELECT * FROM users WHERE auth_provider = ${provider} AND auth_subject = ${subject}
    `;
    return row ?? null;
  }

  async findById(id: string): Promise<UserRow | null> {
    const [row] = await this.db<UserRow[]>`SELECT * FROM users WHERE id = ${id}`;
    return row ?? null;
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
      try {
        const [row] = await this.db<UserRow[]>`
          INSERT INTO users (auth_provider, auth_subject, nickname, discriminator)
          VALUES (${input.provider}, ${input.subject}, ${input.nickname}, ${discriminator})
          RETURNING *
        `;
        return row!;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        lastError = error;
      }
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
    try {
      return await this.update(userId, newNickname, current.discriminator);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      lastError = error;
    }
    // Collision: retry with new discriminators
    for (let i = 0; i < MAX_DISCRIMINATOR_RETRIES; i++) {
      try {
        return await this.update(userId, newNickname, generateDiscriminator());
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        lastError = error;
      }
    }
    throw new Error(
      `Failed to rename user after ${MAX_DISCRIMINATOR_RETRIES} attempts: ${String(lastError)}`,
    );
  }

  async setColor(userId: string, color: string | null): Promise<void> {
    await this.db`UPDATE users SET color = ${color}, updated_at = now() WHERE id = ${userId}`;
  }

  private async update(
    userId: string,
    nickname: string,
    discriminator: string,
  ): Promise<UserRow> {
    const [row] = await this.db<UserRow[]>`
      UPDATE users
      SET nickname = ${nickname}, discriminator = ${discriminator}, updated_at = now()
      WHERE id = ${userId}
      RETURNING *
    `;
    if (!row) throw new Error(`User ${userId} not found`);
    return row;
  }
}
