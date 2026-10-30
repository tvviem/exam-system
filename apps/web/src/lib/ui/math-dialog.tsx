import { hasForbiddenLatex } from '@exam/shared';
import { MathfieldElement } from 'mathlive';
import 'mathlive/fonts.css';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Dialog, ErrorMessage, PrimaryButton } from '.';
import type { MathAttrs } from './math-extension';
import { latexError } from './math-view';

// Hộp thoại soạn công thức bằng MathLive (Q130). Cả file này tải lười: MathLive chỉ vào trang khi mở hộp thoại.
// Font đi kèm gói (woff2, tự host qua Vite); không tải âm thanh.
MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;

export default function MathDialog({
  initial,
  editing,
  onSubmit,
  onDelete,
  onClose,
}: {
  initial: MathAttrs;
  editing: boolean;
  onSubmit: (attrs: MathAttrs) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement>(null);
  const [latex, setLatex] = useState(initial.latex);
  const [display, setDisplay] = useState(initial.display);
  const [problem, setProblem] = useState<'invalid' | 'forbidden' | null>(null);

  // Dựng ô MathLive; bàn phím ảo gắn vào <dialog> để không bị lớp phủ của hộp thoại che.
  useEffect(() => {
    const mount = host.current;
    if (!mount) return;
    const field = new MathfieldElement();
    field.value = initial.latex;
    field.setAttribute('aria-label', t('editor.mathField'));
    field.className =
      'block w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-xl';
    field.addEventListener('input', () => setLatex(field.value));
    mount.append(field);
    const keyboard = window.mathVirtualKeyboard;
    const dialog = mount.closest('dialog');
    if (keyboard && dialog) keyboard.container = dialog;
    field.focus();
    return () => {
      field.remove();
      if (keyboard) keyboard.container = document.body;
    };
  }, [initial.latex, t]);

  useEffect(() => {
    let cancelled = false;
    if (!latex.trim()) {
      setProblem(null);
    } else if (hasForbiddenLatex(latex)) {
      setProblem('forbidden');
    } else {
      void latexError(latex).then((error) => {
        if (!cancelled) setProblem(error ? 'invalid' : null);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [latex]);

  const ready = latex.trim().length > 0 && problem === null;
  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? t('editor.mathEditTitle') : t('editor.mathInsertTitle')}
    >
      <p className="text-sm text-fg-muted">{t('editor.mathHint')}</p>
      <div ref={host} />
      <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 text-sm pointer-fine:min-h-9">
        <input
          type="checkbox"
          className="size-5"
          checked={display}
          onChange={(e) => setDisplay(e.target.checked)}
        />
        {t('editor.mathDisplay')}
      </label>
      <ErrorMessage>
        {problem === 'forbidden'
          ? t('editor.mathForbidden')
          : problem === 'invalid'
            ? t('editor.mathInvalid')
            : null}
      </ErrorMessage>
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <PrimaryButton disabled={!ready} onClick={() => onSubmit({ latex: latex.trim(), display })}>
          {editing ? t('editor.mathSave') : t('editor.mathInsert')}
        </PrimaryButton>
        {editing && (
          <Button variant="danger-ghost" onClick={onDelete}>
            {t('editor.mathDelete')}
          </Button>
        )}
        <Button onClick={onClose}>{t('common.cancel')}</Button>
      </div>
    </Dialog>
  );
}
