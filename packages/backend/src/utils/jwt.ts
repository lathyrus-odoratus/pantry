import jwt from "jsonwebtoken";
import { z } from "zod";

const PayloadSchema = z.object({
  userId: z.string().uuid(),
  provider: z.enum(["github", "google", "discord"]),
});
export type SessionPayload = z.infer<typeof PayloadSchema>;

const EXPIRES_IN = "7d";

export function signSessionToken(payload: SessionPayload, key: string): string {
  return jwt.sign(payload, key, { algorithm: "HS256", expiresIn: EXPIRES_IN });
}

export function verifySessionToken(token: string, key: string): SessionPayload {
  const decoded = jwt.verify(token, key, { algorithms: ["HS256"] });
  return PayloadSchema.parse(decoded);
}
