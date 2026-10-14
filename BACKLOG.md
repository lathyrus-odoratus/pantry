# Pantry Backlog

Future work captured so it's not just in my head / scattered in commits. Ordered roughly by "how ready to pick up", not strict priority. Items struck through are done; line through with the version they shipped in.

Current shipped state: **0.1.17** — TRPG world MVP with GM-driven dice, prompt caching, weighted credit accounting.

---

## ⚡ Ready to pick up (well-scoped, low ambiguity)

- **Revert testing-mode trigger when we've seen enough data.** `shouldTriggerNpc` in `brain.ts` currently returns `true` for every player message. Restore the name-gated check (`return body.includes(NPC.nickname)`) once the always-respond run-rate stops surfacing new signal. Re-enable the corresponding tests. ~10 min.
- **Move credit weights to config.** The `W_INPUT / W_CACHE_WRITE / W_CACHE_READ / W_OUTPUT` constants in `brain.ts` are Haiku 4.5–specific. Lift to an env-keyed lookup so swapping `MODEL` doesn't silently break the $ → credit conversion. Pair with documenting Sonnet 4.6 weights for when we want to try it. ~30 min.
- **Per-world cost summary at end-of-world.** Already log per-call; add an aggregate log line on `endWorld` (`total_credit`, `total_usd_estimate`, `npc_turns`, `dice_rolls`) so we can grep one line per session instead of summing. ~15 min.
- **Persist world session metadata.** New tables `worlds` (id, room_id, opened_at, ended_at, reason, credit_total, credit_used) and optionally `chronicles` (world_id, summary). Lets us query history without grepping container logs. Migration + minimal repo + insert at `endWorld`. ~1 h.
- **Show world status to the operator.** Let the operator see "is a world running, how much credit left, how many turns" without `docker logs`. The `pnpm admin` CLI was retired in #67 (the database is no longer reachable from outside the host), so surface it in the admin TUI (`pantry --admin`) backed by the existing admin WS connection, or as a `GET /admin/world` endpoint gated by `ADMIN_KEY` like `/admin/broadcast`. ~30 min.

---

## 🎲 World feature — next iteration

