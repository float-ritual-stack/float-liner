/**
 * Float Liner - Main App
 *
 * FLOAT Substrate #14: platejs v52+ with markdown rendering
 */

import { useEffect, useCallback, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { PaneLayout } from './components/PaneLayout';
import { useSyncedYDoc } from './hooks/useSyncedYDoc';
import { useBlockStore } from './hooks/useBlockStore';
import { usePaneStore } from './hooks/usePaneStore';

function App() {
  const { doc, isLoaded, error, reloadFromState, docVersion } = useSyncedYDoc();
  const initFromYDoc = useBlockStore((s) => s.initFromYDoc);
  const isInitialized = useBlockStore((s) => s.isInitialized);
  const layout = usePaneStore((s) => s.layout);
  const splitPane = usePaneStore((s) => s.splitPane);
  const closePane = usePaneStore((s) => s.closePane);
  const getAllLeafPanes = usePaneStore((s) => s.getAllLeafPanes);

  // Save state
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Workspace state
  const [currentWorkspace, setCurrentWorkspace] = useState<string>('default');
  const [workspaceList, setWorkspaceList] = useState<string[]>(['default']);
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const workspaceMenuRef = useRef<HTMLDivElement>(null);

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

  // Initialize block store from Y.Doc (also re-init when workspace changes via docVersion)
  useEffect(() => {
    if (isLoaded) {
      initFromYDoc(doc);
    }
  }, [isLoaded, doc, initFromYDoc, docVersion]);

  // Load workspace info on mount
  useEffect(() => {
    async function loadWorkspaceInfo() {
      try {
        const [current, list] = await Promise.all([
          invoke<string>('get_current_workspace'),
          invoke<string[]>('list_workspaces'),
        ]);
        setCurrentWorkspace(current);
        setWorkspaceList(list);
      } catch (err) {
        console.error('Failed to load workspace info:', err);
      }
    }
    loadWorkspaceInfo();
  }, []);

  // Close workspace menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (workspaceMenuRef.current && !workspaceMenuRef.current.contains(event.target as Node)) {
        setShowWorkspaceMenu(false);
        setIsCreatingWorkspace(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle switching to a different workspace
  const handleLoadWorkspace = useCallback(async (name: string) => {
    if (name === currentWorkspace) {
      setShowWorkspaceMenu(false);
      return;
    }
    try {
      // Save current workspace before switching
      await invoke('save_doc');
      const newStateB64 = await invoke<string>('load_workspace', { name });
      reloadFromState(newStateB64);
      setCurrentWorkspace(name);
      setShowWorkspaceMenu(false);
      // Refresh workspace list in case new one was created
      const list = await invoke<string[]>('list_workspaces');
      setWorkspaceList(list);
    } catch (err) {
      console.error('Failed to load workspace:', err);
      alert(`Failed to load workspace: ${err}`);
    }
  }, [currentWorkspace, reloadFromState]);

  // Handle creating a new workspace
  const handleCreateWorkspace = useCallback(async () => {
    const name = newWorkspaceName.trim();
    if (!name) return;
    
    try {
      const newStateB64 = await invoke<string>('new_workspace', { name });
      reloadFromState(newStateB64);
      setCurrentWorkspace(name);
      setShowWorkspaceMenu(false);
      setIsCreatingWorkspace(false);
      setNewWorkspaceName('');
      // Refresh workspace list
      const list = await invoke<string[]>('list_workspaces');
      setWorkspaceList(list);
    } catch (err) {
      console.error('Failed to create workspace:', err);
      alert(`Failed to create workspace: ${err}`);
    }
  }, [newWorkspaceName, reloadFromState]);

  // Handle clearing the current workspace
  const handleClearWorkspace = useCallback(async () => {
    if (!confirm(`Clear all blocks in workspace "${currentWorkspace}"? This cannot be undone.`)) {
      return;
    }
    try {
      const newStateB64 = await invoke<string>('clear_workspace');
      reloadFromState(newStateB64);
      setShowWorkspaceMenu(false);
    } catch (err) {
      console.error('Failed to clear workspace:', err);
      alert(`Failed to clear workspace: ${err}`);
    }
  }, [currentWorkspace, reloadFromState]);

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
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-cyan-400">FLOAT</span>
            <span className="text-fuchsia-400">.</span>
            <span className="font-bold text-fuchsia-300">liner</span>
            <span className="text-xs text-neutral-600 font-mono">v14</span>
          </div>
          
          {/* Workspace selector */}
          <div className="relative" ref={workspaceMenuRef}>
            <button
              className="flex items-center gap-1.5 px-2 py-1 text-xs font-mono bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-700 transition-colors"
              onClick={() => setShowWorkspaceMenu(!showWorkspaceMenu)}
            >
              <span className="text-neutral-400">◊</span>
              <span className="text-cyan-300">{currentWorkspace}</span>
              <span className="text-neutral-500">▾</span>
            </button>
            
            {showWorkspaceMenu && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-neutral-800 border border-neutral-700 rounded shadow-lg z-50">
                {/* Workspace list */}
                <div className="max-h-48 overflow-y-auto">
                  {workspaceList.map((name) => (
                    <button
                      key={name}
                      className={`w-full px-3 py-1.5 text-left text-xs font-mono hover:bg-neutral-700 transition-colors ${
                        name === currentWorkspace ? 'text-cyan-400 bg-neutral-700/50' : 'text-neutral-300'
                      }`}
                      onClick={() => handleLoadWorkspace(name)}
                    >
                      {name === currentWorkspace && <span className="mr-1">◆</span>}
                      {name}
                    </button>
                  ))}
                </div>
                
                <div className="border-t border-neutral-700">
                  {/* New workspace */}
                  {isCreatingWorkspace ? (
                    <div className="p-2">
                      <input
                        type="text"
                        className="w-full px-2 py-1 text-xs font-mono bg-neutral-900 border border-neutral-600 rounded text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-cyan-600"
                        placeholder="workspace-name"
                        value={newWorkspaceName}
                        onChange={(e) => setNewWorkspaceName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleCreateWorkspace();
                          if (e.key === 'Escape') {
                            setIsCreatingWorkspace(false);
                            setNewWorkspaceName('');
                          }
                        }}
                        autoFocus
                      />
                      <div className="flex gap-1 mt-1">
                        <button
                          className="flex-1 px-2 py-1 text-xs bg-cyan-700 hover:bg-cyan-600 text-white rounded transition-colors"
                          onClick={handleCreateWorkspace}
                        >
                          Create
                        </button>
                        <button
                          className="flex-1 px-2 py-1 text-xs bg-neutral-700 hover:bg-neutral-600 text-neutral-300 rounded transition-colors"
                          onClick={() => {
                            setIsCreatingWorkspace(false);
                            setNewWorkspaceName('');
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="w-full px-3 py-1.5 text-left text-xs text-emerald-400 hover:bg-neutral-700 transition-colors"
                      onClick={() => setIsCreatingWorkspace(true)}
                    >
                      + New workspace
                    </button>
                  )}
                  
                  {/* Clear workspace */}
                  <button
                    className="w-full px-3 py-1.5 text-left text-xs text-amber-400 hover:bg-neutral-700 transition-colors"
                    onClick={handleClearWorkspace}
                  >
                    ⟳ Clear workspace
                  </button>
                </div>
              </div>
            )}
          </div>
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
