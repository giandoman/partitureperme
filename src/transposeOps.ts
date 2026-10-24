import { spellingForKey, transposeChordText, transposePitch } from './chords';
import type { Song } from './model';

/** Applica in modo definitivo la trasposizione corrente a tutto il brano */
export function bakeTranspose(s: Song) {
  const t = s.transpose || 0;
  if (!t) return;
  const sp = spellingForKey(s.key, t);
  for (const b of s.blocks) {
    if (b.type === 'chords') {
      for (const bar of b.bars) bar.chords = bar.chords.map((c) => transposeChordText(c, t, sp));
    } else if (b.type === 'staff') {
      for (const m of b.measures)
        for (const e of m.events) {
          e.keys = e.keys.map((k) => transposePitch(k, t, sp));
          if (e.chord) e.chord = transposeChordText(e.chord, t, sp);
        }
    }
  }
  if (s.key) s.key = transposeChordText(s.key, t, sp);
  s.transpose = 0;
}
