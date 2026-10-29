import { createFileRoute } from '@tanstack/react-router';
import { QUESTION_TYPES, type QuestionType } from '../../../../lib/question-bank';
import { QuestionEditor } from '../../../../lib/ui/question-editor';

export const Route = createFileRoute('/_authed/examiner/questions/new')({
  validateSearch: (search: Record<string, unknown>) => ({
    type: QUESTION_TYPES.includes(search.type as QuestionType)
      ? (search.type as QuestionType)
      : ('single_choice' as QuestionType),
    topicId: typeof search.topicId === 'string' && search.topicId ? search.topicId : undefined,
  }),
  staticData: { wide: true },
  component: NewQuestionPage,
});

function NewQuestionPage() {
  const { type, topicId } = Route.useSearch();
  return <QuestionEditor initialType={type} initialTopicId={topicId} />;
}
