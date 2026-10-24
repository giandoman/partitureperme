import { ReactNode, useEffect, useRef, useState } from 'react';
import { displayChord, pitchLabel } from '../chords';
import {
  Bar,
  Block,
  BlockWidth,
  ChordsBlock,
  CueBlock,
  Duration,
  eventLength,
  measureCapacity,
  newBar,
  newMeasure,
  RoadmapBlock,
  SectionBlock,
  Song,
  SpacerBlock,
  StaffBlock,
  uid,
} from '../model';
import type { Selection } from '../render/util';
import { findEvent, NoteTool } from '../staffOps';
import { parseNokia, serializeNokia } from '../nokia';
import NoteIcon from './NoteIcon';
import { parseGrid, serializeGrid } from '../syntax';

type Update = (fn: (s: Song) => void, key?: string) => void;

interface Props {
  song: Song;
  sel?: Selection;
  setSel: (s?: Selection) => void;
  update: Update;
  tool: NoteTool;
  setTool: (p: Partial<NoteTool>) => void;
  insertMode: boolean;
  setInsertMode: (v: boolean) => void;
}

export const LABELS = ['INTRO', 'STR', 'PRE', 'RIT', 'BRIDGE', 'SOLO', 'FINALE', 'OUTRO'];

// ---------- campi riutilizzabili ----------

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}

function Text({ value, onChange, placeholder, upper }: { value: string; onChange: (v: string) => void; placeholder?: string; upper?: boolean }) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(upper ? e.target.value.toUpperCase() : e.target.value)}
    />
  );
}

function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check-row">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Num({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <div className="stepper">
      <button type="button" className="btn tiny" onClick={() => onChange(Math.max(min, value - 1))}>
        −
      </button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Math.max(min, Math.min(max, parseInt(e.target.value || '0', 10))))}
      />
      <button type="button" className="btn tiny" onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  );
}

function LabelPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Etichetta (badge)">
      <div className="chips">
        <button type="button" className={'chip' + (!value ? ' on' : '')} onClick={() => onChange('')}>
          nessuna
        </button>
        {LABELS.map((l) => (
          <button type="button" key={l} className={'chip' + (value === l ? ' on' : '')} onClick={() => onChange(l)}>
            {l}
          </button>
        ))}
      </div>
      <input value={value} placeholder="oppure scrivi…" onChange={(e) => onChange(e.target.value.toUpperCase())} />
    </Field>
  );
}

// ---------- pannello principale ----------

export default function Inspector(p: Props) {
  const block = p.sel ? p.song.blocks.find((b) => b.id === p.sel!.blockId) : undefined;
  return (
    <aside className="inspector">
      {!block && <SongPanel {...p} />}
      {block && <BlockPanel {...p} block={block} />}
    </aside>
  );
}

