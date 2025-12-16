/**
 * VirtualBlockList - Virtualized flat block list for performance
 *
 * Replaces recursive BlockTree with a virtualized flat list.
 * Uses TanStack Virtual to render only visible blocks.
 *
 * Key insight: The tree is flattened to a linear list with depth info,
 * indentation is handled via CSS (depth * 20px).
 */

import React, { useRef, useCallback, useMemo, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useShallow } from 'zustand/shallow';
import { BlockItem } from './BlockItem';
import { useBlockStore } from '../hooks/useBlockStore';
import { usePaneStore } from '../hooks/usePaneStore';
import type { Block } from '../lib/types';
import * as Y from 'yjs';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface FlatBlock {
  id: string;
  block: Block;
  depth: number;
}

interface VirtualBlockListProps {
  /** Root block ID to render ('root' for all roots) */
  rootBlockId: string;
  /** Y.Doc for executing shell commands */
  doc: Y.Doc;
  /** Pane ID for zoom functionality */
  paneId: string;
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export function VirtualBlockList({ rootBlockId, doc, paneId }: VirtualBlockListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // Get blocks from store with shallow comparison to prevent rerenders
  const blocks = useBlockStore(useShallow(state => state.blocks));
  const rootIds = useBlockStore(useShallow(state => state.rootIds));

  // Get pane store for zoom and collapse functionality
  const setPaneRoot = usePaneStore(state => state.setPaneRoot);
  const isCollapsed = usePaneStore(state => state.isCollapsed);
  const toggleCollapsed = usePaneStore(state => state.toggleCollapsed);
  const collapsedBlocks = usePaneStore(state => state.collapsedBlocks);

  // Track focused block in local state
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // Flatten tree to linear list with depth info (uses per-pane collapse state)
  const flatBlocks = useMemo((): FlatBlock[] => {
    const result: FlatBlock[] = [];

    function traverse(blockId: string, depth: number) {
      const block = blocks.get(blockId);
      if (!block) return;

      result.push({ id: blockId, block, depth });

      // Recurse into children if not collapsed (per-pane state!)
      const collapsed = isCollapsed(paneId, blockId, block.collapsed);
      if (!collapsed && block.childIds.length > 0) {
        for (const childId of block.childIds) {
          traverse(childId, depth + 1);
        }
      }
    }

    // If rootBlockId is 'root', show all root blocks
    if (rootBlockId === 'root') {
      for (const rootId of rootIds) {
        traverse(rootId, 0);
      }
    } else {
      traverse(rootBlockId, 0);
    }

    return result;
  }, [blocks, rootIds, rootBlockId, paneId, isCollapsed, collapsedBlocks]);

  // Size cache for measurement - keyed by block ID (not index!)
  // Index-based keys cause stale values when blocks are inserted/removed
  const sizeCache = useRef(new Map<string, number>());

  // Clear stale cache entries when block list changes
  useEffect(() => {
    const currentIds = new Set(flatBlocks.map(fb => fb.id));
    for (const cachedId of sizeCache.current.keys()) {
      if (!currentIds.has(cachedId)) {
        sizeCache.current.delete(cachedId);
      }
    }
  }, [flatBlocks]);

  // Virtualizer setup with dynamic measurement
  const virtualizer = useVirtualizer({
    count: flatBlocks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      // First check cache by block ID
      const block = flatBlocks[index];
      if (!block) return 28;

      const cached = sizeCache.current.get(block.id);
      if (cached) return cached;

      // Estimate based on content length
      const lineCount = Math.ceil(block.block.content.length / 60) || 1;
      return Math.max(28, lineCount * 20);
    },
    overscan: 15, // Extra items for smoother scrolling
    measureElement: (element, _entry, instance) => {
      if (!element) return 28;

      const index = Number(element.getAttribute('data-index'));
      const block = flatBlocks[index];
      if (!block) return 28;

      const measuredHeight = element.getBoundingClientRect().height;

      // Direction-aware caching by block ID
      const direction = instance.scrollDirection;
      if (direction === 'forward' || direction === null) {
        // Scrolling down or initial - measure fresh and cache
        sizeCache.current.set(block.id, measuredHeight);
        return measuredHeight;
      } else {
        // Scrolling up - use cached value to prevent jump
        const cached = sizeCache.current.get(block.id);
        return cached ?? measuredHeight;
      }
    },
  });

  // Get linear order of visible block IDs (for navigation)
  const getLinearOrder = useCallback(() => {
    return flatBlocks.map(fb => fb.id);
  }, [flatBlocks]);

  // Navigate to a specific block
  const requestFocus = useCallback((blockId: string) => {
    setFocusedId(blockId);
    // Scroll into view
    const index = flatBlocks.findIndex(fb => fb.id === blockId);
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: 'auto' });
    }
  }, [flatBlocks, virtualizer]);

  // Ctrl+Enter: Zoom pane into a specific block
  const handleZoomIntoBlock = useCallback((blockId: string) => {
    setPaneRoot(paneId, blockId);
  }, [paneId, setPaneRoot]);

  // Memoized navigation callbacks per block
  const callbacksMap = useMemo(() => {
    const map = new Map<string, {
      onNavigateUp: () => void;
      onNavigateDown: () => void;
    }>();

    for (const { id: blockId } of flatBlocks) {
      map.set(blockId, {
        onNavigateUp: () => {
          const order = getLinearOrder();
          const idx = order.indexOf(blockId);
          if (idx > 0) {
            requestFocus(order[idx - 1]);
          }
        },
        onNavigateDown: () => {
          const order = getLinearOrder();
          const idx = order.indexOf(blockId);
          if (idx < order.length - 1) {
            requestFocus(order[idx + 1]);
          }
        },
      });
    }
    return map;
  }, [flatBlocks, getLinearOrder, requestFocus]);

  // Handle focus change
  const handleFocusBlock = useCallback((blockId: string) => {
    setFocusedId(blockId);
  }, []);

  if (flatBlocks.length === 0) {
    return (
      <div className="p-4 text-neutral-500 text-sm">
        No blocks yet. Start typing to create your first block.
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="virtual-block-list h-full overflow-auto p-2"
      style={{ contain: 'strict' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map(virtualRow => {
          const { id, block, depth } = flatBlocks[virtualRow.index];
          const callbacks = callbacksMap.get(id)!;

          return (
            <div
              key={id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <BlockItem
                block={block}
                depth={depth}
                isCollapsed={isCollapsed(paneId, id, block.collapsed)}
                isFocused={focusedId === id}
                onFocus={() => handleFocusBlock(id)}
                onNavigateUp={callbacks.onNavigateUp}
                onNavigateDown={callbacks.onNavigateDown}
                onRequestFocus={requestFocus}
                onZoomIntoBlock={handleZoomIntoBlock}
                onToggleCollapsed={() => toggleCollapsed(paneId, id)}
                doc={doc}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default VirtualBlockList;
