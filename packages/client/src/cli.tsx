#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { App } from "./app.js";
import { loadConfig } from "./config.js";
import { useStore } from "./store.js";
import { loadPrefs } from "./prefs.js";

const config = loadConfig();
if (config.adminMode) {
  useStore.getState().setScreen("admin_oauth");
} else if (config.initialRoom) {
  useStore.getState().commitRoomName(config.initialRoom);
}

const prefs = await loadPrefs();
useStore.setState({ prefs });

render(<App />);