function SongPanel({ song, update }: Props) {
  const set = (k: keyof Song, key: string) => (v: string) =>
    update((s) => {
      (s as any)[k] = v;
    }, key);
  return (
    <div className="panel">
      <h2>Brano</h2>
      <Field label="Titolo">
        <Text value={song.title} onChange={set('title', 'title')} />
      </Field>
      <Field label="Artista">
        <Text value={song.artist} onChange={set('artist', 'artist')} />
      </Field>
      <div className="row2">
        <Field label="Tonalità" hint="es. MI-, LA, SIb">
          <Text value={song.key} upper onChange={set('key', 'key')} />
        </Field>
        <Field label="BPM">
          <Text value={song.tempo} onChange={set('tempo', 'tempo')} />
        </Field>
      </div>
      <Field label="Metro">
        <select value={song.timeSig} onChange={(e) => set('timeSig', 'ts')(e.target.value)}>
          {['4/4', '3/4', '2/4', '6/8', '12/8', '5/4', '7/8'].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="Suono / patch" hint="es. il nome della patch in MainStage">
        <Text value={song.patch} onChange={set('patch', 'patch')} />
      </Field>
      <Field label="Note generali">
        <textarea rows={3} value={song.notes} onChange={(e) => set('notes', 'notes')(e.target.value)} />
      </Field>
      <p className="muted small">Clicca un blocco sul foglio per modificarlo. Trascina i blocchi dal menu a sinistra.</p>
    </div>
  );
}

function BlockPanel(p: Props & { block: Block }) {
  const { block, update } = p;
  const upd = (fn: (b: any) => void, key?: string) =>
    update((s) => {
      const b = s.blocks.find((x) => x.id === block.id);
      if (b) fn(b);
    }, key && block.id + key);

  const titles: Record<string, string> = {
    section: 'Sezione',
    chords: 'Griglia accordi',
    staff: 'Pentagramma',
    cue: 'Avviso',
    roadmap: 'Roadmap',
    spacer: 'Spazio',
    pagebreak: 'Salto pagina',
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{titles[block.type]}</h2>
        <button className="btn tiny ghost" onClick={() => p.setSel(undefined)} title="Proprietà del brano">
          ✕
        </button>
      </div>
      {block.type !== 'pagebreak' && (
        <Field label="Larghezza" hint="I blocchi stretti consecutivi si mettono uno accanto all'altro">
          <div className="seg">
            {(['full', '1/2', '1/3', '2/3'] as BlockWidth[]).map((w) => (
              <button type="button" key={w} className={(block.width || 'full') === w ? 'on' : ''} onClick={() => upd((x) => (x.width = w))}>
                {w === 'full' ? 'Intera' : w}
              </button>
            ))}
          </div>
        </Field>
      )}
      {block.type === 'section' && <SectionForm b={block} upd={upd} />}
      {block.type === 'chords' && <ChordsForm b={block} upd={upd} sel={p.sel} setSel={p.setSel} />}
      {block.type === 'staff' && <StaffForm {...p} b={block} upd={upd} />}
      {block.type === 'cue' && <CueForm b={block} upd={upd} />}
      {block.type === 'roadmap' && <RoadmapForm b={block} upd={upd} />}
      {block.type === 'spacer' && <SpacerForm b={block} upd={upd} />}
      {block.type === 'pagebreak' && <p className="muted small">Da qui il PDF ricomincia su una nuova pagina.</p>}
    </div>
  );
}

type Upd = (fn: (b: any) => void, key?: string) => void;

function SectionForm({ b, upd }: { b: SectionBlock; upd: Upd }) {
  return (
    <>
      <Field label="Etichetta">
        <div className="chips">
          {LABELS.map((l) => (
            <button type="button" key={l} className={'chip' + (b.label === l ? ' on' : '')} onClick={() => upd((x) => (x.label = l))}>
              {l}
            </button>
          ))}
        </div>
        <Text value={b.label} upper onChange={(v) => upd((x) => (x.label = v), 'label')} />
      </Field>
      <Field label="Testo">
        <Text value={b.text} onChange={(v) => upd((x) => (x.text = v), 'text')} placeholder="es. Tastiera: organo" />
      </Field>
    </>
  );
}

function CueForm({ b, upd }: { b: CueBlock; upd: Upd }) {
  return (
    <>
      <Field label="Testo">
        <textarea rows={2} value={b.text} onChange={(e) => upd((x) => (x.text = e.target.value.toUpperCase()), 'text')} />
      </Field>
      <div className="chips">
        {['STOP!!', 'CORI!!', 'SOLO BATTERIA E VOCI', 'FINO ALLA FINE', 'IMPRO', 'CAMBIO SUONO'].map((t) => (
          <button type="button" key={t} className="chip" onClick={() => upd((x) => (x.text = t))}>
            {t}
          </button>
        ))}
      </div>
      <Field label="Stile">
        <div className="seg">
          {(['forte', 'riquadro', 'semplice'] as const).map((s) => (
            <button type="button" key={s} className={b.style === s ? 'on' : ''} onClick={() => upd((x) => (x.style = s))}>
              {s === 'forte' ? 'Nero' : s === 'riquadro' ? 'Riquadro' : 'Semplice'}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Allineamento">
        <div className="seg">
          <button type="button" className={b.align === 'left' ? 'on' : ''} onClick={() => upd((x) => (x.align = 'left'))}>
            Sinistra
          </button>
          <button type="button" className={b.align === 'center' ? 'on' : ''} onClick={() => upd((x) => (x.align = 'center'))}>
            Centro
          </button>
        </div>
      </Field>
    </>
  );
}

function RoadmapForm({ b, upd }: { b: RoadmapBlock; upd: Upd }) {
  return (
    <>
      <Field label="Percorso del brano" hint="Una riga per fila. Usa > tra i passi, xN per le ripetizioni, 'su' per il sottotitolo.">
        <textarea
          rows={5}
          className="mono"
          value={b.lines.join('\n')}
          onChange={(e) => upd((x) => (x.lines = e.target.value.split('\n')), 'lines')}
        />
      </Field>
      <p className="muted small">Esempio: STR x4 &gt; RIT x8 &gt; SOLO CHIT su STR x2</p>
    </>
  );
}

function SpacerForm({ b, upd }: { b: SpacerBlock; upd: Upd }) {
  return (
    <Field label={`Altezza: ${b.height} pt`}>
      <input type="range" min={4} max={120} value={b.height} onChange={(e) => upd((x) => (x.height = +e.target.value), 'h')} />
    </Field>
  );
}

// ---------- griglia accordi ----------

function GridText({ b, upd }: { b: ChordsBlock; upd: Upd }) {
  const serialized = serializeGrid(b.bars, b.repeat);
  const [txt, setTxt] = useState(serialized);
  const own = useRef(serialized);
  useEffect(() => {
    if (serialized !== own.current) {
      own.current = serialized;
      setTxt(serialized);
    }
  }, [serialized]);
  const change = (v: string) => {
    setTxt(v);
    const g = parseGrid(v);
    g.bars.forEach((bar, i) => {
      if (b.bars[i]) bar.id = b.bars[i].id; // mantiene la selezione
    });
    own.current = serializeGrid(g.bars, g.repeat);
    upd((x: ChordsBlock) => {
      x.bars = g.bars.length ? g.bars : [newBar()];
      x.repeat = g.repeat;
    }, 'grid');
  };
  return (
    <Field
      label="Scrittura rapida"
      hint='| separa le battute · |: :| ritornello · % uguale · (4) pausa di 4 · 1. 2. volte · "STOP" nota · x4 in fondo · a capo = nuova riga'
    >
      <textarea className="mono" rows={4} value={txt} spellCheck={false} onChange={(e) => change(e.target.value)} />
    </Field>
  );
}

function ChordsForm({ b, upd, sel, setSel }: { b: ChordsBlock; upd: Upd; sel?: Selection; setSel: (s?: Selection) => void }) {
  const barIdx = sel?.barId ? b.bars.findIndex((x) => x.id === sel.barId) : -1;
  const bar = barIdx >= 0 ? b.bars[barIdx] : undefined;
  const updBar = (fn: (x: Bar) => void, key?: string) =>
    upd((x: ChordsBlock) => {
      const bb = x.bars.find((y) => y.id === sel!.barId);
      if (bb) fn(bb);
    }, key);

  return (
    <>
      <GridText b={b} upd={upd} />
      <div className="row2">
        <Field label="Battute per riga">
          <Num value={b.barsPerLine} min={1} max={8} onChange={(v) => upd((x) => (x.barsPerLine = v))} />
        </Field>
        <Field label="Numero battute">
          <Num
            value={b.bars.length}
            min={1}
            max={64}
            onChange={(v) =>
              upd((x: ChordsBlock) => {
                while (x.bars.length < v) x.bars.push(newBar());
                while (x.bars.length > v) x.bars.pop();
              })
            }
          />
        </Field>
      </div>
      <Field label="Ripetizione (in fondo)" hint="es. x4  oppure  x4, x4, x3">
        <Text value={b.repeat} onChange={(v) => upd((x) => (x.repeat = v), 'repeat')} />
      </Field>
      <LabelPicker value={b.label} onChange={(v) => upd((x) => (x.label = v), 'label')} />
      <Field label="Nota sotto la griglia">
        <Text value={b.note} onChange={(v) => upd((x) => (x.note = v), 'note')} placeholder="es. 2a voce, cori" />
      </Field>

      <div className="subpanel">
        <h3>Battuta {bar ? barIdx + 1 : ''}</h3>
        {!bar && <p className="muted small">Clicca una battuta sul foglio per modificarla.</p>}
        {bar && (
          <>
            <Field label="Accordi (separati da spazio, max 4)">
              <ChordInput bar={bar} onChange={(ch) => updBar((x) => (x.chords = ch), 'chords' + bar.id)} />
            </Field>
            <div className="row2">
              <Check label="Uguale alla precedente (%)" value={!!bar.simile} onChange={(v) => updBar((x) => (x.simile = v || undefined))} />
              <Check label="Va a capo prima" value={!!bar.newLine} onChange={(v) => updBar((x) => (x.newLine = v || undefined))} />
            </div>
            <div className="row2">
              <Check label="Inizio ritornello |:" value={!!bar.repeatStart} onChange={(v) => updBar((x) => (x.repeatStart = v || undefined))} />
              <Check label="Fine ritornello :|" value={!!bar.repeatEnd} onChange={(v) => updBar((x) => (x.repeatEnd = v || undefined))} />
            </div>
            <div className="row2">
              <Field label="Volta">
                <select value={bar.volta || ''} onChange={(e) => updBar((x) => (x.volta = e.target.value || undefined))}>
                  <option value="">—</option>
                  <option>1.</option>
                  <option>2.</option>
                  <option>3.</option>
                </select>
              </Field>
              <Field label="Pausa (battute)">
                <Num value={bar.rest || 0} min={0} max={64} onChange={(v) => updBar((x) => (x.rest = v || undefined))} />
              </Field>
            </div>
            <Field label="Nota sopra la battuta">
              <Text value={bar.cue || ''} upper onChange={(v) => updBar((x) => (x.cue = v || undefined), 'cue' + bar.id)} placeholder="es. STOP" />
            </Field>
            <div className="btn-row">
              <button
                className="btn small"
                onClick={() => {
                  const nb = newBar();
                  upd((x: ChordsBlock) => x.bars.splice(barIdx + 1, 0, nb));
                  setSel({ blockId: b.id, barId: nb.id });
                }}
              >
                + Battuta dopo
              </button>
              <button
                className="btn small"
                onClick={() => {
                  const nb = { ...structuredClone(bar), id: uid(), newLine: undefined };
                  upd((x: ChordsBlock) => x.bars.splice(barIdx + 1, 0, nb));
                  setSel({ blockId: b.id, barId: nb.id });
                }}
              >
                Duplica
              </button>
              <button
                className="btn small danger"
                disabled={b.bars.length <= 1}
                onClick={() => {
                  upd((x: ChordsBlock) => x.bars.splice(barIdx, 1));
                  setSel({ blockId: b.id });
                }}
              >
                Elimina
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function ChordInput({ bar, onChange }: { bar: Bar; onChange: (c: string[]) => void }) {
  const [txt, setTxt] = useState(bar.chords.join(' '));
  useEffect(() => {
    setTxt(bar.chords.join(' '));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bar.id]);
  return (
    <input
      className="mono big-input"
      value={txt}
      autoFocus
      spellCheck={false}
      placeholder="es. LA/DO# RE"
      onChange={(e) => {
        const v = e.target.value.toUpperCase().replace(/(?<=[A-Z])B(?=\s|$|\/|\d|-)/g, 'b');
        setTxt(v);
        onChange(
          v
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 4)
            .map((c) => displayChord(c)),
        );
      }}
    />
  );
}

// ---------- pentagramma ----------

export const DURS: { d: Duration; name: string; n: string }[] = [
  { d: 'w', name: 'Semibreve', n: '1' },
  { d: 'h', name: 'Minima', n: '2' },
  { d: 'q', name: 'Semiminima', n: '4' },
  { d: '8', name: 'Croma', n: '8' },
  { d: '16', name: 'Semicroma', n: '16' },
  { d: '32', name: 'Biscroma', n: '32' },
];

export function toolLabel(t: NoteTool): string {
  const d = DURS.find((x) => x.d === t.dur)!;
  return (t.rest ? 'Pausa di ' + d.name.toLowerCase() : d.name) + (t.dot ? ' puntata' : '') + (t.triplet ? ' in terzina' : '');
}

function NokiaText({ b, upd }: { b: StaffBlock; upd: Upd }) {
  const serialized = serializeNokia(b.measures);
  const [txt, setTxt] = useState(serialized);
  const [errs, setErrs] = useState<string[]>([]);
  const own = useRef(serialized);
  useEffect(() => {
    if (serialized !== own.current) {
      own.current = serialized;
      setTxt(serialized);
      setErrs([]);
    }
  }, [serialized]);
  const change = (v: string) => {
    setTxt(v);
    const r = parseNokia(v, b.measures);
    setErrs(r.errors);
    own.current = serializeNokia(r.measures);
    upd((x: StaffBlock) => {
      x.measures = r.measures;
    }, 'nokia');
  };
  return (
    <div className="subpanel nokia">
      <h3>Scrittura rapida (stile Nokia)</h3>
      <textarea className="mono" rows={4} value={txt} spellCheck={false} onChange={(e) => change(e.target.value)} />
      {errs.length > 0 && <div className="error small">Non capisco: {errs.join('  ')}</div>}
      <details className="help">
        <summary>Come si scrive</summary>
        <table>
          <tbody>
            <tr><td><code>4c1</code></td><td>semiminima DO (ottava 1 = dal DO centrale)</td></tr>
            <tr><td><code>8#f1</code> <code>8eb1</code></td><td>croma FA# · croma MIb</td></tr>
            <tr><td><code>2.g1</code></td><td>minima puntata</td></tr>
            <tr><td><code>4-</code></td><td>pausa da 1/4</td></tr>
            <tr><td><code>t8e2 t8g2 t8e2</code></td><td>terzina</td></tr>
            <tr><td><code>4c1+e1+g1</code></td><td>accordo</td></tr>
            <tr><td><code>4b1_</code></td><td>legata alla nota dopo</td></tr>
            <tr><td><code>(8e2 8d2 8c2)</code></td><td>legatura di frase</td></tr>
            <tr><td><code>1e2^</code></td><td>corona</td></tr>
            <tr><td><code>"LA" 4a1</code></td><td>sigla sopra · <code>'la'</code> testo sotto</td></tr>
            <tr><td><code>|</code> <code>|: :|</code> <code>=4</code></td><td>battuta · ritornello · pausa di 4 battute</td></tr>
          </tbody>
        </table>
        <p className="muted small">Se ometti durata o ottava valgono quelle della nota precedente. Durate: 1 2 4 8 16 32.</p>
      </details>
    </div>
  );
}

function StaffForm(p: Props & { b: StaffBlock; upd: Upd }) {
  const { b, upd, sel, setSel, tool, setTool, song } = p;
  const mi = sel?.measureId ? b.measures.findIndex((m) => m.id === sel.measureId) : -1;
  const meas = mi >= 0 ? b.measures[mi] : undefined;
  const fe = sel?.eventId ? findEvent(b, sel.eventId) : null;
  const ev = fe ? b.measures[fe.mi].events[fe.ei] : undefined;
  const cap = measureCapacity(b.timeSig || song.timeSig);
  const used = meas ? meas.events.reduce((a, e) => a + eventLength(e), 0) : 0;

  const updMeas = (fn: (m: StaffBlock['measures'][number]) => void, key?: string) =>
    upd((x: StaffBlock) => {
      const m = x.measures.find((y) => y.id === sel!.measureId);
      if (m) fn(m);
    }, key);
  const updEv = (fn: (e: NonNullable<typeof ev>) => void, key?: string) =>
    upd((x: StaffBlock) => {
      const f = findEvent(x, sel!.eventId!);
      if (f) fn(x.measures[f.mi].events[f.ei]);
    }, key);

  return (
    <>
      <div className="subpanel tools">
        <h3>Inserimento note</h3>
        {song.transpose !== 0 && (
          <div className="notice small">Brano trasposto: per scrivere note riporta la trasposizione a 0 o rendila definitiva.</div>
        )}
        <div className="seg">
          <button type="button" className={p.insertMode ? 'on' : ''} onClick={() => p.setInsertMode(true)}>
            ✎ Inserisci
          </button>
          <button type="button" className={!p.insertMode ? 'on' : ''} onClick={() => p.setInsertMode(false)}>
            ⌖ Seleziona
          </button>
        </div>
        <div className="durs">
          {DURS.map((d) => (
            <button
              type="button"
              key={d.d}
              title={`${d.name} (${d.n})`}
              className={'dur' + (tool.dur === d.d ? ' on' : '')}
              onClick={() => setTool({ dur: d.d })}
            >
              <NoteIcon dur={d.d} rest={tool.rest} size={26} />
              <small>{d.name}</small>
            </button>
          ))}
        </div>
        <div className="toggles">
          <button type="button" className={'tgl' + (tool.dot ? ' on' : '')} onClick={() => setTool({ dot: !tool.dot })} title="Punto (.)">
            punto
          </button>
          <button type="button" className={'tgl' + (tool.rest ? ' on' : '')} onClick={() => setTool({ rest: !tool.rest })} title="Pausa (R)">
            pausa
          </button>
          <button type="button" className={'tgl' + (tool.triplet ? ' on' : '')} onClick={() => setTool({ triplet: !tool.triplet })} title="Terzina">
            terzina
          </button>
        </div>
        <div className="toggles">
          {([
            [1, '♯'],
            [0, '♮'],
            [-1, '♭'],
          ] as const).map(([a, l]) => (
            <button type="button" key={a} className={'tgl acc' + (tool.acc === a ? ' on' : '')} onClick={() => setTool({ acc: a })}>
              {l}
            </button>
          ))}
          <button
            type="button"
            className={'tgl' + (tool.addToChord ? ' on' : '')}
            onClick={() => setTool({ addToChord: !tool.addToChord })}
            title="Clic su una nota esistente aggiunge una nota sopra/sotto (anche Maiusc+clic)"
          >
            + accordo
          </button>
        </div>
        <div className="now-inserting">
          <NoteIcon dur={tool.dur} rest={tool.rest} size={30} />
          <div>
            <small className="muted">Stai inserendo</small>
            <b>
              {toolLabel(tool)}
              {!tool.rest && tool.acc !== 0 ? (tool.acc > 0 ? ' con ♯' : ' con ♭') : ''}
            </b>
          </div>
        </div>
        <p className="muted small">
          Passa col mouse sul rigo: vedi la nota in grigio prima di cliccare. Clic su una nota = selezione. Frecce ↑↓ spostano la nota
          (Maiusc = ottava), ←→ cambiano nota, Canc elimina, tasti 1-6 durata, L legatura.
        </p>
      </div>
      <NokiaText b={b} upd={upd} />

      {ev && (
        <div className="subpanel">
          <h3>
            Nota selezionata{' '}
            <span className="muted small">{ev.rest ? 'pausa' : ev.keys.map(pitchLabel).join(' + ')}</span>
          </h3>
          <Field label="Sigla sopra">
            <input
              className="mono"
              value={ev.chord || ''}
              placeholder="es. LA"
              onChange={(e) => updEv((x) => (x.chord = e.target.value.toUpperCase() || undefined), 'evc' + ev.id)}
            />
          </Field>
          <Field label="Testo sotto">
            <Text value={ev.below || ''} upper onChange={(v) => updEv((x) => (x.below = v || undefined), 'evb' + ev.id)} />
          </Field>
          <Field label="Legature">
            <div className="toggles">
              <button type="button" className={'tgl' + (ev.tie ? ' on' : '')} onClick={() => updEv((x) => (x.tie = !x.tie))} title="Lega questa nota alla successiva (stessa altezza)">
                ⁀ valore
              </button>
              <button type="button" className={'tgl' + (ev.slurStart ? ' on' : '')} onClick={() => updEv((x) => (x.slurStart = !x.slurStart || undefined))} title="La legatura di frase parte da qui">
                ( inizio frase
              </button>
              <button type="button" className={'tgl' + (ev.slurEnd ? ' on' : '')} onClick={() => updEv((x) => (x.slurEnd = !x.slurEnd || undefined))} title="La legatura di frase finisce qui">
                fine frase )
              </button>
            </div>
            <div className="toggles">
              <button type="button" className={'tgl' + (ev.fermata ? ' on' : '')} onClick={() => updEv((x) => (x.fermata = !x.fermata || undefined))} title="Corona sulla nota">
                𝄐 corona
              </button>
            </div>
          </Field>
          <div className="btn-row">
            {ev.keys.length > 1 && (
              <button className="btn small" onClick={() => updEv((x) => x.keys.pop())}>
                Togli ultima nota accordo
              </button>
            )}
            <button
              className="btn small danger"
              onClick={() => {
                upd((x: StaffBlock) => {
                  const f = findEvent(x, ev.id);
                  if (f) x.measures[f.mi].events.splice(f.ei, 1);
                });
                setSel({ blockId: b.id, measureId: sel?.measureId });
              }}
            >
              Elimina nota
            </button>
          </div>
        </div>
      )}

      {meas && (
        <div className="subpanel">
          <h3>
            Battuta {mi + 1}{' '}
            <span className={'muted small' + (used > cap + 1e-6 ? ' bad' : '')}>
              {Math.round(used * 100) / 100}/{cap} quarti
            </span>
          </h3>
          <div className="row2">
            <Check label="Inizio ritornello" value={!!meas.repeatStart} onChange={(v) => updMeas((m) => (m.repeatStart = v || undefined))} />
            <Check label="Fine ritornello" value={!!meas.repeatEnd} onChange={(v) => updMeas((m) => (m.repeatEnd = v || undefined))} />
          </div>
          <div className="row2">
            <Check label="8va" value={!!meas.ottava} onChange={(v) => updMeas((m) => (m.ottava = v || undefined))} />
            <Field label="Volta">
              <select value={meas.volta || ''} onChange={(e) => updMeas((m) => (m.volta = e.target.value || undefined))}>
                <option value="">—</option>
                <option>1.</option>
                <option>2.</option>
                <option>3.</option>
              </select>
            </Field>
          </div>
          <Field label="Pausa di più battute" hint="0 = battuta normale">
            <Num value={meas.multiRest || 0} min={0} max={64} onChange={(v) => updMeas((m) => (m.multiRest = v || undefined))} />
          </Field>
          <div className="btn-row">
            <button
              className="btn small"
              onClick={() => {
                const nm = newMeasure();
                upd((x: StaffBlock) => x.measures.splice(mi + 1, 0, nm));
                setSel({ blockId: b.id, measureId: nm.id });
              }}
            >
              + Battuta dopo
            </button>
            <button
              className="btn small"
              onClick={() => {
                const nm = structuredClone(meas);
                nm.id = uid();
                nm.events.forEach((e) => (e.id = uid()));
                upd((x: StaffBlock) => x.measures.splice(mi + 1, 0, nm));
                setSel({ blockId: b.id, measureId: nm.id });
              }}
            >
              Duplica
            </button>
            <button className="btn small" onClick={() => updMeas((m) => (m.events = []))}>
              Svuota
            </button>
            <button
              className="btn small danger"
              disabled={b.measures.length <= 1}
              onClick={() => {
                upd((x: StaffBlock) => x.measures.splice(mi, 1));
                setSel({ blockId: b.id });
              }}
            >
              Elimina
            </button>
          </div>
        </div>
      )}

      <div className="subpanel">
        <h3>Blocco</h3>
        <div className="row2">
          <Field label="Battute">
            <Num
              value={b.measures.length}
              min={1}
              max={64}
              onChange={(v) =>
                upd((x: StaffBlock) => {
                  while (x.measures.length < v) x.measures.push(newMeasure());
                  while (x.measures.length > v) x.measures.pop();
                })
              }
            />
          </Field>
          <Field label="Per riga" hint="0 = automatico">
            <Num value={b.measuresPerLine} min={0} max={8} onChange={(v) => upd((x) => (x.measuresPerLine = v))} />
          </Field>
        </div>
        <div className="row2">
          <Check label="Mostra il metro" value={b.showTimeSig} onChange={(v) => upd((x) => (x.showTimeSig = v))} />
          <Field label="Metro">
            <select value={b.timeSig} onChange={(e) => upd((x) => (x.timeSig = e.target.value))}>
              <option value="">come il brano</option>
              {['4/4', '3/4', '2/4', '6/8', '12/8', '5/4', '7/8'].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Ripetizione (in fondo)">
          <Text value={b.repeat} onChange={(v) => upd((x) => (x.repeat = v), 'repeat')} placeholder="es. x3" />
        </Field>
        <LabelPicker value={b.label} onChange={(v) => upd((x) => (x.label = v), 'label')} />
        <Field label="Nota sotto">
          <Text value={b.note} onChange={(v) => upd((x) => (x.note = v), 'note')} placeholder="es. riff tastiera" />
        </Field>
      </div>
    </>
  );
}
