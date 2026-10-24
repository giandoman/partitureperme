import { useEffect, useMemo } from 'react';
import type { Song } from '../model';
import { LaidOut, pageSvg } from '../render/layout';

export default function Preview({
  song,
  layout,
  onClose,
  onExport,
  busy,
}: {
  song: Song;
  layout: LaidOut;
  onClose: () => void;
  onExport: () => void;
  busy: boolean;
}) {
  const pages = useMemo(() => layout.pages.map((_, i) => pageSvg(layout, i, song)), [layout, song]);
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onClose]);
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-bar" onClick={(e) => e.stopPropagation()}>
        <b>Anteprima · {layout.preset.name}</b>
        <span className="muted">
          {pages.length} {pages.length === 1 ? 'pagina' : 'pagine'}
          {Math.abs(layout.scale - layout.preset.scale) > 0.01 ? ` · ridotto al ${Math.round((layout.scale / layout.preset.scale) * 100)}%` : ''}
        </span>
        <div className="spacer" />
        <button className="btn primary" onClick={onExport} disabled={busy}>
          {busy ? 'Creo il PDF…' : 'Scarica PDF'}
        </button>
        <button className="btn" onClick={onClose}>
          Chiudi
        </button>
      </div>
      <div className="pages" onClick={(e) => e.stopPropagation()}>
        {pages.map((s, i) => (
          <div key={i} className="page" dangerouslySetInnerHTML={{ __html: s }} />
        ))}
      </div>
    </div>
  );
}
