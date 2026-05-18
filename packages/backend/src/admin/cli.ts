#!/usr/bin/env node
import { cac } from "cac";
import readline from "node:readline";
import { loadConfig } from "../config.js";
import { createSupabaseClient } from "../db/supabase.js";
import { RoomsRepo } from "../db/rooms.js";
import { UsersRepo, type UserRow } from "../db/users.js";

const cli = cac("pantry-admin");

function makeRepos() {
  const config = loadConfig();
  const db = createSupabaseClient(config);
  return {
    rooms: new RoomsRepo(db),
    users: new UsersRepo(db),
  };
}

function readRawFlag(flag: string): string | undefined {
  const argv = process.argv;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === flag) return argv[i + 1];
    if (a !== undefined && a.startsWith(`${flag}=`)) return a.slice(flag.length + 1);
  }
  return undefined;
}

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

cli
  .command("room create <name>", "Create a new room")
  .action(async (name: string) => {
    const { rooms } = makeRepos();
    const existing = await rooms.findByName(name);
    if (existing) {
      console.error(`Room "${name}" already exists.`);
      process.exit(1);
    }
    const room = await rooms.create(name);
    console.log(`✓ Created room "${room.name}" (id: ${room.id})`);
  });

cli
  .command("room list", "List all rooms")
  .action(async () => {
    const { rooms } = makeRepos();
    const list = await rooms.list();
    if (list.length === 0) {
      console.log("(no rooms)");
      return;
    }
    console.log(
      "NAME".padEnd(24) +
        "ID".padEnd(40) +
        "WEBHOOK".padEnd(10) +
        "STATE".padEnd(8) +
        "CREATED",
    );
    for (const r of list) {
      const webhook = r.webhook_url
        ? r.webhook_thread_id
          ? "url+thr"
          : "url"
        : "—";
      const state = r.closed_at ? "closed" : "open";
      console.log(
        r.name.padEnd(24) +
          r.id.padEnd(40) +
          webhook.padEnd(10) +
          state.padEnd(8) +
          new Date(r.created_at).toISOString(),
      );
    }
  });

cli
  .command("room set-webhook <name> <url>", "Bind a Discord webhook to a room")
  .option("--thread <id>", "Discord forum/thread id (optional)")
  .action(async (name: string, url: string, _opts: { thread?: string }) => {
    // Read --thread directly from argv: cac coerces numeric strings to Number,
    // which loses precision on Discord snowflakes (≥ 2^53).
    const threadId = readRawFlag("--thread");
    const { rooms } = makeRepos();
    const existing = await rooms.findByName(name);
    if (!existing) {
      console.error(`Room "${name}" not found.`);
      process.exit(1);
    }
    const updated = await rooms.setWebhook(name, {
      url,
      threadId: threadId ?? null,
    });
    console.log(
      `✓ Bound webhook for "${updated.name}"` +
        (updated.webhook_thread_id ? ` (thread ${updated.webhook_thread_id})` : ""),
    );
  });

cli
  .command(
    "room clone-webhook <src> <dst>",
    "Copy webhook (url + thread) from one room to another",
  )
  .action(async (src: string, dst: string) => {
    const { rooms } = makeRepos();
    const source = await rooms.findByName(src);
    if (!source) {
      console.error(`Source room "${src}" not found.`);
      process.exit(1);
    }
    if (!source.webhook_url) {
      console.error(`Source room "${src}" has no webhook configured.`);
      process.exit(1);
    }
    const target = await rooms.findByName(dst);
    if (!target) {
      console.error(`Target room "${dst}" not found.`);
      process.exit(1);
    }
    await rooms.setWebhook(dst, {
      url: source.webhook_url,
      threadId: source.webhook_thread_id,
    });
    console.log(
      `✓ Copied webhook from "${src}" to "${dst}"` +
        (source.webhook_thread_id ? " (url+thread)" : " (url only)"),
    );
  });

