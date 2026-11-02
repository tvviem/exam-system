import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../../lib/errors';
import { formatDateTime } from '../../../../lib/format';
import { accessCodeSuggestionQuery, createSession } from '../../../../lib/sessions';
import { Button, Card, ErrorMessage, PrimaryButton } from '../../../../lib/ui';
import { Breadcrumb } from '../../../../lib/ui/breadcrumb';
import { PageHeader } from '../../../../lib/ui/page-header';
import {
  emptySessionDraft,
  GROUP_FIELDS,
  inputOf,
  invalidFields,
  type SessionDraft,
  SessionFields,
  type SessionGroup,
} from '../../../../lib/ui/session-fields';
import { StickyActionBar } from '../../../../lib/ui/sticky-action-bar';
import { useToast } from '../../../../lib/ui/toast';
import { vnInputToIso } from '../../../../lib/vn-time';

export const Route = createFileRoute('/_authed/examiner/sessions/new')({
  component: NewSessionPage,
});

const STEPS: SessionGroup[] = ['exam', 'times', 'rules'];

/** Tạo Phiên thi theo 3 bước (Bộ đề và tên, Thời gian, Thiết lập làm bài); tạo xong sang tab Danh sách dự thi. */
function NewSessionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<SessionDraft>(emptySessionDraft);
  const [codeBusy, setCodeBusy] = useState(false);
  const patch = (change: Partial<SessionDraft>) => setDraft((d) => ({ ...d, ...change }));
  const group = STEPS[step] as SessionGroup;
  const invalid = invalidFields(draft);
  const stepOk = GROUP_FIELDS[group].every((field) => !invalid.has(field));

  const suggest = async () => {
    setCodeBusy(true);
    try {
      const { accessCode } = await queryClient.fetchQuery(
        accessCodeSuggestionQuery(
          vnInputToIso(draft.opensAt),
          vnInputToIso(draft.closesAt),
          Date.now(),
        ),
      );
      patch({ accessCode });
    } catch (error) {
      toast(errorMessage(t, error), 'error');
    } finally {
      setCodeBusy(false);
    }
  };

  // Vào bước cuối mà chưa có mã thì gợi ý sẵn một mã chưa dùng trong Khung giờ này.
  // biome-ignore lint/correctness/useExhaustiveDependencies: chỉ chạy khi đổi bước
  useEffect(() => {
    if (group === 'rules' && !draft.accessCode) void suggest();
  }, [group]);

  const create = useMutation({
    mutationFn: () => createSession(inputOf(draft)),
    onSuccess: async (session) => {
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
      toast(t('session.action.created'));
      await navigate({
        to: '/examiner/sessions/$sessionId',
        params: { sessionId: session.id },
        search: { tab: 'roster' },
      });
    },
  });

  const last = step === STEPS.length - 1;
  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb
        items={[
          { label: t('session.crumb.list'), to: '/examiner/sessions' },
          { label: t('session.crumb.new') },
        ]}
      />
      <PageHeader title={t('session.create')} />
      <nav aria-label={t('session.wizard.label')}>
        <p aria-current="step" className="text-sm font-semibold text-on-primary-soft">
          {t('session.wizard.step', {
            current: step + 1,
            total: STEPS.length,
            name: t(`session.wizard.steps.${group}`),
          })}
        </p>
        <div aria-hidden className="mt-2 flex gap-1">
          {STEPS.map((name, index) => (
            <span
              key={name}
              className={`h-1.5 flex-1 rounded-full ${index <= step ? 'bg-primary' : 'bg-border'}`}
            />
          ))}
        </div>
      </nav>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <Card>
          <SessionFields
            group={group}
            draft={draft}
            patch={patch}
            invalid={invalid}
            onSuggestCode={suggest}
            codeBusy={codeBusy}
          />
        </Card>
        <Summary draft={draft} />
      </div>

      <ErrorMessage>{create.isError && errorMessage(t, create.error)}</ErrorMessage>
      <StickyActionBar align="end">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {step > 0 && (
            <Button onClick={() => setStep(step - 1)}>{t('session.wizard.back')}</Button>
          )}
          {last ? (
            <PrimaryButton
              loading={create.isPending}
              disabled={invalid.size > 0 || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? t('session.wizard.creating') : t('session.wizard.submit')}
            </PrimaryButton>
          ) : (
            <PrimaryButton disabled={!stepOk} onClick={() => setStep(step + 1)}>
              {t('session.wizard.next')}
            </PrimaryButton>
          )}
        </div>
      </StickyActionBar>
    </div>
  );
}

/** Tóm tắt những gì đã chọn, hiện bên phải trên màn hình rộng và dưới biểu mẫu trên điện thoại. */
function Summary({ draft }: { draft: SessionDraft }) {
  const { t } = useTranslation();
  const opens = draft.opensAt ? formatDateTime(vnInputToIso(draft.opensAt)) : null;
  const closes = draft.closesAt ? formatDateTime(vnInputToIso(draft.closesAt)) : null;
  return (
    <Card className="flex flex-col gap-1 text-sm">
      <p className="font-medium">{draft.title || t('session.field.name')}</p>
      {opens && closes && <p className="text-fg-muted">{t('session.window', { opens, closes })}</p>}
      <p className="text-fg-muted">
        {t('session.overview.durationValue', { minutes: draft.durationMinutes })}
      </p>
    </Card>
  );
}
