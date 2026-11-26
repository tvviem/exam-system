import type { RichText } from '@exam/shared';
import type { ReactNode } from 'react';
import { IllustrationFigure } from './illustration-image';
import { MathView } from './math-view';

// Dựng nội dung từ JSON thành phần tử React, không dùng HTML thô (Q114): không có đường cho XSS.

type Block = RichText['content'][number];
type Inline = NonNullable<Extract<Block, { type: 'paragraph' }>['content']>[number];

/** Cụm chữ liền (như `p->Next`) không bị ngắt giữa chừng: chỉ ngắt ở khoảng trắng, hoặc khi cụm dài hơn cả khung. */
function CodeTokens({ text }: { text: string }) {
  return text.split(/(\s+)/).map((part, index) =>
    part.trim() === '' ? (
      part
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: nội dung chỉ đọc, không đổi thứ tự
      <span key={index} className="inline-block max-w-full indent-0 [overflow-wrap:anywhere]">
        {part}
      </span>
    ),
  );
}

/**
 * Khối mã trên điện thoại: tự xuống dòng, giữ thụt lề, không cuộn ngang (Q491). Mỗi dòng mã có số thứ tự khi có từ 2 dòng,
 * phần bị xuống dòng không có số và thụt sâu hơn đầu dòng nên không nhầm với dòng mới.
 */
function CodeBlock({ code }: { code: string }) {
  const lines = code.replaceAll('\t', '  ').split('\n');
  const numberWidth = `${String(lines.length).length}ch`;
  return (
    <pre className="whitespace-pre-wrap rounded-lg border border-border bg-bg p-3 font-mono text-sm font-normal leading-relaxed text-fg">
      <code>
        {lines.map((line, index) => {
          const hang = `${line.length - line.trimStart().length + 2}ch`;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: nội dung chỉ đọc, không đổi thứ tự
            <span key={index} className="flex gap-3">
              {lines.length > 1 && (
                <span
                  aria-hidden="true"
                  className="shrink-0 select-none text-right text-fg-muted"
                  style={{ minWidth: numberWidth }}
                >
                  {index + 1}
                </span>
              )}
              <span
                className="min-w-0 flex-1"
                style={{ paddingLeft: hang, textIndent: `-${hang}` }}
              >
                <CodeTokens text={line || ' '} />
              </span>
            </span>
          );
        })}
      </code>
    </pre>
  );
}

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
    // Mã trong dòng không đi cùng định dạng khác.
    if (mark.type === 'code') {
      return (
        <code className="box-decoration-clone rounded bg-bg px-1 font-mono text-[0.9em] text-fg">
          <CodeTokens text={node.text} />
        </code>
      );
    }
    const Tag = MARK_TAG[mark.type];
    content = <Tag>{content}</Tag>;
  }
  return <>{content}</>;
}

function Paragraph({ block }: { block: Extract<Block, { type: 'paragraph' }> }) {
  return (
    // Giữ khoảng trắng như trong trình soạn (thụt lề của đoạn mã), dòng dài vẫn tự xuống.
    <p className="whitespace-pre-wrap">
      {(block.content ?? []).map((node, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: nội dung chỉ đọc, không đổi thứ tự
        <InlineNode key={index} node={node} />
      ))}
    </p>
  );
}

function BlockNode({ block }: { block: Block }) {
  if (block.type === 'paragraph') return <Paragraph block={block} />;
  if (block.type === 'codeBlock') return <CodeBlock code={block.content[0]?.text ?? ''} />;
  if (block.type === 'image') {
    return <IllustrationFigure id={block.attrs.illustrationId} alt={block.attrs.alt} />;
  }
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
