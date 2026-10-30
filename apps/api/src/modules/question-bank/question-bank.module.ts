import { Module } from '@nestjs/common';
import { IllustrationProcessJob } from './illustrations/illustration-process.job';
import { IllustrationsController, MediaController } from './illustrations/illustrations.controller';
import { IllustrationsService } from './illustrations/illustrations.service';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { TopicsController } from './topics.controller';
import { TopicsService } from './topics.service';

// Quyền truy cập (AuthGuard) do IdentityModule đăng ký toàn cục.
@Module({
  controllers: [TopicsController, QuestionsController, IllustrationsController, MediaController],
  providers: [TopicsService, QuestionsService, IllustrationsService, IllustrationProcessJob],
})
export class QuestionBankModule {}
