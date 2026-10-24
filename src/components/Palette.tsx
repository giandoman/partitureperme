import { useDraggable } from '@dnd-kit/core';
import { Block, ChordsBlock, newBar, newBlock } from '../model';

export interface PaletteItem {
  key: string;
  label: string;
  desc: string;
  icon: string;
  make: () => Block;
}

export const PALETTE: PaletteItem[] = [
  { key: 'section', label: 'Sezione', desc: 'Titolo di parte: INTRO, STR, RIT…', icon: '▬', make: () => newBlock('section') },
  { key: 'chords', label: 'Griglia accordi', desc: '| RE- | DO | SOL DO | x4', icon: '𝄀', make: () => newBlock('chords') },
  { key: 'staff', label: 'Pentagramma', desc: 'Riff, melodie, voicing', icon: '𝄞', make: () => newBlock('staff') },
  {
    key: 'rest',
    label: 'Pausa multipla',
    desc: 'Battute di attesa',
    icon: '▭',
    make: () => {
      const b = newBlock('chords') as ChordsBlock;
      b.bars = [{ ...newBar(), rest: 4 }];
      return b;
    },
  },
  { key: 'cue', label: 'Avviso', desc: 'STOP!!, CORI, IMPRO…', icon: '!', make: () => newBlock('cue') },
  { key: 'roadmap', label: 'Roadmap', desc: 'STR x4 → RIT x8 → …', icon: '→', make: () => newBlock('roadmap') },
  { key: 'spacer', label: 'Spazio', desc: 'Spazio vuoto', icon: '↕', make: () => newBlock('spacer') },
  { key: 'pagebreak', label: 'Salto pagina', desc: 'Nuova pagina nel PDF', icon: '⤓', make: () => newBlock('pagebreak') },
];

function Item({ it, onAdd }: { it: PaletteItem; onAdd: (it: PaletteItem) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: 'new:' + it.key });
  return (
    <button
      ref={setNodeRef}
      className={'pal-item' + (isDragging ? ' dragging' : '')}
      onClick={() => onAdd(it)}
      title="Clic per aggiungere, oppure trascina sul foglio"
      {...attributes}
      {...listeners}
    >
      <span className="pal-icon">{it.icon}</span>
      <span className="pal-text">
        <b>{it.label}</b>
        <small>{it.desc}</small>
      </span>
    </button>
  );
}

export default function Palette({ onAdd }: { onAdd: (it: PaletteItem) => void }) {
  return (
    <nav className="palette">
      <h2>Blocchi</h2>
      {PALETTE.map((it) => (
        <Item key={it.key} it={it} onAdd={onAdd} />
      ))}
      <p className="muted small pal-tip">Clic per aggiungere sotto il blocco selezionato, oppure trascina nel punto voluto.</p>
    </nav>
  );
}
