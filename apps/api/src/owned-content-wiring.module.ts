import { Global, Module } from '@nestjs/common';
import { OWNED_CONTENT } from './common/owned-content';
import { QuestionBankModule } from './modules/question-bank/question-bank.module';
import { QuestionBankOwnedContent } from './modules/question-bank/transfer/question-bank-owned-content';

/**
 * Nối cổng `OWNED_CONTENT` (Q150): `identity` đòi cổng, `question-bank` cài đặt, hai module không import nhau.
 * Giống cách `JOB_QUEUE` được nối; api và worker cùng import module này.
 */
@Global()
@Module({
  imports: [QuestionBankModule],
  providers: [{ provide: OWNED_CONTENT, useExisting: QuestionBankOwnedContent }],
  exports: [OWNED_CONTENT],
})
export class OwnedContentWiringModule {}
