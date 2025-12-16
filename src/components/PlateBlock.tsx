/**
 * PlateBlock - Rich text editor per block using platejs v52+
 *
 * Key difference from #13: Full plugin stack for markdown rendering
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Plate,
  PlateContent,
  PlateElement,
  PlateLeaf,
  ParagraphPlugin,
  usePlateEditor,
  type PlateElementProps,
  type PlateLeafProps,
} from 'platejs/react';
import { MarkdownPlugin } from '@platejs/markdown';
import {
  BoldPlugin,
  ItalicPlugin,
  StrikethroughPlugin,
  CodePlugin,
  H1Plugin,
  H2Plugin,
  H3Plugin,
} from '@platejs/basic-nodes/react';
import { CodeBlockPlugin, CodeLinePlugin } from '@platejs/code-block/react';
import { AutoformatPlugin } from '@platejs/autoformat';
import { Editor, Point, Range, Transforms } from 'slate';
import remarkGfm from 'remark-gfm';
import type { Value, TElement } from 'platejs';

// ═══════════════════════════════════════════════════════════════
// CURSOR POSITION HELPERS
// ═══════════════════════════════════════════════════════════════

/**
 * Check if cursor is at the very first position of the ENTIRE editor
 * (not just current paragraph - for multi-line content)
 */
function isCursorAtEditorStart(editor: any): boolean {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) return false;

  // Get the absolute start of the editor
  const editorStart = Editor.start(editor, []);
  return Point.equals(selection.anchor, editorStart);
}

/**
 * Check if cursor is at the very last position of the ENTIRE editor
 * (not just current paragraph - for multi-line content)
 */
function isCursorAtEditorEnd(editor: any): boolean {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) return false;

  // Get the absolute end of the editor
  const editorEnd = Editor.end(editor, []);
  return Point.equals(selection.anchor, editorEnd);
}

// ═══════════════════════════════════════════════════════════════
// CUSTOM ELEMENT COMPONENTS
// ═══════════════════════════════════════════════════════════════

function H1Element({ children, element, ...props }: PlateElementProps) {
  return (
    <PlateElement as="h1" element={element} className="plate-h1" {...props}>
      {children}
    </PlateElement>
  );
}

function H2Element({ children, element, ...props }: PlateElementProps) {
  return (
    <PlateElement as="h2" element={element} className="plate-h2" {...props}>
      {children}
    </PlateElement>
  );
}

function H3Element({ children, element, ...props }: PlateElementProps) {
  return (
    <PlateElement as="h3" element={element} className="plate-h3" {...props}>
      {children}
    </PlateElement>
  );
}

function ParagraphElement({ children, ...props }: PlateElementProps) {
  return (
    <PlateElement as="p" className="my-1" {...props}>
      {children}
    </PlateElement>
  );
}

function CodeBlockElement({ children, ...props }: PlateElementProps) {
  return (
    <PlateElement as="pre" className="plate-code-block" {...props}>
      <code>{children}</code>
    </PlateElement>
  );
}

function CodeLineElement({ children, ...props }: PlateElementProps) {
  return (
    <PlateElement as="div" {...props}>
      {children}
    </PlateElement>
  );
}

function BoldLeaf({ children, ...props }: PlateLeafProps) {
  return (
    <PlateLeaf as="strong" className="plate-bold" {...props}>
      {children}
    </PlateLeaf>
  );
}

function ItalicLeaf({ children, ...props }: PlateLeafProps) {
  return (
    <PlateLeaf as="em" className="plate-italic" {...props}>
      {children}
    </PlateLeaf>
  );
}

function StrikethroughLeaf({ children, ...props }: PlateLeafProps) {
  return (
    <PlateLeaf as="s" className="line-through" {...props}>
      {children}
    </PlateLeaf>
  );
}

function CodeLeaf({ children, ...props }: PlateLeafProps) {
  return (
    <PlateLeaf as="code" className="plate-code" {...props}>
      {children}
    </PlateLeaf>
  );
}

// ═══════════════════════════════════════════════════════════════
// AUTOFORMAT RULES
// ═══════════════════════════════════════════════════════════════

const autoformatRules = [
  // Block rules
  { match: '# ', mode: 'block' as const, type: 'h1' },
  { match: '## ', mode: 'block' as const, type: 'h2' },
  { match: '### ', mode: 'block' as const, type: 'h3' },
  { match: '```', mode: 'block' as const, type: 'code_block' },
  // Mark rules
  { match: '**', mode: 'mark' as const, type: 'bold' },
  { match: '__', mode: 'mark' as const, type: 'bold' },
  { match: '*', mode: 'mark' as const, type: 'italic' },
  { match: '_', mode: 'mark' as const, type: 'italic' },
  { match: '~~', mode: 'mark' as const, type: 'strikethrough' },
  { match: '`', mode: 'mark' as const, type: 'code' },
];

