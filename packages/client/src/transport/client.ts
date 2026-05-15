import WebSocket from "ws";
import {
  ServerMessageSchema,
  type ServerMessage,
  type ClientMessage,
} from "@pantry/shared";

export type Status =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type DisconnectDetail = {
  code?: number;
  reason?: string;
  error?: string;
};

export type TransportOptions = {
  url: string;
  onStatus: (s: Status, attempt?: number, detail?: DisconnectDetail) => void;
  onMessage: (m: ServerMessage) => void;
  backoffSchedule?: number[]; // milliseconds, last value caps
  maxReconnects?: number; // default: Infinity
};

const DEFAULT_BACKOFF = [2000, 4000, 8000, 16000, 30000];

export class TransportClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private attempts = 0;
  private closedByUser = false;
  private backoff: number[];
  private maxReconnects: number;
  private lastDetail: DisconnectDetail | null = null;
  private pendingError: string | null = null;

  constructor(private opts: TransportOptions) {
    this.backoff = opts.backoffSchedule ?? DEFAULT_BACKOFF;
    this.maxReconnects = opts.maxReconnects ?? Infinity;
  }

  connect(): void {
    this.closedByUser = false;
    this.pendingError = null;
    this.opts.onStatus(
      this.attempts === 0 ? "connecting" : "reconnecting",
      this.attempts,
      this.lastDetail ?? undefined,
    );
    const ws = new WebSocket(this.opts.url);
    this.ws = ws;

    ws.on("open", () => {
      this.attempts = 0;
      this.lastDetail = null;
      this.pendingError = null;
      this.opts.onStatus("connected", 0);
    });

    ws.on("message", (data: WebSocket.RawData) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      const result = ServerMessageSchema.safeParse(parsed);
      if (!result.success) return;
      this.opts.onMessage(result.data);
    });

    ws.on("error", (err: Error) => {
      this.pendingError = err.message;
    });

    ws.on("close", (code: number, reasonBuf: Buffer) => {
      const reason = reasonBuf?.toString() || undefined;
      this.lastDetail = {
        code,
        reason,
        error: this.pendingError ?? undefined,
      };
      this.pendingError = null;
      if (this.closedByUser) {
        this.opts.onStatus("disconnected", undefined, this.lastDetail);
        return;
      }
      this.scheduleReconnect();
    });
  }

  send(msg: ClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.opts.onStatus("disconnected");
  }

  private scheduleReconnect(): void {
    if (this.attempts >= this.maxReconnects) {
      this.opts.onStatus("disconnected", undefined, this.lastDetail ?? undefined);
      return;
    }
    const idx = Math.min(this.attempts, this.backoff.length - 1);
    const delay = this.backoff[idx] ?? this.backoff[this.backoff.length - 1] ?? 5000;
    this.attempts += 1;
    this.opts.onStatus("reconnecting", this.attempts, this.lastDetail ?? undefined);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
