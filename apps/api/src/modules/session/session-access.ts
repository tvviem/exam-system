import { phaseOf, type SessionPhase } from '@exam/shared';
import { and, eq } from 'drizzle-orm';
import { ApiError } from '../../common/api-error';
import type { Database, Transaction } from '../../db/db.module';
import { sessions } from './session.schema';

export type SessionRow = typeof sessions.$inferSelect;

/** Phiên thi của `ownerId`, hoặc NOT_FOUND (của người khác coi như không tồn tại). */
export async function findOwnedSession(
  db: Pick<Database, 'select'>,
  ownerId: string,
  id: string,
): Promise<SessionRow> {
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.ownerId, ownerId)));
  if (!row) throw new ApiError('NOT_FOUND');
  return row;
}

/** Như `findOwnedSession` nhưng khóa dòng đến hết giao dịch, để các thao tác lên cùng Phiên thi nối đuôi nhau. */
export async function lockOwnedSession(
  tx: Transaction,
  ownerId: string,
  id: string,
): Promise<SessionRow> {
  const [row] = await tx
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.ownerId, ownerId)))
    .for('update');
  if (!row) throw new ApiError('NOT_FOUND');
  return row;
}

const OVER: Partial<Record<SessionPhase, string>> = {
  closed: 'WINDOW_CLOSED',
  cancelled: 'SESSION_CANCELLED',
};

/** Chặn thao tác khi Phiên thi đã Đã đóng hoặc Đã hủy. */
export function requireNotOver(session: SessionRow, now: Date): SessionPhase {
  const phase = phaseOf(session, now);
  const reason = OVER[phase];
  if (reason) throw new ApiError('INVALID_STATE', { reason });
  return phase;
}
