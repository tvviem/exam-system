import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { type Database, DB } from '../../../db/db.module';
import { MEDIA_STORE, type MediaStore } from '../../../media/media-store';
import { JobRegistry } from '../../../queue/job-queue';
import { illustrations } from '../question-bank.schema';
import { uploadKeyOf, variantKeyOf } from './illustrations.service';
import { ImageProcessingError, makeVariants } from './image-processing';

/** Job "illustration.process": đọc file tạm, tạo biến thể WebP, xóa file tạm (Q140). */
@Injectable()
export class IllustrationProcessJob implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(MEDIA_STORE) private readonly media: MediaStore,
    private readonly registry: JobRegistry,
  ) {}

  onModuleInit() {
    this.registry.register('illustration.process', ({ illustrationId }) =>
      this.run(illustrationId),
    );
  }

  async run(id: string): Promise<void> {
    const [row] = await this.db
      .select({ id: illustrations.id })
      .from(illustrations)
      .where(and(eq(illustrations.id, id), eq(illustrations.status, 'processing')));
    if (!row) return; // đã xử lý rồi (job chạy lại) hoặc ảnh đã bị xóa

    let variants: Awaited<ReturnType<typeof makeVariants>>;
    try {
      variants = await makeVariants(await this.media.get(uploadKeyOf(id)));
    } catch (error) {
      if (!(error instanceof ImageProcessingError) && !isMissingFile(error)) throw error;
      const reason = error instanceof ImageProcessingError ? error.reason : 'corrupt';
      await this.db
        .update(illustrations)
        .set({ status: 'failed', failureReason: reason, bytes: 0 })
        .where(and(eq(illustrations.id, id), eq(illustrations.status, 'processing')));
      await this.media.delete(uploadKeyOf(id));
      return;
    }

    for (const variant of variants)
      await this.media.put(variantKeyOf(id, variant.side), variant.data);
    const largest = variants[variants.length - 1];
    if (!largest) throw new Error('Không có biến thể nào được tạo');
    const updated = await this.db
      .update(illustrations)
      .set({
        status: 'ready',
        failureReason: null,
        width: largest.width,
        height: largest.height,
        variants: variants.map((variant) => variant.side),
        bytes: variants.reduce((sum, variant) => sum + variant.data.length, 0),
      })
      .where(and(eq(illustrations.id, id), eq(illustrations.status, 'processing')))
      .returning({ id: illustrations.id });
    if (updated.length === 0) {
      // Ảnh bị xóa trong lúc xử lý: dọn các file vừa ghi.
      for (const variant of variants) await this.media.delete(variantKeyOf(id, variant.side));
    }
    await this.media.delete(uploadKeyOf(id));
  }
}

const isMissingFile = (error: unknown) => (error as { code?: string }).code === 'ENOENT';
