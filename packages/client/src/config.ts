const DEFAULT_SERVER_URL = "wss://pantry.miao-bao.cc/ws";

export type ClientConfig = {
  serverUrl: string;
  backendHttpUrl: string;
  initialRoom: string | undefined;
};

export type ResolveInput = {
  argv: string[];
  env: Record<string, string | undefined>;
};

function parseFlag(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx === -1) return undefined;
  const value = argv[idx + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

function toHttpUrl(wsUrl: string): string {
  const u = new URL(wsUrl);
  const httpProtocol = u.protocol === "wss:" ? "https:" : "http:";
  return `${httpProtocol}//${u.host}`;
}

export function resolveConfig(input: ResolveInput): ClientConfig {
  const cliServer = parseFlag(input.argv, "--server");
  const envServer = input.env.PANTRY_SERVER;
  const serverUrl = cliServer ?? envServer ?? DEFAULT_SERVER_URL;
  const initialRoom = parseFlag(input.argv, "--room");
  return {
    serverUrl,
    backendHttpUrl: toHttpUrl(serverUrl),
    initialRoom,
  };
}

export function loadConfig(): ClientConfig {
  return resolveConfig({ argv: process.argv.slice(2), env: process.env });
}
