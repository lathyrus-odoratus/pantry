# pantry

Tiny TUI chat client. Companion to a pantry backend.

## Usage

```sh
npx @lathyrus-odoratus/pantry
```

Steps inside the TUI:

1. Type a room name → Enter.
2. Pick Anonymous (Discord OAuth also supported).
3. Type a nickname (for anon) or sign in.
4. Chat. `/nick <name>` to rename. `Ctrl+C` to quit.

## CLI flags

| Flag | Description |
|---|---|
| `--server <ws-url>` | Override the backend WebSocket URL. Defaults to `wss://pantry.miao-bao.cc/ws`. |
| (env) `PANTRY_SERVER` | Same as `--server`. |
