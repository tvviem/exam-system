import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';
import type { SessionInfoProvider, SessionPaperVariant } from '../../common/session-info';
import { type Database, DB } from '../../db/db.module';
import { sessions, sessionVariantItems, sessionVariants } from './session.schema';

/** Cài đặt cổng `SESSION_INFO` (xuất đề). */
@Injectable()
export class SessionInfoService implements SessionInfoProvider {
  constructor(@Inject(DB) private readonly db: Database) {}

  async info(sessionId: string) {
    const [row] = await this.db
      .select({
        sessionId: sessions.id,
        examId: sessions.examId,
        ownerId: sessions.ownerId,
        opensAt: sessions.opensAt,
        closesAt: sessions.closesAt,
        durationMinutes: sessions.durationMinutes,
      })
      .from(sessions)
      .where(eq(sessions.id, sessionId));
    return row ?? null;
  }

  async variantsOf(sessionId: string): Promise<SessionPaperVariant[]> {
    const variants = await this.db
      .select({
        id: sessionVariants.id,
        number: sessionVariants.number,
        label: sessionVariants.label,
      })
      .from(sessionVariants)
      .where(eq(sessionVariants.sessionId, sessionId))
      .orderBy(asc(sessionVariants.number));
    if (variants.length === 0) return [];
    const items = await this.db
      .select({ variantId: sessionVariantItems.variantId, itemId: sessionVariantItems.itemId })
      .from(sessionVariantItems)
      .where(
        inArray(
          sessionVariantItems.variantId,
          variants.map((variant) => variant.id),
        ),
      );
    return variants.map(({ id, number, label }) => ({
      number,
      label,
      itemIds: items.filter((item) => item.variantId === id).map((item) => item.itemId),
    }));
  }
}
