import { Global, Module } from '@nestjs/common';
import {
  OWNED_CONTENT,
  type OwnedContent,
  type OwnedContentSummary,
  type PreparedTransfer,
} from './common/owned-content';
import type { Transaction } from './db/db.module';
import { ExamModule } from './modules/exam/exam.module';
import { ExamOwnedContent } from './modules/exam/exam-owned-content';
import { QuestionBankModule } from './modules/question-bank/question-bank.module';
import { QuestionBankOwnedContent } from './modules/question-bank/transfer/question-bank-owned-content';

/**
 * Ghép nội dung người dùng sở hữu (Q150, Q183): ngân hàng câu hỏi chạy trước, rồi Bộ đề đọc quyền sở hữu Câu hỏi vừa
 * đổi trong cùng giao dịch. `identity` chỉ biết cổng `OWNED_CONTENT`; hai module nguồn không import nhau.
 */
export class CompositeOwnedContent implements OwnedContent {
  constructor(
    private readonly questionBank: QuestionBankOwnedContent,
    private readonly exams: ExamOwnedContent,
  ) {}

  async summaryOf(
    userId: string,
    options: { topicIds?: string[] } = {},
  ): Promise<OwnedContentSummary> {
    const base = await this.questionBank.summaryOf(userId, options);
    const all = await this.exams.summaryOf(userId);
    const chosen = options.topicIds
      ? await this.exams.summaryOf(userId, options.topicIds)
      : undefined;
    return {
      topics: base.topics,
      totals: { ...base.totals, ...all },
      ...(base.selected && chosen ? { selected: { ...base.selected, ...chosen } } : {}),
    };
  }

  async prepareTransfer(input: {
    fromId: string;
    toId: string;
    topicIds: string[] | 'all';
  }): Promise<PreparedTransfer> {
    const prepared = await this.questionBank.prepareTransfer(input);
    return {
      apply: async (tx: Transaction, donorName: string) => {
        // Bộ đề khóa trước, Câu hỏi sau: cùng thứ tự với Phát hành nên không bế tắc nhau.
        await this.exams.lock(tx, input.fromId);
        const content = await prepared.apply(tx, donorName);
        const exams = await this.exams.apply(tx, {
          fromId: input.fromId,
          toId: input.toId,
          all: input.topicIds === 'all',
        });
        return { ...content, ...exams };
      },
      finish: (committed: boolean) => prepared.finish(committed),
    };
  }
}

@Global()
@Module({
  imports: [QuestionBankModule, ExamModule],
  providers: [
    {
      provide: OWNED_CONTENT,
      inject: [QuestionBankOwnedContent, ExamOwnedContent],
      useFactory: (questionBank: QuestionBankOwnedContent, exams: ExamOwnedContent) =>
        new CompositeOwnedContent(questionBank, exams),
    },
  ],
  exports: [OWNED_CONTENT],
})
export class OwnedContentWiringModule {}
