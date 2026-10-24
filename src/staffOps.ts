// Operazioni di modifica sul pentagramma

import type { Duration, NoteEvent, Pitch, StaffBlock } from './model';
import { uid } from './model';
import type { HitEvent, HitMeasure } from './render/util';

export interface NoteTool {
  dur: Duration;
  dot: boolean;
  rest: boolean;
  triplet: boolean;
  acc: -1 | 0 | 1;
  addToChord: boolean;
}

export const DEFAULT_TOOL: NoteTool = { dur: 'q', dot: false, rest: false, triplet: false, acc: 0, addToChord: false };

const STEPS: Pitch['step'][] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const TOP_LINE = 38; // FA5

export function diatonic(p: Pitch): number {
  return p.oct * 7 + STEPS.indexOf(p.step);
}

export function fromDiatonic(d: number, acc: Pitch['acc'] = 0): Pitch {
  const step = STEPS[((d % 7) + 7) % 7];
  return { step, acc, oct: Math.floor(d / 7) };
}

export function pitchAtY(m: HitMeasure, y: number, acc: Pitch['acc']): Pitch {
  const steps = Math.round((y - m.yTop) / (m.space / 2));
  const d = Math.max(22, Math.min(50, TOP_LINE - steps));
  return fromDiatonic(d, acc);
}

export interface StaffHit {
  measure: HitMeasure;
  event?: HitEvent;
  insertAt: number;
}

export function hitTest(
  hits: { measures: HitMeasure[]; events: HitEvent[] },
  x: number,
  y: number,
  block: StaffBlock,
): StaffHit | null {
  const m = hits.measures.find((h) => x >= h.x0 && x <= h.x1 && y >= h.yLineTop && y <= h.yLineBottom);
  if (!m) return null;
  const evs = hits.events.filter((e) => e.measureId === m.measureId);
  let best: HitEvent | undefined;
  let bd = 7;
  for (const e of evs) {
    const d = Math.abs(e.x - x);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  const meas = block.measures.find((mm) => mm.id === m.measureId);
  const insertAt = meas ? evs.filter((e) => e.x < x).length : 0;
  return { measure: m, event: best, insertAt };
}

export function makeEvent(tool: NoteTool, pitch: Pitch): NoteEvent {
  return {
    id: uid(),
    rest: tool.rest,
    dur: tool.dur,
    dot: tool.dot,
    triplet: tool.triplet,
    keys: tool.rest ? [] : [pitch],
    tie: false,
  };
}

export function findEvent(b: StaffBlock, eventId: string): { mi: number; ei: number } | null {
  for (let mi = 0; mi < b.measures.length; mi++) {
    const ei = b.measures[mi].events.findIndex((e) => e.id === eventId);
    if (ei >= 0) return { mi, ei };
  }
  return null;
}

export function shiftEvent(ev: NoteEvent, steps: number) {
  if (ev.rest) return;
  ev.keys = ev.keys.map((k) => {
    const d = Math.max(22, Math.min(52, diatonic(k) + steps));
    return { ...fromDiatonic(d, k.acc) };
  });
}
