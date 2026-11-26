import { CODE_MAX_CHARS, CODE_MAX_LINES } from '@exam/shared';
import CodeBlock from '@tiptap/extension-code-block';
import type { Node } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';
import type { KeyboardShortcutCommand } from '@tiptap/react';

// Khối mã trong trình soạn (docs/plan/ma-lenh-trong-cau-hoi-thiet-ke.md mục 4.3). Mã trong dòng dùng sẵn của StarterKit.

const INDENT_SPACES = 2;

/** Có khối mã nào vượt giới hạn mà schema ở @exam/shared đặt ra. */
function hasOversizedCode(doc: Node): boolean {
  let found = false;
  doc.descendants((node) => {
    if (node.type.name === 'codeBlock') {
      const text = node.textContent.normalize('NFC');
      if (text.length > CODE_MAX_CHARS || text.split('\n').length > CODE_MAX_LINES) found = true;
    }
    return !found;
  });
  return found;
}

/**
 * Khối mã để soạn: Tab và Shift+Tab thụt lề; Escape rồi Tab thì rời ô soạn (không kẹt bàn phím). Thao tác làm khối mã vượt
 * giới hạn bị từ chối ngay và gọi `onTooLong`, để nội dung đang thấy luôn là nội dung sẽ được lưu.
 */
export const authoringCodeBlock = (onTooLong: () => void) =>
  CodeBlock.extend({
    addStorage: () => ({ leaving: false }),
    onSelectionUpdate() {
      this.storage.leaving = false;
    },
    addKeyboardShortcuts() {
      const editing = this.parent?.() ?? {};
      const leaveWithNextTab: KeyboardShortcutCommand = ({ editor }) => {
        if (!editor.isActive(this.name)) return false;
        this.storage.leaving = true;
        return true;
      };
      const indentOrLeave: KeyboardShortcutCommand = (props) => {
        if (!this.storage.leaving) return editing.Tab?.(props) ?? false;
        this.storage.leaving = false;
        return false; // để trình duyệt chuyển tiêu điểm
      };
      return { ...editing, Escape: leaveWithNextTab, Tab: indentOrLeave };
    },
    addProseMirrorPlugins() {
      return [
        ...(this.parent?.() ?? []),
        new Plugin({
          filterTransaction: (transaction, state) => {
            if (!transaction.docChanged || !hasOversizedCode(transaction.doc)) return true;
            if (hasOversizedCode(state.doc)) return true; // đã quá từ trước: cho sửa bớt
            onTooLong();
            return false;
          },
        }),
      ];
    },
  }).configure({
    enableTabIndentation: true,
    tabSize: INDENT_SPACES,
    // Bàn phím điện thoại không tự viết hoa, sửa chính tả trong mã.
    HTMLAttributes: { autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' },
  });
