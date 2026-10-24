// Disegno dei blocchi non-pentagramma

import { displayChord, transposeLabel } from '../chords';
import type { Bar, ChordsBlock, CueBlock, RoadmapBlock, SectionBlock } from '../model';
import { parseRoadLine, prettyRepeat } from '../syntax';
import {
  badge,
  BADGE_H,
  badgeWidth,
  esc,
  fitSize,
  line,
  r,
  rect,
  RenderCtx,
  Rendered,
  text,
  textWidth,
  wrap,
} from './util';

const SEL_FILL = '#fff1a8';

// ---------- Intestazione del brano ----------

export function renderHeader(ctx: RenderCtx): Rendered {
  const s = ctx.song;
  const W = ctx.width;
  let out = '';
  const titleSize = fitSize(s.title || 'Senza titolo', W * 0.62, 22, true, 12);
  out += text(0, 22, (s.title || 'Senza titolo').toUpperCase(), titleSize, { bold: true });
  if (s.artist) out += text(0, 38, s.artist, 11, { fill: '#333' });

  const info: string[] = [];
  if (s.key) info.push('Tonalità: ' + displayChord(s.key, ctx.transpose, ctx.sp));
  if (s.tempo) info.push(s.tempo + ' BPM');
  if (s.timeSig) info.push(s.timeSig);
  let y = 16;
  if (info.length) {
    out += text(W, y, info.join('   ·   '), 11, { bold: true, anchor: 'end' });
    y += 15;
  }
  if (s.patch) {
    const sz = fitSize('Suono: ' + s.patch, W * 0.45, 10, false, 7);
    out += text(W, y, 'Suono: ' + s.patch, sz, { anchor: 'end', fill: '#333' });
    y += 13;
  }
  if (ctx.transpose) {
    out += text(W, y, 'Trasposto ' + transposeLabel(ctx.transpose), 9, { anchor: 'end', italic: true, fill: '#555' });
    y += 12;
  }
  let h = Math.max(s.artist ? 44 : 30, y);
  out += line(0, h, W, h, 1.2);
  h += 4;
  if (s.notes.trim()) {
    const lines = wrap(s.notes, W, 10, false, true);
    lines.forEach((l, i) => {
      out += text(0, h + 12 + i * 13, l, 10, { italic: true, fill: '#222' });
    });
    h += 6 + lines.length * 13;
  }
  return { svg: out, height: h + 4 };
}

// ---------- Sezione ----------

export function renderSection(b: SectionBlock, ctx: RenderCtx): Rendered {
  const cy = 16;
  const label = (b.label || '').toUpperCase();
  let out = '';
  let x = 0;
  if (label) {
    const bw = Math.max(44, textWidth(label, 13, true) + 16);
    out += rect(0, cy - 12, bw, 24, 'rx="3" fill="#000"');
    out += text(bw / 2, cy + 4.7, label, 13, { bold: true, fill: '#fff', anchor: 'middle' });
    x = bw + 10;
  }
  if (b.text) {
    out += text(x, cy + 5, b.text, 13, { bold: true });
    x += textWidth(b.text, 13, true) + 10;
  }
  if (x < ctx.width) out += line(x, cy, ctx.width, cy, 1, '#000');
  return { svg: out, height: 32 };
}

// ---------- Avviso / cue ----------

export function renderCue(b: CueBlock, ctx: RenderCtx): Rendered {
  const size = 16;
  const lines = wrap(b.text || ' ', ctx.width - 24, size, true);
  const tw = Math.max(...lines.map((l) => textWidth(l, size, true)));
  const lh = 20;
  const h = lines.length * lh + 10;
  const bw = Math.min(ctx.width, tw + 24);
  const x0 = b.align === 'center' ? (ctx.width - bw) / 2 : 0;
  let out = '';
  let fill = '#000';
  if (b.style === 'forte') {
    out += rect(x0, 0, bw, h, 'rx="4" fill="#000"');
    fill = '#fff';
  } else if (b.style === 'riquadro') {
    out += rect(x0 + 1, 1, bw - 2, h - 2, 'rx="4" fill="none" stroke="#000" stroke-width="2"');
  }
  lines.forEach((l, i) => {
    out += text(x0 + bw / 2, 5 + lh * i + 15.5, l, size, { bold: true, fill, anchor: 'middle' });
  });
  return { svg: out, height: h + 2 };
}

// ---------- Roadmap ----------

