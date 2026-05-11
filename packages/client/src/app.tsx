import React from "react";
import { Box, Text } from "ink";
import { useStore } from "./store.js";
import { RoomInput } from "./screens/RoomInput.js";
import { IdentitySelect } from "./screens/IdentitySelect.js";
import { NicknameInput } from "./screens/NicknameInput.js";

export function App(): React.JSX.Element {
  const screen = useStore((s) => s.screen);
  switch (screen) {
    case "room_input":
      return <RoomInput />;
    case "identity_select":
      return <IdentitySelect />;
    case "nickname_input":
      return <NicknameInput />;
    default:
      return (
        <Box padding={1}>
          <Text>Screen "{screen}" not implemented yet.</Text>
        </Box>
      );
  }
}
