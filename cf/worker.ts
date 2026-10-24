// Worker Cloudflare: API (/api/*) + file statici dell'app (cartella dist)
import { ensureSchema, Env as BaseEnv, ID_RE, isAuthorized, json, makeToken, safeEq } from './lib';

interface Env extends BaseEnv {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

async function api(req: Request, env: Env, path: string): Promise<Response> {
  if (path === '/api/login') {
    if (req.method !== 'POST') return json({ error: 'Metodo non consentito' }, 405);
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Richiesta non valida' }, 400);
    }
    const pw = String(body.password || '');
    if (!env.APP_PASSWORD || !safeEq(pw, env.APP_PASSWORD)) {
      await new Promise((r) => setTimeout(r, 800));
      return json({ error: 'Password errata' }, 401);
    }
    return json({ token: await makeToken(env) });
  }

  if (path === '/api/songs' || path.startsWith('/api/songs/')) {
    if (!(await isAuthorized(req, env))) return json({ error: 'Accesso non autorizzato' }, 401);
    await ensureSchema(env);
    const id = decodeURIComponent(path.slice('/api/songs'.length).replace(/^\//, ''));
    if (!id) {
      if (req.method !== 'GET') return json({ error: 'Metodo non consentito' }, 405);
      const { results } = await env.DB.prepare('SELECT id, title, artist, key, updated_at FROM songs').all();
      return json({
        songs: (results || []).map((r: any) => ({ id: r.id, title: r.title, artist: r.artist, key: r.key, updatedAt: r.updated_at })),
      });
    }
    if (!ID_RE.test(id)) return json({ error: 'Id non valido' }, 400);

    if (req.method === 'GET') {
      const row: any = await env.DB.prepare('SELECT data FROM songs WHERE id = ?').bind(id).first();
      if (!row) return json({ error: 'Brano non trovato' }, 404);
      return json({ song: JSON.parse(row.data) });
    }
    if (req.method === 'PUT') {
      const text = await req.text();
      if (text.length > 2_000_000) return json({ error: 'Brano troppo grande' }, 413);
      let song: any;
      try {
        song = JSON.parse(text);
      } catch {
        return json({ error: 'JSON non valido' }, 400);
      }
      if (!song || song.id !== id || !Array.isArray(song.blocks)) return json({ error: 'Brano non valido' }, 400);
      const updatedAt = Number(song.updatedAt) || Date.now();
      await env.DB.prepare(
        `INSERT INTO songs (id, title, artist, key, updated_at, data) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET title = ?2, artist = ?3, key = ?4, updated_at = ?5, data = ?6`,
      )
        .bind(id, String(song.title || '').slice(0, 200), String(song.artist || '').slice(0, 200), String(song.key || '').slice(0, 20), updatedAt, text)
        .run();
      return json({ ok: true, updatedAt });
    }
    if (req.method === 'DELETE') {
      const row: any = await env.DB.prepare('SELECT data FROM songs WHERE id = ?').bind(id).first();
      if (row) {
        await env.DB.batch([
          env.DB.prepare('INSERT INTO trash (id, deleted_at, data) VALUES (?, ?, ?)').bind(id, Date.now(), row.data),
          env.DB.prepare('DELETE FROM songs WHERE id = ?').bind(id),
        ]);
      }
      return json({ ok: true });
    }
    return json({ error: 'Metodo non consentito' }, 405);
  }
  return json({ error: 'Non trovato' }, 404);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await api(req, env, url.pathname);
      } catch (e: any) {
        return json({ error: 'Errore del server: ' + (e?.message || e) }, 500);
      }
    }
    const res = await env.ASSETS.fetch(req);
    const h = new Headers(res.headers);
    h.set('X-Robots-Tag', 'noindex, nofollow');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  },
};
