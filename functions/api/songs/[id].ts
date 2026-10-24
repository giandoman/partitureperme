import { ensureSchema, Env, ID_RE, isAuthorized, json } from '../../../cf/lib';

type Ctx = { request: Request; env: Env; params: { id: string } };

async function guard({ request, env, params }: Ctx): Promise<Response | null> {
  if (!(await isAuthorized(request, env))) return json({ error: 'Accesso non autorizzato' }, 401);
  if (!ID_RE.test(params.id)) return json({ error: 'Id non valido' }, 400);
  await ensureSchema(env);
  return null;
}

export const onRequestGet = async (ctx: Ctx) => {
  const g = await guard(ctx);
  if (g) return g;
  const row = await ctx.env.DB.prepare('SELECT data FROM songs WHERE id = ?').bind(ctx.params.id).first();
  if (!row) return json({ error: 'Brano non trovato' }, 404);
  return json({ song: JSON.parse(row.data) });
};

export const onRequestPut = async (ctx: Ctx) => {
  const g = await guard(ctx);
  if (g) return g;
  const text = await ctx.request.text();
  if (text.length > 2_000_000) return json({ error: 'Brano troppo grande' }, 413);
  let song: any;
  try {
    song = JSON.parse(text);
  } catch {
    return json({ error: 'JSON non valido' }, 400);
  }
  if (!song || song.id !== ctx.params.id || !Array.isArray(song.blocks)) return json({ error: 'Brano non valido' }, 400);
  const updatedAt = Number(song.updatedAt) || Date.now();
  await ctx.env.DB.prepare(
    `INSERT INTO songs (id, title, artist, key, updated_at, data) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(id) DO UPDATE SET title = ?2, artist = ?3, key = ?4, updated_at = ?5, data = ?6`,
  )
    .bind(song.id, String(song.title || '').slice(0, 200), String(song.artist || '').slice(0, 200), String(song.key || '').slice(0, 20), updatedAt, text)
    .run();
  return json({ ok: true, updatedAt });
};

export const onRequestDelete = async (ctx: Ctx) => {
  const g = await guard(ctx);
  if (g) return g;
  const row = await ctx.env.DB.prepare('SELECT data FROM songs WHERE id = ?').bind(ctx.params.id).first();
  if (row) {
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('INSERT INTO trash (id, deleted_at, data) VALUES (?, ?, ?)').bind(ctx.params.id, Date.now(), row.data),
      ctx.env.DB.prepare('DELETE FROM songs WHERE id = ?').bind(ctx.params.id),
    ]);
  }
  return json({ ok: true });
};