// ═══════════════════════════════════════════════════════════════
// VALUE CONVERSION
// ═══════════════════════════════════════════════════════════════

function textToValue(text: string): Value {
  if (!text) {
    return [{ type: 'p', children: [{ text: '' }] }];
  }
  return [{ type: 'p', children: [{ text }] }];
}

function valueToText(value: Value): string {
  if (!value || !Array.isArray(value)) return '';
  return value
    .map((node) => {
      if ('children' in node) {
        return (node.children as any[])
          .map((child) => ('text' in child ? child.text : ''))
          .join('');
      }
      return '';
    })
    .join('\n');
}

// ═══════════════════════════════════════════════════════════════
// PLATE BLOCK COMPONENT
// ═══════════════════════════════════════════════════════════════

interface PlateBlockProps {
  content: string;
  blockType: string;
  isFocused: boolean;
  onChange: (content: string) => void;
  onNavigateUp: () => void;
  onNavigateDown: () => void;
  onTreeAction: (action: 'indent' | 'outdent' | 'newBlockAfter' | 'deleteIfEmpty' | 'zoomIntoBlock') => void;
  onFocus?: () => void;
  onExecute?: () => void;
}

export function PlateBlock({
  content,
  blockType,
  isFocused,
  onChange,
  onNavigateUp,
  onNavigateDown,
  onTreeAction,
  onFocus,
  onExecute,
}: PlateBlockProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const lastContentRef = useRef(content);
  const hasInitializedMarkdown = useRef(false);

  // All blocks can have markdown content
  const initialValue = useMemo(() => textToValue(content), []);

  // Create editor with full plugin stack
  const editor = usePlateEditor({
    value: initialValue,
    plugins: [
      // Element plugins
      ParagraphPlugin.configure({
        render: { node: ParagraphElement },
      }),
      // Use individual heading plugins - HeadingPlugin wrapper doesn't propagate render config
      H1Plugin.configure({
        node: { component: H1Element },
      }),
      H2Plugin.configure({
        node: { component: H2Element },
      }),
      H3Plugin.configure({
        node: { component: H3Element },
      }),
      CodeBlockPlugin.configure({
        render: { node: CodeBlockElement },
      }),
      CodeLinePlugin.configure({
        render: { node: CodeLineElement },
      }),
      // Mark plugins
      BoldPlugin.configure({
        render: { leaf: BoldLeaf },
      }),
      ItalicPlugin.configure({
        render: { leaf: ItalicLeaf },
      }),
      StrikethroughPlugin.configure({
        render: { leaf: StrikethroughLeaf },
      }),
      CodePlugin.configure({
        render: { leaf: CodeLeaf },
      }),
      // Functionality plugins
      MarkdownPlugin.configure({
        options: {
          remarkPlugins: [remarkGfm],
        },
      }),
      AutoformatPlugin.configure({
        options: {
          rules: autoformatRules,
          enableUndoOnDelete: true,
        },
      }),
    ],
  });

  // Sync content changes
  const handleChange = useCallback(
    ({ value }: { value: Value }) => {
      const newText = valueToText(value);
      if (newText !== lastContentRef.current) {
        lastContentRef.current = newText;
        onChange(newText);
      }
    },
    [onChange]
  );

  // Try to deserialize content as markdown
  const deserializeMarkdown = useCallback((text: string): Value | null => {
    if (!text || !editor.api.markdown) return null;

    // Only try markdown parsing if content looks like it has markdown
    const hasMarkdown = /^#{1,6}\s|^\*\*|^__|^\*[^*]|^_[^_]|^```|^~~/.test(text);
    if (!hasMarkdown) return null;

    try {
      const nodes = editor.api.markdown.deserialize(text);
      if (nodes && nodes.length > 0) {
        return nodes;
      }
    } catch (e) {
      // Fall through
    }
    return null;
  }, [editor]);

  // Handle external content updates
  useEffect(() => {
    if (content !== lastContentRef.current) {
      lastContentRef.current = content;

      // Try markdown deserialization first
      const markdownNodes = deserializeMarkdown(content);
      if (markdownNodes) {
        (editor as any).children = markdownNodes;
        editor.tf.setValue(markdownNodes);
        return;
      }

      const newValue = textToValue(content);
      (editor as any).children = newValue;
      editor.tf.setValue(newValue);
    }
  }, [content, editor, deserializeMarkdown]);

  // Deserialize markdown on initial mount (after editor is ready)
  useEffect(() => {
    if (hasInitializedMarkdown.current) return;
    if (!content || !editor.api.markdown) return;

    hasInitializedMarkdown.current = true;

    const markdownNodes = deserializeMarkdown(content);
    if (markdownNodes) {
      (editor as any).children = markdownNodes;
      editor.tf.setValue(markdownNodes);
    }
  }, [content, editor, deserializeMarkdown]);

  // Focus editor when isFocused changes to true
  useEffect(() => {
    if (isFocused && contentRef.current) {
      const editable = contentRef.current.querySelector('[contenteditable="true"]');
      if (editable instanceof HTMLElement) {
        editable.focus();
        // Move cursor to end
        const endPoint = Editor.end(editor as any, []);
        Transforms.select(editor as any, endPoint);
      }
    }
  }, [isFocused, editor]);

  // Handle keyboard events with cursor-aware navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Tab - indent/outdent (always intercept)
    if (e.key === 'Tab') {
      e.preventDefault();
      onTreeAction(e.shiftKey ? 'outdent' : 'indent');
      return;
    }

    // Ctrl+Enter - zoom into block (set pane root to this block)
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onTreeAction('zoomIntoBlock');
      return;
    }

    // Enter - execute sh:: block OR new block after
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const currentText = valueToText(editor.children);
      // If it's an sh:: block and we have an execute handler, run it
      if (currentText.trim().startsWith('sh::') && onExecute) {
        onExecute();
      } else {
        onTreeAction('newBlockAfter');
      }
      return;
    }

    // ArrowUp - navigate to previous block only if at editor start
    if (e.key === 'ArrowUp') {
      if (isCursorAtEditorStart(editor)) {
        e.preventDefault();
        onNavigateUp();
      }
      // Otherwise let Slate handle moving up within multi-line content
      return;
    }

    // ArrowDown - navigate to next block only if at editor end
    if (e.key === 'ArrowDown') {
      if (isCursorAtEditorEnd(editor)) {
        e.preventDefault();
        onNavigateDown();
      }
      // Otherwise let Slate handle moving down within multi-line content
      return;
    }

    // Backspace at start of empty block - delete block
    if (e.key === 'Backspace') {
      const currentText = valueToText(editor.children);
      if (currentText === '' || (isCursorAtEditorStart(editor) && currentText === '')) {
        e.preventDefault();
        onTreeAction('deleteIfEmpty');
      }
    }
  }, [editor, onNavigateUp, onNavigateDown, onTreeAction, onExecute]);

  // Determine styling based on block type
  const typeClass = blockType === 'sh' ? 'block-sh' :
                    blockType === 'output' ? 'block-output' :
                    blockType === 'error' ? 'block-error' :
                    blockType === 'ctx' ? 'block-ctx' :
                    blockType === 'ai' ? 'block-ai' : '';

  return (
    <div ref={contentRef} className="flex-1 min-w-0">
      <Plate editor={editor} onChange={handleChange}>
        <PlateContent
          className={`plate-editor outline-none w-full ${typeClass}`}
          onKeyDown={handleKeyDown}
          onFocus={onFocus}
          placeholder="Type here..."
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </Plate>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MARKDOWN PREVIEW (for output blocks)
// ═══════════════════════════════════════════════════════════════

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

export function MarkdownPreview({ content, className = '' }: MarkdownPreviewProps) {
  // Create read-only editor with markdown deserialized
  const editor = usePlateEditor({
    value: [{ type: 'p', children: [{ text: '' }] }],
    plugins: [
      ParagraphPlugin.configure({ render: { node: ParagraphElement } }),
      H1Plugin.configure({ node: { component: H1Element } }),
      H2Plugin.configure({ node: { component: H2Element } }),
      H3Plugin.configure({ node: { component: H3Element } }),
      CodeBlockPlugin.configure({ render: { node: CodeBlockElement } }),
      CodeLinePlugin.configure({ render: { node: CodeLineElement } }),
      BoldPlugin.configure({ render: { leaf: BoldLeaf } }),
      ItalicPlugin.configure({ render: { leaf: ItalicLeaf } }),
      StrikethroughPlugin.configure({ render: { leaf: StrikethroughLeaf } }),
      CodePlugin.configure({ render: { leaf: CodeLeaf } }),
      MarkdownPlugin.configure({ options: { remarkPlugins: [remarkGfm] } }),
    ],
  });

  // Deserialize markdown on mount/change
  useEffect(() => {
    if (content && editor.api.markdown) {
      try {
        const nodes = editor.api.markdown.deserialize(content);
        if (nodes && nodes.length > 0) {
          editor.tf.setValue(nodes);
        }
      } catch (e) {
        // Fallback to plain text
        editor.tf.setValue([{ type: 'p', children: [{ text: content }] }]);
      }
    }
  }, [content, editor]);

  return (
    <Plate editor={editor}>
      <PlateContent
        className={`plate-editor outline-none ${className}`}
        readOnly
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
    </Plate>
  );
}

export default PlateBlock;
