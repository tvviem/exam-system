import { Ellipsis } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface RowMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  /** Mục bị khóa vẫn hiện, kèm `hint` giải thích vì sao. */
  disabled?: boolean;
  hint?: string;
  /** Mục đang chọn (ví dụ Phần đang xem): đánh dấu và báo cho trình đọc màn hình. */
  current?: boolean;
}

const MENU_WIDTH = 224;

/**
 * Menu "…" gom hành động phụ của một dòng (docs/ui-design.md mục 9). Menu định vị `fixed` theo nút nên không bị
 * vùng cuộn hay <dialog> cắt; mũi tên lên/xuống đổi mục, Esc đóng và trả focus về nút, bấm ra ngoài hoặc cuộn thì đóng.
 */
export function RowMenu({
  label,
  items,
  trigger,
  width = MENU_WIDTH,
}: {
  label: string;
  items: RowMenuItem[];
  /** Chữ trên nút mở; không có thì nút "…" chỉ có biểu tượng. */
  trigger?: ReactNode;
  width?: number;
}) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  // Nơi dựng menu: <dialog> cha nếu có (lớp trên cùng của trình duyệt), không thì <body>. Dựng tại chỗ sẽ bị kẹt trong lớp xếp chồng của
  // thanh dính (z-10) và nằm dưới thanh tab (z-30) trên điện thoại.
  const [host, setHost] = useState<Element | null>(null);
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
    const height = Math.min(items.length * 56 + 16, window.innerHeight * 0.6);
    const below = box.bottom + 4;
    const top = below + height > window.innerHeight ? Math.max(8, box.top - height - 4) : below;
    const left = Math.min(Math.max(8, box.right - width), window.innerWidth - width - 8);
    setHost(button.current?.closest('dialog') ?? document.body);
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
        className={
          trigger
            ? 'inline-flex min-h-12 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 text-sm font-semibold tabular-nums hover:bg-primary-soft pointer-fine:min-h-9'
            : 'inline-flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-lg text-fg-muted hover:bg-primary-soft hover:text-fg pointer-fine:size-9'
        }
      >
        {trigger ?? <Ellipsis aria-hidden className="size-5" />}
      </button>
      {open &&
        host &&
        createPortal(
          <div
            ref={menu}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onKeyDown}
            style={{ top: position.top, left: position.left, width }}
            className="fixed z-50 flex max-h-[60dvh] flex-col gap-0.5 overflow-y-auto rounded-xl border border-border bg-surface-raised p-1 shadow-lg"
          >
            {items.map((item, index) => (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: nhãn có thể trùng (hai Phần cùng tên); thứ tự mục cố định trong lúc mở
                key={`${index}-${item.label}`}
                type="button"
                role="menuitem"
                aria-current={item.current ? 'true' : undefined}
                disabled={item.disabled}
                onClick={() => {
                  close(false);
                  item.onSelect();
                }}
                className={`flex min-h-12 w-full cursor-pointer flex-col justify-center rounded-lg px-3 text-left text-sm font-medium pointer-fine:min-h-10 disabled:cursor-not-allowed disabled:opacity-60 ${
                  item.danger
                    ? 'text-danger hover:bg-danger-soft'
                    : item.current
                      ? 'bg-primary-soft hover:bg-primary-soft'
                      : 'hover:bg-primary-soft'
                }`}
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  {item.icon}
                  <span className="min-w-0 wrap-anywhere">{item.label}</span>
                </span>
                {item.hint && (
                  <span className="text-xs font-normal text-fg-muted">{item.hint}</span>
                )}
              </button>
            ))}
          </div>,
          host,
        )}
    </>
  );
}
