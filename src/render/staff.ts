// Pentagramma a rigo singolo in chiave di violino (VexFlow)

import {
  Accidental,
  Annotation,
  BarlineType,
  Beam,
  Curve,
  Dot,
  Formatter,
  MultiMeasureRest,
  Renderer,
  Stave,
  StaveNote,
  StaveTie,
  Tuplet,
  Voice,
} from 'vexflow';
import { displayChord, transposePitch } from '../chords';
import {
  eventLength,
  Measure,
  measureCapacity,
  NoteEvent,
  parseTimeSig,
  Pitch,
  StaffBlock,
} from '../model';
import { prettyRepeat } from '../syntax';
import { badge, badgeWidth, FONT, FONT_STACK, HitEvent, HitMeasure, r, rect, RenderCtx, Rendered, text, textWidth, wrap } from './util';

export const STAFF_SCALE = 0.72;
const SPACE = 10; // distanza tra le righe in unità VexFlow

const STEP_IDX: Record<Pitch['step'], number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
const diat = (p: Pitch) => p.oct * 7 + STEP_IDX[p.step];
const TOP_LINE = 38; // FA5
const BOTTOM_LINE = 30; // MI4

const EV_W: Record<string, number> = { w: 38, h: 32, q: 27, '8': 23, '16': 21, '32': 21 };

function naturalWidth(m: Measure): number {
  if (m.multiRest) return 110;
  if (!m.events.length) return 70;
  let w = 22;
  for (const e of m.events) {
    w += EV_W[e.dur] || 26;
    if (e.dot) w += 6;
    if (e.keys.some((k) => k.acc !== 0)) w += 9;
    if (e.chord) w += Math.max(0, textWidth(e.chord, 13, true) - (EV_W[e.dur] || 26) + 4);
  }
  if (m.repeatStart) w += 14;
  if (m.repeatEnd) w += 14;
  return w;
}

let host: HTMLDivElement | null = null;
function getHost(): HTMLDivElement {
  if (!host) {
    host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:-10000px;top:0;width:10px;height:10px;overflow:hidden;visibility:hidden';
    document.body.appendChild(host);
  }
  return host;
}

interface Placed {
  ev: NoteEvent;
  note: StaveNote;
  line: number;
}

