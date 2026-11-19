import { Inject, Injectable } from '@nestjs/common';
import type { IllustrationFiles } from '../../../common/illustration-files';
import { MEDIA_STORE, type MediaStore } from '../../../media/media-store';
import { variantKeyOf } from './illustration-keys';

/** Cài đặt cổng `ILLUSTRATION_FILES` (xuất đề). */
@Injectable()
export class IllustrationFilesService implements IllustrationFiles {
  constructor(@Inject(MEDIA_STORE) private readonly media: MediaStore) {}

  async variant(illustrationId: string, side: number) {
    try {
      return new Uint8Array(await this.media.get(variantKeyOf(illustrationId, side)));
    } catch {
      return null;
    }
  }
}
