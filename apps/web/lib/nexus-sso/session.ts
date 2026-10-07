import { defaultCookies } from "@calcom/lib/default-cookies";
import { encode } from "next-auth/jwt";
import { NEXUS_SSO_SESSION_MAX_AGE_SECONDS } from "./config";
import type { NexusSsoUser } from "./provision";

export async function buildSessionCookie(params: { user: NexusSsoUser; secret: string; webappUrl: string }) {
  const { user, secret, webappUrl } = params;
  // O jwt callback do motor refaz a sessao pelo email do token em toda requisicao,
  // e o getServerSession exige sub numerico, email e exp.
  const value = await encode({
    secret,
    maxAge: NEXUS_SSO_SESSION_MAX_AGE_SECONDS,
    token: { sub: String(user.id), email: user.email, name: user.name },
  });
  const { name, options } = defaultCookies(webappUrl.startsWith("https://")).sessionToken;
  return { name, value, options: { ...options, maxAge: NEXUS_SSO_SESSION_MAX_AGE_SECONDS } };
}
