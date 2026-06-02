import type { CabombInput, CabombPing } from "@pantry/shared";
import type { AuthedConnection } from "../connection-registry.js";
import type { ConnectionRegistry } from "../connection-registry.js";
import { send } from "../broadcast.js";
import {
  startCabomb,
  inputCabomb,
  watchCabomb,
  unwatchCabomb,
} from "../../cabomb/manager.js";
import { isExtGameActive } from "../../ext-game/manager.js";

export function handleCabombStart(
  conn: AuthedConnection,
  registry: ConnectionRegistry,
): void {
  if (isExtGameActive(conn.roomId)) {
    send(conn, { type: "error", code: "bad_request" });
    return;
  }
  startCabomb(conn, registry);
}

export function handleCabombInput(
  conn: AuthedConnection,
  msg: CabombInput,
  registry: ConnectionRegistry,
): void {
  inputCabomb(conn, msg.key, registry);
}

export function handleCabombWatch(conn: AuthedConnection): void {
  watchCabomb(conn);
}

export function handleCabombLeave(conn: AuthedConnection): void {
  unwatchCabomb(conn);
}

export function handleCabombPing(conn: AuthedConnection, msg: CabombPing): void {
  send(conn, { type: "cabomb.pong", t: msg.t });
}
