/**
 * Shell executor - invoke sh:: commands via Tauri
 *
 * Flow:
 * 1. Frontend detects sh:: prefix and extracts command
 * 2. Invokes Rust execute_shell command
 * 3. Rust executes command, appends output as Y.Doc children
 * 4. Returns updated state, frontend syncs via Y.Doc
 */

import { invoke } from '@tauri-apps/api/core';
import * as Y from 'yjs';

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Normalize smart/curly quotes to straight quotes
 * Plate's typography can convert " to " and " which breaks shell commands
 */
function normalizeQuotes(str: string): string {
  return str
    .replace(/[\u201C\u201D]/g, '"')  // " " → "
    .replace(/[\u2018\u2019]/g, "'")  // ' ' → '
    .replace(/[\u2013\u2014]/g, '-'); // – — → -
}

/**
 * Extract command from sh:: block content
 * e.g., "sh:: ls -la" → "ls -la"
 */
export function extractShellCommand(content: string): string | null {
  const trimmed = content.trim();
  const lower = trimmed.toLowerCase();

  let command: string | null = null;

  if (lower.startsWith('sh::')) {
    command = trimmed.slice(4).trim();
  } else if (lower.startsWith('term::')) {
    command = trimmed.slice(6).trim();
  }

  // Normalize smart quotes to straight quotes for shell compatibility
  return command ? normalizeQuotes(command) : null;
}

/**
 * Execute a shell command for a block
 *
 * @param blockId - The block ID that triggered execution
 * @param command - The shell command to execute
 * @param doc - The Y.Doc to apply the update to
 * @returns Promise that resolves when execution completes
 */
export async function executeShellBlock(
  blockId: string,
  command: string,
  doc: Y.Doc
): Promise<void> {
  try {
    console.log(`[sh::] Executing: ${command} for block ${blockId}`);

    // Invoke the Rust command
    const updatedStateB64 = await invoke<string>('execute_shell', {
      blockId,
      command,
    });

    // Apply the update to the local Y.Doc
    const updateBytes = base64ToBytes(updatedStateB64);
    Y.applyUpdate(doc, updateBytes);

    console.log(`[sh::] Execution complete for block ${blockId}`);
  } catch (err) {
    console.error(`[sh::] Execution failed for block ${blockId}:`, err);
    throw err;
  }
}

/**
 * Check if a block is a sh:: block that can be executed
 */
export function isExecutableShellBlock(content: string): boolean {
  const command = extractShellCommand(content);
  return command !== null && command.length > 0;
}
