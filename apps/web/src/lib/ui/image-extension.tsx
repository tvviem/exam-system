import {
  mergeAttributes,
  Node,
  NodeViewWrapper,
  type ReactNodeViewProps,
  ReactNodeViewRenderer,
} from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import { IllustrationPicture } from './illustration-image';

export interface ImageAttrs {
  illustrationId: string;
  alt: string;
}

interface ImageOptions {
  /** Người dùng bấm vào ảnh đã có để sửa mô tả hoặc gỡ. */
  onEdit: (pos: number, attrs: ImageAttrs) => void;
}

function ImageNodeView({ node, getPos, extension, selected }: ReactNodeViewProps) {
  const { t } = useTranslation();
  const attrs = node.attrs as ImageAttrs;
  return (
    <NodeViewWrapper className="my-2" contentEditable={false}>
      <button
        type="button"
        aria-label={t('editor.imageNode', { alt: attrs.alt })}
        onClick={() => {
          const pos = getPos();
          if (pos !== undefined) (extension.options as ImageOptions).onEdit(pos, attrs);
        }}
        className={`block max-w-full cursor-pointer rounded-lg pointer-coarse:min-h-12 ${
          selected ? 'ring-2 ring-ring/60' : ''
        }`}
      >
        <IllustrationPicture id={attrs.illustrationId} alt={attrs.alt} />
      </button>
    </NodeViewWrapper>
  );
}

/** Hình minh họa đứng riêng một khối (Q137); khớp node `image` của richTextSchema. */
export const ImageNode = Node.create<ImageOptions>({
  name: 'image',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addOptions: () => ({ onEdit: () => {} }),

  addAttributes() {
    return {
      illustrationId: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-illustration') ?? '',
        renderHTML: (attrs) => ({ 'data-illustration': attrs.illustrationId }),
      },
      alt: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-alt') ?? '',
        renderHTML: (attrs) => ({ 'data-alt': attrs.alt }),
      },
    };
  },

  // Sao chép và dán trong trình soạn giữ được ảnh.
  parseHTML: () => [{ tag: 'figure[data-illustration]' }],
  renderHTML: ({ HTMLAttributes }) => ['figure', mergeAttributes(HTMLAttributes)],

  addNodeView: () => ReactNodeViewRenderer(ImageNodeView),
});
