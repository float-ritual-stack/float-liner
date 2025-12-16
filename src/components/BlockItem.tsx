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
  const { updateBlockContent, createBlockAfter, deleteBlock, indentBlock, outdentBlock } = useBlockStore(
    useShallow(state => ({
      updateBlockContent: state.updateBlockContent,
      createBlockAfter: state.createBlockAfter,
      deleteBlock: state.deleteBlock,
      indentBlock: state.indentBlock,
      outdentBlock: state.outdentBlock,
    }))
  );

  const [isExecuting, setIsExecuting] = useState(false);

  const handleChange = useCallback(
    (content: string) => {
      updateBlockContent(block.id, content);
    },
    [block.id, updateBlockContent]
  );

  // Handle tree operations (indent, outdent, new block, delete, zoom)
  const handleTreeAction = useCallback(
    (action: 'indent' | 'outdent' | 'newBlockAfter' | 'deleteIfEmpty' | 'zoomIntoBlock') => {
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
      }
    },
    [block.id, block.content, block.childIds.length, indentBlock, outdentBlock, createBlockAfter, deleteBlock, onNavigateUp, onRequestFocus, onZoomIntoBlock]
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

  return (
    <div
      className={`flex items-start gap-2 py-0.5 ${isFocused ? 'block-focused rounded' : ''}`}
      style={{ paddingLeft: `${depth * 20}px` }}
      onClick={handleFocus}
    >
      {/* Collapse toggle (per-pane state) */}
      {block.childIds.length > 0 && (
        <button
          className="w-4 h-4 flex items-center justify-center text-neutral-500 hover:text-neutral-300 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapsed();
          }}
        >
          {isCollapsed ? '▸' : '▾'}
        </button>
      )}
      {block.childIds.length === 0 && <span className="w-4" />}

      {/* Block indicator - FLOAT palette */}
      <span
        className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
          block.type === 'sh'
            ? isExecuting
              ? 'bg-amber-500 animate-pulse'
              : 'bg-emerald-500'
            : block.type === 'output'
            ? 'bg-cyan-700'
            : block.type === 'error'
            ? 'bg-red-500'
            : block.type === 'ctx'
            ? 'bg-amber-500'
            : block.type === 'ai'
            ? 'bg-fuchsia-500'
            : 'bg-neutral-600'
        }`}
      />

      {/* Content - PlateBlock for all block types (including output - editable) */}
      <PlateBlock
        content={block.content}
        blockType={block.type}
        isFocused={isFocused}
        onChange={handleChange}
        onNavigateUp={onNavigateUp}
        onNavigateDown={onNavigateDown}
        onTreeAction={handleTreeAction}
        onFocus={handleFocus}
        onExecute={isExecutableShellBlock(block.content) ? handleExecute : undefined}
      />

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
