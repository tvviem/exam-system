import { ImageOff } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mediaSrcSet, mediaUrl } from '../illustrations';
import { Dialog } from '.';

// Hình minh họa trong nội dung Câu hỏi (Q141): tải lười, trình duyệt chọn cỡ vừa màn hình, chạm để phóng to.

const SIZES = '(min-width: 768px) 640px, 100vw';

/** Ảnh có `srcset`; lỗi tải (mất quyền, ảnh đã xóa) hiện khung thông báo thay vì ô ảnh vỡ. */
export function IllustrationPicture({ id, alt }: { id: string; alt: string }) {
  const { t } = useTranslation();
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <span className="inline-flex min-h-24 items-center gap-2 rounded-lg border border-dashed border-border-strong px-3 text-sm text-fg-muted">
        <ImageOff aria-hidden className="size-5" />
        {t('illustration.unavailable')}
      </span>
    );
  }
  return (
    <img
      src={mediaUrl(id, 960)}
      srcSet={mediaSrcSet(id)}
      sizes={SIZES}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setBroken(true)}
      className="block h-auto max-h-[28rem] w-auto max-w-full rounded-lg bg-surface-muted object-contain"
    />
  );
}

/** Ảnh ở chế độ đọc: chạm để xem bản lớn trong hộp thoại. */
export function IllustrationFigure({ id, alt }: { id: string; alt: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <figure className="my-1">
      <button
        type="button"
        aria-label={t('illustration.zoom', { alt })}
        onClick={() => setOpen(true)}
        className="block max-w-full cursor-zoom-in rounded-lg pointer-coarse:min-h-12"
      >
        <IllustrationPicture id={id} alt={alt} />
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('illustration.title')} size="xl">
        <img
          src={mediaUrl(id, 1600)}
          alt={alt}
          className="mx-auto block h-auto max-h-[70dvh] w-auto max-w-full object-contain"
        />
        <p className="text-sm text-fg-muted">{alt}</p>
      </Dialog>
    </figure>
  );
}
