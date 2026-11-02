import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../errors';
import {
  ACCEPTED_IMAGE_TYPES,
  deleteIllustration,
  type Illustration,
  IMAGE_ALT_MAX,
  illustrationQuery,
  illustrationsQuery,
  mediaUrl,
  shrinkForUpload,
  uploadIllustration,
} from '../illustrations';
import { Button, buttonClass, Dialog, ErrorMessage, PrimaryButton, Spinner, TextField } from '.';
import { IllustrationPicture } from './illustration-image';
import type { ImageAttrs } from './image-extension';

// Hộp thoại chèn và sửa Hình minh họa (Q138): tải ảnh mới hoặc chọn từ thư viện của tôi, bắt buộc có mô tả (alt).

function Status({ illustration }: { illustration: Illustration }) {
  const { t } = useTranslation();
  if (illustration.status === 'processing') {
    return (
      <p role="status" className="inline-flex items-center gap-2 text-sm text-fg-muted">
        <Spinner className="size-4" />
        {t('illustration.processing')}
      </p>
    );
  }
  if (illustration.status === 'failed') {
    return (
      <ErrorMessage>
        {t(`illustration.failed.${illustration.failureReason ?? 'corrupt'}`)}
      </ErrorMessage>
    );
  }
  return null;
}

function Library({ onPick }: { onPick: (id: string) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [confirming, setConfirming] = useState<string | null>(null);
  const library = useQuery(illustrationsQuery(page));
  const remove = useMutation({
    mutationFn: deleteIllustration,
    onSuccess: async () => {
      setConfirming(null);
      await queryClient.invalidateQueries({ queryKey: ['illustrations'] });
    },
  });
  const data = library.data;
  if (!data || data.total === 0) {
    return <p className="text-sm text-fg-muted">{t('illustration.libraryEmpty')}</p>;
  }
  const pages = Math.ceil(data.total / data.pageSize);
  return (
    <section aria-labelledby="library-title" className="flex flex-col gap-2">
      <h3 id="library-title" className="text-sm font-semibold">
        {t('illustration.library')}
      </h3>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {data.items.map((item) => (
          <li
            key={item.id}
            className="relative overflow-hidden rounded-lg border border-border bg-surface"
          >
            {item.status === 'ready' ? (
              <button
                type="button"
                aria-label={t('illustration.pick')}
                onClick={() => onPick(item.id)}
                className="block w-full cursor-pointer"
              >
                <img
                  src={mediaUrl(item.id, 480)}
                  alt=""
                  loading="lazy"
                  className="aspect-4/3 w-full bg-surface-muted object-cover"
                />
              </button>
            ) : (
              <div className="flex aspect-4/3 items-center justify-center bg-surface-muted p-2 text-center">
                <Status illustration={item} />
              </div>
            )}
            {confirming === item.id ? (
              <div className="absolute inset-x-1 bottom-1 flex gap-1 rounded-lg bg-surface p-1 shadow">
                <Button
                  variant="danger"
                  className="flex-1 px-2 text-sm"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(item.id)}
                >
                  {t('illustration.deleteConfirm')}
                </Button>
                <Button className="px-2 text-sm" onClick={() => setConfirming(null)}>
                  {t('common.cancel')}
                </Button>
              </div>
            ) : (
              <button
                type="button"
                aria-label={t('illustration.delete')}
                title={item.inUse ? t('illustration.inUse') : t('illustration.delete')}
                disabled={item.inUse}
                onClick={() => setConfirming(item.id)}
                className="absolute top-1 right-1 inline-flex size-9 cursor-pointer items-center justify-center rounded-full bg-surface/90 text-danger shadow hover:bg-danger-soft disabled:cursor-not-allowed disabled:text-fg-muted disabled:opacity-60 pointer-coarse:size-12"
              >
                <Trash2 aria-hidden className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {remove.error && <ErrorMessage>{errorMessage(t, remove.error)}</ErrorMessage>}
      {pages > 1 && (
        <div className="flex items-center justify-between">
          <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>
            {t('common.previous')}
          </Button>
          <span className="text-sm text-fg-muted">{t('illustration.page', { page, pages })}</span>
          <Button disabled={page >= pages} onClick={() => setPage(page + 1)}>
            {t('common.next')}
          </Button>
        </div>
      )}
    </section>
  );
}

export default function ImageDialog({
  initial,
  editing,
  onSubmit,
  onDelete,
  onClose,
}: {
  initial: ImageAttrs | null;
  editing: boolean;
  onSubmit: (attrs: ImageAttrs) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pickedId, setPickedId] = useState<string | null>(initial?.illustrationId ?? null);
  const [alt, setAlt] = useState(initial?.alt ?? '');
  const picked = useQuery({ ...illustrationQuery(pickedId ?? ''), enabled: pickedId !== null });
  const upload = useMutation({
    mutationFn: async (file: File) => uploadIllustration(await shrinkForUpload(file)),
    onSuccess: async (result) => {
      setPickedId(result.id);
      await queryClient.invalidateQueries({ queryKey: ['illustrations'] });
    },
  });

  const ready = picked.data?.status === 'ready';
  const canSubmit = pickedId !== null && ready && alt.trim().length > 0;
  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? t('editor.imageEditTitle') : t('editor.imageInsertTitle')}
    >
      {pickedId === null ? (
        <>
          <p className="text-sm text-fg-muted">{t('illustration.hint')}</p>
          <label
            className={buttonClass(
              'primary',
              'cursor-pointer focus-within:ring-2 focus-within:ring-ring/60',
            )}
          >
            {upload.isPending ? t('illustration.uploading') : t('illustration.choose')}
            <input
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              className="sr-only"
              disabled={upload.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) upload.mutate(file);
              }}
            />
          </label>
          {upload.error && <ErrorMessage>{errorMessage(t, upload.error)}</ErrorMessage>}
          <Library onPick={setPickedId} />
        </>
      ) : (
        <>
          <div className="flex flex-col items-start gap-2">
            {ready ? (
              <IllustrationPicture id={pickedId} alt={alt || t('illustration.preview')} />
            ) : picked.data ? (
              <Status illustration={picked.data} />
            ) : null}
            {!editing && (
              <Button
                onClick={() => {
                  setPickedId(null);
                  upload.reset();
                }}
              >
                {t('illustration.change')}
              </Button>
            )}
          </div>
          <TextField
            id="image-alt"
            label={t('illustration.alt')}
            hint={t('illustration.altHint', { count: alt.length, max: IMAGE_ALT_MAX })}
            maxLength={IMAGE_ALT_MAX}
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
          />
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <PrimaryButton
              disabled={!canSubmit}
              onClick={() => onSubmit({ illustrationId: pickedId, alt: alt.trim() })}
            >
              {editing ? t('editor.imageSave') : t('editor.imageInsert')}
            </PrimaryButton>
            {editing && (
              <Button variant="danger-ghost" onClick={onDelete}>
                {t('editor.imageRemove')}
              </Button>
            )}
            <Button onClick={onClose}>{t('common.cancel')}</Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
