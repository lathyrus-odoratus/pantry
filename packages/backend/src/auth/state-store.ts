import { nanoid } from "nanoid";
import type { AuthProvider } from "@pantry/shared";

const TTL_MS = 10 * 60 * 1000;

export type OAuthProvider = Exclude<AuthProvider, "anon">;

type Entry =
  | { status: "pending"; provider: OAuthProvider; expiresAt: number }
  | { status: "ready"; token: string; expiresAt: number };

export type ConsumeResult =
  | { status: "ready"; token: string }
  | { status: "pending" }
  | { status: "not_found" };

export class OAuthStateStore {
  private entries = new Map<string, Entry>();

  createPending(provider: OAuthProvider): string {
    const state = nanoid(32);
    this.entries.set(state, {
      status: "pending",
      provider,
      expiresAt: Date.now() + TTL_MS,
    });
    return state;
  }

  resolve(state: string, token: string): boolean {
    const entry = this.entries.get(state);
    if (!entry) return false;
    if (entry.expiresAt < Date.now()) {
      this.entries.delete(state);
      return false;
    }
    this.entries.set(state, {
      status: "ready",
      token,
      expiresAt: Date.now() + TTL_MS,
    });
    return true;
  }

  consume(state: string): ConsumeResult {
    const entry = this.entries.get(state);
    if (!entry) return { status: "not_found" };
    if (entry.expiresAt < Date.now()) {
      this.entries.delete(state);
      return { status: "not_found" };
    }
    if (entry.status === "pending") return { status: "pending" };
    this.entries.delete(state);
    return { status: "ready", token: entry.token };
  }

  getProvider(state: string): OAuthProvider | null {
    const entry = this.entries.get(state);
    if (!entry || entry.status !== "pending") return null;
    return entry.provider;
  }
}
