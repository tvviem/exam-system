import { CircleAlert, CircleCheck } from 'lucide-react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

// Thông báo nổi (docs/ui-design.md mục 11): thao tác thành công hiện vài giây rồi tự mất, không chiếm focus.

type Tone = 'success' | 'error';
interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}

const SUCCESS_MS = 4000;
const ERROR_MS = 8000;

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

/** `const toast = useToast(); toast('Đã lưu')`. Lỗi cần hành động nên hiện ở chỗ xảy ra lỗi, toast chỉ nhắc thêm. */
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
  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Nằm trên thanh tab dưới đáy ở điện thoại */}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {items.map((item) => (
          <ToastView key={item.id} item={item} onDone={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ item, onDone }: { item: ToastItem; onDone: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDone(item.id), item.tone === 'error' ? ERROR_MS : SUCCESS_MS);
    return () => clearTimeout(timer);
  }, [item, onDone]);

  const Icon = item.tone === 'error' ? CircleAlert : CircleCheck;
  return (
    <div
      role="status"
      className="pointer-events-auto flex max-w-md items-center gap-2 rounded-lg bg-fg px-4 py-3 text-sm font-medium text-bg shadow-lg"
    >
      <Icon aria-hidden className="size-5 shrink-0" />
      {item.message}
    </div>
  );
}
