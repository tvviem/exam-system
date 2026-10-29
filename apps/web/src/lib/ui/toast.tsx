import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Thông báo nổi (docs/ui-design.md mục 11). Thành công: vài giây rồi tự mất. Lỗi cần hành động: ở lại tới khi đóng.
// Nằm phía trên màn hình để không che thanh tab hay thanh hành động dính đáy; vùng chứa là vùng `aria-live` cố định.

type Tone = 'success' | 'error';
interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}

const SUCCESS_MS = 4000;

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

/** `const toast = useToast(); toast('Đã lưu')`. */
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const toast = useCallback((message: string, tone: Tone = 'success') => {
    setItems((current) => [
      ...current.slice(-2),
      { id: Date.now() + Math.random(), message, tone },
    ]);
  }, []);
  const dismiss = useCallback((id: number) => setItems((c) => c.filter((i) => i.id !== id)), []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-[calc(var(--app-header-h)+0.75rem)] z-50 flex flex-col items-center gap-2 px-4"
      >
        {items.map((item) => (
          <ToastView key={item.id} item={item} onDone={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ item, onDone }: { item: ToastItem; onDone: (id: number) => void }) {
  const { t } = useTranslation();
  const isError = item.tone === 'error';
  useEffect(() => {
    if (isError) return; // lỗi ở lại cho tới khi người dùng đóng
    const timer = setTimeout(() => onDone(item.id), SUCCESS_MS);
    return () => clearTimeout(timer);
  }, [item.id, isError, onDone]);

  const Icon = isError ? CircleAlert : CircleCheck;
  return (
    <div
      role={isError ? 'alert' : 'status'}
      className="pointer-events-auto flex max-w-md items-center gap-2 rounded-lg bg-fg px-4 py-3 text-sm font-medium text-bg shadow-lg"
    >
      <Icon aria-hidden className="size-5 shrink-0" />
      {item.message}
      {isError && (
        <button
          type="button"
          aria-label={t('common.close')}
          className="-my-2 -mr-2 ml-1 inline-flex size-10 cursor-pointer items-center justify-center rounded-md hover:bg-bg/15"
          onClick={() => onDone(item.id)}
        >
          <X aria-hidden className="size-4" />
        </button>
      )}
    </div>
  );
}
