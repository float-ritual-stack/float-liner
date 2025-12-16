/**
 * Core types for FLOAT Substrate
 *
 * Block: The universal primitive - everything is a block
 * PaneLayout: Binary tree for split pane management
 */

// ═══════════════════════════════════════════════════════════════
// BLOCK TYPES
// ═══════════════════════════════════════════════════════════════

/** Block type determined by prefix:: pattern */
export type BlockType =
  | 'text'      // No prefix - inert text
  | 'sh'        // sh:: or term:: - shell/terminal
  | 'ai'        // ai:: or chat:: - LLM interface
  | 'ctx'       // ctx:: - context scope
  | 'dispatch'  // dispatch:: - agent execution
  | 'web'       // web:: or link:: - iframe embed
  | 'output'    // Output from sh:: or ai:: execution
  | 'error';    // Error output from execution

/** Executor status */
export type ExecutorStatus = 'idle' | 'running' | 'complete' | 'error';

/** A block in the tree */
export interface Block {
  id: string;
  parentId: string | null;
  childIds: string[];

  /** Raw text content (may include prefix::) */
  content: string;

  /** Parsed block type from prefix */
  type: BlockType;

  /** Whether children are visible */
  collapsed: boolean;

  /** Creation timestamp */
  createdAt: number;

  /** Last modified timestamp */
  updatedAt: number;

  /** Executor status (for sh::, ai::, etc.) */
  status?: ExecutorStatus;

  /** Exit code (for sh:: blocks) */
  exitCode?: number;
}

/** Parse block type from content prefix */
export function parseBlockType(content: string): BlockType {
  const trimmed = content.trim().toLowerCase();

  if (trimmed.startsWith('sh::') || trimmed.startsWith('term::')) return 'sh';
  if (trimmed.startsWith('ai::') || trimmed.startsWith('chat::')) return 'ai';
  if (trimmed.startsWith('ctx::')) return 'ctx';
  if (trimmed.startsWith('dispatch::')) return 'dispatch';
  if (trimmed.startsWith('web::') || trimmed.startsWith('link::')) return 'web';

  return 'text';
}

/** Create a new block with defaults */
export function createBlock(
  id: string,
  content: string = '',
  parentId: string | null = null
): Block {
  const now = Date.now();
  return {
    id,
    parentId,
    childIds: [],
    content,
    type: parseBlockType(content),
    collapsed: false,
    createdAt: now,
    updatedAt: now,
  };
}

// ═══════════════════════════════════════════════════════════════
// PANE LAYOUT TYPES (Binary Tree)
// ═══════════════════════════════════════════════════════════════

/** Split direction */
export type SplitDirection = 'horizontal' | 'vertical';

/** A leaf pane showing a block tree */
export interface PaneLeaf {
  type: 'leaf';
  id: string;
  /** Root block ID this pane is viewing */
  rootBlockId: string;
  /** Currently focused block ID within this pane */
  focusedBlockId: string | null;
}

/** A split pane containing two children */
export interface PaneSplit {
  type: 'split';
  id: string;
  direction: SplitDirection;
  /** Size of first child as ratio (0-1) */
  ratio: number;
  first: PaneNode;
  second: PaneNode;
}

/** Union type for pane tree nodes */
export type PaneNode = PaneLeaf | PaneSplit;

/** Root layout state */
export interface PaneLayout {
  root: PaneNode;
  /** Currently active pane ID */
  activePaneId: string;
}

/** Create a leaf pane */
export function createPaneLeaf(
  id: string,
  rootBlockId: string
): PaneLeaf {
  return {
    type: 'leaf',
    id,
    rootBlockId,
    focusedBlockId: null,
  };
}

/** Create a split pane */
export function createPaneSplit(
  id: string,
  direction: SplitDirection,
  first: PaneNode,
  second: PaneNode,
  ratio: number = 0.5
): PaneSplit {
  return {
    type: 'split',
    id,
    direction,
    ratio,
    first,
    second,
  };
}

// ═══════════════════════════════════════════════════════════════
// Y.DOC SCHEMA
// ═══════════════════════════════════════════════════════════════

/**
 * Y.Doc structure:
 *
 * blocks: Y.Map<string, Block>
 *   - Key: block ID
 *   - Value: Block object
 *
 * rootIds: Y.Array<string>
 *   - Top-level block IDs (no parent)
 *
 * layout: Y.Map<string, any>
 *   - Pane layout state (optional, can use localStorage)
 */

export const YDOC_BLOCKS_KEY = 'blocks';
export const YDOC_ROOT_IDS_KEY = 'rootIds';
export const YDOC_LAYOUT_KEY = 'layout';

// ═══════════════════════════════════════════════════════════════
// FOCUS & NAVIGATION
// ═══════════════════════════════════════════════════════════════

/** Direction for navigation */
export type NavigationDirection = 'up' | 'down' | 'left' | 'right';

/** Focus state */
export interface FocusState {
  /** Active pane ID */
  paneId: string;
  /** Focused block ID within the pane */
  blockId: string | null;
  /** Whether the block editor has focus (vs pane chrome) */
  editorFocused: boolean;
}
