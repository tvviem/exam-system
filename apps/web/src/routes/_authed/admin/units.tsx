import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Pencil, Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createUnit, type Unit, unitsQuery, updateUnit } from '../../../lib/admin';
import { errorMessage } from '../../../lib/errors';
import { Button, Dialog, ErrorMessage, PrimaryButton, TextField } from '../../../lib/ui';
import { EmptyState, ListSkeleton } from '../../../lib/ui/admin';
import { PageHeader } from '../../../lib/ui/page-header';
import { useToast } from '../../../lib/ui/toast';

export const Route = createFileRoute('/_authed/admin/units')({
  component: UnitsPage,
});

function UnitsPage() {
  const { t } = useTranslation();
  const units = useQuery(unitsQuery);
  // null: đóng; 'new': thêm mới; Unit: sửa Đơn vị đó.
  const [editing, setEditing] = useState<Unit | 'new' | null>(null);

  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title={t('admin.units.heading')}
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus aria-hidden className="size-5" />
            {t('admin.units.add')}
          </Button>
        }
      />
      {units.isPending ? (
        <ListSkeleton rows={3} />
      ) : units.isError ? (
        <ErrorMessage>{errorMessage(t, units.error)}</ErrorMessage>
      ) : units.data.length === 0 ? (
        <EmptyState>{t('admin.units.empty')}</EmptyState>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {units.data.map((unit) => (
            <li key={unit.id} className="flex items-center gap-3 px-4 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{unit.name}</p>
                <p className="text-sm text-fg-muted">{unit.code}</p>
              </div>
              <Button
                variant="ghost"
                aria-label={t('admin.units.editNamed', { name: unit.name })}
                onClick={() => setEditing(unit)}
              >
                <Pencil aria-hidden className="size-5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <UnitDialog unit={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}

function UnitDialog({ unit, onClose }: { unit: Unit | null; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ code: unit?.code ?? '', name: unit?.name ?? '' });
  const mutation = useMutation({
    mutationFn: () => {
      const body = { code: form.code.trim(), name: form.name.trim() };
      return unit ? updateUnit(unit.id, body) : createUnit(body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: unitsQuery.queryKey });
      toast(unit ? t('toast.unitSaved') : t('toast.unitCreated'));
      onClose();
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };
  return (
    <Dialog open onClose={onClose} title={unit ? t('admin.units.edit') : t('admin.units.add')}>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <TextField
          id="unit-code"
          label={t('admin.units.code')}
          required
          maxLength={30}
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value })}
        />
        <TextField
          id="unit-name"
          label={t('admin.units.name')}
          required
          maxLength={200}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <ErrorMessage>{mutation.isError && errorMessage(t, mutation.error)}</ErrorMessage>
        <PrimaryButton type="submit" disabled={mutation.isPending}>
          {t('common.save')}
        </PrimaryButton>
      </form>
    </Dialog>
  );
}
