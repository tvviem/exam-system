import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, inArray } from 'drizzle-orm';
import { CANDIDATE_DIRECTORY, type CandidateDirectory } from '../../common/candidate-directory';
import type {
  SessionInfoProvider,
  SessionPaperPerson,
  SessionPaperVariant,
} from '../../common/session-info';
import { type Database, DB } from '../../db/db.module';
import { sessionRoster, sessions, sessionVariantItems, sessionVariants } from './session.schema';
import { SessionVariantsService } from './session-variants.service';

/** Cài đặt cổng `SESSION_INFO` (xuất đề). */
@Injectable()
export class SessionInfoService implements SessionInfoProvider {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CANDIDATE_DIRECTORY) private readonly directory: CandidateDirectory,
    private readonly variants: SessionVariantsService,
  ) {}

  async info(sessionId: string) {
    const [row] = await this.db
      .select({
        sessionId: sessions.id,
        title: sessions.title,
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

  async peopleOf(sessionId: string): Promise<SessionPaperPerson[]> {
    const members = await this.db
      .select({ userId: sessionRoster.userId, classLabel: sessionRoster.classLabel })
      .from(sessionRoster)
      .where(eq(sessionRoster.sessionId, sessionId));
    if (members.length === 0) return [];
    const classOf = new Map(members.map((member) => [member.userId, member.classLabel]));
    const [profiles, { byUser }] = await Promise.all([
      this.directory.page([...classOf.keys()], { sort: 'name', limit: members.length, offset: 0 }),
      this.variants.rosterVariantsOf(this.db, sessionId),
    ]);
    return profiles.items.map((profile) => ({
      code: profile.code,
      fullName: profile.fullName,
      classLabel: classOf.get(profile.id) ?? null,
      variantNumber: byUser.get(profile.id)?.number ?? null,
      variantLabel: byUser.get(profile.id)?.label ?? null,
    }));
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
