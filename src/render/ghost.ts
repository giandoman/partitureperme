// "Nota ombra": anteprima della nota sotto il mouse

import { pitchLabel } from '../chords';
import type { Pitch } from '../model';
import type { NoteTool } from '../staffOps';
import { diatonic } from '../staffOps';
import { r, text } from './util';
import type { HitMeasure } from './util';

const NAMES: Record<string, string> = { w: 'semibreve', h: 'minima', q: 'semiminima', '8': 'croma', '16': 'semicroma', '32': 'biscroma' };
const COLOR = '#c8741f';

export function ghostSvg(hm: HitMeasure, x: number, pitch: Pitch, tool: NoteTool, chordAdd: boolean): string {
  const sp = hm.space;
  const top = hm.yTop;
  const bottom = top + 4 * sp;
  const d = diatonic(pitch);
  const y = top + ((38 - d) * sp) / 2;
  const rx = sp * 0.66;
  const ry = sp * 0.47;
  let out = `<g opacity="0.62">`;
  // linea di inserimento
  if (!chordAdd)
    out += `<line x1="${r(x)}" y1="${r(top - 8)}" x2="${r(x)}" y2="${r(bottom + 8)}" stroke="${COLOR}" stroke-width="0.8" stroke-dasharray="2 2"/>`;
  if (tool.rest && !chordAdd) {
    out += `<rect x="${r(x - sp * 0.6)}" y="${r(top + sp)}" width="${r(sp * 1.2)}" height="${r(sp * 2)}" rx="2" fill="${COLOR}"/>`;
  } else {
    // tagli addizionali
    for (let ld = 40; ld <= d; ld += 2) {
      const ly = top + ((38 - ld) * sp) / 2;
      out += `<line x1="${r(x - rx - 3)}" y1="${r(ly)}" x2="${r(x + rx + 3)}" y2="${r(ly)}" stroke="${COLOR}" stroke-width="1"/>`;
    }
    for (let ld = 28; ld >= d; ld -= 2) {
      const ly = top + ((38 - ld) * sp) / 2;
      out += `<line x1="${r(x - rx - 3)}" y1="${r(ly)}" x2="${r(x + rx + 3)}" y2="${r(ly)}" stroke="${COLOR}" stroke-width="1"/>`;
    }
    const hollow = tool.dur === 'w' || tool.dur === 'h';
    out += `<ellipse cx="${r(x)}" cy="${r(y)}" rx="${r(rx)}" ry="${r(ry)}" transform="rotate(-20 ${r(x)} ${r(y)})" fill="${hollow ? 'none' : COLOR}" stroke="${COLOR}" stroke-width="${hollow ? 1.4 : 0.6}"/>`;
    if (tool.dur !== 'w' && !chordAdd) {
      const up = d < 34;
      const sx = up ? x + rx * 0.9 : x - rx * 0.9;
      const ey = up ? y - 3.5 * sp : y + 3.5 * sp;
      out += `<line x1="${r(sx)}" y1="${r(y)}" x2="${r(sx)}" y2="${r(ey)}" stroke="${COLOR}" stroke-width="1"/>`;
      const flags = tool.dur === '8' ? 1 : tool.dur === '16' ? 2 : tool.dur === '32' ? 3 : 0;
      for (let i = 0; i < flags; i++) {
        const fy = up ? ey + i * sp * 0.8 : ey - i * sp * 0.8;
        const dir = up ? 1 : -1;
        out += `<path d="M${r(sx)} ${r(fy)} q ${r(sp * 0.9)} ${r(dir * sp * 0.6)} ${r(sp * 0.7)} ${r(dir * sp * 1.7)}" fill="none" stroke="${COLOR}" stroke-width="1.2"/>`;
      }
    }
    if (tool.dot) out += `<circle cx="${r(x + rx + 3)}" cy="${r(y)}" r="1.3" fill="${COLOR}"/>`;
    if (pitch.acc !== 0) out += text(x - rx - 8, y + 3.5, pitch.acc > 0 ? '#' : 'b', 10, { bold: true, fill: COLOR });
  }
  out += '</g>';
  // etichetta
  const name = tool.rest && !chordAdd ? 'pausa di ' + NAMES[tool.dur] : (chordAdd ? '+ ' : '') + pitchLabel(pitch) + ' · ' + NAMES[tool.dur];
  const label = name + (tool.dot && !chordAdd ? ' puntata' : '') + (tool.triplet && !chordAdd ? ' (terzina)' : '');
  const ly = Math.min(top - 12, y - sp * 2.2);
  const w = label.length * 4.6 + 10;
  out += `<rect x="${r(x - w / 2)}" y="${r(ly - 9)}" width="${r(w)}" height="12" rx="3" fill="#1c1d20" opacity="0.85"/>`;
  out += text(x, ly, label, 8, { bold: true, fill: '#fff', anchor: 'middle' });
  return out;
}
