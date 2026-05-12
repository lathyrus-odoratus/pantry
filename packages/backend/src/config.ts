import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.string().regex(/^\d+$/).transform(Number).default("8080"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PUBLIC_BACKEND_URL: z.string().url(),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  JWT_SIGNING_KEY: z.string().min(32),

  GITHUB_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
});

export type ProviderCreds = { clientId: string; clientSecret: string };

export type Config = {
  port: number;
  nodeEnv: "development" | "test" | "production";
  publicBackendUrl: string;
  supabase: { url: string; serviceRoleKey: string };
  jwtSigningKey: string;
  oauth: {
    github?: ProviderCreds;
    google?: ProviderCreds;
    discord: ProviderCreds;
  };
};

export function parseConfig(env: Record<string, string | undefined>): Config {
  const parsed = EnvSchema.parse(env);
  return {
    port: parsed.PORT,
    nodeEnv: parsed.NODE_ENV,
    publicBackendUrl: parsed.PUBLIC_BACKEND_URL,
    supabase: {
      url: parsed.SUPABASE_URL,
      serviceRoleKey: parsed.SUPABASE_SERVICE_ROLE_KEY,
    },
    jwtSigningKey: parsed.JWT_SIGNING_KEY,
    oauth: {
      github:
        parsed.GITHUB_CLIENT_ID && parsed.GITHUB_CLIENT_SECRET
          ? { clientId: parsed.GITHUB_CLIENT_ID, clientSecret: parsed.GITHUB_CLIENT_SECRET }
          : undefined,
      google:
        parsed.GOOGLE_CLIENT_ID && parsed.GOOGLE_CLIENT_SECRET
          ? { clientId: parsed.GOOGLE_CLIENT_ID, clientSecret: parsed.GOOGLE_CLIENT_SECRET }
          : undefined,
      discord: {
        clientId: parsed.DISCORD_CLIENT_ID,
        clientSecret: parsed.DISCORD_CLIENT_SECRET,
      },
    },
  };
}

export function loadConfig(): Config {
  return parseConfig(process.env);
}
