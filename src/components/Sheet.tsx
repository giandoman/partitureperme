import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MouseEvent, useMemo } from 'react';
import type { Block, Song, StaffBlock } from '../model';
import { renderHeader } from '../render/blocks';
import { renderCached } from '../render/cache';
import { LaidOut, PAGE_W } from '../render/layout';
import type { HitEvent, HitMeasure, RenderCtx, Selection } from '../render/util';

export interface SheetProps {
  song: Song;
  layout: LaidOut;
  ctx: RenderCtx;
  px: number; // pixel per unità di contenuto
  pagePx: number; // pixel per punto della pagina
  sel?: Selection;
  onSelect: (s?: Selection) => void;
  onStaffClick: (b: StaffBlock, hits: { measures: HitMeasure[]; events: HitEvent[] }, x: number, y: number, shift: boolean) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onResize: (id: string, delta: number) => void;
}

function svgPoint(e: MouseEvent<SVGSVGElement>) {
  const svg = e.currentTarget;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const m = svg.getScreenCTM();
  return m ? pt.matrixTransform(m.inverse()) : pt;
}

function BlockCard({ b, p }: { b: Block; p: SheetProps }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: b.id });
  const rd = renderCached(b, p.ctx);
  const selected = p.sel?.blockId === b.id;
  const W = p.ctx.width;

  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    e.stopPropagation();
    if (b.type === 'chords') {
      const t = (e.target as Element).closest('[data-bar]');
      p.onSelect(t ? { blockId: b.id, barId: t.getAttribute('data-bar')! } : { blockId: b.id });
      return;
    }
    if (b.type === 'staff' && rd.hits) {
      const pt = svgPoint(e);
      p.onStaffClick(b, rd.hits, pt.x, pt.y, e.shiftKey);
      return;
    }
    p.onSelect({ blockId: b.id });
  };

  const resizable = b.type === 'chords' || b.type === 'staff';

  return (
    <div
      ref={setNodeRef}
      className={'card' + (selected ? ' selected' : '') + (isDragging ? ' dragging' : '') + ' t-' + b.type}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      onClick={(e) => {
        e.stopPropagation();
        p.onSelect({ blockId: b.id });
      }}
    >
      <div className="card-tools" onClick={(e) => e.stopPropagation()}>
        <button className="handle" title="Trascina per spostare" {...attributes} {...listeners}>
          ⠿
        </button>
        {resizable && (
          <>
            <button title="Togli una battuta" onClick={() => p.onResize(b.id, -1)}>
              −
            </button>
            <button title="Aggiungi una battuta" onClick={() => p.onResize(b.id, 1)}>
              +
            </button>
          </>
        )}
        <button title="Duplica blocco" onClick={() => p.onDuplicate(b.id)}>
          ⧉
        </button>
        <button title="Elimina blocco" className="del" onClick={() => p.onDelete(b.id)}>
          ✕
        </button>
      </div>
      {b.type === 'pagebreak' ? (
        <div className="pagebreak-mark">salto pagina</div>
      ) : (
        <svg
          className={'block-svg' + (b.type === 'staff' ? ' staff' : '')}
          width={W * p.px}
          height={Math.max(rd.height, 6) * p.px}
          viewBox={`0 0 ${W} ${Math.max(rd.height, 6)}`}
          onClick={onClick}
          dangerouslySetInnerHTML={{ __html: rd.svg }}
        />
      )}
    </div>
  );
}

function EndDrop() {
  const { setNodeRef, isOver } = useDroppable({ id: 'sheet-end' });
  return (
    <div ref={setNodeRef} className={'end-drop' + (isOver ? ' over' : '')}>
      trascina qui i blocchi
    </div>
  );
}

export default function Sheet(p: SheetProps) {
  const head = useMemo(() => renderHeader(p.ctx), [p.ctx]);
  const W = p.ctx.width;
  const m = p.layout.preset.margin * p.pagePx;
  let lastPage = 0;
  return (
    <div className="paper" style={{ width: PAGE_W * p.pagePx, padding: `${m}px ${m}px ${m * 2}px` }} onClick={() => p.onSelect(undefined)}>
      <div
        className={'card header-card' + (!p.sel ? ' selected' : '')}
        onClick={(e) => {
          e.stopPropagation();
          p.onSelect(undefined);
        }}
      >
        <svg width={W * p.px} height={head.height * p.px} viewBox={`0 0 ${W} ${head.height}`} dangerouslySetInnerHTML={{ __html: head.svg }} />
      </div>
      <SortableContext items={p.song.blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        {p.song.blocks.map((b) => {
          const pg = p.layout.pageOf[b.id] ?? 0;
          const marker = pg !== lastPage && b.type !== 'pagebreak';
          lastPage = pg;
          return (
            <div key={b.id}>
              {marker && <div className="page-marker">pagina {pg + 1}</div>}
              <BlockCard b={b} p={p} />
            </div>
          );
        })}
      </SortableContext>
      <EndDrop />
    </div>
  );
}
