import React from "react";
import { useStore } from "./store.js";
import { loadConfig } from "./config.js";
import { RoomInput } from "./screens/RoomInput.js";
import { IdentitySelect } from "./screens/IdentitySelect.js";
import { NicknameInput } from "./screens/NicknameInput.js";
import { OAuthWaiting } from "./screens/OAuthWaiting.js";
import { Chat } from "./screens/Chat.js";
import { ErrorScreen } from "./screens/ErrorScreen.js";

const config = loadConfig();

export function App(): React.JSX.Element {
  const screen = useStore((s) => s.screen);
  switch (screen) {
    case "room_input":
      return <RoomInput />;
    case "identity_select":
      return <IdentitySelect />;
    case "nickname_input":
      return <NicknameInput />;
    case "oauth_waiting":
      return <OAuthWaiting backendHttpUrl={config.backendHttpUrl} />;
    case "chat":
      return <Chat serverUrl={config.serverUrl} />;
    case "error":
      return <ErrorScreen />;
  }
}
