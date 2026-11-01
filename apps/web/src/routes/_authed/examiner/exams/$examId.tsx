import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../../lib/errors';
import { examQuery } from '../../../../lib/exams';
import { ErrorMessage } from '../../../../lib/ui';
import { ListSkeleton } from '../../../../lib/ui/admin';
import { ExamEditor } from '../../../../lib/ui/exam-editor';

export const Route = createFileRoute('/_authed/examiner/exams/$examId')({
  staticData: { wide: true },
  component: EditExamPage,
});

function EditExamPage() {
  const { t } = useTranslation();
  const { examId } = Route.useParams();
  // Luôn nạp bản mới khi mở trang để `version` đúng với server (như trình soạn Câu hỏi).
  const exam = useQuery({ ...examQuery(examId), staleTime: 0, gcTime: 0 });
  if (exam.isPending) return <ListSkeleton rows={3} />;
  if (exam.isError) return <ErrorMessage>{errorMessage(t, exam.error)}</ErrorMessage>;
  return <ExamEditor key={exam.data.id} exam={exam.data} />;
}
