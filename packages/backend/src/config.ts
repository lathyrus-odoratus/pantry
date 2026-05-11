import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.string().regex(/^\d+$/).transform(Number).default("8080"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PUBLIC_BACKEND_URL: z.string().url(),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  JWT_SIGNING_KEY: z.string().min(32),

  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
});

export type Config = {
  port: number;
  nodeEnv: "development" | "test" | "production";
  publicBackendUrl: string;
  supabase: { url: string; serviceRoleKey: string };
  jwtSigningKey: string;
  oauth: {
    github: { clientId: string; clientSecret: string };
    google: { clientId: string; clientSecret: string };
    discord: { clientId: string; clientSecret: string };
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
      github: {
        clientId: parsed.GITHUB_CLIENT_ID,
        clientSecret: parsed.GITHUB_CLIENT_SECRET,
      },
      google: {
        clientId: parsed.GOOGLE_CLIENT_ID,
        clientSecret: parsed.GOOGLE_CLIENT_SECRET,
      },
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
