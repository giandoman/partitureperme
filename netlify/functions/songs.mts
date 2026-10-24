import type { Config, Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { isAuthorized, json } from '../lib/auth.mts';

const store = () => getStore({ name: 'songs', consistency: 'strong' });
const trash = () => getStore({ name: 'songs-trash', consistency: 'strong' });

const ID_RE = /^[a-z0-9]{4,40}$/i;

export default async (req: Request, context: Context) => {
  if (!isAuthorized(req)) return json({ error: 'Accesso non autorizzato' }, 401);
  const id = context.params.id;
  const s = store();

  if (!id) {
    if (req.method !== 'GET') return json({ error: 'Metodo non consentito' }, 405);
    const { blobs } = await s.list();
    const items = await Promise.all(
      blobs.map(async (b) => {
        const meta = await s.getMetadata(b.key);
        return { id: b.key, ...(meta?.metadata || {}) };
      }),
    );
    return json({ songs: items });
  }

  if (!ID_RE.test(id)) return json({ error: 'Id non valido' }, 400);

  if (req.method === 'GET') {
    const song = await s.get(id, { type: 'json' });
    if (song === null) return json({ error: 'Brano non trovato' }, 404);
    return json({ song });
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
    const metadata = {
      title: String(song.title || '').slice(0, 200),
      artist: String(song.artist || '').slice(0, 200),
      key: String(song.key || '').slice(0, 20),
      updatedAt: Number(song.updatedAt) || Date.now(),
    };
    await s.setJSON(id, song, { metadata });
    return json({ ok: true, updatedAt: metadata.updatedAt });
  }

  if (req.method === 'DELETE') {
    const song = await s.get(id, { type: 'json' });
    if (song !== null) await trash().setJSON(`${id}-${Date.now()}`, song);
    await s.delete(id);
    return json({ ok: true });
  }

  return json({ error: 'Metodo non consentito' }, 405);
};

export const config: Config = { path: ['/api/songs', '/api/songs/:id'] };
