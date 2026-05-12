import type { AuthProvider } from "@pantry/shared";
import type { Config } from "../config.js";

export type ProviderConfig = {
  name: Exclude<AuthProvider, "anon">;
  authorizeUrl: (params: { clientId: string; redirectUri: string; state: string; scope: string }) => string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
  clientId: string;
  clientSecret: string;
  /**
   * Extract a stable subject and a display name from the provider's user-info response.
   */
  parseProfile: (raw: unknown) => { subject: string; nickname: string };
};

function qs(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

export function getProviderConfig(
  provider: Exclude<AuthProvider, "anon">,
  config: Config,
): ProviderConfig | undefined {
  switch (provider) {
    case "github": {
      const creds = config.oauth.github;
      if (!creds) return undefined;
      return {
        name: "github",
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
        scope: "read:user",
        authorizeUrl: ({ clientId, redirectUri, state, scope }) =>
          `https://github.com/login/oauth/authorize?${qs({
            client_id: clientId,
            redirect_uri: redirectUri,
            state,
            scope,
          })}`,
        tokenUrl: "https://github.com/login/oauth/access_token",
        userInfoUrl: "https://api.github.com/user",
        parseProfile: (raw) => {
          const r = raw as { id: number; login: string; name?: string };
          return {
            subject: `github:${r.id}`,
            nickname: (r.name ?? r.login).slice(0, 20),
          };
        },
      };
    }

    case "google": {
      const creds = config.oauth.google;
      if (!creds) return undefined;
      return {
        name: "google",
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
        scope: "openid email profile",
        authorizeUrl: ({ clientId, redirectUri, state, scope }) =>
          `https://accounts.google.com/o/oauth2/v2/auth?${qs({
            client_id: clientId,
            redirect_uri: redirectUri,
            state,
            scope,
            response_type: "code",
            access_type: "offline",
            prompt: "consent",
          })}`,
        tokenUrl: "https://oauth2.googleapis.com/token",
        userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
        parseProfile: (raw) => {
          const r = raw as { sub: string; name?: string; email?: string };
          return {
            subject: `google:${r.sub}`,
            nickname: (r.name ?? r.email ?? "user").slice(0, 20),
          };
        },
      };
    }

    case "discord": {
      const creds = config.oauth.discord;
      return {
        name: "discord",
        clientId: creds.clientId,
        clientSecret: creds.clientSecret,
        scope: "identify",
        authorizeUrl: ({ clientId, redirectUri, state, scope }) =>
          `https://discord.com/oauth2/authorize?${qs({
            client_id: clientId,
            redirect_uri: redirectUri,
            state,
            scope,
            response_type: "code",
          })}`,
        tokenUrl: "https://discord.com/api/oauth2/token",
        userInfoUrl: "https://discord.com/api/users/@me",
        parseProfile: (raw) => {
          const r = raw as {
            id: string;
            username: string;
            global_name?: string;
          };
          return {
            subject: `discord:${r.id}`,
            nickname: (r.global_name ?? r.username).slice(0, 20),
          };
        },
      };
    }
  }
}

export async function exchangeCodeForToken(
  cfg: ProviderConfig,
  redirectUri: string,
  code: string,
): Promise<string> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) {
    throw new Error(`Token exchange returned no access_token: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

export async function fetchUserProfile(
  cfg: ProviderConfig,
  accessToken: string,
): Promise<{ subject: string; nickname: string }> {
  const res = await fetch(cfg.userInfoUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "User-Agent": "pantry-backend",
    },
  });
  if (!res.ok) {
    throw new Error(`Userinfo fetch failed (${res.status}): ${await res.text()}`);
  }
  const raw = (await res.json()) as unknown;
  return cfg.parseProfile(raw);
}
