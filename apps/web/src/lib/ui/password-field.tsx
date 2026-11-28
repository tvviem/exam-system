import { Eye, EyeOff } from 'lucide-react';
import { type ComponentProps, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextField } from '.';

/**
 * Ô mật khẩu có nút hiện và ẩn (docs/ui-design.md): mặc định ẩn vì chỗ đông người dễ bị nhìn trộm, chỉ hiện khi người dùng
 * bấm, tự ẩn lại khi gửi biểu mẫu. Không chặn sao chép, dán hay trình quản lý mật khẩu.
 */
export function PasswordField(
  props: Omit<ComponentProps<typeof TextField>, 'type' | 'suffix' | 'ref'>,
) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const form = ref.current?.form;
    const hide = () => setShown(false);
    form?.addEventListener('submit', hide);
    return () => form?.removeEventListener('submit', hide);
  }, []);

  const Icon = shown ? EyeOff : Eye;
  return (
    <TextField
      {...props}
      ref={ref}
      type={shown ? 'text' : 'password'}
      // Đang hiện thì là ô chữ thường: bàn phím không được tự viết hoa hay sửa chính tả mật khẩu.
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      suffix={
        <button
          type="button"
          // Nút cố ý nằm trong ô; bước quét bố cục (e2e/ui-layout) nhận ra nhờ thuộc tính này.
          data-input-suffix
          aria-label={t(shown ? 'passwordField.hide' : 'passwordField.show')}
          aria-controls={props.id}
          aria-describedby={`${props.id}-label`}
          className="absolute inset-y-0 right-0 flex w-12 cursor-pointer items-center justify-center rounded-r-lg text-fg-muted hover:bg-primary-soft"
          // Bấm hay chạm không làm ô mất con trỏ (bàn phím ảo không đóng).
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setShown(!shown)}
        >
          <Icon aria-hidden className="size-5" />
        </button>
      }
    />
  );
}