cli
  .command("room clear-webhook <name>", "Remove the Discord webhook from a room")
  .action(async (name: string) => {
    const { rooms } = makeRepos();
    const existing = await rooms.findByName(name);
    if (!existing) {
      console.error(`Room "${name}" not found.`);
      process.exit(1);
    }
    await rooms.setWebhook(name, { url: null, threadId: null });
    console.log(`✓ Cleared webhook for "${name}"`);
  });

cli
  .command(
    "room close <name>",
    "Close a room: history preserved, new joins rejected",
  )
  .action(async (name: string) => {
    const { rooms } = makeRepos();
    const existing = await rooms.findByName(name);
    if (!existing) {
      console.error(`Room "${name}" not found.`);
      process.exit(1);
    }
    if (existing.closed_at) {
      console.log(`Room "${name}" is already closed (since ${existing.closed_at}).`);
      return;
    }
    const updated = await rooms.close(name);
    console.log(`✓ Closed room "${updated.name}" at ${updated.closed_at}`);
    console.log(
      "  Note: existing connections stay alive; only new joins are rejected.",
    );
  });

cli
  .command("room reopen <name>", "Reopen a previously closed room")
  .action(async (name: string) => {
    const { rooms } = makeRepos();
    const existing = await rooms.findByName(name);
    if (!existing) {
      console.error(`Room "${name}" not found.`);
      process.exit(1);
    }
    if (!existing.closed_at) {
      console.log(`Room "${name}" is already open.`);
      return;
    }
    const updated = await rooms.reopen(name);
    console.log(`✓ Reopened room "${updated.name}"`);
  });

cli
  .command("room delete <name>", "Delete a room and all its messages")
  .option("-y, --yes", "Skip confirmation")
  .action(async (name: string, opts: { yes?: boolean }) => {
    const { rooms } = makeRepos();
    const existing = await rooms.findByName(name);
    if (!existing) {
      console.error(`Room "${name}" not found.`);
      process.exit(1);
    }
    if (!opts.yes) {
      const ok = await confirm(
        `This will delete room "${name}" and all its messages.`,
      );
      if (!ok) {
        console.log("Cancelled.");
        return;
      }
    }
    await rooms.deleteByName(name);
    console.log(`✓ Deleted room "${name}"`);
  });

cli
  .command(
    "announce <room> <message>",
    "Broadcast a system announcement to a room (ephemeral; not persisted)",
  )
  .action(async (room: string, message: string) => {
    const config = loadConfig();
    if (!config.adminKey) {
      console.error("ADMIN_KEY is not set in backend .env");
      process.exit(1);
    }
    const url = `${config.publicBackendUrl.replace(/\/$/, "")}/admin/broadcast`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-key": config.adminKey,
      },
      body: JSON.stringify({ room, body: message }),
    });
    if (res.status === 204) {
      console.log(`✓ Announced to "${room}"`);
      return;
    }
    const text = await res.text().catch(() => "");
    console.error(`Announce failed: ${res.status} ${text}`);
    process.exit(1);
  });

cli
  .command("user list", "List users (all, or by recent activity in a room)")
  .option("--room <name>", "Limit to users active in this room")
  .option("--provider <name>", "Filter by auth provider (anon|discord|github|google)")
  .option("--limit <n>", "Cap rows (default 100 when --room not given)")
  .action(async (opts: { room?: string; provider?: string; limit?: string }) => {
    const { rooms, users } = makeRepos();
    let list;
    if (opts.room) {
      const room = await rooms.findByName(opts.room);
      if (!room) {
        console.error(`Room "${opts.room}" not found.`);
        process.exit(1);
      }
      list = await users.listByRoomActivity(room.id);
      if (list.length === 0) {
        console.log("(no users have messaged in this room)");
        return;
      }
    } else {
      const limit = opts.limit ? Number(opts.limit) : 100;
      list = await users.listAll({
        provider: opts.provider as
          | "anon"
          | "discord"
          | "github"
          | "google"
          | undefined,
        limit,
      });
      if (list.length === 0) {
        console.log("(no users)");
        return;
      }
    }
    console.log(
      "NICKNAME".padEnd(20) +
        "DISC".padEnd(8) +
        "PROVIDER".padEnd(10) +
        "ADMIN".padEnd(8) +
        "ID",
    );
    for (const u of list) {
      console.log(
        u.nickname.padEnd(20) +
          u.discriminator.padEnd(8) +
          u.auth_provider.padEnd(10) +
          (u.is_admin ? "yes" : "—").padEnd(8) +
          u.id,
      );
    }
  });

