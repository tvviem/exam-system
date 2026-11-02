import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { IllustrationProcessJob } from './illustrations/illustration-process.job';
import {
  CandidateMediaController,
  IllustrationsController,
  MediaController,
} from './illustrations/illustrations.controller';
import { IllustrationsService } from './illustrations/illustrations.service';
import { QuestionImportCleanupJob } from './imports/question-import-cleanup.job';
import { QuestionImportCommitJob } from './imports/question-import-commit.job';
import { QuestionImportParseJob } from './imports/question-import-parse.job';
import { QuestionImportsController } from './imports/question-imports.controller';
import { QuestionImportsService } from './imports/question-imports.service';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { TopicsController } from './topics.controller';
import { TopicsService } from './topics.service';
import { QuestionBankOwnedContent } from './transfer/question-bank-owned-content';

// Quyền truy cập (AuthGuard) do IdentityModule đăng ký toàn cục.
@Module({
  imports: [AuditModule],
  controllers: [
    TopicsController,
    QuestionsController,
    IllustrationsController,
    MediaController,
    CandidateMediaController,
    QuestionImportsController,
  ],
  providers: [
    TopicsService,
    QuestionsService,
    IllustrationsService,
    IllustrationProcessJob,
    QuestionImportsService,
    QuestionImportParseJob,
    QuestionImportCommitJob,
    QuestionImportCleanupJob,
    QuestionBankOwnedContent,
  ],
  exports: [QuestionBankOwnedContent],
})
export class QuestionBankModule {}
