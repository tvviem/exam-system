import {
  mergeAttributes,
  Node,
  NodeViewWrapper,
  type ReactNodeViewProps,
  ReactNodeViewRenderer,
} from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import { MathView } from './math-view';

export interface MathAttrs {
  latex: string;
  display: boolean;
}

interface MathOptions {
  /** Người dùng bấm vào công thức đã có để sửa. */
  onEdit: (pos: number, attrs: MathAttrs) => void;
}

function MathNodeView({ node, getPos, extension, selected }: ReactNodeViewProps) {
  const { t } = useTranslation();
  const attrs = node.attrs as MathAttrs;
  return (
    <NodeViewWrapper
      as="span"
      className="inline-block max-w-full align-middle"
      contentEditable={false}
    >
      <button
        type="button"
        aria-label={t('editor.mathNode', { latex: attrs.latex })}
        onClick={() => {
          const pos = getPos();
          if (pos !== undefined) (extension.options as MathOptions).onEdit(pos, attrs);
        }}
        className={`inline-flex max-w-full cursor-pointer items-center overflow-x-auto rounded px-1 hover:bg-primary-soft pointer-coarse:min-h-12 pointer-coarse:min-w-12 pointer-coarse:justify-center ${
          selected ? 'bg-primary-soft ring-2 ring-ring/40' : ''
        }`}
      >
        <MathView latex={attrs.latex} display={attrs.display} />
      </button>
    </NodeViewWrapper>
  );
}

/** Công thức LaTeX nhúng trong dòng (Q127); khớp node `math` của richTextSchema. */
export const MathNode = Node.create<MathOptions>({
  name: 'math',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions: () => ({ onEdit: () => {} }),

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-latex') ?? '',
        renderHTML: (attrs) => ({ 'data-latex': attrs.latex }),
      },
      display: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-display') === 'true',
        renderHTML: (attrs) => ({ 'data-display': String(attrs.display) }),
      },
    };
  },

  // Sao chép và dán trong trình soạn giữ được công thức.
  parseHTML: () => [{ tag: 'span[data-math]' }],
  renderHTML: ({ HTMLAttributes }) => [
    'span',
    mergeAttributes({ 'data-math': '' }, HTMLAttributes),
  ],

  addNodeView: () => ReactNodeViewRenderer(MathNodeView),
});
