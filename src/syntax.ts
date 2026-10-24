// Sintassi rapida per la griglia accordi e per la roadmap
//
// Griglia:  | RE- | RE- | DO | SOL DO | x4
//   |  separa le battute        |:  :|  ritornello
//   %  battuta uguale alla precedente
//   (4)  pausa di 4 battute
//   1.  2.  prima / seconda volta (all'inizio della battuta)
//   "STOP"  nota sopra la battuta
//   [parole]  testo sotto la battuta
//   x4 (in fondo) ripetizioni; tutto ciò che segue è testo libero: "x4, x4, x3"
//   a capo = nuova riga della griglia

import { displayChord } from './chords';
import { Bar, newBar } from './model';

function tokenize(line: string): string[] {
  const out: string[] = [];
  const re = /"[^"]*"|\[[^\]]*\]|\|:|:\||\||[^\s|"\[]+/g;
  let m: RegExpExecArray | null;
  const prepared = line.replace(/:\|/g, ' :| ').replace(/\|:/g, ' |: ');
  while ((m = re.exec(prepared))) out.push(m[0]);
  return out;
}

export function parseGrid(text: string): { bars: Bar[]; repeat: string } {
  const bars: Bar[] = [];
  let repeat = '';
  const lines = text.replace(/\r/g, '').split('\n');
  lines.forEach((rawLine, li) => {
    const line = rawLine.trim();
    if (!line) return;
    const toks = tokenize(line);
    let cur: Bar | null = null;
    let lastWasBar = false;
    let pendingStart = false;
    let firstInLine = true;
    const startBar = (): Bar => {
      const b = newBar();
      if (pendingStart) b.repeatStart = true;
      pendingStart = false;
      if (firstInLine && li > 0 && bars.length > 0) b.newLine = true;
      firstInLine = false;
      return b;
    };
    const close = () => {
      if (cur) bars.push(cur);
      cur = null;
    };
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t === '|') {
        if (cur) close();
        else if (lastWasBar) bars.push(startBar());
        lastWasBar = true;
        continue;
      }
      if (t === '|:') {
        close();
        pendingStart = true;
        lastWasBar = false;
        continue;
      }
      if (t === ':|') {
        if (cur) {
          (cur as Bar).repeatEnd = true;
          close();
        } else if (bars.length) bars[bars.length - 1].repeatEnd = true;
        lastWasBar = true;
        continue;
      }
      lastWasBar = false;
      if (/^[x×](\d|\.|…)/i.test(t)) {
        close();
        repeat = toks.slice(i).join(' ').replace(/\s+,/g, ',');
        break;
      }
      if (!cur) cur = startBar();
      const b = cur as Bar;
      if (t === '%') b.simile = true;
      else if (/^\(\d+\)$/.test(t)) b.rest = parseInt(t.slice(1), 10);
      else if (/^\d\.$/.test(t)) b.volta = t;
      else if (t.startsWith('"')) b.cue = t.replace(/"/g, '');
      else if (t.startsWith('[')) b.lyric = t.slice(1, -1).trim() || undefined;
      else if (b.chords.length < 4) b.chords.push(displayChord(t));
    }
    close();
  });
  return { bars, repeat };
}

function barContent(b: Bar): string {
  const parts: string[] = [];
  if (b.volta) parts.push(b.volta);
  if (b.cue) parts.push(`"${b.cue}"`);
  if (b.lyric) parts.push(`[${b.lyric}]`);
  if (b.rest) parts.push(`(${b.rest})`);
  else if (b.simile) parts.push('%');
  else parts.push(...b.chords);
  return parts.join(' ');
}

export function serializeGrid(bars: Bar[], repeat: string): string {
  let out = '';
  bars.forEach((b, i) => {
    const first = i === 0 || b.newLine;
    if (b.newLine && i > 0) out += '\n';
    if (b.repeatStart) out += (out && !first ? ' ' : '') + '|: ';
    else if (first) out += '| ';
    else out += ' ';
    const c = barContent(b);
    out += c ? c + ' ' : ' ';
    out += b.repeatEnd ? ':|' : '|';
  });
  if (repeat.trim()) out += ' ' + repeat.trim();
  return out;
}

// ---- Roadmap ----

export interface RoadStep {
  label: string;
  repeat: string;
  sub: string;
}

export function parseRoadLine(line: string): RoadStep[] {
  return line
    .split(/\s*(?:->|→|=>|>)\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      let repeat = '';
      let rest = s.replace(/\s*[x×]\s?(\d+)\b/i, (_, n) => {
        repeat = '×' + n;
        return ' ';
      });
      let sub = '';
      const su = /\s(su|on|\()\s*(.*)$/i.exec(rest);
      if (su) {
        sub = su[0].trim().replace(/^\(/, '').replace(/\)$/, '');
        rest = rest.slice(0, su.index);
      }
      return { label: rest.trim().toUpperCase(), repeat, sub: sub.toUpperCase() };
    });
}

export function prettyRepeat(r: string): string {
  return r.replace(/(^|[\s,])x(?=\d|\.|…)/gi, '$1×');
}
