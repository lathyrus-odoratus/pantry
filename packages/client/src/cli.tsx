#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { decodePermalink } from "@pantry/shared";
import { App } from "./app.js";
import { loadConfig } from "./config.js";
import { useStore } from "./store.js";
import { loadPrefs } from "./prefs.js";
import { runCaBomb } from "./screens/components/caBombRun.js";

const config = loadConfig();

// --ca-bomb runs its own flicker-free renderer outside Ink (see caBombRun).
if (config.caBomb) {
  let map;
  if (config.mapUrl) {
    try {
      map = decodePermalink(config.mapUrl);
    } catch (err) {
      console.error(`無法讀取地圖連結：${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }
  await runCaBomb(map, config.playerName);
  process.exit(0);
}

if (config.adminMode) {
  useStore.getState().setScreen("admin_oauth");
} else if (config.mapUrl) {
  try {
    const map = decodePermalink(config.mapUrl);
    useStore.setState({ viewedMap: map, screen: "map_view" });
  } catch (err) {
    useStore.getState().setError(
      `無法讀取地圖連結：${err instanceof Error ? err.message : String(err)}`,
    );
  }
} else if (config.initialRoom) {
  useStore.getState().commitRoomName(config.initialRoom);
}

const prefs = await loadPrefs();
useStore.setState({ prefs });

render(<App />);