export function renderStaff(b: StaffBlock, ctx: RenderCtx): Rendered {
  const S = STAFF_SCALE;
  const ts = b.timeSig || ctx.song.timeSig || '4/4';
  const { num, den } = parseTimeSig(ts);
  const cap = measureCapacity(ts);
  const rep = prettyRepeat(b.repeat || '').trim();
  const repW = rep ? textWidth(rep, 14, true) + 12 : 0;
  const x0 = ctx.labelCol;
  const Wi = (ctx.width - x0 - repW) / S;
  const measures = b.measures.length ? b.measures : [];
  const tp = (p: Pitch) => transposePitch(p, ctx.transpose, ctx.sp);

  // ---- impaginazione delle battute in righe ----
  const nat = measures.map(naturalWidth);
  const lines: number[][] = [];
  const firstExtra = (li: number) => 36 + (li === 0 && b.showTimeSig ? 26 : 0);
  if (b.measuresPerLine > 0) {
    for (let i = 0; i < measures.length; i += b.measuresPerLine)
      lines.push(measures.slice(i, i + b.measuresPerLine).map((_, k) => i + k));
  } else {
    let cur: number[] = [];
    let sum = 0;
    measures.forEach((_, i) => {
      const w = nat[i] + (cur.length === 0 ? firstExtra(lines.length) : 0);
      if (cur.length && sum + w > Wi) {
        lines.push(cur);
        cur = [];
        sum = 0;
      }
      sum += nat[i] + (cur.length === 0 ? firstExtra(lines.length) : 0);
      cur.push(i);
    });
    if (cur.length) lines.push(cur);
  }
  if (!lines.length) lines.push([]);

  const widths: number[][] = lines.map((ln, li) => {
    const raw = ln.map((i, k) => nat[i] + (k === 0 ? firstExtra(li) : 0));
    const sum = raw.reduce((a, c) => a + c, 0) || 1;
    const isLast = li === lines.length - 1;
    let f = Wi / sum;
    if (isLast && b.measuresPerLine === 0 && lines.length > 1) f = Math.min(f, Math.max(1, (Wi / sum) * 0.75));
    if (isLast && lines.length === 1 && b.measuresPerLine === 0) f = Math.min(f, 2.2);
    return raw.map((w) => w * f);
  });

  // ---- misure verticali per riga ----
  const lineInfo = lines.map((ln) => {
    let dmax = -Infinity;
    let dmin = Infinity;
    let hasChord = false;
    let hasBelow = false;
    let hasOtt = false;
    let hasVolta = false;
    for (const i of ln) {
      const m = measures[i];
      if (m.ottava) hasOtt = true;
      if (m.volta) hasVolta = true;
      for (const e of m.events) {
        if (e.chord) hasChord = true;
        if (e.below) hasBelow = true;
        if (!e.rest)
          for (const k of e.keys) {
            const d = diat(tp(k));
            dmax = Math.max(dmax, d);
            dmin = Math.min(dmin, d);
          }
      }
    }
    const above = Math.max(0, dmax - TOP_LINE) * (SPACE / 2);
    const below = Math.max(0, BOTTOM_LINE - dmin) * (SPACE / 2);
    const zoneA = 26 + above; // note, gambi e numeri delle terzine
    const top = zoneA + (hasChord ? 22 : 0) + (hasOtt ? 18 : 0) + (hasVolta ? 18 : 0);
    const bottom = 22 + below + (hasBelow ? 20 : 0);
    return { top, bottom, zoneA, hasChord, hasOtt, hasVolta };
  });
  const totalH = lineInfo.reduce((a, l) => a + l.top + 4 * SPACE + l.bottom, 0);

  // ---- disegno ----
  const div = document.createElement('div');
  getHost().appendChild(div);
  const renderer = new Renderer(div, Renderer.Backends.SVG);
  renderer.resize(Math.ceil(Wi) + 2, Math.ceil(totalH) + 2);
  const c = renderer.getContext();
  c.setFont(FONT, 10);

  const hitsM: HitMeasure[] = [];
  const hitsE: HitEvent[] = [];
  const placed: Placed[] = [];
  const overlays: string[] = [];
  const staffYs: number[] = [];
  const lineEnds: number[] = [];
  const chordMarks: { note: StaveNote; text: string; y: number }[] = [];
  const ottavas: { x1: number; x2: number; y: number }[] = [];
  const voltas: { x: number; w: number; text: string; y: number }[] = [];

  let y = 0;
  lines.forEach((ln, li) => {
    const info = lineInfo[li];
    const yStaff = y + info.top;
    staffYs.push(yStaff);
    let x = 0;
    const lineNotes: { m: Measure; notes: StaveNote[] }[] = [];
    ln.forEach((mi, k) => {
      const m = measures[mi];
      const w = widths[li][k];
      const stave = new Stave(x, yStaff, w, { space_above_staff_ln: 0, space_below_staff_ln: 0 });
      if (k === 0) {
        stave.addClef('treble');
        if (li === 0 && b.showTimeSig) stave.addTimeSignature(`${num}/${den}`);
      }
      if (m.repeatStart) stave.setBegBarType(BarlineType.REPEAT_BEGIN);
      if (m.repeatEnd) stave.setEndBarType(BarlineType.REPEAT_END);
      else if (mi === measures.length - 1 && !rep) stave.setEndBarType(BarlineType.SINGLE);
      if (m.volta) voltas.push({ x, w, text: m.volta, y: yStaff - info.zoneA - (info.hasChord ? 22 : 0) - (info.hasOtt ? 18 : 0) - 12 });
      stave.setContext(c).draw();

      const selM = ctx.editing && ctx.sel?.blockId === b.id && ctx.sel.measureId === m.id;
      const used = m.events.reduce((a, e) => a + eventLength(e), 0);
      if (ctx.editing && used > cap + 1e-6)
        overlays.push(rect(x0 + x * S, yStaff * S - 6, w * S, 4 * SPACE * S + 12, 'fill="#ffd6d6"'));
      else if (selM) overlays.push(rect(x0 + x * S, yStaff * S - 6, w * S, 4 * SPACE * S + 12, 'fill="#fff6c7"'));

      hitsM.push({
        measureId: m.id,
        x0: x0 + (k === 0 ? stave.getNoteStartX() - 6 : x) * S,
        x1: x0 + (x + w) * S,
        yTop: stave.getYForLine(0) * S,
        space: SPACE * S,
        yLineTop: (y + 4) * S,
        yLineBottom: (yStaff + 4 * SPACE + info.bottom - 4) * S,
      });

      const notes: StaveNote[] = [];
      if (m.multiRest) {
        new MultiMeasureRest(m.multiRest, { number_of_measures: m.multiRest }).setStave(stave).setContext(c).draw();
      } else if (m.events.length) {
        // alterazioni: valgono fino alla fine della battuta
        const accState = new Map<string, number>();
        m.events.forEach((ev) => {
          const keys = ev.rest ? [] : ev.keys.map(tp);
          const sorted = keys.map((p, idx) => ({ p, idx })).sort((a, z) => diat(a.p) - diat(z.p));
          const vexKeys = ev.rest ? ['b/4'] : sorted.map(({ p }) => `${p.step.toLowerCase()}/${p.oct}`);
          const dur = ev.dur + (ev.dot ? 'd' : '') + (ev.rest ? 'r' : '');
          const n = new StaveNote({ keys: vexKeys, duration: dur, auto_stem: true, clef: 'treble' });
          if (!ev.rest)
            sorted.forEach(({ p }, idx) => {
              const id = p.step + p.oct;
              const prev = accState.get(id) ?? 0;
              if (p.acc !== prev) {
                n.addModifier(new Accidental(p.acc > 0 ? '#' : p.acc < 0 ? 'b' : 'n'), idx);
                accState.set(id, p.acc);
              }
            });
          if (ev.dot) Dot.buildAndAttach([n], { all: true });
          if (ev.chord) chordMarks.push({ note: n, text: displayChord(ev.chord, ctx.transpose, ctx.sp), y: yStaff - info.zoneA - 5 });
          if (ev.below) {
            const a = new Annotation(ev.below.toUpperCase());
            a.setFont(FONT, 11, 'bold');
            a.setVerticalJustification(Annotation.VerticalJustify.BOTTOM);
            n.addModifier(a, 0);
          }
          if (ctx.editing && ctx.sel?.eventId === ev.id) n.setStyle({ fillStyle: '#d40000', strokeStyle: '#d40000' });
          notes.push(n);
          placed.push({ ev, note: n, line: li });
        });

        // terzine (gruppi di 3)
        const tuplets: Tuplet[] = [];
        const beamGroups: StaveNote[][] = [];
        const beamable = (e: NoteEvent) => !e.rest && (e.dur === '8' || e.dur === '16' || e.dur === '32');
        let i = 0;
        let pos = 0;
        const beat = den === 8 && num % 3 === 0 ? 1.5 : den === 8 ? 0.5 : 1;
        let run: StaveNote[] = [];
        let runBeat = -1;
        const flush = () => {
          if (run.length > 1) beamGroups.push(run);
          run = [];
          runBeat = -1;
        };
        while (i < m.events.length) {
          const e = m.events[i];
          if (e.triplet) {
            flush();
            const grp: number[] = [];
            while (i < m.events.length && m.events[i].triplet && grp.length < 3) {
              grp.push(i);
              pos += eventLength(m.events[i]);
              i++;
            }
            const gn = grp.map((g) => notes[g]);
            const allB = grp.every((g) => beamable(m.events[g]));
            tuplets.push(new Tuplet(gn, { num_notes: 3, notes_occupied: 2, bracketed: !allB, ratioed: false }));
            if (allB && gn.length > 1) beamGroups.push(gn);
            continue;
          }
          const bk = Math.floor(pos / beat + 1e-6);
          if (beamable(e)) {
            if (runBeat !== bk) flush();
            run.push(notes[i]);
            runBeat = bk;
          } else flush();
          pos += eventLength(e);
          i++;
        }
        flush();

        const voice = new Voice({ num_beats: num, beat_value: den }).setMode(Voice.Mode.SOFT);
        voice.addTickables(notes);
        const beams = beamGroups.map((g) => new Beam(g, true));
        new Formatter().joinVoices([voice]).formatToStave([voice], stave);
        voice.draw(c, stave);
        beams.forEach((bm) => bm.setContext(c).draw());
        tuplets.forEach((t) => t.setContext(c).draw());

        notes.forEach((n, idx) => {
          hitsE.push({ eventId: m.events[idx].id, measureId: m.id, x: x0 + (n.getAbsoluteX() + 6) * S });
        });
      }
      lineNotes.push({ m, notes });
      x += w;
    });
    lineEnds.push(x);

    // 8va sulle battute marcate
    let runStart: StaveNote | null = null;
    let runEnd: StaveNote | null = null;
    const flushOtt = () => {
      if (runStart && runEnd)
        ottavas.push({
          x1: runStart.getAbsoluteX() - 4,
          x2: runEnd.getAbsoluteX() + 14,
          y: yStaff - info.zoneA - (info.hasChord ? 22 : 0) - 8,
        });
      runStart = runEnd = null;
    };
    lineNotes.forEach(({ m, notes }) => {
      if (m.ottava && notes.length) {
        if (!runStart) runStart = notes[0];
        runEnd = notes[notes.length - 1];
      } else if (!m.ottava) flushOtt();
    });
    flushOtt();

    y = yStaff + 4 * SPACE + info.bottom;
  });

  // legature di frase
  const open: Placed[] = [];
  placed.forEach((p) => {
    if (p.ev.slurStart) open.push(p);
    if (p.ev.slurEnd && open.length) {
      const st = open.pop()!;
      if (st === p) return;
      const opts = { cps: [{ x: 0, y: 14 }, { x: 0, y: 14 }] };
      if (st.line === p.line) new Curve(st.note, p.note, opts).setContext(c).draw();
      else {
        new Curve(st.note, undefined as any, opts).setContext(c).draw();
        new Curve(undefined as any, p.note, opts).setContext(c).draw();
      }
    }
  });

  // legature di valore
  placed.forEach((p, idx) => {
    if (!p.ev.tie || p.ev.rest) return;
    const nx = placed[idx + 1];
    if (!nx || nx.ev.rest) return;
    const k = Math.min(p.ev.keys.length, nx.ev.keys.length);
    const ind = Array.from({ length: k }, (_, i) => i);
    if (nx.line === p.line) {
      new StaveTie({ first_note: p.note, last_note: nx.note, first_indices: ind, last_indices: ind }).setContext(c).draw();
    } else {
      new StaveTie({ first_note: p.note, last_note: null as any, first_indices: ind, last_indices: ind }).setContext(c).draw();
      new StaveTie({ first_note: null as any, last_note: nx.note, first_indices: ind, last_indices: ind }).setContext(c).draw();
    }
  });

  const svgEl = div.querySelector('svg')!;
  // compatibilità con il PDF: dimensioni senza "pt", carattere standard, righe nere
  const inner = svgEl.innerHTML
    .replace(/font-size="([\d.]+)pt"/g, (_, n) => `font-size="${r(parseFloat(n) * (4 / 3))}"`)
    .replace(/font-family="[^"]*"/g, `font-family="${FONT_STACK}"`)
    .replace(/#999999/g, '#000000');
  // gli attributi di stile (stroke, fill...) stanno sulla radice: li riporto sul gruppo
  const skip = new Set(['width', 'height', 'style', 'xmlns', 'version', 'viewbox', 'xmlns:xlink', 'preserveaspectratio']);
  let rootAttrs = '';
  for (const a of Array.from(svgEl.attributes)) {
    if (skip.has(a.name.toLowerCase())) continue;
    let v = a.value;
    if (a.name === 'font-family') v = FONT_STACK;
    if (a.name === 'font-size') v = /pt$/.test(v) ? r(parseFloat(v) * (4 / 3)) : v;
    rootAttrs += ` ${a.name}="${v.replace(/"/g, '&quot;')}"`;
  }
  div.remove();

  let out = overlays.join('');
  out += `<g transform="translate(${r(x0)},0) scale(${S})"${rootAttrs}>${inner}</g>`;
  const X = (v: number) => x0 + v * S;
  const Y = (v: number) => v * S;
  for (const cm of chordMarks) out += text(X(cm.note.getAbsoluteX() - 2), Y(cm.y), cm.text, 13, { bold: true });
  for (const o of ottavas) {
    const ty = Y(o.y);
    out += text(X(o.x1), ty + 4, '8', 12, { bold: true, italic: true });
    out += text(X(o.x1) + 7, ty - 0.5, 'va', 8, { bold: true, italic: true });
    out += `<line x1="${r(X(o.x1) + 18)}" y1="${r(ty)}" x2="${r(X(o.x2))}" y2="${r(ty)}" stroke="#000" stroke-width="0.9" stroke-dasharray="3 2.5"/>`;
    out += `<line x1="${r(X(o.x2))}" y1="${r(ty)}" x2="${r(X(o.x2))}" y2="${r(ty + 6)}" stroke="#000" stroke-width="0.9"/>`;
  }
  for (const v of voltas) {
    const vy = Y(v.y);
    out += `<path d="M${r(X(v.x) + 2)} ${r(vy + 11)} L${r(X(v.x) + 2)} ${r(vy)} L${r(X(v.x + v.w) - 4)} ${r(vy)}" fill="none" stroke="#000" stroke-width="1"/>`;
    out += text(X(v.x) + 5, vy + 10, v.text, 9, { bold: true });
  }
  if (b.label) {
    const cy = (staffYs[0] + 2 * SPACE) * S;
    out += badge(0, cy, b.label.toUpperCase(), Math.min(badgeWidth(b.label), x0 - 6));
  }
  if (rep) {
    const li = lines.length - 1;
    out += text(x0 + lineEnds[li] * S + 8, (staffYs[li] + 2 * SPACE) * S + 5, rep, 14, { bold: true });
  }
  let h = totalH * S;
  if (b.note.trim()) {
    const ls = wrap(b.note, ctx.width - x0, 9.5, true, true);
    ls.forEach((l, i) => {
      out += text(x0, h + 6 + i * 12, l.toUpperCase(), 9.5, { bold: true, italic: true, fill: '#333' });
    });
    h += ls.length * 12 + 4;
  }
  return { svg: out, height: h + 2, hits: { measures: hitsM, events: hitsE } };
}
