// Bộ đề mẫu bốn Loại câu và câu trả lời mẫu, dùng chung cho `load-exam.cjs` (đo tải) và `demo-room.cjs` (phòng thi thử).
// Đáp án đúng cố định: Chọn một 'a'; Chọn nhiều a và b; Chùm Đúng/Sai/Đúng/Sai; Tự luận có Hướng dẫn chấm. Mỗi câu 1 điểm, Tự luận 2 điểm.

/** Điểm mỗi câu theo Loại: Tự luận 2 điểm, còn lại 1 điểm. */
const pointsOf = (type) => (type === 'essay' ? 2 : 1);

const options = (textDoc) => ['a', 'b', 'c', 'd'].map((id) => ({ id, content: textDoc(`Phương án ${id}`) }));
const payloadOf = {
  single_choice: (textDoc) => ({ options: options(textDoc), key: ['a'], shuffleOptions: true }),
  multiple_choice: (textDoc) => ({ options: options(textDoc), key: ['a', 'b'], shuffleOptions: true, scoringRule: 'proportional' }),
  true_false_cluster: (textDoc) => ({
    statements: [['s1', true], ['s2', false], ['s3', true], ['s4', false]].map(([id, key]) => ({ id, content: textDoc(`Mệnh đề ${id}`), key })),
    scoringRule: 'ladder',
    ladder: [0, 0.25, 0.5, 0.75, 1],
  }),
  essay: (textDoc) => ({ maxLength: 1000, rubric: textDoc('Nêu đủ ý chính, có ví dụ.') }),
};

/** Số câu của từng Loại. Đo tải 40 câu, phòng thi thử 20 câu (docs/plan/slice-5.md, Q322). */
const MIX_LOAD = [['single_choice', 16], ['multiple_choice', 10], ['true_false_cluster', 10], ['essay', 4]];
const MIX_DEMO = [['single_choice', 8], ['multiple_choice', 5], ['true_false_cluster', 5], ['essay', 2]];

/** Tạo các Câu hỏi theo `mix` qua `post(url, body)`; trả id câu hỏi và điểm mỗi câu theo đúng thứ tự. */
async function createMixedQuestions(post, textDoc, topicId, mix) {
  const questionIds = [];
  const points = [];
  for (const [type, count] of mix) {
    for (let i = 0; i < count; i++) {
      const q = await post('/questions', {
        type,
        topicId,
        stem: textDoc(`Câu hỏi ${type} số ${i + 1}`),
        defaultPoints: pointsOf(type),
        tags: [],
        payload: payloadOf[type](textDoc),
      });
      questionIds.push(q.id);
      points.push(pointsOf(type));
    }
  }
  return { questionIds, points };
}

/** Câu trả lời mẫu theo Loại câu; `i` (người) và `salt` (câu) làm kết quả khác nhau: có câu đúng, một phần, sai. */
function answerFor(item, i, salt) {
  switch (item.type) {
    case 'single_choice':
      return { optionId: (i + salt) % 3 === 0 ? 'b' : 'a' };
    case 'multiple_choice':
      return { optionIds: (i + salt) % 4 === 0 ? ['a'] : (i + salt) % 4 === 1 ? ['a', 'c'] : ['a', 'b'] };
    case 'true_false_cluster':
      return { answers: { s1: true, s2: false, s3: (i + salt) % 2 === 0, s4: (i + salt) % 5 !== 0 } };
    default:
      return { text: `Bài làm của người ${i}: trình bày ý chính, ví dụ minh họa và kết luận cho câu số ${salt}.` };
  }
}

/** Lý do Phúc khảo mẫu. */
const APPEAL_REASON = 'Em cho rằng đáp án của em đúng, nhờ thầy cô xem lại.';

/** Câu để Phúc khảo trong Kết quả của một người: câu trắc nghiệm chưa đủ điểm, nếu không có thì câu đầu. */
function appealTargetOf(result) {
  return result.items.find((it) => it.type !== 'essay' && it.score !== null && it.score < it.points) ?? result.items[0];
}

module.exports = { MIX_LOAD, MIX_DEMO, createMixedQuestions, answerFor, appealTargetOf, APPEAL_REASON };
