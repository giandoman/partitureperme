import { Env, json, makeToken, safeEq } from '../../cf/lib';

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Richiesta non valida' }, 400);
  }
  const pw = String(body.password || '');
  if (!env.APP_PASSWORD || !safeEq(pw, env.APP_PASSWORD)) {
    await new Promise((r) => setTimeout(r, 800));
    return json({ error: 'Password errata' }, 401);
  }
  return json({ token: await makeToken(env) });
};
