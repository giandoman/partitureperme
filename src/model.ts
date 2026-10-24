// Modello dati di un brano (salvato come JSON)

export type Duration = 'w' | 'h' | 'q' | '8' | '16';

/** Altezza di una nota: lettera, alterazione (-1 bemolle, 0 naturale, 1 diesis), ottava */
export interface Pitch {
  step: 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
  acc: -1 | 0 | 1;
  oct: number;
}

export interface NoteEvent {
  id: string;
  rest: boolean;
  dur: Duration;
  dot: boolean;
  triplet: boolean;
  keys: Pitch[]; // vuoto se pausa
  tie: boolean; // legatura di valore verso l'evento successivo
  chord?: string; // sigla sopra la nota
  below?: string; // testo sotto la nota
}

export interface Measure {
  id: string;
  events: NoteEvent[];
  multiRest?: number; // pausa di N battute
  repeatStart?: boolean;
  repeatEnd?: boolean;
  volta?: string; // "1." "2."
  ottava?: boolean;
}

export interface Bar {
  id: string;
  chords: string[]; // 0..4 accordi
  simile?: boolean; // battuta uguale alla precedente (%)
  rest?: number; // pausa di N battute
  repeatStart?: boolean;
  repeatEnd?: boolean;
  volta?: string;
  cue?: string; // annotazione sopra la battuta
  newLine?: boolean; // va a capo prima di questa battuta
}

export type BlockType = 'section' | 'chords' | 'staff' | 'cue' | 'roadmap' | 'pagebreak' | 'spacer';

interface BaseBlock {
  id: string;
  type: BlockType;
}

export interface SectionBlock extends BaseBlock {
  type: 'section';
  label: string;
  text: string;
}

export interface ChordsBlock extends BaseBlock {
  type: 'chords';
  label: string; // badge a sinistra (STR, RIT...)
  bars: Bar[];
  barsPerLine: number;
  repeat: string; // es. "x4" oppure "x4, x4, x3"
  note: string; // annotazione a destra (es. "2a voce")
}

export interface StaffBlock extends BaseBlock {
  type: 'staff';
  label: string;
  measures: Measure[];
  measuresPerLine: number; // 0 = automatico
  showTimeSig: boolean;
  timeSig: string; // vuoto = metro del brano
  repeat: string;
  note: string;
}

export interface CueBlock extends BaseBlock {
  type: 'cue';
  text: string;
  style: 'forte' | 'riquadro' | 'semplice';
  align: 'left' | 'center';
}

export interface RoadmapBlock extends BaseBlock {
  type: 'roadmap';
  lines: string[];
}

export interface PageBreakBlock extends BaseBlock {
  type: 'pagebreak';
}

export interface SpacerBlock extends BaseBlock {
  type: 'spacer';
  height: number;
}

export type Block =
  | SectionBlock
  | ChordsBlock
  | StaffBlock
  | CueBlock
  | RoadmapBlock
  | PageBreakBlock
  | SpacerBlock;

export interface Song {
  id: string;
  version: 1;
  title: string;
  artist: string;
  key: string; // es. "MI-"
  tempo: string; // BPM come testo
  timeSig: string; // "4/4"
  patch: string; // suono / patch MainStage
  notes: string; // note generali
  transpose: number; // semitoni (non distruttivo)
  blocks: Block[];
  updatedAt: number;
}

export interface SongSummary {
  id: string;
  title: string;
  artist: string;
  key: string;
  updatedAt: number;
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function newBar(chords: string[] = []): Bar {
  return { id: uid(), chords };
}

export function newMeasure(): Measure {
  return { id: uid(), events: [] };
}

export function newBlock(type: BlockType): Block {
  const id = uid();
  switch (type) {
    case 'section':
      return { id, type, label: 'STR', text: '' };
    case 'chords':
      return {
        id,
        type,
        label: '',
        bars: [newBar(), newBar(), newBar(), newBar()],
        barsPerLine: 4,
        repeat: '',
        note: '',
      };
    case 'staff':
      return {
        id,
        type,
        label: '',
        measures: [newMeasure(), newMeasure()],
        measuresPerLine: 0,
        showTimeSig: true,
        timeSig: '',
        repeat: '',
        note: '',
      };
    case 'cue':
      return { id, type, text: 'STOP!!', style: 'forte', align: 'left' };
    case 'roadmap':
      return { id, type, lines: ['STR x4 > RIT x8 > SOLO CHIT su STR x2'] };
    case 'pagebreak':
      return { id, type };
    case 'spacer':
      return { id, type, height: 16 };
  }
}

export function newSong(title = 'Nuovo brano'): Song {
  return {
    id: uid(),
    version: 1,
    title,
    artist: '',
    key: '',
    tempo: '',
    timeSig: '4/4',
    patch: '',
    notes: '',
    transpose: 0,
    blocks: [],
    updatedAt: Date.now(),
  };
}

/** Copia profonda con nuovi id (per duplicare blocchi o brani) */
export function cloneWithNewIds<T>(obj: T): T {
  const copy = JSON.parse(JSON.stringify(obj));
  const walk = (o: any) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') {
      if (typeof o.id === 'string') o.id = uid();
      Object.values(o).forEach(walk);
    }
  };
  walk(copy);
  return copy;
}

export function summaryOf(s: Song): SongSummary {
  return { id: s.id, title: s.title, artist: s.artist, key: s.key, updatedAt: s.updatedAt };
}

export const DUR_QUARTERS: Record<Duration, number> = { w: 4, h: 2, q: 1, '8': 0.5, '16': 0.25 };

export function eventLength(e: NoteEvent): number {
  let l = DUR_QUARTERS[e.dur];
  if (e.dot) l *= 1.5;
  if (e.triplet) l *= 2 / 3;
  return l;
}

export function parseTimeSig(ts: string): { num: number; den: number } {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec((ts || '').trim());
  if (!m) return { num: 4, den: 4 };
  return { num: Math.max(1, +m[1]), den: Math.max(1, +m[2]) };
}

export function measureCapacity(ts: string): number {
  const { num, den } = parseTimeSig(ts);
  return (num * 4) / den;
}
