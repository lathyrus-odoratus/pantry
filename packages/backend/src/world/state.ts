export type TranscriptEntry = {
  role: "player" | "npc";
  authorLabel: string;
  body: string;
  at: number;
};

export type ActiveWorld = {
  roomId: string;
  npcUserId: string;
  npcConnectionId: string;
  startedAt: number;
  creditUsed: number;
  creditTotal: number;
  transcript: TranscriptEntry[];
  // Captured at world.open from the opener's connection so the end-summary
  // can be pushed to the same Discord webhook even though endWorld doesn't
  // have a triggering connection in hand.
  webhook: { url: string; threadId: string | null } | null;
  // Set to true while an LLM call is in flight so a second concurrent
  // trigger drops the turn rather than racing the in-flight one.
  brainBusy: boolean;
};

export class WorldStateStore {
  private active: ActiveWorld | null = null;

  get(): ActiveWorld | null {
    return this.active;
  }

  set(w: ActiveWorld | null): void {
    this.active = w;
  }

  isActive(): boolean {
    return this.active !== null;
  }

  isActiveInRoom(roomId: string): boolean {
    return this.active?.roomId === roomId;
  }

  appendTranscript(e: TranscriptEntry): void {
    if (this.active) this.active.transcript.push(e);
  }

  addCreditUsage(tokens: number): void {
    if (this.active) this.active.creditUsed += tokens;
  }
}
