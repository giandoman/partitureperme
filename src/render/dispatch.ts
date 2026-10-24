import type { Block } from '../model';
import { renderChords, renderCue, renderRoadmap, renderSection, renderSpacer } from './blocks';
import { renderStaff } from './staff';
import type { RenderCtx, Rendered } from './util';

export function renderBlock(b: Block, ctx: RenderCtx): Rendered {
  switch (b.type) {
    case 'section':
      return renderSection(b, ctx);
    case 'chords':
      return renderChords(b, ctx);
    case 'staff':
      return renderStaff(b, ctx);
    case 'cue':
      return renderCue(b, ctx);
    case 'roadmap':
      return renderRoadmap(b, ctx);
    case 'spacer':
      return renderSpacer(b.height);
    case 'pagebreak':
      return { svg: '', height: 0 };
  }
}
