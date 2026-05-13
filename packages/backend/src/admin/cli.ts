#!/usr/bin/env node
import { cac } from "cac";
import readline from "node:readline";
import { loadConfig } from "../config.js";
import { createSupabaseClient } from "../db/supabase.js";
import { RoomsRepo } from "../db/rooms.js";
import { UsersRepo } from "../db/users.js";

const cli = cac("pantry-admin");

function makeRepos() {
  const config = loadConfig();
  const db = createSupabaseClient(config);
  return {
    rooms: new RoomsRepo(db),
    users: new UsersRepo(db),
  };
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
      "NAME".padEnd(24) + "ID".padEnd(40) + "WEBHOOK".padEnd(10) + "CREATED",
    );
    for (const r of list) {
      const webhook = r.webhook_url
        ? r.webhook_thread_id
          ? "url+thr"
          : "url"
        : "—";
      console.log(
        r.name.padEnd(24) +
          r.id.padEnd(40) +
          webhook.padEnd(10) +
          new Date(r.created_at).toISOString(),
      );
    }
  });

cli
  .command("room set-webhook <name> <url>", "Bind a Discord webhook to a room")
  .option("--thread <id>", "Discord forum/thread id (optional)")
  .action(async (name: string, url: string, opts: { thread?: string }) => {
    const { rooms } = makeRepos();
    const existing = await rooms.findByName(name);
    if (!existing) {
      console.error(`Room "${name}" not found.`);
      process.exit(1);
    }
    const updated = await rooms.setWebhook(name, {
      url,
      threadId: opts.thread ?? null,
    });
    console.log(
      `✓ Bound webhook for "${updated.name}"` +
        (updated.webhook_thread_id ? ` (thread ${updated.webhook_thread_id})` : ""),
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
  .command("user list", "List users (by recent activity in a room)")
  .option("--room <name>", "Limit to users active in this room")
  .action(async (opts: { room?: string }) => {
    const { rooms, users } = makeRepos();
    if (!opts.room) {
      console.error("--room <name> is required for now.");
      process.exit(1);
    }
    const room = await rooms.findByName(opts.room);
    if (!room) {
      console.error(`Room "${opts.room}" not found.`);
      process.exit(1);
    }
    const list = await users.listByRoomActivity(room.id);
    if (list.length === 0) {
      console.log("(no users have messaged in this room)");
      return;
    }
    console.log(
      "NICKNAME".padEnd(20) +
        "DISC".padEnd(8) +
        "PROVIDER".padEnd(10) +
        "ID",
    );
    for (const u of list) {
      console.log(
        u.nickname.padEnd(20) +
          u.discriminator.padEnd(8) +
          u.auth_provider.padEnd(10) +
          u.id,
      );
    }
  });

cli.help();

// cac matches commands by their first positional arg only.
// Merge the first two non-flag args into a single "group action" token
// so that "room list", "room create", "room delete", "user list" are
// recognised as compound command names (e.g. "room list" → args[0]).
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
  !u1.startsWith("-")
) {
  argv = [raw[0] ?? "", raw[1] ?? "", `${u0} ${u1}`, ...userArgs.slice(2)];
}

cli.parse(argv);

if (!cli.matchedCommand) {
  cli.outputHelp();
  process.exit(0);
}
