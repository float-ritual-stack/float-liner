/**
 * usePaneStore - Zustand store for pane layout management
 *
 * Provides:
 * - Binary tree pane layout
 * - Split/close operations
 * - Active pane tracking
 * - Resize ratio updates
 * - localStorage persistence
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  PaneLayout,
  PaneNode,
  PaneLeaf,
  PaneSplit,
  SplitDirection,
  createPaneLeaf,
  createPaneSplit,
} from '../lib/types';
import { v4 as uuidv4 } from 'uuid';

// ═══════════════════════════════════════════════════════════════
// STORE TYPES
// ═══════════════════════════════════════════════════════════════

export interface PaneStore {
  layout: PaneLayout;
  // Per-pane collapse state: paneId -> Set of collapsed blockIds
  collapsedBlocks: Map<string, Set<string>>;

  // Actions
  setActivePane: (paneId: string) => void;
  splitPane: (paneId: string, direction: SplitDirection) => void;
  closePane: (paneId: string) => void;
  setRatio: (splitId: string, ratio: number) => void;
  setPaneRoot: (paneId: string, rootBlockId: string) => void;
  toggleCollapsed: (paneId: string, blockId: string) => void;
  isCollapsed: (paneId: string, blockId: string, blockDefault: boolean) => boolean;

  // Queries
  getPane: (paneId: string) => PaneLeaf | null;
  getAllLeafPanes: () => PaneLeaf[];
}

// ═══════════════════════════════════════════════════════════════
// TREE HELPERS
// ═══════════════════════════════════════════════════════════════

function findNode(node: PaneNode, id: string): PaneNode | null {
  if (node.id === id) return node;
  if (node.type === 'split') {
    return findNode(node.first, id) || findNode(node.second, id);
  }
  return null;
}

function findParent(root: PaneNode, targetId: string): PaneSplit | null {
  if (root.type === 'leaf') return null;

  if (root.first.id === targetId || root.second.id === targetId) {
    return root;
  }

  return findParent(root.first, targetId) || findParent(root.second, targetId);
}

function replaceNode(root: PaneNode, targetId: string, newNode: PaneNode): PaneNode {
  if (root.id === targetId) return newNode;

  if (root.type === 'split') {
    return {
      ...root,
      first: replaceNode(root.first, targetId, newNode),
      second: replaceNode(root.second, targetId, newNode),
    };
  }

  return root;
}

function collectLeaves(node: PaneNode): PaneLeaf[] {
  if (node.type === 'leaf') return [node];
  return [...collectLeaves(node.first), ...collectLeaves(node.second)];
}

// ═══════════════════════════════════════════════════════════════
// STORE
// ═══════════════════════════════════════════════════════════════

const initialPaneId = 'pane-1';

const initialLayout: PaneLayout = {
  root: createPaneLeaf(initialPaneId, 'root'),
  activePaneId: initialPaneId,
};

export const usePaneStore = create<PaneStore>()(
  persist(
    (set, get) => ({
      layout: initialLayout,
      collapsedBlocks: new Map(),

      setActivePane: (paneId: string) => {
        set(state => ({
          layout: { ...state.layout, activePaneId: paneId },
        }));
      },

      splitPane: (paneId: string, direction: SplitDirection) => {
        const { layout } = get();
        const targetPane = findNode(layout.root, paneId) as PaneLeaf;
        if (!targetPane || targetPane.type !== 'leaf') return;

        const newPaneId = `pane-${uuidv4().slice(0, 8)}`;
        const splitId = `split-${uuidv4().slice(0, 8)}`;

        // Create new leaf with same root as original
        const newPane = createPaneLeaf(newPaneId, targetPane.rootBlockId);

        // Create split containing original and new pane
        const split = createPaneSplit(splitId, direction, targetPane, newPane);

        // Replace original pane with split
        const newRoot = replaceNode(layout.root, paneId, split);

        set({
          layout: {
            root: newRoot,
            activePaneId: newPaneId,
          },
        });
      },

      closePane: (paneId: string) => {
        const { layout } = get();

        // Can't close the last pane
        const leaves = collectLeaves(layout.root);
        if (leaves.length <= 1) return;

        // Find parent split
        const parent = findParent(layout.root, paneId);
        if (!parent) return;

        // Get sibling (the one we'll keep)
        const sibling = parent.first.id === paneId ? parent.second : parent.first;

        // Replace parent split with sibling
        const newRoot = replaceNode(layout.root, parent.id, sibling);

        // Update active pane if needed
        let newActiveId = layout.activePaneId;
        if (newActiveId === paneId) {
          const newLeaves = collectLeaves(newRoot);
          newActiveId = newLeaves[0]?.id || initialPaneId;
        }

        set({
          layout: {
            root: newRoot,
            activePaneId: newActiveId,
          },
        });
      },

      setRatio: (splitId: string, ratio: number) => {
        set(state => {
          const updateRatio = (node: PaneNode): PaneNode => {
            if (node.id === splitId && node.type === 'split') {
              return { ...node, ratio: Math.max(0.1, Math.min(0.9, ratio)) };
            }
            if (node.type === 'split') {
              return {
                ...node,
                first: updateRatio(node.first),
                second: updateRatio(node.second),
              };
            }
            return node;
          };

          return {
            layout: {
              ...state.layout,
              root: updateRatio(state.layout.root),
            },
          };
        });
      },

      setPaneRoot: (paneId: string, rootBlockId: string) => {
        set(state => {
          const updatePaneRoot = (node: PaneNode): PaneNode => {
            if (node.id === paneId && node.type === 'leaf') {
              return { ...node, rootBlockId };
            }
            if (node.type === 'split') {
              return {
                ...node,
                first: updatePaneRoot(node.first),
                second: updatePaneRoot(node.second),
              };
            }
            return node;
          };

          return {
            layout: {
              ...state.layout,
              root: updatePaneRoot(state.layout.root),
            },
          };
        });
      },

      toggleCollapsed: (paneId: string, blockId: string) => {
        set(state => {
          const newMap = new Map(state.collapsedBlocks);
          const paneSet = new Set(newMap.get(paneId) || []);

          if (paneSet.has(blockId)) {
            paneSet.delete(blockId);
          } else {
            paneSet.add(blockId);
          }

          newMap.set(paneId, paneSet);
          return { collapsedBlocks: newMap };
        });
      },

      isCollapsed: (paneId: string, blockId: string, blockDefault: boolean) => {
        const paneSet = get().collapsedBlocks.get(paneId);
        if (!paneSet) return blockDefault; // No overrides, use block's default
        // If block is in the set, it's been toggled from default
        return paneSet.has(blockId) ? !blockDefault : blockDefault;
      },

      getPane: (paneId: string) => {
        const node = findNode(get().layout.root, paneId);
        return node?.type === 'leaf' ? node : null;
      },

      getAllLeafPanes: () => {
        return collectLeaves(get().layout.root);
      },
    }),
    {
      name: 'float-substrate-pane-layout',
      // Only persist layout, not actions
      partialize: (state) => ({ layout: state.layout }),
    }
  )
);
