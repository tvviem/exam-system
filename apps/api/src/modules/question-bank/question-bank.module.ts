import { Module } from '@nestjs/common';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { TopicsController } from './topics.controller';
import { TopicsService } from './topics.service';

// Quyền truy cập (AuthGuard) do IdentityModule đăng ký toàn cục.
@Module({
  controllers: [TopicsController, QuestionsController],
  providers: [TopicsService, QuestionsService],
})
export class QuestionBankModule {}
