import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthError, clearDraft, getDraft, getSong, saveDraft, saveSong } from '../api';
import { go } from '../App';
import { transposeLabel } from '../chords';
import { downloadText, safeName } from '../download';
import { Block, cloneWithNewIds, Duration, newBar, newMeasure, Song, StaffBlock } from '../model';
import { layoutSong, makeCtx, PresetId } from '../render/layout';
import { exportPdf } from '../render/pdf';
import type { HitEvent, HitMeasure, Selection } from '../render/util';
import { DEFAULT_TOOL, findEvent, hitTest, makeEvent, NoteTool, pitchAtY, shiftEvent } from '../staffOps';
import { toggleTheme } from '../theme';
import { bakeTranspose } from '../transposeOps';
import { useHistory } from '../useHistory';
import Inspector from './Inspector';
import Palette, { PALETTE, PaletteItem } from './Palette';
import Preview from './Preview';
import Sheet from './Sheet';

export default function Editor({ id }: { id: string }) {
  const [song, setSong] = useState<Song | null>(null);
  const [err, setErr] = useState('');
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    getSong(id)
      .then((s) => {
        const d = getDraft(id);
        if (d && d.updatedAt > (s.updatedAt || 0)) {
          setSong(d);
          setRestored(true);
        } else setSong(s);
      })
      .catch((e) => {
        if (e instanceof AuthError) window.dispatchEvent(new Event('ppm-auth'));
        const d = getDraft(id);
        if (d) {
          setSong(d);
          setRestored(true);
        } else setErr(e.message || String(e));
      });
  }, [id]);

  if (err)
    return (
      <div className="center-msg">
        <p className="error">{err}</p>
        <button className="btn" onClick={() => go('/')}>
          Torna ai brani
        </button>
      </div>
    );
  if (!song) return <div className="center-msg muted">Carico il brano…</div>;
  return <EditorInner initial={song} restored={restored} />;
}

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

function pref<T extends string>(k: string, def: T): T {
  try {
    return (localStorage.getItem(k) as T) || def;
  } catch {
    return def;
  }
}

