/**
 * BlockItem - Individual block renderer with PlateBlock editor
 *
 * Handles:
 * - Rendering content via PlateBlock
 * - Keyboard navigation (cursor-aware - delegated to PlateBlock)
 * - sh:: execution triggering
 * - Block operations (indent, outdent, delete, new block)
 */

import { useCallback, useState, memo } from 'react';
import { PlateBlock } from './PlateBlock';
import { StaticBlockRenderer } from './StaticBlockRenderer';
import { useShallow } from 'zustand/shallow';
import { useBlockStore } from '../hooks/useBlockStore';
import { extractShellCommand, executeShellBlock, isExecutableShellBlock } from '../lib/executor';
import type { Block } from '../lib/types';
import * as Y from 'yjs';

interface BlockItemProps {
  block: Block;
  depth: number;
  isCollapsed: boolean; // Per-pane collapse state
  isFocused: boolean;
  onFocus: () => void;
  onNavigateUp: () => void;
  onNavigateDown: () => void;
  onRequestFocus: (blockId: string) => void; // Focus a specific block by ID
  onZoomIntoBlock?: (blockId: string) => void; // Ctrl+Enter - zoom pane into this block
  onToggleCollapsed: () => void; // Per-pane collapse toggle
  doc: Y.Doc;
}

export const BlockItem = memo(function BlockItem({
  block,
  depth,
  isCollapsed,
  isFocused,
  onFocus,
  onNavigateUp,
  onNavigateDown,
  onRequestFocus,
  onZoomIntoBlock,
  onToggleCollapsed,
  doc,
}: BlockItemProps) {
  // Use shallow selectors to prevent unnecessary rerenders
  const { updateBlockContent, createBlockAfter, deleteBlock, indentBlock, outdentBlock, moveBlockUp, moveBlockDown } = useBlockStore(
    useShallow(state => ({
      updateBlockContent: state.updateBlockContent,
      createBlockAfter: state.createBlockAfter,
      deleteBlock: state.deleteBlock,
      indentBlock: state.indentBlock,
      outdentBlock: state.outdentBlock,
      moveBlockUp: state.moveBlockUp,
      moveBlockDown: state.moveBlockDown,
    }))
  );

  const [isExecuting, setIsExecuting] = useState(false);

  const handleChange = useCallback(
    (content: string) => {
      updateBlockContent(block.id, content);
    },
    [block.id, updateBlockContent]
  );

  // Handle tree operations (indent, outdent, new block, delete, zoom, move)
  const handleTreeAction = useCallback(
    (action: 'indent' | 'outdent' | 'newBlockAfter' | 'deleteIfEmpty' | 'zoomIntoBlock' | 'moveUp' | 'moveDown') => {
      switch (action) {
        case 'indent':
          indentBlock(block.id);
          break;
        case 'outdent':
          outdentBlock(block.id);
          break;
        case 'newBlockAfter': {
          const newId = createBlockAfter(block.id);
          if (newId) {
            // Focus the new block after a short delay to let Y.Doc sync
            setTimeout(() => onRequestFocus(newId), 0);
          }
          break;
        }
        case 'deleteIfEmpty':
          if (block.content === '' && block.childIds.length === 0) {
            deleteBlock(block.id);
            onNavigateUp();
          }
          break;
        case 'zoomIntoBlock':
          if (onZoomIntoBlock) {
            onZoomIntoBlock(block.id);
          }
          break;
        case 'moveUp':
          moveBlockUp(block.id);
          break;
        case 'moveDown':
          moveBlockDown(block.id);
          break;
      }
    },
    [block.id, block.content, block.childIds.length, indentBlock, outdentBlock, createBlockAfter, deleteBlock, onNavigateUp, onRequestFocus, onZoomIntoBlock, moveBlockUp, moveBlockDown]
  );

  // Execute sh:: command
  const handleExecute = useCallback(async () => {
    if (isExecuting) return;

    const command = extractShellCommand(block.content);
    if (!command) return;

    setIsExecuting(true);
    try {
      await executeShellBlock(block.id, command, doc);
    } catch (err) {
      console.error('Execution failed:', err);
    } finally {
      setIsExecuting(false);
    }
  }, [block.id, block.content, doc, isExecuting]);

  const handleFocus = useCallback(() => {
    onFocus();
  }, [onFocus]);

  // Determine if block has children
  const hasChildren = block.childIds.length > 0;

  // Use cyan for expand/collapse indicators (stands out against dark bg)
  // Keep block-type colors only for leaf nodes (no children)
  const indicatorColor = hasChildren
    ? 'text-cyan-400 hover:text-cyan-300'
    : block.type === 'sh'
      ? isExecuting
        ? 'text-amber-500 animate-pulse'
        : 'text-emerald-500'
      : block.type === 'output'
      ? 'text-cyan-600'
      : block.type === 'error'
      ? 'text-red-500'
      : block.type === 'ctx'
      ? 'text-amber-500'
      : block.type === 'ai'
      ? 'text-fuchsia-500'
      : 'text-neutral-500';

  // Use triangle arrows for expand/collapse (more obvious), bullet for leaves
  const indicatorSymbol = hasChildren ? (isCollapsed ? '▶' : '▼') : '•';

  return (
    <div
      className={`flex items-start gap-1 py-0.5 ${isFocused ? 'block-focused rounded' : ''}`}
      style={{ paddingLeft: `${depth * 16}px` }}
      onClick={handleFocus}
    >
      {/* Combined block indicator and collapse toggle */}
      <button
        className={`w-5 h-5 flex items-center justify-center flex-shrink-0 text-base leading-none mt-0.5 ${indicatorColor} ${hasChildren ? 'cursor-pointer' : 'cursor-default'}`}
        onClick={(e) => {
          if (hasChildren) {
            e.stopPropagation();
            onToggleCollapsed();
          }
        }}
        tabIndex={hasChildren ? 0 : -1}
      >
        {indicatorSymbol}
      </button>

      {/* Content - Floating editor pattern: only render PlateBlock when focused */}
      {isFocused ? (
        <PlateBlock
          content={block.content}
          blockType={block.type}
          isFocused={isFocused}
          hasChildren={hasChildren}
          onChange={handleChange}
          onNavigateUp={onNavigateUp}
          onNavigateDown={onNavigateDown}
          onTreeAction={handleTreeAction}
          onFocus={handleFocus}
          onExecute={isExecutableShellBlock(block.content) ? handleExecute : undefined}
          onToggleCollapsed={onToggleCollapsed}
        />
      ) : (
        <StaticBlockRenderer
          content={block.content}
          blockType={block.type}
          onFocus={handleFocus}
        />
      )}

      {/* Exit code badge for sh:: blocks */}
      {block.type === 'sh' && block.exitCode !== undefined && (
        <span
          className={`text-xs px-1 rounded ${
            block.exitCode === 0 ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'
          }`}
        >
          {block.exitCode}
        </span>
      )}
    </div>
  );
});

export default BlockItem;
