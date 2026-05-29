# CA-bomb 全房旁觀版 — 設計文件

> 日期：2026-05-29
> 狀態：定稿（待實作）
> 前置：離線 POC（`pantry --ca-bomb`，見 PR #29）已完成，本文件是把它升級成「房內共享」的後續設計。

## 目標

把 CA-bomb 從單機離線 POC，升級成**伺服器主導**的房內遊戲：
房裡一人玩（driver），其他人可**選擇性**進入**全螢幕**旁觀。比照已發佈的
`/bomb`（server-authoritative + broadcast）的模型，但旁觀採「opt-in、不打擾」。

## 參與模型（第一版）

- **一人 driver**（開局者）操作，全房可選擇性旁觀。
- 真‧多人同場（多 driver 一起動）= **out of scope**，之後再說。
- `/ca-bomb` 與既有 `/bomb` 是**兩個獨立遊戲**；`/bomb` 維持不動。

## UX 流程

1. driver 在聊天輸入 `/ca-bomb` → 後端在該房開一場（每房同時一場），driver 直接進全螢幕。
2. 後端廣播「開局」→ 全房：
   - 聊天插一則系統訊息：「`X#1234` 開了一場 CA-bomb，輸入 `/watch` 旁觀」。
   - **status bar 持續顯示**：`🎮 遊戲進行中 · /watch 旁觀（/watch bw 黑白）`，直到結束。
     涵蓋 AFK、中途想看、開局後才進房的人。
3. 其他人**照常聊天、不被打擾**（被動提示，不彈阻擋式 modal、不吃鍵盤）。
4. 想看就用指令進場（比照 `/roll` 要主動輸入）：
   - `/watch` → 全螢幕**彩色**旁觀
   - `/watch bw` → 全螢幕**黑白**旁觀（亮度灰階）
5. 全螢幕內：
   - **driver**：WASD 移動（推箱）、Space 放水球、q 離開。
   - **旁觀者**：只有 q 離開。
6. 離開全螢幕（q）→ 回聊天（見「終端機交接」）。
7. 結束（清光敵人 / driver 心歸零 / driver 斷線）→ 廣播 game over：
   - 全螢幕內的人看到結算、按 q 回聊天。
   - 聊天端 status bar 提示消失。
   - 成績系統訊息 +（可選）Discord 推送（沿用 POC 的 `PANTRY_DISCORD_WEBHOOK`）。

## 渲染

- 全螢幕、flicker-free：沿用 POC 的 `caBombRun`（接管替代螢幕緩衝區 + 游標 home 整幀覆蓋 + DEC 同步更新 `?2026h/l`）。
- 改成**吃 WS 廣播狀態來畫**，分兩種角色：
  - **spectator**：只畫收到的狀態，不跑本地引擎，只收 `q`。
  - **driver**：一樣畫廣播狀態，但把 WASD/Space 當輸入**送後端**（不本地模擬，等廣播回來）。
- **殘影/動畫仍在 client 端算**（30fps 重繪、依玩家位置變化補殘影），與廣播頻率脫鉤。
- **黑白模式（`/watch bw`）**：
  - 純 client 端渲染切換、零協定/後端成本。
  - 每格 fg/bg 用亮度公式轉灰階：`Y = 0.299·R + 0.587·G + 0.114·B`，輸出 `(Y,Y,Y)`。
  - 形狀/明暗對比保留、只去顏色。玩家/敵人/水球/水花/道具/殘影一律走灰階。
  - **只給旁觀者**；driver 永遠彩色。

## 架構

### 引擎位置（重要取捨）

把 CA-bomb 引擎放 **`@pantry/shared`**：
- 後端當**權威**跑（tick、碰撞、爆炸、敵人、道具）。
- 離線 `--ca-bomb`（PR #29）**重用同一份**。
- 避免「後端一份、client 一份」邏輯漂移。
- 實作時把 POC 的 `caBombMock.ts` 純邏輯搬進 shared（去掉 React/IO 依賴）。

### 後端（比照 `/bomb`）

- **引擎**：from `@pantry/shared`。
- **manager**（per-room）：每房一場、tick loop、driver 斷線即結束、維護「該房有無進行中遊戲 + driver 是誰 + 旁觀者集合」。
- **handlers**：開局 / driver 輸入 / 旁觀註冊+取消 / 結束。

