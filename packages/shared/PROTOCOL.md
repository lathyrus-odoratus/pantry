# Pantry WS Protocol — Forward Compatibility Rules

The Pantry WebSocket protocol is committed to **forward compatibility**: a server upgrade must never break an older client that's still sitting in someone's `npx` cache.

## Invariants (NEVER violate)

1. **Never remove a field** from an existing message. Even if no code reads it, leave the field declared.
2. **Never change the type of an existing field.** `string` stays `string`; `number` stays `number`.
3. **Optional stays optional.** Don't promote an optional field to required.
4. **Unknown `type` discriminators MUST be silently ignored.** Both client and server: if you receive a message whose `type` you don't recognise, drop it. Never throw, never close the socket.
5. **New required behaviour goes behind capability flags** exchanged at auth time, not behind protocol-version gating. (e.g. add `capabilities: ["edit-message"]` to the auth payload; server keys feature availability off that.)

## How to add a new field

- **Optional, additive only.** Old peers parse the message without seeing the field; that's by design.
- **Add zod test that parses payloads with AND without the new field** to prevent accidental tightening later. See `src/protocol.test.ts` for the canonical pattern.

## How to add a new message type

- New `type` literal, new schema in `ClientMessageSchema` or `ServerMessageSchema` discriminated union.
- Receivers that don't know the type: the schema parse fails → handler logs `warn` and drops the frame. Do NOT close the socket on parse failure.

## How to retire a message type

- Stop sending it. Leave the schema in place indefinitely so old peers keep parsing what they DO send.
- Removing a schema entry is a breaking change; bump major and bake a long deprecation window.

## Version metadata

- Client sends `clientVersion` in `auth.anon` / `auth.oauth` payloads. Server logs it; nothing more.
- Server returns `latestClientVersion` in `auth.ok`. Client compares and may render an upgrade hint. Server NEVER refuses an old client.

## When you genuinely need to break compat

- Don't. Add a new endpoint or a new message type instead.
- If truly unavoidable: bump the `name` field in `package.json` (`@lathyrus-odoratus/pantry` → `@lathyrus-odoratus/pantry2`). This guarantees old `npx` users keep using the old server-compatible binary.
