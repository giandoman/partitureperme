import { useEffect, useMemo, useState } from 'react';
import { AuthError, deleteSong, getSong, isLocalMode, listSongs, logout, saveSong } from '../api';
import { go } from '../App';
import { downloadText, pickFile, safeName } from '../download';
import { cloneWithNewIds, newSong, Song, SongSummary, uid } from '../model';
import { PresetId } from '../render/layout';
import { exportSetlistPdf } from '../render/pdf';
import { toggleTheme } from '../theme';

export default function Library() {
  const [songs, setSongs] = useState<SongSummary[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [preset, setPreset] = useState<PresetId>('a4');

  const fail = (e: any) => {
    if (e instanceof AuthError) {
      window.dispatchEvent(new Event('ppm-auth'));
      return;
    }
    setErr(e.message || String(e));
  };

  const load = () =>
    listSongs()
      .then((s) => setSongs(s.sort((a, b) => a.title.localeCompare(b.title, 'it'))))
      .catch(fail);

  useEffect(() => {
    load();
  }, []);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (songs || []).filter((s) => !t || (s.title + ' ' + s.artist).toLowerCase().includes(t));
  }, [songs, q]);

  const create = async () => {
    const s = newSong('Nuovo brano');
    try {
      await saveSong(s);
      go(`/brano/${s.id}`);
    } catch (e) {
      fail(e);
    }
  };

  const duplicate = async (id: string) => {
    try {
      const s = await getSong(id);
      const c = cloneWithNewIds(s);
      c.id = uid();
      c.title = s.title + ' (copia)';
      c.updatedAt = Date.now();
      await saveSong(c);
      load();
    } catch (e) {
      fail(e);
    }
  };

  const remove = async (s: SongSummary) => {
    if (!confirm(`Eliminare "${s.title}"?`)) return;
    try {
      await deleteSong(s.id);
      setPicked((p) => p.filter((x) => x !== s.id));
      load();
    } catch (e) {
      fail(e);
    }
  };

  const backup = async () => {
    setBusy('Preparo il backup…');
    try {
      const all: Song[] = [];
      for (const s of songs || []) all.push(await getSong(s.id));
      const d = new Date().toISOString().slice(0, 10);
      downloadText(`partiture_backup_${d}.json`, JSON.stringify({ app: 'partitureperme', songs: all }, null, 1));
    } catch (e) {
      fail(e);
    } finally {
      setBusy('');
    }
  };

  const importJson = async () => {
    const f = await pickFile('.json,application/json');
    if (!f) return;
    setBusy('Importo…');
    try {
      const data = JSON.parse(await f.text());
      const list: Song[] = Array.isArray(data?.songs) ? data.songs : data?.blocks ? [data] : [];
      if (!list.length) throw new Error('Il file non contiene brani');
      const existing = new Set((songs || []).map((s) => s.id));
      for (const s of list) {
        if (!s.id || existing.has(s.id)) {
          if (existing.has(s.id) && confirm(`"${s.title}" esiste già. Sovrascrivere? (Annulla = importa come copia)`)) {
            await saveSong(s);
            continue;
          }
          s.id = uid();
        }
        await saveSong(s);
      }
      load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy('');
    }
  };

  const setlistPdf = async () => {
    const order = picked;
    if (!order.length) return;
    const name = prompt('Nome della scaletta', 'Scaletta') || 'Scaletta';
    setBusy('Creo il PDF…');
    try {
      const full: Song[] = [];
      for (const id of order) full.push(await getSong(id));
      await exportSetlistPdf(full, preset, false, safeName(name));
    } catch (e) {
      fail(e);
    } finally {
      setBusy('');
    }
  };

  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const movePick = (id: string, d: number) =>
    setPicked((p) => {
      const i = p.indexOf(id);
      const j = i + d;
      if (i < 0 || j < 0 || j >= p.length) return p;
      const c = [...p];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  const titleOf = (id: string) => songs?.find((s) => s.id === id)?.title || '?';

  return (
    <div className="library">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          Partiture per me
        </div>
        <div className="spacer" />
        {isLocalMode() && <span className="pill warn">modalità locale</span>}
        <button className="btn ghost" onClick={toggleTheme} title="Tema chiaro/scuro">
          ◐
        </button>
        <button
          className="btn ghost"
          onClick={() => {
            logout();
            window.dispatchEvent(new Event('ppm-auth'));
          }}
        >
          Esci
        </button>
      </header>

      <main className="lib-main">
        <div className="lib-head">
          <h1>I miei brani</h1>
          <div className="lib-actions">
            <input className="search" placeholder="Cerca…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn primary" onClick={create}>
              + Nuovo brano
            </button>
          </div>
        </div>
        {err && (
          <div className="error" onClick={() => setErr('')}>
            {err}
          </div>
        )}
        {busy && <div className="notice">{busy}</div>}

        <div className="lib-grid">
          <section className="song-list">
            {songs === null && <div className="muted pad">Carico…</div>}
            {songs && !songs.length && (
              <div className="empty">
                <p>Nessun brano ancora.</p>
                <button className="btn primary" onClick={create}>
                  Crea il primo brano
                </button>
              </div>
            )}
            {shown.map((s) => (
              <div key={s.id} className={'song-row' + (picked.includes(s.id) ? ' picked' : '')}>
                <label className="check" title="Aggiungi alla scaletta">
                  <input type="checkbox" checked={picked.includes(s.id)} onChange={() => togglePick(s.id)} />
                </label>
                <a className="song-main" href={`#/brano/${s.id}`}>
                  <span className="song-title">{s.title || 'Senza titolo'}</span>
                  <span className="song-sub">
                    {s.artist}
                    {s.key ? ` · ${s.key}` : ''}
                  </span>
                </a>
                <span className="song-date">{s.updatedAt ? new Date(s.updatedAt).toLocaleDateString('it-IT') : ''}</span>
                <button className="btn small ghost" onClick={() => duplicate(s.id)} title="Duplica">
                  Duplica
                </button>
                <button className="btn small ghost danger" onClick={() => remove(s)} title="Elimina">
                  Elimina
                </button>
              </div>
            ))}
          </section>

          <aside className="side-card">
            <h3>Scaletta</h3>
            <p className="muted small">Spunta i brani: escono in un unico PDF, nell'ordine qui sotto.</p>
            <ol className="setlist">
              {picked.map((id, i) => (
                <li key={id}>
                  <span>{titleOf(id)}</span>
                  <span className="row-btns">
                    <button className="btn tiny ghost" disabled={i === 0} onClick={() => movePick(id, -1)}>
                      ▲
                    </button>
                    <button className="btn tiny ghost" disabled={i === picked.length - 1} onClick={() => movePick(id, 1)}>
                      ▼
                    </button>
                  </span>
                </li>
              ))}
            </ol>
            <div className="seg">
              <button className={preset === 'a4' ? 'on' : ''} onClick={() => setPreset('a4')}>
                A4 stampa
              </button>
              <button className={preset === 'tablet' ? 'on' : ''} onClick={() => setPreset('tablet')}>
                Tablet
              </button>
            </div>
            <button className="btn primary wide" disabled={!picked.length} onClick={setlistPdf}>
              PDF scaletta
            </button>
            <hr />
            <h3>Archivio</h3>
            <button className="btn wide" onClick={backup} disabled={!songs?.length}>
              Scarica backup (JSON)
            </button>
            <button className="btn wide" onClick={importJson}>
              Importa da JSON
            </button>
          </aside>
        </div>
      </main>
    </div>
  );
}