export function renderRoadmap(b: RoadmapBlock, ctx: RenderCtx): Rendered {
  const W = ctx.width;
  let out = '';
  let y = 0;
  const chipH = 24;
  const subH = 11;
  const gap = 26;
  for (const ln of b.lines) {
    const steps = parseRoadLine(ln);
    if (!steps.length) continue;
    const hasSub = steps.some((s) => s.sub);
    const rowH = chipH + (hasSub ? subH : 0);
    let x = 0;
    steps.forEach((st, i) => {
      const lw = textWidth(st.label, 13, true);
      const rw = st.repeat ? textWidth(st.repeat, 13, true) + 6 : 0;
      const sw = st.sub ? textWidth(st.sub, 8.5, true) : 0;
      const cw = Math.max(lw + rw, sw) + 16;
      if (x > 0 && x + cw > W) {
        x = 0;
        y += rowH + 6;
      }
      const top = y;
      out += rect(x + 0.6, top + 0.6, cw - 1.2, rowH - 1.2, 'rx="5" fill="none" stroke="#000" stroke-width="1.2"');
      out += text(x + 8, top + 17, st.label, 13, { bold: true });
      if (st.repeat) out += text(x + 8 + lw + 6, top + 17, st.repeat, 13, { bold: true, fill: '#000' });
      if (st.sub) out += text(x + 8, top + rowH - 5, st.sub, 8.5, { bold: true, fill: '#444' });
      x += cw;
      if (i < steps.length - 1) {
        const ay = top + rowH / 2;
        out += line(x + 5, ay, x + gap - 7, ay, 1.6);
        out += `<path d="M${r(x + gap - 5)} ${r(ay)} L${r(x + gap - 11)} ${r(ay - 4)} L${r(x + gap - 11)} ${r(ay + 4)} Z" fill="#000"/>`;
        x += gap;
      }
    });
    y += rowH + 8;
  }
  return { svg: out, height: Math.max(y, 10) };
}

// ---------- Griglia accordi ----------

const CHORD_SIZE = 15;
const ROW_H = 30;

function barlineSvg(x: number, top: number, bot: number, kind: 'thin' | 'start' | 'end' | 'final'): string {
  const cy = (top + bot) / 2;
  const dots = (dx: number) =>
    `<circle cx="${r(x + dx)}" cy="${r(cy - 4.5)}" r="1.7" fill="#000"/><circle cx="${r(x + dx)}" cy="${r(cy + 4.5)}" r="1.7" fill="#000"/>`;
  switch (kind) {
    case 'thin':
      return line(x, top, x, bot, 1.1);
    case 'start':
      return rect(x, top, 3, bot - top, 'fill="#000"') + line(x + 5.5, top, x + 5.5, bot, 1.1) + dots(9.5);
    case 'end':
      return dots(-9.5) + line(x - 5.5, top, x - 5.5, bot, 1.1) + rect(x - 3, top, 3, bot - top, 'fill="#000"');
    case 'final':
      return line(x - 5, top, x - 5, bot, 1.1) + rect(x - 3, top, 3, bot - top, 'fill="#000"');
  }
}

