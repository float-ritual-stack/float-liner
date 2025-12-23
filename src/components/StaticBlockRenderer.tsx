/**
 * StaticBlockRenderer - Lightweight renderer for non-focused blocks
 *
 * Renders block content without any PlateJS/Slate editor overhead.
 * Uses simple regex-based markdown rendering for performance.
 * This is the performance-critical path - keep it minimal!
 */

import { memo, useMemo } from 'react';
import type { BlockType } from '../lib/types';

interface StaticBlockRendererProps {
  content: string;
  blockType: BlockType;
  onFocus: () => void;
}

/**
 * Parse simple markdown inline formatting to React elements
 * Handles: **bold**, ~~strikethrough~~, *italic*, `code`
 */
function parseInlineMarkdown(text: string): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  let key = 0;

  // Combined regex for inline markdown
  // Order matters: bold (**) and strikethrough (~~) before italic (*) to avoid conflicts
  const inlineRegex = /(\*\*(.+?)\*\*)|(~~(.+?)~~)|(\*(.+?)\*)|(`(.+?)`)/g;

  let lastIndex = 0;
  let match;

  while ((match = inlineRegex.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      result.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // Bold: **text**
      result.push(
        <strong key={key++} className="plate-bold">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // Strikethrough: ~~text~~
      result.push(
        <s key={key++} className="line-through">
          {match[4]}
        </s>
      );
    } else if (match[5]) {
      // Italic: *text*
      result.push(
        <em key={key++} className="plate-italic">
          {match[6]}
        </em>
      );
    } else if (match[7]) {
      // Code: `text`
      result.push(
        <code key={key++} className="plate-code">
          {match[8]}
        </code>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }

  return result.length > 0 ? result : [text];
}

/**
 * Render a single line, detecting headers
 */
function renderLine(line: string, index: number): React.ReactNode {
  const trimmed = line.trimStart();

  // Detect headers
  if (trimmed.startsWith('### ')) {
    return (
      <div key={index} className="plate-h3">
        {parseInlineMarkdown(trimmed.slice(4))}
      </div>
    );
  }
  if (trimmed.startsWith('## ')) {
    return (
      <div key={index} className="plate-h2">
        {parseInlineMarkdown(trimmed.slice(3))}
      </div>
    );
  }
  if (trimmed.startsWith('# ')) {
    return (
      <div key={index} className="plate-h1">
        {parseInlineMarkdown(trimmed.slice(2))}
      </div>
    );
  }

  // Regular paragraph with inline formatting
  return (
    <div key={index} className="my-1">
      {parseInlineMarkdown(line)}
    </div>
  );
}

export const StaticBlockRenderer = memo(function StaticBlockRenderer({
  content,
  blockType,
  onFocus,
}: StaticBlockRendererProps) {
  // Determine styling based on block type
  const typeClass =
    blockType === 'sh'
      ? 'block-sh'
      : blockType === 'output'
      ? 'block-output'
      : blockType === 'error'
      ? 'block-error'
      : blockType === 'ctx'
      ? 'block-ctx'
      : blockType === 'ai'
      ? 'block-ai'
      : '';

  // Parse content into rendered lines
  const rendered = useMemo(() => {
    if (!content) {
      return <div className="text-neutral-500">Type here...</div>;
    }

    const lines = content.split('\n');
    return lines.map((line, i) => renderLine(line, i));
  }, [content]);

  // Activate editor on any keypress (for keyboard navigation)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Don't intercept Tab (let browser handle focus navigation)
    if (e.key === 'Tab') return;
    // Activate the editor for any other key
    onFocus();
  };

  return (
    <div
      className={`flex-1 min-w-0 cursor-text ${typeClass}`}
      onClick={onFocus}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {rendered}
    </div>
  );
});

export default StaticBlockRenderer;
