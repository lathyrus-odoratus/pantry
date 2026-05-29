import type { CabombInput } from "@pantry/shared";
import type { AuthedConnection } from "../connection-registry.js";
import type { ConnectionRegistry } from "../connection-registry.js";
import {
  startCabomb,
  inputCabomb,
  watchCabomb,
  unwatchCabomb,
} from "../../cabomb/manager.js";

export function handleCabombStart(
  conn: AuthedConnection,
  registry: ConnectionRegistry,
): void {
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
