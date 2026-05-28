#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { decodePermalink } from "@pantry/shared";
import { App } from "./app.js";
import { loadConfig } from "./config.js";
import { useStore } from "./store.js";
import { loadPrefs } from "./prefs.js";

const config = loadConfig();
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
