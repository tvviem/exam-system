import { and, count, eq } from 'drizzle-orm';
import type { Transaction } from '../../../db/db.module';
import { accountRequestItems, accountRequests } from '../identity.schema';

type Status = (typeof accountRequests.$inferSelect)['status'];

/**
 * Chốt trạng thái yêu cầu sau một đợt duyệt (Q91): còn dòng chờ thì quay về `pending`; hết dòng chờ thì
 * `approved` (mọi dòng thành công), `rejected` (không dòng nào thành công), còn lại `partially_approved`.
 */
export async function settleRequest(
  tx: Transaction,
  requestId: string,
  reviewerId: string,
  now: Date,
): Promise<Status> {
  const rows = await tx
    .select({ outcome: accountRequestItems.outcome, total: count() })
    .from(accountRequestItems)
    .where(eq(accountRequestItems.requestId, requestId))
    .groupBy(accountRequestItems.outcome);
  const total = (outcome: string) => rows.find((r) => r.outcome === outcome)?.total ?? 0;
  const succeeded = total('created') + total('tag_added');
  const failed = total('rejected') + total('skipped');

  let status: Status;
  if (total('pending') > 0) status = 'pending';
  else if (succeeded === 0) status = 'rejected';
  else status = failed === 0 ? 'approved' : 'partially_approved';

  await tx
    .update(accountRequests)
    .set(status === 'pending' ? { status } : { status, reviewedBy: reviewerId, reviewedAt: now })
    .where(and(eq(accountRequests.id, requestId)));
  return status;
}