async function resolveUser(
  users: UsersRepo,
  ref: string,
): Promise<UserRow | null> {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (UUID.test(ref)) return users.findById(ref);
  const hashIdx = ref.indexOf("#");
  if (hashIdx === -1) return null;
  const nick = ref.slice(0, hashIdx);
  const disc = ref.slice(hashIdx + 1);
  return users.findByNicknameDiscriminator(nick, disc);
}

cli
  .command(
    "user promote <ref>",
    "Grant admin to a user. <ref> is either UUID or nickname#discriminator",
  )
  .action(async (ref: string) => {
    const { users } = makeRepos();
    const user = await resolveUser(users, ref);
    if (!user) {
      console.error(`User "${ref}" not found.`);
      process.exit(1);
    }
    if (user.is_admin) {
      console.log(`User ${user.nickname}#${user.discriminator} is already admin.`);
      return;
    }
    const updated = await users.setAdmin(user.id, true);
    console.log(`✓ Promoted ${updated.nickname}#${updated.discriminator} to admin.`);
  });

cli
  .command(
    "user demote <ref>",
    "Revoke admin from a user. <ref> is either UUID or nickname#discriminator",
  )
  .action(async (ref: string) => {
    const { users } = makeRepos();
    const user = await resolveUser(users, ref);
    if (!user) {
      console.error(`User "${ref}" not found.`);
      process.exit(1);
    }
    if (!user.is_admin) {
      console.log(`User ${user.nickname}#${user.discriminator} is not an admin.`);
      return;
    }
    const updated = await users.setAdmin(user.id, false);
    console.log(`✓ Demoted ${updated.nickname}#${updated.discriminator}.`);
  });

cli
  .command("world end", "Force-end the currently-active world (admin)")
  .action(async () => {
    const config = loadConfig();
    if (!config.adminKey) {
      console.error("ADMIN_KEY is not set in backend .env");
      process.exit(1);
    }
    const url = `${config.publicBackendUrl.replace(/\/$/, "")}/admin/world/end`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "x-admin-key": config.adminKey },
    });
    if (res.status === 204) {
      console.log("✓ World ended.");
      return;
    }
    if (res.status === 404) {
      console.error("No active world.");
      process.exit(1);
    }
    const text = await res.text().catch(() => "");
    console.error(`Force-end failed: ${res.status} ${text}`);
    process.exit(1);
  });

cli.help();

// cac matches commands by their first positional arg only.
// Merge the first two non-flag args into a single "group action" token for
// known compound groups ("room", "user", "world"), so "room list" etc. are
// recognised as one command name. Single-word commands like "announce" are
// left alone.
const COMPOUND_GROUPS = new Set(["room", "user", "world"]);
const raw = process.argv;
const userArgs = raw.slice(2);
const u0 = userArgs[0];
const u1 = userArgs[1];
let argv = raw;
if (
  userArgs.length >= 2 &&
  u0 !== undefined &&
  u1 !== undefined &&
  !u0.startsWith("-") &&
  !u1.startsWith("-") &&
  COMPOUND_GROUPS.has(u0)
) {
  argv = [raw[0] ?? "", raw[1] ?? "", `${u0} ${u1}`, ...userArgs.slice(2)];
}

cli.parse(argv);

if (!cli.matchedCommand) {
  cli.outputHelp();
  process.exit(0);
}
