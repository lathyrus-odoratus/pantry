# pantry

Small real-time TUI chat tool. Backend on a single VM behind Cloudflare Tunnel; client published to npm.

## Production

- Backend: https://pantry.miao-bao.cc (health: `/health`)
- Client: `npx @lathyrus-odoratus/pantry@latest`

```sh
# Try it
npx @lathyrus-odoratus/pantry@latest --room <room-name>
```

The room must be pre-created by an admin (see [docs/superpowers/specs](docs/superpowers/specs/2026-05-11-pantry-design.md) §8).

## Repo

Workspace layout, dev commands, architecture, and the deploy runbook are documented in [CLAUDE.md](./CLAUDE.md).
