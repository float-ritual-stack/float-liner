/**
 * PaneLayout - Recursive binary tree pane renderer
 */

import { useCallback, useRef } from 'react';
import { Pane } from './Pane';
import { usePaneStore } from '../hooks/usePaneStore';
import type { PaneNode } from '../lib/types';
import * as Y from 'yjs';

interface PaneLayoutProps {
  node: PaneNode;
  doc: Y.Doc;
}

export function PaneLayout({ node, doc }: PaneLayoutProps) {
  const setRatio = usePaneStore((s) => s.setRatio);

  if (node.type === 'leaf') {
    return <Pane pane={node} doc={doc} />;
  }

  // It's a split
  const isHorizontal = node.direction === 'horizontal';
  const firstSize = `${node.ratio * 100}%`;
  const secondSize = `${(1 - node.ratio) * 100}%`;

  return (
    <div className={`flex ${isHorizontal ? 'flex-row' : 'flex-col'} h-full`}>
      {/* First child */}
      <div style={{ [isHorizontal ? 'width' : 'height']: firstSize }} className="min-w-0 min-h-0">
        <PaneLayout node={node.first} doc={doc} />
      </div>

      {/* Resize handle */}
      <ResizeHandle
        splitId={node.id}
        direction={node.direction}
        onResize={(ratio) => setRatio(node.id, ratio)}
      />

      {/* Second child */}
      <div style={{ [isHorizontal ? 'width' : 'height']: secondSize }} className="min-w-0 min-h-0">
        <PaneLayout node={node.second} doc={doc} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// RESIZE HANDLE
// ═══════════════════════════════════════════════════════════════

interface ResizeHandleProps {
  splitId: string;
  direction: 'horizontal' | 'vertical';
  onResize: (ratio: number) => void;
}

function ResizeHandle({ splitId, direction, onResize }: ResizeHandleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;

      const container = containerRef.current?.parentElement;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const isHorizontal = direction === 'horizontal';

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging.current) return;

        const position = isHorizontal ? moveEvent.clientX : moveEvent.clientY;
        const start = isHorizontal ? rect.left : rect.top;
        const size = isHorizontal ? rect.width : rect.height;
        const ratio = (position - start) / size;

        onResize(Math.max(0.1, Math.min(0.9, ratio)));
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [direction, onResize]
  );

  return (
    <div
      ref={containerRef}
      className={`resize-handle ${
        direction === 'horizontal' ? 'resize-handle-horizontal' : 'resize-handle-vertical'
      }`}
      onMouseDown={handleMouseDown}
    />
  );
}

export default PaneLayout;
