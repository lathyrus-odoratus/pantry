import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Config } from "../config.js";
import { logger } from "../logger.js";
import { OAuthStateStore } from "./state-store.js";
import {
  getProviderConfig,
  exchangeCodeForToken,
  fetchUserProfile,
} from "./providers.js";
import { UsersRepo } from "../db/users.js";
import { signSessionToken } from "../utils/jwt.js";
import type { AuthProvider } from "@pantry/shared";

export type AuthRoutesDeps = {
  config: Config;
  stateStore: OAuthStateStore;
  usersRepo: UsersRepo;
};

const ProviderParam = z.enum(["github", "google", "discord"]);

export async function registerAuthRoutes(
  app: FastifyInstance,
  { config, stateStore, usersRepo }: AuthRoutesDeps,
): Promise<void> {
  app.post<{ Body: { provider: AuthProvider } }>(
    "/auth/oauth/start",
    async (req, reply) => {
      const provider = ProviderParam.safeParse(
        (req.body as { provider?: string } | undefined)?.provider,
      );
      if (!provider.success) {
        return reply.code(400).send({ error: "invalid_provider" });
      }
      const state = stateStore.createPending(provider.data);
      const cfg = getProviderConfig(provider.data, config);
      const redirectUri = `${config.publicBackendUrl}/auth/oauth/callback`;
      const authUrl = cfg.authorizeUrl({
        clientId: cfg.clientId,
        redirectUri,
        state,
        scope: cfg.scope,
      });
      return reply.send({
        authUrl,
        pollUrl: `/auth/oauth/poll?state=${state}`,
        state,
      });
    },
  );

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    "/auth/oauth/callback",
    async (req, reply) => {
      const { code, state, error } = req.query;
      if (error) {
        return reply.type("text/html").send(
          `<h1>Authorization failed</h1><p>${escapeHtml(error)}</p>`,
        );
      }
      if (!code || !state) {
        return reply
          .code(400)
          .type("text/html")
          .send("<h1>Missing code or state.</h1>");
      }
      const provider = stateStore.getProvider(state);
      if (!provider) {
        return reply
          .code(400)
          .type("text/html")
          .send("<h1>Authorization expired. Please try again.</h1>");
      }
      try {
        const cfg = getProviderConfig(provider, config);
        const redirectUri = `${config.publicBackendUrl}/auth/oauth/callback`;
        const accessToken = await exchangeCodeForToken(cfg, redirectUri, code);
        const profile = await fetchUserProfile(cfg, accessToken);
        let user = await usersRepo.findByProviderSubject(provider, profile.subject);
        if (!user) {
          user = await usersRepo.createWithDiscriminator({
            provider,
            subject: profile.subject,
            nickname: profile.nickname,
          });
        }
        const token = signSessionToken(
          { userId: user.id, provider },
          config.jwtSigningKey,
        );
        stateStore.resolve(state, token);
        return reply
          .type("text/html")
          .send("<h1>Signed in!</h1><p>You can close this tab.</p>");
      } catch (err) {
        logger.error({ err }, "oauth callback failed");
        return reply
          .code(500)
          .type("text/html")
          .send("<h1>Sign-in failed</h1><p>Please try again.</p>");
      }
    },
  );

  app.get<{ Querystring: { state?: string } }>(
    "/auth/oauth/poll",
    async (req, reply) => {
      const { state } = req.query;
      if (!state) return reply.code(400).send({ error: "missing_state" });
      const result = stateStore.consume(state);
      if (result.status === "ready") {
        return reply.send({ status: "ready", token: result.token });
      }
      if (result.status === "pending") {
        return reply.send({ status: "pending" });
      }
      return reply.code(404).send({ status: "not_found" });
    },
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default:  return "&#39;";
    }
  });
}