- **House rules / world bible at open time.** `/the-world <setting>` (or `/the-world` + a multi-line prompt) injects extra system-prompt content for that session: world tone, available skills, dice conventions, taboos. Stored on `ActiveWorld`. The 0.1.13 playtest summary explicitly flagged this: *「NPC 多次催促確認規則，說明 GM 規則設定不夠明確」*.
- **Crit / fumble emphasis on rolls.** When the player rolls a natural max or natural 1 on `d20`, decorate the system event (`✨` / `💥`) and surface it visibly. Adds drama with no LLM cost.
- **Skill-check shape: `[[roll:d20 vs 15]]`.** Marker carries the DC; server reports `success`/`fail` alongside the raw number, fed into transcript as a structured outcome. Easier for the NPC to react with appropriate consequence.
- **Advantage / disadvantage.** Marker form `[[roll:d20!adv]]` / `[[roll:d20!dis]]`: server rolls twice, picks max / min. The NPC can invoke when situational (cover, prone, etc.).
- **Per-room NPC override.** Right now `灰袍旅人` is hard-coded in `world/npc.ts`. Move persona (subject, nickname, emoji, system_prompt block) to a YAML/JSON loaded at startup, eventually per-room overrides via the admin TUI (the `pnpm admin` CLI was retired in #67). Pre-req for the multi-NPC idea below.
- **Multi-NPC in one world.** Several `virtual` participants in the room, each with own persona. Brain becomes a router: per player message, decide which NPC(s) speak (or none). Significant — adds an arbitration layer. Defer until single-NPC has been played enough.
- **NPC name-gated trigger heuristic.** When we go back to "only respond when named", improve detection beyond `body.includes(name)`. Cases to handle: addressed by you/旅人/the traveler synonyms, indirect references, attempting to talk to a different NPC.

---

## 💾 Cross-session persistence (locked design, deferred MVP)

The 0.1.13 spec called this out and kept it out of scope. Picking it up is a project on its own.

- **Chronicle DB** (`chronicles` table with world_id + summary + structured findings).
- **Player character continuity** (XP, items, reputation, NPC bonds keyed on stable `subject`).
- **Collective curses / quests carried forward** to subsequent worlds (re-inject into next world's system prompt).
- **First-X / hall of fame** — public record of who first did X.
- **`/chronicle [version]`** — read past world summaries in-TUI.

The end-summary footer 「下一場世界開啟時，NPC 不會記得這次」 is the marker for "remove this line once cross-session memory is real."

---

## 👤 Identity & profile

Raised 2026-10-14 while making Discord relay posts show the author's name (#68). The original design (`docs/superpowers/specs/2026-05-11-pantry-design.md`, brainstorm transcript) settled on "anonymous nickname + third-party OAuth" (Discord was added later in that brainstorm) and never discussed avatars, profiles, or switching identity mid-session. User mix on 2026-10-14: 118 anon, 3 Discord, 1 NPC.

- **Decide whether the chat flow should persist the OAuth token.** The spec says the token goes to `~/.pantry/credentials.json` (mode 600, 7-day JWT, no refresh) and is reused across launches, deleted on `invalid_token`. Only `--admin` does that today (`AdminOAuthWaiting.tsx`); the chat flow (`OAuthWaiting.tsx`) runs a full browser OAuth on every launch and keeps the token in memory for reconnects only. `auth/credentials.ts` has existed since `59b89ce`. Unclear whether skipping it was deliberate. Trade-off: persisting removes the browser round-trip each launch, but anything refreshed at login (avatar, see below) then only updates every ≤ 7 days. Decide this before the avatar work, since it sets how fresh avatars are.
- **Discord avatar on relayed messages.** Designed, not built. Migration `0002` adds a generic `users.avatar_url`; the Discord OAuth callback fills it from `/users/@me` (`https://cdn.discordapp.com/avatars/<id>/<hash>.png`, or `embed/avatars/<n>.png` when the user has none) and refreshes it on every login, since the hash changes when they change avatars. The connection carries it, and `discord/webhook.ts` sends it as `avatar_url` next to `username` (split runs by username + avatar). Anonymous users keep the webhook's own avatar. A stale hash just 404s and Discord falls back to the webhook avatar. Always-fresh avatars would need a Discord bot token to look users up; not worth it now. Pantry stores nothing else from Discord: `global_name ?? username` only seeds the nickname at first login (truncated to 20).
- **`/avatar` with app-provided presets.** Let users pick from a few avatars the app ships, plus "use my Discord avatar" for Discord users; writes the same `users.avatar_url`. Name it for what the user wants (`/avatar`, like `/nick` and `/color`), not for the mechanism — a `fetch-discord-avatar`-style command was considered and dropped: it would still need a browser OAuth round-trip to get a fresh hash, which is no better than relaunching.
- **Sign in / switch identity / sign out from chat.** Identity is chosen only at launch; an anonymous user who wants to become their Discord identity has to restart. Open questions if we do it: what happens to the anon user's messages (anon rows are per-connection, so there is nothing to merge into), and whether sign-out should also clear a persisted token (depends on the first item).

---

## 🛠 Quality / polish

- **Slash command dispatcher.** `InputBar` has grown an if/else chain of `cmd === "..."`. Extract a small client-side dispatcher + a parallel server-side switch refactor. Worth doing before the next 2-3 commands land.
- **Replace nickname-based NPC detection with a structured `kind` field.** Currently the TUI infers NPC by `nickname === "灰袍旅人"`. When we add multi-NPC, this breaks. Add `kind: "human" | "npc"` to `UserSchema` and `presence` payloads; client uses that.
- **20-block lookback for prompt cache.** The Anthropic skill notes that cache breakpoints walk back at most 20 content blocks. Once world sessions routinely exceed 20 turns, place intermediate `cache_control` breakpoints (every ~15 blocks) so cache hits continue. Investigate when we see cache_read rates dropping mid-session.
- **`/help` and `/changelog` exclusivity.** Currently if `changelogOpen` is true, slash commands typed in the modal still parse from `useInput`. Decide whether `q` is the only way out or whether slash commands also dismiss.
- **Fix pre-existing `IdentitySelect.test.tsx` flake.** Fails ~1/3 of runs on main since well before world work — likely zustand store-state pollution between tests. Add `beforeEach(useStore.getState().reset)` or move the affected assertion.

---

## 🔍 Investigations (data first, decide after)

- **How many turns does a real session get on the 100k weighted budget?** Compare pre-/post-0.1.17 caching impact. Goal: confirm the ~2-3× improvement we predicted on paper.
- **Does the NPC over- or under-trigger `[[roll:...]]` markers?** Count marker frequency per session; if too sparse, prompt-tune for more proactive use; if too dense, tighten "only when uncertainty genuinely matters."
- **How often does the NPC try to write simplified Chinese after the 0.1.16 SUMMARY_SYSTEM_PROMPT fix?** Grep `messages` for simplified-only characters (e.g. `[为实对过来个们现时会点没说听]`). If non-zero, prompt-strengthen.
- **End-summary quality on long sessions.** The 0.1.13 summary was decent; sample more across different play styles to see if it generalizes.

---

## 🚫 Explicitly not now (considered, deferred)

- **`/update` slash command.** Discussed and dropped — Node can't cleanly self-relaunch, and the StatusBar hint already serves the discoverability purpose. May revisit if the hint isn't enough.
- **Pantry-as-MMO global world.** Earlier brainstorm asked "one global world everyone joins" — pivoted to "any room can host one world at a time" before any code. Don't resurrect without a strong reason.
- **Bots framework as a separate npm package (companion-process model).** Originally recommended over server-internal NPCs; user picked server-internal for simplicity. Keep the option live in mind if we need to host bots outside the backend.
- **Voice-channel integration / Discord bridge.** Out of scope — voice happens in Discord call, text in Pantry. If something needs to flow between them, do it via the existing webhook one-way (Pantry → Discord text).
