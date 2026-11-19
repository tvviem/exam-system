import { Global, Module } from '@nestjs/common';
import { ILLUSTRATION_FILES } from './common/illustration-files';
import { SESSION_INFO } from './common/session-info';
import { IllustrationFilesService } from './modules/question-bank/illustrations/illustration-files.service';
import { QuestionBankModule } from './modules/question-bank/question-bank.module';
import { SessionModule } from './modules/session/session.module';
import { SessionInfoService } from './modules/session/session-info.service';

/** Nối các cổng mà `paper` đòi: `session` và `question-bank` cài đặt, các module không import nhau. */
@Global()
@Module({
  imports: [SessionModule, QuestionBankModule],
  providers: [
    { provide: SESSION_INFO, useExisting: SessionInfoService },
    { provide: ILLUSTRATION_FILES, useExisting: IllustrationFilesService },
  ],
  exports: [SESSION_INFO, ILLUSTRATION_FILES],
})
export class PaperPortsWiringModule {}
