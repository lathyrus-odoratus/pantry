import { create } from "zustand";
import type { AdminRoomSummary, Message, MapV1 } from "@pantry/shared";
import type { DisconnectDetail } from "./transport/client.js";
import { DEFAULT_PREFS, savePrefs, type Prefs } from "./prefs.js";

export type Screen =
  | "room_input"
  | "identity_select"
  | "nickname_input"
  | "oauth_waiting"
  | "chat"
  | "admin_oauth"
  | "admin_menu"
  | "map_view"
  | "error";

export type ConnStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type Identity =
  | { kind: "anon"; nickname: string; subject: string }
  | { kind: "oauth"; provider: "github" | "google" | "discord"; token: string };

export type PresenceUser = {
  nickname: string;
  discriminator: string;
  color?: string | null;
};

export type AuthedUser = {
  id: string;
  nickname: string;
  discriminator: string;
};

export type Store = {
  // Screen state
  screen: Screen;
  errorMessage: string | null;

  // Form state
  roomName: string;
  pendingIdentity: Identity | null;

  // Connection state
  status: ConnStatus;
  reconnectAttempt: number;
  lastDisconnect: DisconnectDetail | null;

  // Authed session state
  authedUser: AuthedUser | null;
  roomId: string | null;
  messages: Message[];
  onlineUsers: PresenceUser[];
  historyHasMore: boolean;

  // Update awareness
  updateAvailable: string | null;

  // Changelog modal
  changelogOpen: boolean;
  changelogIndex: number;

  // Settings modal
  settingsOpen: boolean;
  prefs: Prefs;

  // World feature
  worldActive: boolean;
  worldCreditUsed: number;
  worldCreditTotal: number;

  // Admin mode
  adminRooms: AdminRoomSummary[];
  adminStatusLine: string | null;

  // Map viewer (pantry --map <permalink>)
  viewedMap: MapV1 | null;

  // Actions
  setScreen: (s: Screen) => void;
  commitRoomName: (name: string) => void;
  setPendingIdentity: (i: Identity | null) => void;
  setStatus: (s: ConnStatus, attempt?: number, detail?: DisconnectDetail) => void;
  onAuthOk: (user: AuthedUser, roomId: string) => void;
  setSnapshot: (
    roomId: string,
    messages: Message[],
    online: PresenceUser[],
  ) => void;
  addMessage: (m: Message) => void;
  prependHistory: (older: Message[], hasMore?: boolean) => void;
  setPresence: (users: PresenceUser[]) => void;
  renameSelf: (nickname: string, discriminator: string) => void;
  setUpdateAvailable: (latest: string | null) => void;
  openChangelog: () => void;
  closeChangelog: () => void;
  setChangelogIndex: (i: number) => void;
  openSettings: () => void;
  closeSettings: () => void;
  setPrefs: (p: Prefs) => void;
  setWorldState: (state: {
    active: boolean;
    creditUsed: number;
    creditTotal: number;
  }) => void;
  setAdminRooms: (rooms: AdminRoomSummary[]) => void;
  setAdminStatusLine: (line: string | null) => void;
  setError: (msg: string) => void;
  reset: () => void;
};

const initial: Omit<
  Store,
  | "setScreen"
  | "commitRoomName"
  | "setPendingIdentity"
  | "setStatus"
  | "onAuthOk"
  | "setSnapshot"
  | "addMessage"
  | "prependHistory"
  | "setPresence"
  | "renameSelf"
  | "setUpdateAvailable"
  | "openChangelog"
  | "closeChangelog"
  | "setChangelogIndex"
  | "openSettings"
  | "closeSettings"
  | "setPrefs"
  | "setWorldState"
  | "setAdminRooms"
  | "setAdminStatusLine"
  | "setError"
  | "reset"
> = {
  screen: "room_input",
  errorMessage: null,
  roomName: "",
  pendingIdentity: null,
  status: "idle",
  reconnectAttempt: 0,
  lastDisconnect: null,
  authedUser: null,
  roomId: null,
  messages: [],
  onlineUsers: [],
  historyHasMore: true,
  updateAvailable: null,
  changelogOpen: false,
  changelogIndex: 0,
  settingsOpen: false,
  prefs: DEFAULT_PREFS,
  worldActive: false,
  worldCreditUsed: 0,
  worldCreditTotal: 0,
  adminRooms: [],
  adminStatusLine: null,
  viewedMap: null,
};

export const useStore = create<Store>((set) => ({
  ...initial,

  setScreen: (screen) => set({ screen }),

  commitRoomName: (roomName) => set({ roomName, screen: "identity_select" }),

  setPendingIdentity: (pendingIdentity) => set({ pendingIdentity }),

  setStatus: (status, attempt, detail) =>
    set((s) => ({
      status,
      reconnectAttempt: attempt ?? (status === "connected" ? 0 : s.reconnectAttempt),
      lastDisconnect:
        status === "connected" ? null : detail ?? s.lastDisconnect,
    })),

  onAuthOk: (authedUser, roomId) =>
    set({ authedUser, roomId, screen: "chat", status: "connected" }),

  setSnapshot: (roomId, messages, onlineUsers) =>
    set({ roomId, messages, onlineUsers, historyHasMore: messages.length >= 50 }),

  addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),

  prependHistory: (older, hasMore) =>
    set((s) => {
      const known = new Set(s.messages.map((m) => m.id));
      const fresh = older.filter((m) => !known.has(m.id));
      return {
        messages: [...fresh, ...s.messages],
        historyHasMore: hasMore ?? s.historyHasMore,
      };
    }),

  setPresence: (onlineUsers) => set({ onlineUsers }),

  renameSelf: (nickname, discriminator) =>
    set((s) =>
      s.authedUser
        ? { authedUser: { ...s.authedUser, nickname, discriminator } }
        : s,
    ),

  setUpdateAvailable: (updateAvailable) => set({ updateAvailable }),

  openChangelog: () => set({ changelogOpen: true, changelogIndex: 0 }),
  closeChangelog: () => set({ changelogOpen: false }),
  setChangelogIndex: (changelogIndex) => set({ changelogIndex }),

  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  setPrefs: (prefs) => {
    set({ prefs });
    void savePrefs(prefs);
  },

  setWorldState: ({ active, creditUsed, creditTotal }) =>
    set({
      worldActive: active,
      worldCreditUsed: creditUsed,
      worldCreditTotal: creditTotal,
    }),

  setAdminRooms: (adminRooms) => set({ adminRooms }),
  setAdminStatusLine: (adminStatusLine) => set({ adminStatusLine }),

  setError: (errorMessage) => set({ errorMessage, screen: "error" }),

  reset: () => set((s) => ({ ...initial, prefs: s.prefs })),
}));
