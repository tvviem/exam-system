import { Ellipsis } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

export interface RowMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  /** Mục bị khóa vẫn hiện, kèm `hint` giải thích vì sao. */
  disabled?: boolean;
  hint?: string;
}

const MENU_WIDTH = 224;

/**
 * Menu "…" gom hành động phụ của một dòng (docs/ui-design.md mục 9). Menu định vị `fixed` theo nút nên không bị
 * vùng cuộn hay <dialog> cắt; mũi tên lên/xuống đổi mục, Esc đóng và trả focus về nút, bấm ra ngoài hoặc cuộn thì đóng.
 */
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const open = position !== null;

  const close = (restoreFocus = true) => {
    setPosition(null);
    if (restoreFocus) button.current?.focus();
  };

  const toggle = () => {
    if (open) return close(false);
    const box = button.current?.getBoundingClientRect();
    if (!box) return;
    const height = items.length * 56 + 16;
    const below = box.bottom + 4;
    const top = below + height > window.innerHeight ? Math.max(8, box.top - height - 4) : below;
    const left = Math.min(Math.max(8, box.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - 8);
    setPosition({ top, left });
  };

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) setPosition(null);
    };
    const dismiss = () => setPosition(null);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', dismiss);
    document.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', dismiss);
      document.removeEventListener('scroll', dismiss, true);
    };
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation(); // không để <dialog> cha đóng theo
      return close();
    }
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const enabled = [
      ...(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []),
    ];
    const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
    enabled[(index + step + enabled.length) % enabled.length]?.focus();
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={toggle}
        className="inline-flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-lg text-fg-muted hover:bg-primary-soft hover:text-fg pointer-fine:size-9"
      >
        <Ellipsis aria-hidden className="size-5" />
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
          className="fixed z-50 flex flex-col gap-0.5 rounded-xl border border-border bg-surface-raised p-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                close(false);
                item.onSelect();
              }}
              className={`flex min-h-12 w-full cursor-pointer flex-col justify-center rounded-lg px-3 text-left text-sm font-medium pointer-fine:min-h-10 disabled:cursor-not-allowed disabled:opacity-60 ${
                item.danger ? 'text-danger hover:bg-danger-soft' : 'hover:bg-primary-soft'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                {item.icon}
                {item.label}
              </span>
              {item.hint && <span className="text-xs font-normal text-fg-muted">{item.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
