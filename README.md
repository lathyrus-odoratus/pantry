# pantry

一個小小的終端機聊天工具。輸入房間名、開始聊。不用註冊帳號。
A small real-time TUI chat tool. Pick a room name, type, chat. No account signup required.

---

## 中文

### 怎麼用

需要 **Node 20+**（`brew install node`，或用 `nvm` / `fnm` / `asdf`），加上**邀請你的人告訴你的房間名**。「知道房間名」就是進場的鑰匙，所以不會公開列在這裡。

```sh
npx @lathyrus-odoratus/pantry@latest --room <房間名>
```

第一次跑 npx 會下載大概 50 KB 並快取住，之後秒開。

不想裝東西、只想試一下？

```sh
docker run --rm -it node:22-alpine npx --yes @lathyrus-odoratus/pantry@latest --room <房間名>
```

房間是由管理員（架站的人）預先建立的。如果你自己架站，看 [CLAUDE.md](./CLAUDE.md) 裡的 `pnpm admin room create` 流程。

### 進去之後

1. **選身分**
   - **Anonymous (just a nickname)** — 最快，每次連線都是新身分。
   - **Sign in with Discord** — 跳瀏覽器授權；同一個 Discord 帳號下次回來還是同一個人。
   - GitHub / Google 在選單上但目前未啟用（按下去會看到「provider not configured」提示）。
2. **取暱稱**（匿名才需要）— 1–20 字。系統會配一個 4 字 tag（例如 `Alice#a1b2`），同名不撞 ID。
3. **聊天** — 狀態列亮綠 `Connected` 就 OK，打字 Enter 送出。

### 指令

| 動作 | 操作 |
|---|---|
| 送訊息 | 打字 → `Enter` |
| 改暱稱 | `/nick 新名字` → `Enter` |
| 離開 | `Ctrl+C` |
| 看歷史 | 進場會有最近 50 則；更早的訊息用終端機 scrollback 滾上去看（Cmd+↑ / 滑鼠滾輪） |

### 小提醒

- **歷史**：進場顯示最新 50 則；更早的不會自動載入，但仍保存在 server。
- **Discord 授權 URL** 在窄終端會折成兩行。iTerm 3.4+ / kitty / wezterm / VSCode 支援 OSC 8，**Cmd+click 任何一段**都會開到完整 URL。本機（非 Docker）跑會幫你自動開瀏覽器，根本看不到 URL。
- **改名後**歷史訊息會保留你當時的舊名 — 這是設計，不是 bug。

---

## English

### Try it

You need **Node 20+** (`brew install node`, or use `nvm` / `fnm` / `asdf`) and a **room name** from whoever invited you — knowing the room name is how you're let in, so it's not listed publicly. Then:

```sh
npx @lathyrus-odoratus/pantry@latest --room <room-name>
```

First run downloads ~50 KB and caches it; later runs start instantly.

Want a one-shot, no-install try?

```sh
docker run --rm -it node:22-alpine npx --yes @lathyrus-odoratus/pantry@latest --room <room-name>
```

Rooms are pre-created by an admin (the person who set up the server). If you're running your own deploy, see [CLAUDE.md](./CLAUDE.md) for the `pnpm admin room create` flow.

### Inside the TUI

1. **Identity** — pick one:
   - **Anonymous (just a nickname)** — fastest; each connection is a fresh identity.
   - **Sign in with Discord** — opens a browser to authorize; the same Discord account brings the same identity back next time.
   - (GitHub / Google are listed but disabled in the current deploy — picking them shows a clean "provider not configured" message.)
2. **Nickname** (anon only) — 1–20 chars. You get an auto-assigned 4-char tag (e.g. `Alice#a1b2`) so the same nickname can be used by different people.
3. **Chat** — status line turns green `Connected`. Type away.

### Commands

| Action | How |
|---|---|
| Send a message | type → `Enter` |
| Rename yourself | `/nick <new name>` → `Enter` |
| Leave | `Ctrl+C` |
| Read history | The last 50 messages load when you join; older ones live in your terminal's own scrollback (Cmd+↑ / scroll wheel). |

### Notes

- **History on join.** You see the most recent 50 messages already in the room. Earlier messages aren't fetched on demand but stay persisted server-side.
- **Discord OAuth URL.** If the auth URL wraps to two lines in a narrow terminal, **`Cmd+click` any part of it** in iTerm 3.4+ / kitty / wezterm / VSCode — the OSC 8 hyperlink underneath spans the full URL. If you run locally (not in Docker), the browser auto-opens and you don't even see the URL.
- **Renaming.** Past messages keep your old nickname snapshot — that's intentional, not a bug. The "history" of who said what stays accurate even if you rename later.

---

## Production endpoints

- Backend: https://pantry.miao-bao.cc — health at `/health`
- Client: [`@lathyrus-odoratus/pantry`](https://www.npmjs.com/package/@lathyrus-odoratus/pantry) on npm

## For developers

Workspace layout, dev commands, architecture, and the deploy runbook are in [CLAUDE.md](./CLAUDE.md). Design doc lives at [`docs/superpowers/specs/2026-05-11-pantry-design.md`](docs/superpowers/specs/2026-05-11-pantry-design.md).