export function renderChords(b: ChordsBlock, ctx: RenderCtx): Rendered {
  const W = ctx.width;
  const editing = ctx.editing;
  const rep = prettyRepeat(b.repeat || '').trim();
  const repW = rep ? textWidth(rep, 14, true) + 12 : 0;
  const x0 = ctx.labelCol;
  const gridW = W - x0 - repW;
  // nei blocchi stretti riduco le battute per riga per tenere leggibili gli accordi
  const maxChords = Math.max(1, ...b.bars.map((x) => x.chords.length));
  const minBar = 10 + 29 * maxChords;
  const per = Math.max(1, Math.min(8, b.barsPerLine || 4, Math.floor(gridW / minBar)));
  const bw = gridW / per;

  // righe
  const rows: Bar[][] = [];
  let cur: Bar[] = [];
  b.bars.forEach((bar) => {
    if (cur.length && (cur.length >= per || bar.newLine)) {
      rows.push(cur);
      cur = [];
    }
    cur.push(bar);
  });
  if (cur.length || !rows.length) rows.push(cur);

  let out = '';
  let y = 0;
  rows.forEach((row, ri) => {
    const hasTop = row.some((bar) => bar.cue || bar.volta);
    const top = y + (hasTop ? 13 : 2);
    const bot = top + ROW_H - 6;
    const cy = (top + bot) / 2;
    if (ri === 0 && b.label) out += badge(0, cy, b.label.toUpperCase(), Math.min(badgeWidth(b.label), x0 - 6));

    row.forEach((bar, i) => {
      const bx = x0 + i * bw;
      const sel = editing && ctx.sel?.blockId === b.id && ctx.sel.barId === bar.id;
      if (sel) out += rect(bx, top - 2, bw, bot - top + 4, `fill="${SEL_FILL}"`);
      // stanghetta iniziale
      if (bar.repeatStart) out += barlineSvg(bx, top, bot, 'start');
      else if (i === 0 || !row[i - 1].repeatEnd) out += barlineSvg(bx, top, bot, 'thin');
      // stanghetta finale
      const ex = bx + bw;
      if (bar.repeatEnd) out += barlineSvg(ex, top, bot, 'end');
      else if (i === row.length - 1) out += barlineSvg(ex, top, bot, 'thin');

      const innerL = bx + (bar.repeatStart ? 15 : 6);
      const innerR = ex - (bar.repeatEnd ? 15 : 4);
      const innerW = innerR - innerL;

      // volta e cue sopra la battuta
      if (bar.volta) {
        out += line(bx + 2, top - 3, bx + 2, top - 12, 1) + line(bx + 2, top - 12, ex - 4, top - 12, 1);
        out += text(bx + 5, top - 4, bar.volta, 9, { bold: true });
      }
      if (bar.cue) {
        const cx = bar.volta ? bx + 6 + textWidth(bar.volta, 9, true) + 6 : bx + 3;
        const sz = fitSize(bar.cue.toUpperCase(), ex - cx - 4, 9.5, true, 6);
        out += text(cx, top - (bar.volta ? 15 : 3), bar.cue.toUpperCase(), sz, { bold: true });
      }

      if (bar.rest) {
        const mw = Math.min(innerW * 0.7, 60);
        const mx = innerL + (innerW - mw) / 2;
        out += rect(mx, cy - 3, mw, 6, 'fill="#000"');
        out += line(mx, cy - 7, mx, cy + 7, 1.4) + line(mx + mw, cy - 7, mx + mw, cy + 7, 1.4);
        out += text(mx + mw / 2, cy - 7, String(bar.rest), 10, { bold: true, anchor: 'middle' });
      } else if (bar.simile) {
        const cx = innerL + innerW / 2;
        out += line(cx - 6, cy + 7, cx + 6, cy - 7, 3);
        out += `<circle cx="${r(cx - 6)}" cy="${r(cy - 4)}" r="1.8" fill="#000"/><circle cx="${r(cx + 6)}" cy="${r(cy + 4)}" r="1.8" fill="#000"/>`;
      } else if (bar.chords.length) {
        const n = bar.chords.length;
        const slot = innerW / n;
        bar.chords.forEach((c, k) => {
          const label = displayChord(c, ctx.transpose, ctx.sp);
          const sz = fitSize(label, slot - 7, CHORD_SIZE, true, 9);
          out += text(innerL + k * slot, cy + sz * 0.36, label, sz, { bold: true });
        });
      } else if (editing) {
        out += text(innerL + innerW / 2, cy + 4, '·', 14, { anchor: 'middle', fill: '#bbb' });
      }
      if (bar.lyric) {
        const sz = fitSize(bar.lyric, bw - 8, 9.5, false, 6);
        out += text(bx + 5, bot + 11, bar.lyric, sz, { italic: true, fill: '#222' });
      }
      if (editing)
        out += `<rect x="${r(bx)}" y="${r(top - 4)}" width="${r(bw)}" height="${r(bot - top + 8)}" fill="transparent" data-bar="${esc(bar.id)}" style="cursor:pointer"/>`;
    });
    if (ri === rows.length - 1 && rep) {
      const ex = x0 + row.length * bw;
      out += text(ex + 8, cy + 5, rep, 14, { bold: true });
    }
    y = bot + 6 + (row.some((bar) => bar.lyric) ? 12 : 0);
  });
  if (b.note.trim()) {
    const lines = wrap(b.note.toUpperCase(), W - x0, 9.5, true, true);
    lines.forEach((l, i) => {
      out += text(x0, y + 9 + i * 12, l, 9.5, { bold: true, italic: true, fill: '#333' });
    });
    y += lines.length * 12 + 3;
  }
  return { svg: out, height: y + 1 };
}

export function renderSpacer(h: number): Rendered {
  return { svg: '', height: h };
}

export { BADGE_H };
