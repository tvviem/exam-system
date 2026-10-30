import type { RichText } from '@exam/shared';
import type { ReactNode } from 'react';
import { MathView } from './math-view';

// Dựng nội dung từ JSON thành phần tử React, không dùng HTML thô (Q114): không có đường cho XSS.

type Block = RichText['content'][number];
type Inline = NonNullable<Extract<Block, { type: 'paragraph' }>['content']>[number];

const MARK_TAG = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
  superscript: 'sup',
  subscript: 'sub',
} as const;

function InlineNode({ node }: { node: Inline }) {
  if (node.type === 'hardBreak') return <br />;
  if (node.type === 'math')
    return <MathView latex={node.attrs.latex} display={node.attrs.display} />;
  let content: ReactNode = node.text;
  for (const mark of node.marks ?? []) {
    const Tag = MARK_TAG[mark.type];
    content = <Tag>{content}</Tag>;
  }
  return <>{content}</>;
}

function Paragraph({ block }: { block: Extract<Block, { type: 'paragraph' }> }) {
  return (
    <p>
      {(block.content ?? []).map((node, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: nội dung chỉ đọc, không đổi thứ tự
        <InlineNode key={index} node={node} />
      ))}
    </p>
  );
}

function BlockNode({ block }: { block: Block }) {
  if (block.type === 'paragraph') return <Paragraph block={block} />;
  const items = block.content.map((item, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: nội dung chỉ đọc, không đổi thứ tự
    <li key={index}>
      {item.content.map((paragraph, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: nội dung chỉ đọc, không đổi thứ tự
        <Paragraph key={i} block={paragraph} />
      ))}
    </li>
  ));
  return block.type === 'bulletList' ? (
    <ul className="list-disc pl-6">{items}</ul>
  ) : (
    <ol className="list-decimal pl-6" start={block.attrs?.start}>
      {items}
    </ol>
  );
}

/** Nội dung có định dạng ở chế độ chỉ đọc. */
export function RichTextView({ doc, className = '' }: { doc: RichText; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 break-words ${className}`}>
      {doc.content.map((block, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: nội dung chỉ đọc, không đổi thứ tự
        <BlockNode key={index} block={block} />
      ))}
    </div>
  );
}
