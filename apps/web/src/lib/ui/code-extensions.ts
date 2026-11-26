import Code from '@tiptap/extension-code';
import CodeBlock from '@tiptap/extension-code-block';

// Mã lệnh, bước M1 (docs/plan/ma-lenh-trong-cau-hoi-thiet-ke.md mục 5): trình soạn đọc và giữ được khối mã, mã trong dòng đã
// có, nhưng chưa cho tạo mới. Bỏ phím tắt, gõ tắt và việc nhận mã từ HTML dán vào; phần sửa chữ trong khối mã giữ nguyên.

export const KeepCode = Code.extend({
  parseHTML: () => [],
  addKeyboardShortcuts: () => ({}),
  addInputRules: () => [],
  addPasteRules: () => [],
});

export const KeepCodeBlock = CodeBlock.extend({
  parseHTML: () => [],
  addKeyboardShortcuts() {
    const { 'Mod-Alt-c': _toggle, ...editing } = this.parent?.() ?? {};
    return editing;
  },
  addInputRules: () => [],
  addProseMirrorPlugins: () => [],
});
