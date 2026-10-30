import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { errorMessage } from '../../../../lib/errors';
import { questionQuery } from '../../../../lib/question-bank';
import { ErrorMessage } from '../../../../lib/ui';
import { ListSkeleton } from '../../../../lib/ui/admin';
import { QuestionEditor } from '../../../../lib/ui/question-editor';

export const Route = createFileRoute('/_authed/examiner/questions/$questionId')({
  staticData: { wide: true },
  component: EditQuestionPage,
});

function EditQuestionPage() {
  const { t } = useTranslation();
  const { questionId } = Route.useParams();
  const question = useQuery({ ...questionQuery(questionId), staleTime: 0, gcTime: 0 });
  if (question.isPending) return <ListSkeleton rows={3} />;
  if (question.isError) return <ErrorMessage>{errorMessage(t, question.error)}</ErrorMessage>;
  // key: sau khi tạo Câu mới hay nhân bản, id đổi thì dựng lại trình soạn từ đầu.
  return <QuestionEditor key={question.data.id} question={question.data} />;
}
