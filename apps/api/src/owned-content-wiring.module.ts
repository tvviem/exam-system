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
import { SessionModule } from './modules/session/session.module';
import { SessionOwnedContent } from './modules/session/session-owned-content';

/**
 * Ghép nội dung người dùng sở hữu (Q150, Q183, Q263): ngân hàng câu hỏi chạy trước, rồi Bộ đề đọc quyền sở hữu Câu hỏi
 * vừa đổi trong cùng giao dịch, cuối cùng là Phiên thi (chỉ khi Xóa người dùng). `identity` chỉ biết cổng `OWNED_CONTENT`; hai module nguồn không import nhau.
 */
export class CompositeOwnedContent implements OwnedContent {
  constructor(
    private readonly questionBank: QuestionBankOwnedContent,
    private readonly exams: ExamOwnedContent,
    private readonly sessions: SessionOwnedContent,
  ) {}

  async summaryOf(
    userId: string,
    options: { topicIds?: string[]; recipientId?: string } = {},
  ): Promise<OwnedContentSummary> {
    const { topicIds, recipientId } = options;
    const base = await this.questionBank.summaryOf(userId, { topicIds });
    const all = await this.exams.summaryOf(userId);
    const chosen = topicIds ? await this.exams.summaryOf(userId, topicIds) : undefined;
    const owned = await this.sessions.summaryOf(userId, recipientId);
    return {
      topics: base.topics,
      totals: { ...base.totals, ...all, sessions: owned.sessions.total },
      sessions: owned.sessions,
      ...(owned.recipientInRoster === undefined
        ? {}
        : { recipientInRoster: owned.recipientInRoster }),
      // Chuyển giao Chủ đề không đụng Phiên thi (Q263).
      ...(base.selected && chosen
        ? { selected: { ...base.selected, ...chosen, sessions: 0 } }
        : {}),
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
        // Phiên thi khóa và chuyển sau cùng (Bộ đề, Câu hỏi, rồi Phiên thi theo `id`, Q265); chỉ khi Xóa người dùng.
        let movedSessions = 0;
        if (input.topicIds === 'all') {
          await this.sessions.lock(tx, input.fromId);
          movedSessions = await this.sessions.apply(tx, input);
        }
        return { ...content, ...exams, sessions: movedSessions };
      },
      finish: (committed: boolean) => prepared.finish(committed),
    };
  }
}

@Global()
@Module({
  imports: [QuestionBankModule, ExamModule, SessionModule],
  providers: [
    {
      provide: OWNED_CONTENT,
      inject: [QuestionBankOwnedContent, ExamOwnedContent, SessionOwnedContent],
      useFactory: (
        questionBank: QuestionBankOwnedContent,
        exams: ExamOwnedContent,
        sessions: SessionOwnedContent,
      ) => new CompositeOwnedContent(questionBank, exams, sessions),
    },
  ],
  exports: [OWNED_CONTENT],
})
export class OwnedContentWiringModule {}
