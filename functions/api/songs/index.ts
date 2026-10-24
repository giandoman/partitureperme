import { ensureSchema, Env, isAuthorized, json } from '../../../cf/lib';

export const onRequestGet = async ({ request, env }: { request: Request; env: Env }) => {
  if (!(await isAuthorized(request, env))) return json({ error: 'Accesso non autorizzato' }, 401);
  await ensureSchema(env);
  const { results } = await env.DB.prepare('SELECT id, title, artist, key, updated_at FROM songs').all();
  return json({
    songs: (results || []).map((r: any) => ({ id: r.id, title: r.title, artist: r.artist, key: r.key, updatedAt: r.updated_at })),
  });
};
