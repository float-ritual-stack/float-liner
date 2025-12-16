/**
 * useSyncedYDoc - Bridge between Rust (yrs) and Frontend (yjs)
 *
 * Handles:
 * - Loading initial state from Rust on mount
 * - Observing local Y.Doc changes and syncing to Rust
 * - Applying updates from Rust to local Y.Doc
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import * as Y from 'yjs';

// ═══════════════════════════════════════════════════════════════
// BASE64 UTILITIES
// ═══════════════════════════════════════════════════════════════

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ═══════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════

export interface UseSyncedYDocOptions {
  /** Debounce time for syncing updates to Rust (ms) */
  syncDebounce?: number;
}

export interface UseSyncedYDocReturn {
  /** The Y.Doc instance */
  doc: Y.Doc;
  /** Whether initial load is complete */
  isLoaded: boolean;
  /** Any error that occurred */
  error: string | null;
  /** Force sync to Rust */
  forceSync: () => Promise<void>;
}

export function useSyncedYDoc(
  options: UseSyncedYDocOptions = {}
): UseSyncedYDocReturn {
  const { syncDebounce = 50 } = options;

  // Single Y.Doc instance
  const docRef = useRef<Y.Doc>(new Y.Doc());
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track whether we're currently applying an update from Rust
  const isApplyingRemoteRef = useRef(false);

  // Debounce timer for syncing
  const syncTimerRef = useRef<number | null>(null);

  // Sync local changes to Rust
  const syncToRust = useCallback(async () => {
    if (isApplyingRemoteRef.current) return;

    try {
      const update = Y.encodeStateAsUpdate(docRef.current);
      const updateB64 = bytesToBase64(update);
      await invoke<string>('apply_update', { updateB64 });
    } catch (err) {
      console.error('Failed to sync to Rust:', err);
      setError(String(err));
    }
  }, []);

  // Debounced sync
  const debouncedSync = useCallback(() => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = window.setTimeout(syncToRust, syncDebounce);
  }, [syncToRust, syncDebounce]);

  // Force sync (bypass debounce)
  const forceSync = useCallback(async () => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    await syncToRust();
  }, [syncToRust]);

  // Load initial state and set up sync
  useEffect(() => {
    const doc = docRef.current;
    let mounted = true;

    async function loadInitialState() {
      try {
        const stateB64 = await invoke<string>('get_initial_state');
        const stateBytes = base64ToBytes(stateB64);

        isApplyingRemoteRef.current = true;
        Y.applyUpdate(doc, stateBytes);
        isApplyingRemoteRef.current = false;

        if (mounted) {
          setIsLoaded(true);
        }
      } catch (err) {
        console.error('Failed to load initial state:', err);
        if (mounted) {
          setError(String(err));
        }
      }
    }

    // Observe all changes
    const updateHandler = (_update: Uint8Array, origin: unknown) => {
      // Don't sync back changes that came from Rust
      if (origin === 'remote' || isApplyingRemoteRef.current) return;
      debouncedSync();
    };

    doc.on('update', updateHandler);
    loadInitialState();

    return () => {
      mounted = false;
      doc.off('update', updateHandler);
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }
    };
  }, [debouncedSync]);

  return {
    doc: docRef.current,
    isLoaded,
    error,
    forceSync,
  };
}

// ═══════════════════════════════════════════════════════════════
// BLOCK HELPERS
// ═══════════════════════════════════════════════════════════════

/** Get the blocks Y.Map from a Y.Doc */
export function getBlocksMap(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap('blocks');
}

/** Get the rootIds Y.Array from a Y.Doc */
export function getRootIds(doc: Y.Doc): Y.Array<string> {
  return doc.getArray('rootIds');
}

/** Get a block by ID */
export function getBlock(doc: Y.Doc, blockId: string): Y.Map<unknown> | undefined {
  const blocks = getBlocksMap(doc);
  return blocks.get(blockId) as Y.Map<unknown> | undefined;
}
