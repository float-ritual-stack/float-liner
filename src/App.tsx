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

  // Shortcuts help modal
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // Workspace load error state
  const [workspaceLoadError, setWorkspaceLoadError] = useState<string | null>(null);

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
        setWorkspaceLoadError(`Failed to load workspace info: ${err}`);
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
      // Save current workspace before creating new one
      await invoke('save_doc');
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

    // Cmd+? (Cmd+Shift+/) - show shortcuts help
    if (e.key === '?' && e.metaKey) {
      e.preventDefault();
      setShowShortcutsHelp(true);
    }

    // Escape - close shortcuts help
    if (e.key === 'Escape' && showShortcutsHelp) {
      e.preventDefault();
      setShowShortcutsHelp(false);
    }
  }, [layout.activePaneId, splitPane, closePane, getAllLeafPanes, saveDocument, showShortcutsHelp]);

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
      {/* Workspace load error banner */}
      {workspaceLoadError && (
        <div className="px-4 py-2 bg-red-900/50 border-b border-red-700 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-red-300">
            <span className="text-red-400">⚠</span>
            <span>{workspaceLoadError}</span>
          </div>
          <button
            className="text-xs px-2 py-1 bg-red-800 hover:bg-red-700 text-red-200 rounded transition-colors"
            onClick={() => setWorkspaceLoadError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

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
          <span className="text-neutral-700">•</span>
          <button
            className="text-cyan-600 hover:text-cyan-400 transition-colors"
            onClick={() => setShowShortcutsHelp(true)}
            title="Keyboard shortcuts (⌘?)"
          >
            ⌘?
          </button>
          <span className="text-neutral-600">help</span>
        </div>
      </header>

      {/* Keyboard shortcuts help modal */}
      {showShortcutsHelp && (
        <div 
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={() => setShowShortcutsHelp(false)}
        >
          <div 
            className="bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-700">
              <h2 className="text-lg font-bold text-cyan-400">Keyboard Shortcuts</h2>
              <button
                className="text-neutral-500 hover:text-neutral-300 text-xl"
                onClick={() => setShowShortcutsHelp(false)}
              >
                ×
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Global shortcuts */}
              <div>
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">Global</h3>
                <div className="grid grid-cols-2 gap-2">
                  <ShortcutRow keys="⌘ S" description="Save document" />
                  <ShortcutRow keys="⌘ ?" description="Show this help" />
                  <ShortcutRow keys="Esc" description="Close modal/menu" />
                </div>
              </div>

              {/* Pane shortcuts */}
              <div>
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">Panes</h3>
                <div className="grid grid-cols-2 gap-2">
                  <ShortcutRow keys="⌘ \\" description="Split horizontal" />
                  <ShortcutRow keys="⌘ ⇧ \\" description="Split vertical" />
                  <ShortcutRow keys="⌘ W" description="Close pane" />
                  <ShortcutRow keys="⌘ 1-5" description="Focus pane by index" />
                </div>
              </div>

              {/* Block editing */}
              <div>
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">Block Editing</h3>
                <div className="grid grid-cols-2 gap-2">
                  <ShortcutRow keys="Enter" description="New block after / Execute sh::" />
                  <ShortcutRow keys="⌘ Enter" description="Zoom into block" />
                  <ShortcutRow keys="Backspace" description="Delete empty block" />
                  <ShortcutRow keys="Tab" description="Indent block" />
                  <ShortcutRow keys="⇧ Tab" description="Outdent block" />
                </div>
              </div>

              {/* Block navigation & organization */}
              <div>
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">Navigation & Organization</h3>
                <div className="grid grid-cols-2 gap-2">
                  <ShortcutRow keys="↑ / ↓" description="Navigate between blocks" />
                  <ShortcutRow keys="⌘ ." description="Toggle expand/collapse" />
                  <ShortcutRow keys="⌥ ⇧ ↑" description="Move block up" />
                  <ShortcutRow keys="⌥ ⇧ ↓" description="Move block down" />
                </div>
              </div>

              {/* Formatting */}
              <div>
                <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">Markdown Formatting</h3>
                <div className="grid grid-cols-2 gap-2">
                  <ShortcutRow keys="# " description="Heading 1" />
                  <ShortcutRow keys="## " description="Heading 2" />
                  <ShortcutRow keys="### " description="Heading 3" />
                  <ShortcutRow keys="**text**" description="Bold" />
                  <ShortcutRow keys="*text*" description="Italic" />
                  <ShortcutRow keys="`code`" description="Inline code" />
                  <ShortcutRow keys="~~text~~" description="Strikethrough" />
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-neutral-700 text-xs text-neutral-500 text-center">
              Press <kbd className="px-1.5 py-0.5 bg-neutral-800 rounded text-cyan-400">Esc</kbd> or click outside to close
            </div>
          </div>
        </div>
      )}

      {/* Pane layout */}
      <main className="flex-1 min-h-0">
        <PaneLayout node={layout.root} doc={doc} />
      </main>
    </div>
  );
}

// Shortcut row component for the help modal
function ShortcutRow({ keys, description }: { keys: string; description: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-neutral-800/50">
      <span className="text-sm text-neutral-300">{description}</span>
      <kbd className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs font-mono text-cyan-400">
        {keys}
      </kbd>
    </div>
  );
}

export default App;
