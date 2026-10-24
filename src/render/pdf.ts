// Esportazione PDF vettoriale (stesso disegno dell'anteprima)

import { jsPDF } from 'jspdf';
import 'svg2pdf.js';
import type { Song } from '../model';
import { layoutSong, PAGE_H, PAGE_W, pageSvg, PresetId } from './layout';

function fileName(song: Song, preset: PresetId): string {
  const base = (song.title || 'brano')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '_');
  return `${base || 'brano'}${preset === 'tablet' ? '_tablet' : ''}.pdf`;
}

async function appendSong(doc: jsPDF, song: Song, preset: PresetId, fit: boolean, first: boolean) {
  const lo = layoutSong(song, preset, fit);
  const holder = document.createElement('div');
  holder.style.cssText = 'position:absolute;left:-20000px;top:0;visibility:hidden';
  document.body.appendChild(holder);
  try {
    for (let i = 0; i < lo.pages.length; i++) {
      if (!(first && i === 0)) doc.addPage([PAGE_W, PAGE_H], 'portrait');
      holder.innerHTML = pageSvg(lo, i, song);
      const svg = holder.querySelector('svg')!;
      await doc.svg(svg, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    }
  } finally {
    holder.remove();
  }
}

export async function exportPdf(song: Song, preset: PresetId, fit: boolean): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: [PAGE_W, PAGE_H], orientation: 'portrait', compress: true });
  doc.setProperties({ title: song.title || 'Brano', creator: 'Partiture per me' });
  await appendSong(doc, song, preset, fit, true);
  doc.save(fileName(song, preset));
}

/** Più brani in un solo PDF (scaletta) */
export async function exportSetlistPdf(songs: Song[], preset: PresetId, fit: boolean, name: string): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: [PAGE_W, PAGE_H], orientation: 'portrait', compress: true });
  doc.setProperties({ title: name, creator: 'Partiture per me' });
  for (let i = 0; i < songs.length; i++) await appendSong(doc, songs[i], preset, fit, i === 0);
  doc.save((name || 'scaletta').replace(/\s+/g, '_') + (preset === 'tablet' ? '_tablet' : '') + '.pdf');
}
