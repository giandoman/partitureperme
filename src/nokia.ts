// Scrittura delle note "stile Nokia" (Nokia Composer, con qualche aggiunta)
//
//   4c1   semiminima DO, ottava 1 (ottava 1 = dal DO centrale in su)
//   8#f1  croma FA#        8eb1  croma MIb        2.g1  minima puntata SOL
//   4-    pausa da 1/4     t8e2 t8g2 t8e2   terzina di crome
//   4c1+e1+g1  accordo     4b1_  legata alla nota dopo
//   (8e2 8d2 8c2)  legatura di frase      "LA" 4a1  sigla sopra   'la' 4a1  testo sotto
//   |  stanghetta          |: ... :|  ritornello          =4  pausa di 4 battute
//
// Se mancano durata o ottava si riprendono dalla nota precedente.

import type { Duration, Measure, NoteEvent, Pitch } from './model';
import { uid } from './model';

const NUM_TO_DUR: Record<string, Duration> = { '1': 'w', '2': 'h', '4': 'q', '8': '8', '16': '16', '32': '32' };
const DUR_TO_NUM: Record<Duration, string> = { w: '1', h: '2', q: '4', '8': '8', '16': '16', '32': '32' };
const OCT_BASE = 3; // ottava Nokia 1 = ottava scientifica 4

const NOTE_RE = /^(#)?([a-g])(#|b)?(\d)?$/i;
const TOKEN_RE = /^(\()?(t)?(16|32|1|2|4|8)?(\.)?(.*?)(_)?(\))?$/i;

function tokenize(text: string): string[] {
  const prepared = text
    .replace(/:\|/g, ' \u0001 ')
    .replace(/\|:/g, ' \u0002 ')
    .replace(/\|/g, ' | ');
  const out: string[] = [];
  const re = /"[^"]*"|'[^']*'|[^\s"']+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prepared))) out.push(m[0] === '\u0001' ? ':|' : m[0] === '\u0002' ? '|:' : m[0]);
  return out;
}

export interface NokiaResult {
  measures: Measure[];
  errors: string[];
}

export function parseNokia(text: string, old: Measure[]): NokiaResult {
  const measures: Measure[] = [];
  const errors: string[] = [];
  let cur: Measure | null = null;
  let lastWasBar = false;
  let pendingStart = false;
  let dur: Duration = 'q';
  let oct = 1;
  let chord: string | undefined;
  let below: string | undefined;

  const startMeasure = (): Measure => {
    const i = measures.length;
    const o = old[i];
    const m: Measure = {
      id: o?.id || uid(),
      events: [],
      ottava: o?.ottava,
      volta: o?.volta,
    };
    if (pendingStart) m.repeatStart = true;
    pendingStart = false;
    return m;
  };
  const close = () => {
    if (cur) measures.push(cur);
    cur = null;
  };

  const parsePitch = (s: string): Pitch | null => {
    const m = NOTE_RE.exec(s);
    if (!m) return null;
    if (m[4] !== undefined) oct = parseInt(m[4], 10);
    const acc = m[1] || m[3] === '#' ? 1 : m[3]?.toLowerCase() === 'b' ? -1 : 0;
    return { step: m[2].toUpperCase() as Pitch['step'], acc: acc as Pitch['acc'], oct: oct + OCT_BASE };
  };

  for (const t of tokenize(text)) {
    if (t === '|') {
      if (cur) close();
      else if (lastWasBar) measures.push(startMeasure());
      lastWasBar = true;
      continue;
    }
    if (t === '|:') {
      if (cur) close();
      pendingStart = true;
      lastWasBar = true;
      continue;
    }
    if (t === ':|') {
      if (!cur && lastWasBar) cur = startMeasure();
      if (cur) {
        (cur as Measure).repeatEnd = true;
        close();
      } else if (measures.length) measures[measures.length - 1].repeatEnd = true;
      lastWasBar = true;
      continue;
    }
    lastWasBar = false;
    if (t.startsWith('"')) {
      chord = t.slice(1, -1).trim().toUpperCase() || undefined;
      continue;
    }
    if (t.startsWith("'")) {
      below = t.slice(1, -1).trim().toUpperCase() || undefined;
      continue;
    }
    if (/^=\d+$/.test(t)) {
      if (!cur) cur = startMeasure();
      (cur as Measure).multiRest = parseInt(t.slice(1), 10);
      continue;
    }
    const tm = TOKEN_RE.exec(t);
    if (!tm) {
      errors.push(t);
      continue;
    }
    const [, slurS, trip, d, dot, body, tie, slurE] = tm;
    if (d) dur = NUM_TO_DUR[d];
    const ev: NoteEvent = {
      id: '',
      rest: false,
      dur,
      dot: !!dot,
      triplet: !!trip,
      keys: [],
      tie: !!tie,
    };
    if (slurS) ev.slurStart = true;
    if (slurE) ev.slurEnd = true;
    if (body === '-' || body.toLowerCase() === 'p') {
      ev.rest = true;
    } else {
      const parts = body.split('+');
      let ok = parts.length > 0;
      for (const p of parts) {
        const pitch = parsePitch(p);
        if (!pitch) {
          ok = false;
          break;
        }
        ev.keys.push(pitch);
      }
      if (!ok || !ev.keys.length) {
        errors.push(t);
        continue;
      }
    }
    if (chord) ev.chord = chord;
    if (below) ev.below = below;
    chord = below = undefined;
    if (!cur) cur = startMeasure();
    const m = cur as Measure;
    const oe = old[measures.length]?.events[m.events.length];
    ev.id = oe?.id || uid();
    m.events.push(ev);
  }
  close();
  if (!measures.length) measures.push(startMeasure());
  return { measures, errors };
}

function pitchText(p: Pitch, withOct: boolean): string {
  const letter = p.step.toLowerCase();
  const o = p.oct - OCT_BASE;
  return (p.acc > 0 ? '#' : '') + letter + (p.acc < 0 ? 'b' : '') + (withOct ? String(o) : '');
}

export function eventToNokia(e: NoteEvent): string {
  let s = '';
  if (e.chord) s += `"${e.chord}" `;
  if (e.below) s += `'${e.below}' `;
  if (e.slurStart) s += '(';
  if (e.triplet) s += 't';
  s += DUR_TO_NUM[e.dur];
  if (e.dot) s += '.';
  if (e.rest) s += '-';
  else s += e.keys.map((k) => pitchText(k, true)).join('+');
  if (e.tie) s += '_';
  if (e.slurEnd) s += ')';
  return s;
}

export function serializeNokia(measures: Measure[]): string {
  let out = '';
  measures.forEach((m, i) => {
    if (i === 0) out += m.repeatStart ? '|: ' : '| ';
    else out += m.repeatStart ? '|: ' : ' ';
    const body = m.multiRest ? `=${m.multiRest}` : m.events.map(eventToNokia).join(' ');
    out += body;
    out += m.repeatEnd ? ' :|' : ' |';
    if (i < measures.length - 1 && measures[i + 1].repeatStart) out += ' ';
  });
  return out;
}
