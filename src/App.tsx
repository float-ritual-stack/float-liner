/**
 * Float Liner - Main App
 *
 * FLOAT Substrate #14: platejs v52+ with markdown rendering
 */

import { useEffect, useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { PaneLayout } from './components/PaneLayout';
import { useSyncedYDoc } from './hooks/useSyncedYDoc';
import { useBlockStore } from './hooks/useBlockStore';
import { usePaneStore } from './hooks/usePaneStore';

function App() {
  const { doc, isLoaded, error } = useSyncedYDoc();
  const initFromYDoc = useBlockStore((s) => s.initFromYDoc);
  const isInitialized = useBlockStore((s) => s.isInitialized);
  const layout = usePaneStore((s) => s.layout);
  const splitPane = usePaneStore((s) => s.splitPane);
  const closePane = usePaneStore((s) => s.closePane);
  const getAllLeafPanes = usePaneStore((s) => s.getAllLeafPanes);

  // Save state
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Save document to file
  const saveDocument = useCallback(async () => {
    setSaveStatus('saving');
    try {
      await invoke('save_doc');
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      console.error('Save failed:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, []);

  // Initialize block store from Y.Doc
  useEffect(() => {
    if (isLoaded && !isInitialized) {
      initFromYDoc(doc);
    }
  }, [isLoaded, isInitialized, doc, initFromYDoc]);

  // Global keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Cmd+S - save
    if (e.key === 's' && e.metaKey) {
      e.preventDefault();
      saveDocument();
      return;
    }

    // Cmd+\ - split horizontal
    if (e.key === '\\' && e.metaKey && !e.shiftKey) {
      e.preventDefault();
      splitPane(layout.activePaneId, 'horizontal');
    }

    // Cmd+Shift+\ - split vertical
    if (e.key === '\\' && e.metaKey && e.shiftKey) {
      e.preventDefault();
      splitPane(layout.activePaneId, 'vertical');
    }

    // Cmd+W - close pane
    if (e.key === 'w' && e.metaKey) {
      e.preventDefault();
      closePane(layout.activePaneId);
    }

    // Cmd+1/2/3/4/5 - focus pane by index
    if (e.metaKey && ['1', '2', '3', '4', '5'].includes(e.key)) {
      e.preventDefault();
      const panes = getAllLeafPanes();
      const index = parseInt(e.key) - 1;
      if (panes[index]) {
        usePaneStore.getState().setActivePane(panes[index].id);
      }
    }
  }, [layout.activePaneId, splitPane, closePane, getAllLeafPanes, saveDocument]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Loading state
  if (!isLoaded || !isInitialized) {
    return (
      <div className="h-screen flex items-center justify-center bg-neutral-950 text-neutral-400">
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-mono">Loading...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-neutral-950 text-red-400">
        <div className="text-center">
          <div className="text-lg font-mono mb-2">Error</div>
          <div className="text-sm">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-neutral-950 text-neutral-100">
      {/* App header */}
      <header className="flex items-center justify-between px-4 py-2 bg-neutral-900 border-b border-cyan-900/30">
        <div className="flex items-center gap-2">
          <span className="font-bold text-cyan-400">FLOAT</span>
          <span className="text-fuchsia-400">.</span>
          <span className="font-bold text-fuchsia-300">liner</span>
          <span className="text-xs text-neutral-600 font-mono">v14</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          {/* Save status */}
          {saveStatus === 'saving' && (
            <span className="text-amber-500 animate-pulse">saving...</span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-emerald-500">◆ saved</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-red-500">◇ save failed</span>
          )}
          <span className="text-neutral-700">•</span>
          <span className="text-cyan-600">⌘S</span>
          <span className="text-neutral-600">save</span>
          <span className="text-neutral-700">•</span>
          <span className="text-cyan-600">⌘\</span>
          <span className="text-neutral-600">split</span>
          <span className="text-neutral-700">•</span>
          <span className="text-cyan-600">⌘⇧\</span>
          <span className="text-neutral-600">vert</span>
          <span className="text-neutral-700">•</span>
          <span className="text-cyan-600">⌘W</span>
          <span className="text-neutral-600">close</span>
        </div>
      </header>

      {/* Pane layout */}
      <main className="flex-1 min-h-0">
        <PaneLayout node={layout.root} doc={doc} />
      </main>
    </div>
  );
}

export default App;
