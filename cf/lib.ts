// Funzioni comuni per Cloudflare Pages Functions (login + archivio brani su D1)

export interface Env {
  DB: any; // D1Database
  APP_PASSWORD?: string;
  AUTH_SECRET?: string;
}

const enc = new TextEncoder();
const DAYS = 60;

function b64url(buf: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function secret(env: Env): string {
  return (env.APP_PASSWORD || '') + '|' + (env.AUTH_SECRET || 'partitureperme');
}

async function sign(env: Env, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
}

export function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function makeToken(env: Env): Promise<string> {
  const payload = `v1.${Date.now() + DAYS * 86400_000}`;
  return `${payload}.${await sign(env, payload)}`;
}

export async function isAuthorized(req: Request, env: Env): Promise<boolean> {
  const h = req.headers.get('authorization') || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const parts = tok.split('.');
  if (parts.length !== 3 || !env.APP_PASSWORD) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  if (!safeEq(await sign(env, payload), parts[2])) return false;
  return Number(parts[1]) > Date.now();
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

let ready = false;
export async function ensureSchema(env: Env) {
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS songs (id TEXT PRIMARY KEY, title TEXT, artist TEXT, key TEXT, updated_at INTEGER, data TEXT NOT NULL)',
    ),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS trash (id TEXT, deleted_at INTEGER, data TEXT NOT NULL)'),
  ]);
  ready = true;
}

export const ID_RE = /^[a-z0-9]{4,40}$/i;