### 協定（草案；以 `cabomb.*` 命名，避免和 `/bomb` 的 `game.*` 衝突）

client → server：
- `cabomb.start` — 開局（呼叫者成為 driver）。
- `cabomb.input { key: "w"|"a"|"s"|"d"|"bomb"|"quit" }` — 僅 driver 有效，他人回 error。
- `cabomb.watch` — 註冊為旁觀者（server 開始送狀態給他）。
- `cabomb.leave` — 取消旁觀 / driver 主動結束。

server → client：
- `cabomb.started { by }` — **廣播全房**（驅動系統訊息 + status bar）。
- `cabomb.state { map, player, bombs, blasts, enemies, items, stats, status }`
  — **只送 driver + 旁觀者**（不送沒在看的人，省流量、也避開放大）。
- `cabomb.over { result, by, summary }` — **廣播全房**（關提示、印成績）。
- 房內「有無進行中遊戲」需讓**後進房 / 重連**的人也知道：
  在 `room.snapshot`（或 `auth.ok`）夾帶 `activeGame?: { kind: "cabomb", by }`，
  好讓 status bar 立刻顯示提示。

### client

- 指令：`/ca-bomb`（開局，driver 進全螢幕）、`/watch`、`/watch bw`（`bw` 為子參數，比照 `/color reset` 風格）。
- store：`roomGameActive`（驅動 status bar 提示）。
- 全螢幕渲染器吃廣播（driver/spectator/mono 三種模式）。
- 終端機交接走「做法 #1」。

## 終端機交接（做法 #1：unmount → 跑 → remount）

全螢幕渲染器會接管終端機，不能和 Ink 聊天同時跑，所以進場時：

1. `app.exit()` 卸載 Ink 聊天、還原終端機。
2. `cli.tsx` 主迴圈在 `waitUntilExit()` 後，若有「進場請求」就跑全螢幕渲染器（driver 或 spectator）。
3. 跑完 `render(<App/>)` 回聊天。

**代價與已驗證的安全點：**
- **身分不變**：OAuth 靠 token；匿名靠持久化的 `subject`（client 存 store + `~/.pantry`，後端
  `auth.ts` 收到會 `findByProviderSubject("anon", subject)` 重用同一個 user）→ 回來仍是同樣的
  `nickname#discriminator`。
- **歷史補回**：重連時後端送 `room.snapshot`（最近 50 則 + 在線名單，全來自 DB）。
- **已知副作用（可接受）**：
  - 房間會看到進出者 **leave 一下又 join**（系統訊息小雜訊、presence 閃一下）。
  - **旁觀時無法同時聊天**（全螢幕互斥；這是選「全螢幕乾淨不閃」的取捨）。
  - snapshot 只給最近 50 則，洗超過 50 則才需 `history.load` 往上捲。

## 網路 / 注意

- **不要 30fps 打全房**。狀態廣播採「**有變化才送**」：driver 輸入即時送 + 計時事件
  （敵人每步、炸彈引爆/清除）。client 自己 30fps 重繪做殘影。
- 狀態只送 driver + 旁觀者集合（非全房）。
- 與 **issue #24**（`game.input` 無節流、對全房放大）同源——順手做節流/合併。

## 階段（phased）

1. **後端引擎 + 協定**：引擎搬 `@pantry/shared`、定 `cabomb.*` 協定、manager + tick + 廣播；
   先用 log / 既有 inline 驗證狀態正確。
2. **client driver 全螢幕**：`/ca-bomb` 開局、driver 操作（送輸入、吃廣播）、結束回聊天。
3. **旁觀 + status bar + `/watch`(+`bw`)**：開局系統訊息、status bar 提示、`/watch`/`/watch bw`
   進旁觀、`activeGame` 夾帶 snapshot、game over 收尾。
4. **打磨**：廣播節流、成績/Discord、邊角（AFK、後進房、driver 斷線）。

## Out of scope（這版不做）

- 真‧多人同場（多 driver）。
- 旁觀時邊看邊聊（全螢幕互斥）。
- 把 CA 渲染接回既有 `/bomb`。
