import type { Config } from '@netlify/functions';
import { checkPassword, json, makeToken } from '../lib/auth.mts';

export default async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'Metodo non consentito' }, 405);
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Richiesta non valida' }, 400);
  }
  if (!checkPassword(String(body.password || ''))) {
    await new Promise((r) => setTimeout(r, 800));
    return json({ error: 'Password errata' }, 401);
  }
  return json({ token: makeToken() });
};

export const config: Config = { path: '/api/login' };