function EditorInner({ initial, restored }: { initial: Song; restored: boolean }) {
  const h = useHistory<Song>(initial);
  const song = h.state;
  const [sel, setSel] = useState<Selection | undefined>();
  const [tool, setToolState] = useState<NoteTool>(DEFAULT_TOOL);
  const [insertMode, setInsertMode] = useState(true);
  const [preset, setPresetState] = useState<PresetId>(pref('ppm.preset', 'a4'));
  const [fit, setFit] = useState(pref<string>('ppm.fit', '0') === '1');
  const [zoom, setZoom] = useState(Number(pref<string>('ppm.zoom', '1')) || 1);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [save, setSave] = useState<SaveState>(restored ? 'dirty' : 'saved');
  const [flash, setFlash] = useState(restored ? 'Ho recuperato una bozza non salvata.' : '');
  const [dragLabel, setDragLabel] = useState('');

  const update = h.update;

  // ---------- salvataggio automatico ----------
  const first = useRef(!restored);
  const latest = useRef(song);
  latest.current = song;
  const timer = useRef<number | undefined>(undefined);

  const doSave = useCallback(async () => {
    const s = latest.current;
    setSave('saving');
    try {
      await saveSong(s);
      clearDraft(s.id);
      if (latest.current === s) setSave('saved');
      else setSave('dirty');
    } catch (e: any) {
      if (e instanceof AuthError) {
        window.dispatchEvent(new Event('ppm-auth'));
        return;
      }
      setSave('error');
      setFlash('Salvataggio non riuscito: ' + (e.message || e) + ' (la bozza resta nel browser)');
    }
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSave('dirty');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(doSave, 1200);
  }, [song, doSave]);

  // la bozza va salvata con l'orario aggiornato
  useEffect(() => {
    if (save === 'dirty') saveDraft({ ...song, updatedAt: Date.now() });
  }, [song, save]);

  useEffect(() => {
    const f = (e: BeforeUnloadEvent) => {
      if (save !== 'saved') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, [save]);

  const touch = useCallback(
    (fn: (s: Song) => void, key?: string) =>
      update((s) => {
        fn(s);
        s.updatedAt = Date.now();
      }, key),
    [update],
  );

  // ---------- impaginazione ----------
  const layout = useMemo(() => layoutSong(song, preset, fit), [song, preset, fit]);
  const ctx = useMemo(() => makeCtx(song, layout.contentW, true, sel), [song, layout.contentW, sel]);
  const pagePx = 1.333 * zoom;
  const px = pagePx * layout.scale;

  // ---------- blocchi ----------
  const insertBlock = (b: Block, index?: number) => {
    touch((s) => {
      let i = index;
      if (i === undefined) {
        const si = sel ? s.blocks.findIndex((x) => x.id === sel.blockId) : -1;
        i = si >= 0 ? si + 1 : s.blocks.length;
      }
      s.blocks.splice(i, 0, b);
    });
    setSel({ blockId: b.id });
  };

  const onAdd = (it: PaletteItem) => insertBlock(it.make());

  const onDelete = (bid: string) => {
    touch((s) => {
      s.blocks = s.blocks.filter((b) => b.id !== bid);
    });
    setSel(undefined);
  };

  const onDuplicate = (bid: string) => {
    const i = song.blocks.findIndex((b) => b.id === bid);
    if (i < 0) return;
    const c = cloneWithNewIds(song.blocks[i]);
    insertBlock(c, i + 1);
  };

  const onResize = (bid: string, delta: number) =>
    touch((s) => {
      const b = s.blocks.find((x) => x.id === bid);
      if (!b) return;
      if (b.type === 'chords') {
        if (delta > 0) b.bars.push(newBar());
        else if (b.bars.length > 1) b.bars.pop();
      } else if (b.type === 'staff') {
        if (delta > 0) b.measures.push(newMeasure());
        else if (b.measures.length > 1) b.measures.pop();
      }
    });

  // ---------- pentagramma ----------
  const setTool = (p: Partial<NoteTool>) => {
    setToolState((t) => ({ ...t, ...p }));
    if (sel?.eventId && ('dur' in p || 'dot' in p || 'rest' in p || 'triplet' in p || 'acc' in p)) {
      touch((s) => {
        const b = s.blocks.find((x) => x.id === sel.blockId) as StaffBlock | undefined;
        if (!b || b.type !== 'staff') return;
        const f = findEvent(b, sel.eventId!);
        if (!f) return;
        const e = b.measures[f.mi].events[f.ei];
        if (p.dur) e.dur = p.dur;
        if (p.dot !== undefined) e.dot = p.dot;
        if (p.triplet !== undefined) e.triplet = p.triplet;
        if (p.rest !== undefined) {
          e.rest = p.rest;
          e.keys = p.rest ? [] : [{ step: 'B', acc: 0, oct: 4 }];
        }
        if (p.acc !== undefined && !e.rest) e.keys = e.keys.map((k) => ({ ...k, acc: p.acc! }));
      });
    }
  };

  const onStaffClick = (
    b: StaffBlock,
    hits: { measures: HitMeasure[]; events: HitEvent[] },
    x: number,
    y: number,
    shift: boolean,
  ) => {
    const hit = hitTest(hits, x, y, b);
    if (!hit) {
      setSel({ blockId: b.id });
      return;
    }
    const mId = hit.measure.measureId;
    const meas = b.measures.find((m) => m.id === mId)!;
    if (!insertMode || meas.multiRest) {
      setSel({ blockId: b.id, measureId: mId, eventId: hit.event?.eventId });
      return;
    }
    if (song.transpose) {
      setFlash('Il brano è trasposto: per scrivere note riporta la trasposizione a 0 (o rendila definitiva).');
      setSel({ blockId: b.id, measureId: mId, eventId: hit.event?.eventId });
      return;
    }
    if (hit.event) {
      const ev = meas.events.find((e) => e.id === hit.event!.eventId);
      if ((tool.addToChord || shift) && ev && !ev.rest) {
        const p = pitchAtY(hit.measure, y, tool.acc);
        touch((s) => {
          const bb = s.blocks.find((q) => q.id === b.id) as StaffBlock;
          const f = findEvent(bb, ev.id);
          if (!f) return;
          const e = bb.measures[f.mi].events[f.ei];
          if (!e.keys.some((k) => k.step === p.step && k.oct === p.oct)) e.keys.push(p);
        });
      }
      setSel({ blockId: b.id, measureId: mId, eventId: hit.event.eventId });
      return;
    }
    const p = pitchAtY(hit.measure, y, tool.acc);
    const ev = makeEvent(tool, p);
    touch((s) => {
      const bb = s.blocks.find((q) => q.id === b.id) as StaffBlock;
      const m = bb.measures.find((q) => q.id === mId);
      if (m) m.events.splice(hit.insertAt, 0, ev);
    });
    setSel({ blockId: b.id, measureId: mId, eventId: ev.id });
  };

  // ---------- tastiera ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) h.redo();
        else h.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault();
        h.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        doSave();
        return;
      }
      if (typing || mod) return;
      if (e.key === 'Escape') {
        if (sel?.eventId) setSel({ blockId: sel.blockId, measureId: sel.measureId });
        else setSel(undefined);
        return;
      }
      if (!sel?.eventId) return;
      const b = song.blocks.find((x) => x.id === sel.blockId);
      if (!b || b.type !== 'staff') return;
      const f = findEvent(b, sel.eventId);
      if (!f) return;
      const editEv = (fn: (ev: StaffBlock['measures'][number]['events'][number]) => void) =>
        touch((s) => {
          const bb = s.blocks.find((x) => x.id === b.id) as StaffBlock;
          const ff = findEvent(bb, sel.eventId!);
          if (ff) fn(bb.measures[ff.mi].events[ff.ei]);
        });
      const flat = b.measures.flatMap((m) => m.events.map((ev) => ({ ev, m })));
      const idx = flat.findIndex((x) => x.ev.id === sel.eventId);
      const durKeys: Record<string, Duration> = { '1': 'w', '2': 'h', '3': 'q', '4': '8', '5': '16' };
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (song.transpose) return;
        const st = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 7 : 1);
        editEv((ev) => shiftEvent(ev, st));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const n = flat[idx + (e.key === 'ArrowLeft' ? -1 : 1)];
        if (n) setSel({ blockId: b.id, measureId: n.m.id, eventId: n.ev.id });
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const prev = flat[idx - 1];
        touch((s) => {
          const bb = s.blocks.find((x) => x.id === b.id) as StaffBlock;
          const ff = findEvent(bb, sel.eventId!);
          if (ff) bb.measures[ff.mi].events.splice(ff.ei, 1);
        });
        setSel(prev && prev.m.id === b.measures[f.mi].id ? { blockId: b.id, measureId: prev.m.id, eventId: prev.ev.id } : { blockId: b.id, measureId: b.measures[f.mi].id });
      } else if (durKeys[e.key]) {
        setTool({ dur: durKeys[e.key] });
      } else if (e.key === '.') {
        setTool({ dot: !flat[idx]?.ev.dot });
      } else if (e.key.toLowerCase() === 'r') {
        setTool({ rest: !flat[idx]?.ev.rest });
      } else if (e.key.toLowerCase() === 'l') {
        editEv((ev) => (ev.tie = !ev.tie));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- trascinamento ----------
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragStart = (e: DragStartEvent) => {
    const idStr = String(e.active.id);
    if (idStr.startsWith('new:')) setDragLabel(PALETTE.find((p) => 'new:' + p.key === idStr)?.label || '');
    else setDragLabel('');
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragLabel('');
    const a = String(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    if (a.startsWith('new:')) {
      if (!over) return;
      const it = PALETTE.find((p) => 'new:' + p.key === a);
      if (!it) return;
      const idx = over === 'sheet-end' ? song.blocks.length : song.blocks.findIndex((b) => b.id === over);
      if (idx < 0) return;
      insertBlock(it.make(), idx);
      return;
    }
    if (over && over !== a && over !== 'sheet-end') {
      touch((s) => {
        const from = s.blocks.findIndex((b) => b.id === a);
        const to = s.blocks.findIndex((b) => b.id === over);
        if (from >= 0 && to >= 0) s.blocks = arrayMove(s.blocks, from, to);
      });
    } else if (over === 'sheet-end') {
      touch((s) => {
        const from = s.blocks.findIndex((b) => b.id === a);
        if (from >= 0) s.blocks = arrayMove(s.blocks, from, s.blocks.length - 1);
      });
    }
  };

  // ---------- azioni barra ----------
  const transpose = (d: number) =>
    touch((s) => {
      s.transpose = Math.max(-11, Math.min(11, (s.transpose || 0) + d));
    });

  const setPreset = (p: PresetId) => {
    setPresetState(p);
    try {
      localStorage.setItem('ppm.preset', p);
    } catch {
      /* niente */
    }
  };

  const doExport = async () => {
    setBusy(true);
    try {
      await exportPdf(song, preset, fit);
    } catch (e: any) {
      setFlash('Errore nella creazione del PDF: ' + (e.message || e));
    } finally {
      setBusy(false);
    }
  };

  const saveLabel: Record<SaveState, string> = {
    saved: 'Salvato',
    dirty: 'Modifiche…',
    saving: 'Salvataggio…',
    error: 'Non salvato',
  };

  return (
    <div className="editor">
      <header className="topbar">
        <button
          className="btn ghost"
          onClick={async () => {
            if (save !== 'saved') await doSave();
            go('/');
          }}
          title="Torna all'elenco"
        >
          ← Brani
        </button>
        <div className="title-edit">
          <input
            value={song.title}
            onChange={(e) => touch((s) => (s.title = e.target.value), 'title')}
            aria-label="Titolo"
          />
        </div>
        <span className={'save-state ' + save} title="Salvataggio automatico">
          {saveLabel[save]}
        </span>
        <div className="spacer" />
        <div className="group" title="Annulla / Ripeti (Ctrl+Z / Ctrl+Maiusc+Z)">
          <button className="btn ghost" onClick={h.undo} disabled={!h.canUndo}>
            ↶
          </button>
          <button className="btn ghost" onClick={h.redo} disabled={!h.canRedo}>
            ↷
          </button>
        </div>
        <div className="group transpose" title="Trasposizione (non distruttiva)">
          <span className="lbl">Trasporta</span>
          <button className="btn ghost" onClick={() => transpose(-1)}>
            −
          </button>
          <span className={'tval' + (song.transpose ? ' on' : '')}>{song.transpose > 0 ? '+' + song.transpose : song.transpose}</span>
          <button className="btn ghost" onClick={() => transpose(1)}>
            +
          </button>
          {song.transpose !== 0 && (
            <>
              <button className="btn tiny ghost" onClick={() => transpose(-song.transpose)} title="Azzera">
                0
              </button>
              <button
                className="btn tiny"
                onClick={() => {
                  if (confirm(`Riscrivere tutto il brano trasposto di ${transposeLabel(song.transpose)}?`)) touch(bakeTranspose);
                }}
                title="Riscrive accordi e note nella nuova tonalità"
              >
                Rendi definitiva
              </button>
            </>
          )}
        </div>
        <div className="group">
          <div className="seg">
            <button className={preset === 'a4' ? 'on' : ''} onClick={() => setPreset('a4')}>
              A4
            </button>
            <button className={preset === 'tablet' ? 'on' : ''} onClick={() => setPreset('tablet')}>
              Tablet
            </button>
          </div>
          <label className="check-row compact" title="Rimpicciolisce per stare in una sola pagina">
            <input
              type="checkbox"
              checked={fit}
              onChange={(e) => {
                setFit(e.target.checked);
                try {
                  localStorage.setItem('ppm.fit', e.target.checked ? '1' : '0');
                } catch {
                  /* niente */
                }
              }}
            />
            <span>1 pagina</span>
          </label>
        </div>
        <button className="btn" onClick={() => setPreview(true)}>
          Anteprima
        </button>
        <button className="btn primary" onClick={doExport} disabled={busy}>
          {busy ? 'PDF…' : 'Esporta PDF'}
        </button>
        <div className="menu-wrap">
          <details className="menu">
            <summary className="btn ghost">⋯</summary>
            <div className="menu-pop">
              <button onClick={() => downloadText(safeName(song.title) + '.json', JSON.stringify(song, null, 1))}>
                Scarica il brano (JSON)
              </button>
              <button onClick={toggleTheme}>Tema chiaro / scuro</button>
              <div className="zoom-row">
                Zoom
                {[0.8, 1, 1.25, 1.5].map((z) => (
                  <button
                    key={z}
                    className={zoom === z ? 'on' : ''}
                    onClick={() => {
                      setZoom(z);
                      try {
                        localStorage.setItem('ppm.zoom', String(z));
                      } catch {
                        /* niente */
                      }
                    }}
                  >
                    {Math.round(z * 100)}%
                  </button>
                ))}
              </div>
            </div>
          </details>
        </div>
      </header>

      {flash && (
        <div className="flash" onClick={() => setFlash('')}>
          {flash} <span className="muted">(clic per chiudere)</span>
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="workspace">
          <Palette onAdd={onAdd} />
          <div className="canvas" onClick={() => setSel(undefined)}>
            <Sheet
              song={song}
              layout={layout}
              ctx={ctx}
              px={px}
              pagePx={pagePx}
              sel={sel}
              onSelect={setSel}
              onStaffClick={onStaffClick}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onResize={onResize}
            />
          </div>
          <Inspector
            song={song}
            sel={sel}
            setSel={setSel}
            update={touch}
            tool={tool}
            setTool={setTool}
            insertMode={insertMode}
            setInsertMode={setInsertMode}
          />
        </div>
        <DragOverlay dropAnimation={null}>{dragLabel ? <div className="drag-ghost">{dragLabel}</div> : null}</DragOverlay>
      </DndContext>

      {preview && <Preview song={song} layout={layout} onClose={() => setPreview(false)} onExport={doExport} busy={busy} />}
    </div>
  );
}

