// Impaginazione: blocchi -> pagine A4 (anteprima e PDF usano lo stesso risultato)

import { spellingForKey } from '../chords';
import { Block, blockFrac, Song } from '../model';
import { renderHeader } from './blocks';
import { renderCached } from './cache';
import { badgeWidth, r, RenderCtx, Selection, text } from './util';

export const PAGE_W = 595.28;
export const PAGE_H = 841.89;

export type PresetId = 'a4' | 'tablet';

export interface Preset {
  id: PresetId;
  name: string;
  margin: number;
  scale: number;
}

export const PRESETS: Record<PresetId, Preset> = {
  a4: { id: 'a4', name: 'A4 stampa', margin: 36, scale: 1 },
  tablet: { id: 'tablet', name: 'Tablet', margin: 16, scale: 1.22 },
};

export const BLOCK_GAP = 9;

export function labelColumn(song: Song): number {
  let w = 0;
  for (const b of song.blocks) {
    if ((b.type === 'chords' || b.type === 'staff') && b.label) w = Math.max(w, badgeWidth(b.label.toUpperCase()));
  }
  return w ? w + 8 : 0;
}

export function makeCtx(song: Song, width: number, editing: boolean, sel?: Selection): RenderCtx {
  return {
    width,
    song,
    transpose: song.transpose || 0,
    sp: spellingForKey(song.key, song.transpose || 0),
    labelCol: labelColumn(song),
    editing,
    sel,
  };
}

export interface PageItem {
  svg: string;
  x: number; // in unità di contenuto
  y: number;
  height: number;
  blockId?: string;
}

export interface LaidOut {
  pages: PageItem[][];
  scale: number;
  contentW: number;
  preset: Preset;
  /** pagina di ciascun blocco */
  pageOf: Record<string, number>;
}

export function layoutSong(song: Song, presetId: PresetId, fitOnePage = false): LaidOut {
  const preset = PRESETS[presetId];
  let scale = preset.scale;
  let result = paginate(song, preset, scale);
  if (fitOnePage && result.pages.length > 1) {
    for (let iter = 0; iter < 6 && result.pages.length > 1; iter++) {
      const total = result.totalH;
      const avail = (PAGE_H - 2 * preset.margin - 14) / scale;
      const f = Math.max(0.85, Math.min(0.98, avail / total));
      scale = Math.max(preset.scale * 0.55, scale * f);
      result = paginate(song, preset, scale);
      if (scale <= preset.scale * 0.55) break;
    }
  }
  return { pages: result.pages, scale, contentW: result.contentW, preset, pageOf: result.pageOf };
}

export const COL_GAP = 14;

export interface RowCell {
  block: Block;
  x: number;
  w: number;
}

/** Raggruppa i blocchi in righe: blocchi stretti consecutivi si affiancano se c'è spazio */
export function rowsOf(blocks: Block[], contentW: number): RowCell[][] {
  const rows: RowCell[][] = [];
  let cur: RowCell[] = [];
  let sum = 0;
  const flush = () => {
    if (cur.length) rows.push(cur);
    cur = [];
    sum = 0;
  };
  for (const b of blocks) {
    const f = blockFrac(b);
    if (b.type === 'pagebreak' || f >= 0.999) {
      flush();
      rows.push([{ block: b, x: 0, w: contentW }]);
      continue;
    }
    if (sum + f > 1.001) flush();
    const w = f * (contentW + COL_GAP) - COL_GAP;
    const x = sum * (contentW + COL_GAP);
    cur.push({ block: b, x, w });
    sum += f;
  }
  flush();
  return rows;
}

function paginate(song: Song, preset: Preset, scale: number) {
  const contentW = (PAGE_W - 2 * preset.margin) / scale;
  const availH = (PAGE_H - 2 * preset.margin - 14) / scale; // 14pt per il piè di pagina
  const ctx = makeCtx(song, contentW, false);
  const pages: PageItem[][] = [[]];
  const pageOf: Record<string, number> = {};
  let y = 0;
  let totalH = 0;
  const head = renderHeader(ctx);
  pages[0].push({ svg: head.svg, x: 0, y: 0, height: head.height });
  y = head.height + BLOCK_GAP + 4;
  totalH = y;
  for (const row of rowsOf(song.blocks, contentW)) {
    const first = row[0].block;
    if (first.type === 'pagebreak') {
      if (pages[pages.length - 1].length) {
        pages.push([]);
        y = 0;
      }
      pageOf[first.id] = pages.length - 1;
      continue;
    }
    const rendered = row.map((c) => ({ c, rd: renderCached(c.block, { ...ctx, width: c.w }) }));
    const h = Math.max(...rendered.map((x) => x.rd.height));
    totalH += h + BLOCK_GAP;
    if (y > 0 && y + h > availH) {
      pages.push([]);
      y = 0;
    }
    for (const { c, rd } of rendered) {
      pages[pages.length - 1].push({ svg: rd.svg, x: c.x, y, height: rd.height, blockId: c.block.id });
      pageOf[c.block.id] = pages.length - 1;
    }
    y += h + BLOCK_GAP;
  }
  return { pages, contentW, pageOf, totalH };
}

/** SVG completo di una pagina, in punti tipografici */
export function pageSvg(lo: LaidOut, idx: number, song: Song): string {
  const { preset, scale } = lo;
  const m = preset.margin;
  let body = '';
  const availH = (PAGE_H - 2 * m - 14) / scale;
  for (const it of lo.pages[idx]) {
    // blocco più alto della pagina: lo rimpicciolisco per farlo stare
    const fit = it.height > availH ? availH / it.height : 1;
    body += `<g transform="translate(${r(m + it.x * scale)},${r(m + it.y * scale)}) scale(${r(scale * fit)})">${it.svg}</g>`;
  }
  if (lo.pages.length > 1) {
    const label = `${(song.title || '').toUpperCase()}  ·  ${idx + 1}/${lo.pages.length}`;
    body += text(PAGE_W - m, PAGE_H - m + 8, label, 8, { anchor: 'end', fill: '#444' });
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}"><rect x="0" y="0" width="${PAGE_W}" height="${PAGE_H}" fill="#fff"/>${body}</svg>`;
}
