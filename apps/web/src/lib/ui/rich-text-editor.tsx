import { type RichText, richTextSchema } from '@exam/shared';
import { BulletList, ListItem, OrderedList } from '@tiptap/extension-list';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  type LucideIcon,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Underline as UnderlineIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Trình soạn nội dung có định dạng (Q114). Chỉ bật những node và mark mà schema ở @exam/shared cho phép;
// kết quả luôn được làm sạch rồi kiểm lại bằng richTextSchema trước khi báo ra ngoài.

// Mục danh sách chỉ chứa đoạn văn (không lồng danh sách), khớp richTextSchema.
const FlatListItem = ListItem.extend({ content: 'paragraph' });

const extensions = [
  StarterKit.configure({
    heading: false,
    blockquote: false,
    codeBlock: false,
    code: false,
    horizontalRule: false,
    strike: false,
    link: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
  }),
  BulletList,
  OrderedList,
  FlatListItem,
  Superscript,
  Subscript,
];

type Json = { type?: string; attrs?: Record<string, unknown>; content?: Json[] } & Record<
  string,
  unknown
>;

/** TipTap ghi cả thuộc tính mặc định (ví dụ `type: null` của danh sách); giữ lại đúng những gì schema cho phép. */
function clean(node: Json): Json {
  const { attrs, content, ...rest } = node;
  const out: Json = { ...rest };
  if (node.type === 'orderedList' && typeof attrs?.start === 'number') {
    out.attrs = { start: attrs.start };
  }
  if (content) out.content = content.map(clean);
  return out;
}

export function cleanRichText(json: unknown): RichText | null {
  const parsed = richTextSchema.safeParse(clean(json as Json));
  return parsed.success ? parsed.data : null;
}

function ToolButton({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      // Giữ vùng chọn trong trình soạn khi bấm nút.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`inline-flex size-12 cursor-pointer items-center justify-center rounded-lg pointer-fine:size-9 ${
        active ? 'bg-primary-soft text-on-primary-soft' : 'text-fg-muted hover:bg-primary-soft'
      }`}
    >
      <Icon aria-hidden className="size-5" />
    </button>
  );
}

/**
 * `value` chỉ là giá trị ban đầu: muốn nạp nội dung khác (khôi phục bản nháp) thì đổi `key` để dựng lại.
 * `onChange` nhận nội dung đã làm sạch.
 */
export default function RichTextEditor({
  id,
  label,
  value,
  onChange,
  invalid = false,
  minHeight = 'min-h-24',
}: {
  id: string;
  label: string;
  value: RichText;
  onChange: (doc: RichText) => void;
  invalid?: boolean;
  minHeight?: string;
}) {
  const { t } = useTranslation();
  const editor = useEditor({
    extensions,
    content: value,
    editorProps: {
      attributes: {
        id,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': label,
        'aria-invalid': invalid ? 'true' : 'false',
        class: `${minHeight} px-3 py-2 outline-none [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 [&_p]:my-1`,
      },
    },
    onUpdate: ({ editor: instance }) => {
      const doc = cleanRichText(instance.getJSON());
      if (doc) onChange(doc);
    },
  });

  if (!editor) return null;
  const chain = () => editor.chain().focus();
  return (
    <div
      className={`rounded-lg border bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/40 ${
        invalid ? 'border-danger' : 'border-border-strong'
      }`}
    >
      <div
        role="toolbar"
        aria-label={t('editor.toolbar', { label })}
        className="flex flex-wrap gap-1 border-b border-border p-1"
      >
        <ToolButton
          label={t('editor.bold')}
          icon={Bold}
          active={editor.isActive('bold')}
          onClick={() => chain().toggleBold().run()}
        />
        <ToolButton
          label={t('editor.italic')}
          icon={Italic}
          active={editor.isActive('italic')}
          onClick={() => chain().toggleItalic().run()}
        />
        <ToolButton
          label={t('editor.underline')}
          icon={UnderlineIcon}
          active={editor.isActive('underline')}
          onClick={() => chain().toggleUnderline().run()}
        />
        <ToolButton
          label={t('editor.superscript')}
          icon={SuperscriptIcon}
          active={editor.isActive('superscript')}
          onClick={() => chain().toggleSuperscript().run()}
        />
        <ToolButton
          label={t('editor.subscript')}
          icon={SubscriptIcon}
          active={editor.isActive('subscript')}
          onClick={() => chain().toggleSubscript().run()}
        />
        <ToolButton
          label={t('editor.bulletList')}
          icon={List}
          active={editor.isActive('bulletList')}
          onClick={() => chain().toggleBulletList().run()}
        />
        <ToolButton
          label={t('editor.orderedList')}
          icon={ListOrdered}
          active={editor.isActive('orderedList')}
          onClick={() => chain().toggleOrderedList().run()}
        />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
