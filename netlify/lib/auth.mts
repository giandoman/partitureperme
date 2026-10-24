import { createHmac, timingSafeEqual } from 'node:crypto';

const DAYS = 60;

function secret(): string {
  return (Netlify.env.get('APP_PASSWORD') || '') + '|' + (Netlify.env.get('AUTH_SECRET') || 'partitureperme');
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function makeToken(): string {
  const exp = Date.now() + DAYS * 86400_000;
  const payload = `v1.${exp}`;
  return `${payload}.${sign(payload)}`;
}

function safeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function checkPassword(pw: string): boolean {
  const expected = Netlify.env.get('APP_PASSWORD');
  if (!expected) return false;
  return safeEq(pw, expected);
}

export function isAuthorized(req: Request): boolean {
  const h = req.headers.get('authorization') || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
  const parts = tok.split('.');
  if (parts.length !== 3) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  if (!safeEq(sign(payload), parts[2])) return false;
  return Number(parts[1]) > Date.now();
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
