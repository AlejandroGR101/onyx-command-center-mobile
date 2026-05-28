import crypto from "crypto";
import OAuthClient from "intuit-oauth";
import { storage } from "../storage";
import type { QuickbooksToken } from "@shared/schema";

const clientId = process.env.QB_CLIENT_ID || "";
const clientSecret = process.env.QB_CLIENT_SECRET || "";
const redirectUri = process.env.QB_REDIRECT_URI || "";
const environment = (process.env.QB_ENVIRONMENT || "sandbox") as "sandbox" | "production";

export function isQbConfigured(): boolean {
  return !!clientId && !!clientSecret && !!redirectUri;
}

function newClient(): OAuthClient {
  return new OAuthClient({
    clientId,
    clientSecret,
    environment,
    redirectUri,
  });
}

// State firmado HMAC para anti-CSRF en el OAuth flow.
function getStateSecret(): string {
  return process.env.SESSION_SECRET || "dev-insecure-secret";
}

export function signState(payload: object): string {
  const body = Buffer.from(JSON.stringify({ ...payload, t: Date.now() })).toString("base64url");
  const sig = crypto.createHmac("sha256", getStateSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state: string, maxAgeMs = 10 * 60 * 1000): boolean {
  const idx = state.lastIndexOf(".");
  if (idx < 0) return false;
  const body = state.slice(0, idx);
  const sig = state.slice(idx + 1);
  const expected = crypto.createHmac("sha256", getStateSecret()).update(body).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof parsed?.t !== "number") return false;
    if (Date.now() - parsed.t > maxAgeMs) return false;
    return true;
  } catch {
    return false;
  }
}

export function getAuthorizeUrl(): { url: string; state: string } {
  const client = newClient();
  const state = signState({ nonce: crypto.randomBytes(8).toString("hex") });
  const url = client.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state,
  });
  return { url, state };
}

// Intercambia el callback URL completo (con code, state, realmId) por tokens
// y los persiste. Devuelve el token guardado.
export async function exchangeCode(callbackUrl: string, realmId: string): Promise<QuickbooksToken> {
  const client = newClient();
  const authResponse = await client.createToken(callbackUrl);
  const token = authResponse.getJson() as {
    access_token: string;
    refresh_token: string;
    expires_in: number; // seconds
    x_refresh_token_expires_in?: number;
    token_type?: string;
  };
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);
  return storage.upsertQbTokens({
    realmId,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt,
    environment,
    lastSyncAt: null,
  });
}

// Devuelve un access_token válido. Si está por expirar (<5 min), refresca y persiste.
export async function ensureValidAccessToken(): Promise<{ accessToken: string; realmId: string; environment: string }> {
  const t = await storage.getQbTokens();
  if (!t) throw new Error("QB no conectado");
  const now = Date.now();
  const margin = 5 * 60 * 1000;
  if (t.expiresAt.getTime() - now > margin) {
    return { accessToken: t.accessToken, realmId: t.realmId, environment: t.environment };
  }
  // Refrescar.
  const client = newClient();
  client.setToken({
    access_token: t.accessToken,
    refresh_token: t.refreshToken,
    token_type: "bearer",
    expires_in: Math.max(0, Math.floor((t.expiresAt.getTime() - now) / 1000)),
    x_refresh_token_expires_in: 0,
    realmId: t.realmId,
  });
  let refreshed: any;
  try {
    const r = await client.refresh();
    refreshed = r.getJson();
  } catch (err: any) {
    // Refresh fallido (token expirado >100d, o revocado): borrar tokens.
    await storage.clearQbTokens();
    throw new Error("QB refresh falló — re-conectar requerido");
  }
  const newExpires = new Date(Date.now() + refreshed.expires_in * 1000);
  const saved = await storage.upsertQbTokens({
    realmId: t.realmId,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    expiresAt: newExpires,
    environment: t.environment,
    lastSyncAt: t.lastSyncAt ?? null,
  });
  return { accessToken: saved.accessToken, realmId: saved.realmId, environment: saved.environment };
}

export async function getStatus(): Promise<{
  connected: boolean;
  realmId?: string;
  environment?: string;
  lastSyncAt?: string | null;
}> {
  const t = await storage.getQbTokens();
  if (!t) return { connected: false };
  return {
    connected: true,
    realmId: t.realmId,
    environment: t.environment,
    lastSyncAt: t.lastSyncAt ? t.lastSyncAt.toISOString() : null,
  };
}
