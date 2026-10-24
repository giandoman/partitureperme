import { useDroppable } from '@dnd-kit/core';
import { rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MouseEvent, useMemo, useState } from 'react';
import { ghostSvg } from '../render/ghost';
import { hitTest, NoteTool, pitchAtY } from '../staffOps';
import { Block, blockFrac, Song, StaffBlock } from '../model';
import { renderHeader } from '../render/blocks';
import { renderCached } from '../render/cache';
import { LaidOut, PAGE_W, rowsOf } from '../render/layout';
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
  onCycleWidth: (id: string) => void;
  tool: NoteTool;
  insertMode: boolean;
}

function svgPoint(e: MouseEvent<SVGSVGElement>) {
  const svg = e.currentTarget;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const m = svg.getScreenCTM();
  return m ? pt.matrixTransform(m.inverse()) : pt;
}

function BlockCard({ b, p, w, frac }: { b: Block; p: SheetProps; w: number; frac: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: b.id });
  const bctx = useMemo(() => ({ ...p.ctx, width: w }), [p.ctx, w]);
  const rd = renderCached(b, bctx);
  const selected = p.sel?.blockId === b.id;
  const W = w;

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
  const [ghost, setGhost] = useState<string>('');
  const canGhost = b.type === 'staff' && p.insertMode && !p.ctx.transpose && !!rd.hits;
  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    if (!canGhost || b.type !== 'staff') return;
    const pt = svgPoint(e);
    const hit = hitTest(rd.hits!, pt.x, pt.y, b);
    const meas = hit ? b.measures.find((m) => m.id === hit.measure.measureId) : undefined;
    if (!hit || !meas || meas.multiRest) return setGhost('');
    const chordAdd = !!hit.event && (p.tool.addToChord || e.shiftKey);
    if (hit.event && !chordAdd) return setGhost('');
    const pitch = pitchAtY(hit.measure, pt.y, p.tool.acc);
    setGhost(ghostSvg(hit.measure, chordAdd ? hit.event!.x : pt.x, pitch, p.tool, chordAdd));
  };

  return (
    <div
      ref={setNodeRef}
      className={'card' + (selected ? ' selected' : '') + (isDragging ? ' dragging' : '') + ' t-' + b.type}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-frac={frac}
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
        {b.type !== 'pagebreak' && (
          <button title="Larghezza: intera, 1/2, 1/3, 2/3" className="wbtn" onClick={() => p.onCycleWidth(b.id)}>
            {b.width && b.width !== 'full' ? b.width : '⇔'}
          </button>
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
        <div className="ghost-wrap">
          <svg
            className={'block-svg' + (b.type === 'staff' ? ' staff' : '')}
            width={W * p.px}
            height={Math.max(rd.height, 6) * p.px}
            viewBox={`0 0 ${W} ${Math.max(rd.height, 6)}`}
            onClick={(e) => {
              onClick(e);
              setGhost('');
            }}
            onMouseMove={onMove}
            onMouseLeave={() => setGhost('')}
            dangerouslySetInnerHTML={{ __html: rd.svg }}
          />
          {ghost && (
            <svg
              className="ghost-layer"
              width={W * p.px}
              height={Math.max(rd.height, 6) * p.px}
              viewBox={`0 0 ${W} ${Math.max(rd.height, 6)}`}
              dangerouslySetInnerHTML={{ __html: ghost }}
            />
          )}
        </div>
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
  const rows = rowsOf(p.song.blocks, W);
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
      <SortableContext items={p.song.blocks.map((b) => b.id)} strategy={rectSortingStrategy}>
        <div className="rows">
          {rows.map((row) => {
            const pg = p.layout.pageOf[row[0].block.id] ?? 0;
            const marker = pg !== lastPage && row[0].block.type !== 'pagebreak';
            lastPage = pg;
            const els = [];
            if (marker)
              els.push(
                <div key={'pm' + row[0].block.id} className="page-marker">
                  pagina {pg + 1}
                </div>,
              );
            row.forEach((c, i) => {
              els.push(<BlockCard key={c.block.id} b={c.block} p={p} w={c.w} frac={blockFrac(c.block)} />);
              if (i < row.length - 1) els.push(<div key={'g' + c.block.id} className="col-gap" style={{ width: 14 * p.px }} />);
            });
            els.push(<div key={'br' + row[0].block.id} className="row-break" />);
            return els;
          })}
        </div>
      </SortableContext>
      <EndDrop />
    </div>
  );
}
