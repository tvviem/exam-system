import { Global, Module } from '@nestjs/common';
import { CANDIDATE_DIRECTORY } from './common/candidate-directory';
import { EXAM_CATALOG } from './common/exam-catalog';
import { ExamModule } from './modules/exam/exam.module';
import { ExamCatalogService } from './modules/exam/exam-catalog.service';
import { CandidateDirectoryService } from './modules/identity/candidate-directory.service';
import { IdentityModule } from './modules/identity/identity.module';

/** Nối các cổng mà `session` đòi (Q223): `exam` và `identity` cài đặt, các module không import nhau. */
@Global()
@Module({
  imports: [ExamModule, IdentityModule],
  providers: [
    { provide: EXAM_CATALOG, useExisting: ExamCatalogService },
    { provide: CANDIDATE_DIRECTORY, useExisting: CandidateDirectoryService },
  ],
  exports: [EXAM_CATALOG, CANDIDATE_DIRECTORY],
})
export class SessionPortsWiringModule {}
