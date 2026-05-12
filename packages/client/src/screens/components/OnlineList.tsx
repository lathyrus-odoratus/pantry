import React, { memo } from "react";
import { Box, Text } from "ink";

type Props = {
  users: { nickname: string; discriminator: string }[];
};

export const OnlineList = memo(OnlineListImpl);

function OnlineListImpl({ users }: Props): React.JSX.Element {
  return (
    <Box flexDirection="column" width={22} paddingX={1} borderStyle="single">
      <Text bold>Online ({users.length})</Text>
      {users.map((u) => (
        <Text key={`${u.nickname}#${u.discriminator}`}>
          {u.nickname}#{u.discriminator}
        </Text>
      ))}
    </Box>
  );
}
