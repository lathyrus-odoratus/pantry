import type { WebhookTarget } from "../discord/webhook.js";

export type AuthedConnection = {
  id: string;
  userId: string;
  roomId: string;
  nickname: string;
  discriminator: string;
  webhook: WebhookTarget | null;
  sendRaw: (text: string) => void;
  close: (code?: number, reason?: string) => void;
};

export class ConnectionRegistry {
  private byId = new Map<string, AuthedConnection>();
  private byRoom = new Map<string, Set<string>>();

  add(conn: AuthedConnection): void {
    this.byId.set(conn.id, conn);
    let set = this.byRoom.get(conn.roomId);
    if (!set) {
      set = new Set();
      this.byRoom.set(conn.roomId, set);
    }
    set.add(conn.id);
  }

  remove(conn: AuthedConnection): void {
    this.byId.delete(conn.id);
    const set = this.byRoom.get(conn.roomId);
    if (!set) return;
    set.delete(conn.id);
    if (set.size === 0) this.byRoom.delete(conn.roomId);
  }

  get(id: string): AuthedConnection | undefined {
    return this.byId.get(id);
  }

  listByRoom(roomId: string): AuthedConnection[] {
    const set = this.byRoom.get(roomId);
    if (!set) return [];
    const out: AuthedConnection[] = [];
    for (const id of set) {
      const c = this.byId.get(id);
      if (c) out.push(c);
    }
    return out;
  }

  rename(connectionId: string, nickname: string, discriminator: string): void {
    const c = this.byId.get(connectionId);
    if (!c) return;
    c.nickname = nickname;
    c.discriminator = discriminator;
  }
}
