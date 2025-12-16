/**
 * Pane - Individual pane showing a block tree
 */

import { VirtualBlockList } from './VirtualBlockList';
import { usePaneStore } from '../hooks/usePaneStore';
import type { PaneLeaf } from '../lib/types';
import * as Y from 'yjs';

interface PaneProps {
  pane: PaneLeaf;
  doc: Y.Doc;
}

export function Pane({ pane, doc }: PaneProps) {
  const setActivePane = usePaneStore((s) => s.setActivePane);
  const activePaneId = usePaneStore((s) => s.layout.activePaneId);
  const splitPane = usePaneStore((s) => s.splitPane);
  const closePane = usePaneStore((s) => s.closePane);
  const getAllLeafPanes = usePaneStore((s) => s.getAllLeafPanes);
  const setPaneRoot = usePaneStore((s) => s.setPaneRoot);

  const isActive = activePaneId === pane.id;
  const canClose = getAllLeafPanes().length > 1;
  const isZoomed = pane.rootBlockId !== 'root';

  return (
    <div
      className={`flex flex-col h-full ${isActive ? 'ring-1 ring-cyan-800/50' : ''}`}
      onClick={() => setActivePane(pane.id)}
    >
      {/* Pane header */}
      <div className="pane-header">
        <div className="flex items-center gap-2">
          {isZoomed && (
            <button
              className="px-1 text-amber-400 hover:text-amber-300 hover:bg-amber-900/30 rounded transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setPaneRoot(pane.id, 'root');
              }}
              title="Zoom out to root (Escape)"
            >
              ◂
            </button>
          )}
          <span className={`font-mono ${isActive ? 'text-cyan-400' : 'text-neutral-500'}`}>
            {pane.rootBlockId === 'root' ? '◊ root' : `◊ ${pane.rootBlockId.slice(0, 8)}`}
          </span>
        </div>
        <div className="flex gap-1">
          <button
            className="px-1 hover:bg-fuchsia-900/30 hover:text-fuchsia-300 rounded transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              splitPane(pane.id, 'horizontal');
            }}
            title="Split horizontal"
          >
            ⊟
          </button>
          <button
            className="px-1 hover:bg-fuchsia-900/30 hover:text-fuchsia-300 rounded transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              splitPane(pane.id, 'vertical');
            }}
            title="Split vertical"
          >
            ⊞
          </button>
          {canClose && (
            <button
              className="px-1 hover:bg-red-900/30 hover:text-red-400 rounded transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                closePane(pane.id);
              }}
              title="Close pane"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Content - VirtualBlockList handles its own scrolling */}
      <div className="flex-1 min-h-0">
        <VirtualBlockList rootBlockId={pane.rootBlockId} doc={doc} paneId={pane.id} />
      </div>
    </div>
  );
}

export default Pane;
