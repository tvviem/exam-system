import { TAG_GUIDE, TAG_GUIDE_TITLE } from '@exam/shared';
import { Lightbulb } from 'lucide-react';

/** Hướng dẫn đặt tag, đóng sẵn: người đã quen không bị chiếm chỗ (docs/plan/loc-nhieu-tag-thiet-ke.md). */
export function TagGuide() {
  return (
    <details className="text-sm">
      <summary className="flex min-h-12 w-fit cursor-pointer items-center gap-2 font-medium text-primary pointer-fine:min-h-8">
        <Lightbulb aria-hidden className="size-4 shrink-0" />
        {TAG_GUIDE_TITLE}
      </summary>
      <dl className="mt-1 flex flex-col gap-2 rounded-lg border border-border bg-bg p-3">
        {TAG_GUIDE.map((rule) => (
          <div key={rule.title}>
            <dt className="font-semibold">{rule.title}</dt>
            <dd className="text-fg-muted wrap-anywhere">{rule.text}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
