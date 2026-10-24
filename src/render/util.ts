// Utilità comuni per il disegno in SVG (unità: punti tipografici)

import type { Spelling } from '../chords';
import type { Song } from '../model';

export const FONT = 'helvetica';
export const FONT_STACK = 'helvetica, Arial, sans-serif';

export interface RenderCtx {
  width: number; // larghezza disponibile in punti
  song: Song;
  transpose: number;
  sp: Spelling;
  labelCol: number; // colonna riservata ai badge (STR, RIT...)
  editing: boolean;
  sel?: Selection;
}

export interface Selection {
  blockId: string;
  barId?: string;
  measureId?: string;
  eventId?: string;
}

export interface HitMeasure {
  measureId: string;
  x0: number;
  x1: number;
  yTop: number; // y della prima riga del pentagramma
  space: number; // distanza tra le righe
  yLineTop: number; // inizio fascia cliccabile
  yLineBottom: number;
}

export interface HitEvent {
  eventId: string;
  measureId: string;
  x: number;
}

export interface Rendered {
  svg: string; // contenuto SVG (senza tag <svg>) con origine in alto a sinistra
  height: number;
  /** y della linea di riferimento della prima riga musicale (per allineare i blocchi affiancati) */
  anchor?: number;
  hits?: { measures: HitMeasure[]; events: HitEvent[] };
}

/** Spostamenti verticali per allineare i blocchi di una riga sulla loro linea di riferimento */
export function rowOffsets(items: Rendered[]): { offsets: number[]; height: number } {
  const anchors = items.map((r) => r.anchor).filter((a): a is number => a !== undefined);
  const maxA = anchors.length > 1 ? Math.max(...anchors) : 0;
  const offsets = items.map((r) => (anchors.length > 1 && r.anchor !== undefined ? maxA - r.anchor : 0));
  const height = Math.max(...items.map((r, i) => r.height + offsets[i]));
  return { offsets, height };
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let canvas: HTMLCanvasElement | null = null;

export function textWidth(text: string, size: number, bold = false, italic = false): number {
  if (typeof document === 'undefined') return text.length * size * (bold ? 0.6 : 0.55);
  if (!canvas) canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px ${FONT}, Arial, sans-serif`;
  return ctx.measureText(text).width;
}

export function text(
  x: number,
  y: number,
  s: string,
  size: number,
  opts: { bold?: boolean; italic?: boolean; fill?: string; anchor?: 'start' | 'middle' | 'end' } = {},
): string {
  const a = opts.anchor && opts.anchor !== 'start' ? ` text-anchor="${opts.anchor}"` : '';
  const w = opts.bold ? ' font-weight="bold"' : '';
  const it = opts.italic ? ' font-style="italic"' : '';
  return `<text x="${r(x)}" y="${r(y)}" font-family="${FONT_STACK}" font-size="${size}"${w}${it}${a} fill="${opts.fill || '#000'}">${esc(s)}</text>`;
}

export function r(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

export function rect(x: number, y: number, w: number, h: number, attrs: string): string {
  return `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}" ${attrs}/>`;
}

export function line(x1: number, y1: number, x2: number, y2: number, w = 1, color = '#000'): string {
  return `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="${color}" stroke-width="${w}"/>`;
}

export const BADGE_SIZE = 11;
export const BADGE_H = 19;

export function badgeWidth(label: string): number {
  return Math.max(34, textWidth(label, BADGE_SIZE, true) + 12);
}

/** Etichetta di sezione: rettangolo nero con testo bianco */
export function badge(x: number, cy: number, label: string, w?: number): string {
  const bw = w ?? badgeWidth(label);
  return (
    rect(x, cy - BADGE_H / 2, bw, BADGE_H, 'rx="3" fill="#000"') +
    text(x + bw / 2, cy + BADGE_SIZE * 0.36, label, BADGE_SIZE, { bold: true, fill: '#fff', anchor: 'middle' })
  );
}

/** Divide un testo in righe che stanno nella larghezza data */
export function wrap(s: string, width: number, size: number, bold = false, italic = false): string[] {
  const out: string[] = [];
  for (const para of s.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (textWidth(t, size, bold, italic) > width && cur) {
        out.push(cur);
        cur = w;
      } else cur = t;
    }
    out.push(cur);
  }
  return out;
}

/** Riduce la dimensione del carattere finché il testo entra nella larghezza */
export function fitSize(s: string, maxW: number, size: number, bold: boolean, min = 8): number {
  let sz = size;
  while (sz > min && textWidth(s, sz, bold) > maxW) sz -= 0.5;
  return sz;
}
