import type { DB } from "./client.js";

export type RoomRow = {
  id: string;
  name: string;
  created_at: string;
  created_by: string | null;
  webhook_url: string | null;
  webhook_thread_id: string | null;
  closed_at: string | null;
};

function must(row: RoomRow | undefined, name: string): RoomRow {
  if (!row) throw new Error(`Room ${name} not found`);
  return row;
}

export class RoomsRepo {
  constructor(private db: DB) {}

  async findByName(name: string): Promise<RoomRow | null> {
    const [row] = await this.db<RoomRow[]>`SELECT * FROM rooms WHERE name = ${name}`;
    return row ?? null;
  }

  async create(name: string, createdBy?: string): Promise<RoomRow> {
    const [row] = await this.db<RoomRow[]>`
      INSERT INTO rooms (name, created_by) VALUES (${name}, ${createdBy ?? null})
      RETURNING *
    `;
    return must(row, name);
  }

  async list(): Promise<RoomRow[]> {
    return await this.db<RoomRow[]>`SELECT * FROM rooms ORDER BY created_at ASC`;
  }

  async deleteByName(name: string): Promise<void> {
    await this.db`DELETE FROM rooms WHERE name = ${name}`;
  }

  async close(name: string): Promise<RoomRow> {
    const [row] = await this.db<RoomRow[]>`
      UPDATE rooms SET closed_at = now() WHERE name = ${name} RETURNING *
    `;
    return must(row, name);
  }

  async reopen(name: string): Promise<RoomRow> {
    const [row] = await this.db<RoomRow[]>`
      UPDATE rooms SET closed_at = NULL WHERE name = ${name} RETURNING *
    `;
    return must(row, name);
  }
}
