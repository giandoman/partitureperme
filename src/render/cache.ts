import type { Block } from '../model';
import { renderBlock } from './dispatch';
import type { RenderCtx, Rendered } from './util';

const cache = new Map<string, Rendered>();

/** Rendering con memoria: ridisegna solo i blocchi cambiati */
export function renderCached(b: Block, ctx: RenderCtx): Rendered {
  const selKey = ctx.sel && ctx.sel.blockId === b.id ? JSON.stringify(ctx.sel) : '';
  const key = [ctx.width.toFixed(2), ctx.transpose, ctx.sp, ctx.labelCol.toFixed(2), ctx.editing ? 1 : 0, ctx.song.timeSig, selKey, JSON.stringify(b)].join('|');
  const hit = cache.get(key);
  if (hit) return hit;
  const rd = renderBlock(b, ctx);
  if (cache.size > 400) cache.clear();
  cache.set(key, rd);
  return rd;
}
