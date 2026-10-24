// Sigle degli accordi in notazione italiana, maiuscolo, con trasposizione

import type { Pitch } from './model';

const ROOTS: Record<string, number> = { DO: 0, RE: 2, MI: 4, FA: 5, SOL: 7, LA: 9, SI: 11 };

export type Spelling = 'sharp' | 'sharps' | 'flat' | 'neutral';

const NAMES: Record<Spelling, string[]> = {
  sharp: ['DO', 'DO#', 'RE', 'RE#', 'MI', 'FA', 'FA#', 'SOL', 'SOL#', 'LA', 'SIb', 'SI'],
  sharps: ['DO', 'DO#', 'RE', 'RE#', 'MI', 'FA', 'FA#', 'SOL', 'SOL#', 'LA', 'LA#', 'SI'],
  flat: ['DO', 'REb', 'RE', 'MIb', 'MI', 'FA', 'SOLb', 'SOL', 'LAb', 'LA', 'SIb', 'SI'],
  neutral: ['DO', 'DO#', 'RE', 'MIb', 'MI', 'FA', 'FA#', 'SOL', 'LAb', 'LA', 'SIb', 'SI'],
};

const MAJOR_KEY_NAMES = ['DO', 'REb', 'RE', 'MIb', 'MI', 'FA', 'FA#', 'SOL', 'LAb', 'LA', 'SIb', 'SI'];
const MINOR_KEY_NAMES = ['DO', 'DO#', 'RE', 'MIb', 'MI', 'FA', 'FA#', 'SOL', 'SOL#', 'LA', 'SIb', 'SI'];

const ROOT_RE = /^(DO|RE|MI|FA|SOL|LA|SI)([#bB♯♭]?)/i;

export interface ParsedChord {
  root: string; // DO..SI
  acc: number; // -1, 0, 1
  suffix: string;
  bass?: { root: string; acc: number };
}

function accOf(s: string): number {
  if (!s) return 0;
  if (s === '#' || s === '♯') return 1;
  return -1;
}

function normalizeSuffix(raw: string): string {
  let s = raw.trim();
  if (/^min/i.test(s)) s = '-' + s.slice(3);
  else if (/^m(?!aj)/.test(s)) s = '-' + s.slice(1);
  // maiuscolo, ma i bemolle delle estensioni (b9, b5, b13) restano minuscoli
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if ((c === 'b' || c === 'B') && /\d/.test(s[i + 1] || '') && (i === 0 || !/[A-Za-z]/.test(s[i - 1]))) out += 'b';
    else out += c.toUpperCase();
  }
  return out;
}

export function parseChord(text: string): ParsedChord | null {
  const t = text.trim();
  const m = ROOT_RE.exec(t);
  if (!m) return null;
  const root = m[1].toUpperCase();
  const acc = accOf(m[2]);
  let rest = t.slice(m[0].length);
  let bass: ParsedChord['bass'];
  const slash = rest.lastIndexOf('/');
  if (slash >= 0) {
    const b = ROOT_RE.exec(rest.slice(slash + 1));
    if (b && rest.slice(slash + 1).length === b[0].length) {
      bass = { root: b[1].toUpperCase(), acc: accOf(b[2]) };
      rest = rest.slice(0, slash);
    }
  }
  return { root, acc, suffix: normalizeSuffix(rest), bass };
}

function pcOf(root: string, acc: number): number {
  return (((ROOTS[root] ?? 0) + acc) % 12 + 12) % 12;
}

function nameFromPc(pc: number, sp: Spelling): string {
  return NAMES[sp][((pc % 12) + 12) % 12];
}

function writeRoot(root: string, acc: number): string {
  return root + (acc > 0 ? '#' : acc < 0 ? 'b' : '');
}

/** Determina la grafia (diesis/bemolle) dalla tonalità del brano, già trasposta */
export function spellingForKey(key: string, transpose: number): Spelling {
  const p = parseChord(key || '');
  if (!p) return 'neutral';
  const minor = p.suffix.startsWith('-');
  const pc = pcOf(p.root, p.acc) + transpose;
  const n = ((pc % 12) + 12) % 12;
  const name = (minor ? MINOR_KEY_NAMES : MAJOR_KEY_NAMES)[n];
  if ((!minor && name === 'DO') || (minor && name === 'LA')) return 'neutral';
  if (name.endsWith('b') || name === 'FA' || (minor && ['RE', 'SOL', 'DO'].includes(name))) return 'flat';
  // tonalità con molti diesis: grafia tutta in diesis
  const many = minor ? ['FA#', 'DO#', 'SOL#'] : ['LA', 'MI', 'SI', 'FA#'];
  return many.includes(name) ? 'sharps' : 'sharp';
}

/** Restituisce la sigla da mostrare (normalizzata in maiuscolo e trasposta) */
export function displayChord(text: string, transpose = 0, sp: Spelling = 'neutral'): string {
  const p = parseChord(text);
  if (!p) return text.trim().toUpperCase();
  const root =
    transpose === 0 ? writeRoot(p.root, p.acc) : nameFromPc(pcOf(p.root, p.acc) + transpose, sp);
  let bass = '';
  if (p.bass) {
    bass =
      '/' +
      (transpose === 0
        ? writeRoot(p.bass.root, p.bass.acc)
        : nameFromPc(pcOf(p.bass.root, p.bass.acc) + transpose, sp));
  }
  return root + p.suffix + bass;
}

/** Trasposizione definitiva della sigla (per "Rendi definitiva") */
export function transposeChordText(text: string, transpose: number, sp: Spelling): string {
  if (!parseChord(text)) return text;
  return displayChord(text, transpose, sp);
}

// ---- Note sul pentagramma ----

const STEP_PC: Record<Pitch['step'], number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const IT_TO_STEP: Record<string, Pitch['step']> = { DO: 'C', RE: 'D', MI: 'E', FA: 'F', SOL: 'G', LA: 'A', SI: 'B' };

export function transposePitch(p: Pitch, transpose: number, sp: Spelling): Pitch {
  if (!transpose) return p;
  const midi = 12 * (p.oct + 1) + STEP_PC[p.step] + p.acc + transpose;
  const pc = ((midi % 12) + 12) % 12;
  const name = nameFromPc(pc, sp);
  const m = ROOT_RE.exec(name)!;
  const step = IT_TO_STEP[m[1]];
  const acc = accOf(m[2]) as Pitch['acc'];
  const oct = Math.floor((midi - STEP_PC[step] - acc) / 12) - 1;
  return { step, acc, oct };
}

export const STEP_IT: Record<Pitch['step'], string> = { C: 'DO', D: 'RE', E: 'MI', F: 'FA', G: 'SOL', A: 'LA', B: 'SI' };

export function pitchLabel(p: Pitch): string {
  return STEP_IT[p.step] + (p.acc > 0 ? '#' : p.acc < 0 ? 'b' : '') + p.oct;
}

export function transposeLabel(n: number): string {
  if (!n) return '0';
  const s = n > 0 ? '+' + n : String(n);
  return s + (Math.abs(n) === 1 ? ' semitono' : ' semitoni');
}
