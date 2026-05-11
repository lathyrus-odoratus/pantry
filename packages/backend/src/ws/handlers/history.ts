import type { ServerMessage, HistoryLoad } from "@pantry/shared";
import type { MessagesRepo } from "../../db/messages.js";
import type { AuthedConnection } from "../connection-registry.js";
import { send } from "../broadcast.js";

export type HistoryDeps = {
  messages: MessagesRepo;
};

export async function handleHistory(
  conn: AuthedConnection,
  raw: HistoryLoad,
  deps: HistoryDeps,
): Promise<void> {
  const { messages, hasMore } = await deps.messages.listBefore(
    conn.roomId,
    raw.beforeId,
    raw.limit,
  );
  const out: ServerMessage = { type: "history", messages, hasMore };
  send(conn, out);
}
