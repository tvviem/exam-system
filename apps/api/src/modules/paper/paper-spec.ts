import type { QuestionType } from '@exam/shared';
import type { ContentItem, ExamContentData } from '../../common/exam-content';
import type { PaperHeading, PaperSpec } from './paper-document';
import { plainText } from './rich-text';

/** Thời gian của Phiên thi, có khi xuất từ Phiên thi (xuất từ Bộ đề thì không có). */
export interface SessionTimes {
  opensAt: Date;
  closesAt: Date;
  durationMinutes: number;
}

/** Điều Người ra đề nhập khi xuất. */
export interface PaperRequest {
  /** Học phần (không có trong dữ liệu, nhập mỗi lần xuất, Q404). */
  course: string;
  title?: string;
  examCode?: string;
  preset?: PaperSpec['preset'];
  blocks?: PaperSpec['blocks'];
}

const SCHOOL = 'Trường Đại học Bạc Liêu';
const DEFAULT_TITLE = 'THI KẾT THÚC HỌC PHẦN';
const DEFAULT_EXAM_CODE = 'đề chuẩn';
const TIME_ZONE = 'Asia/Ho_Chi_Minh';

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
/** dd/MM/yyyy theo giờ Việt Nam. */
const dateOf = (date: Date) => dateFormat.format(date);

/** Ngày thi: một ngày, hoặc khoảng ngày khi Khung giờ kéo qua nhiều ngày. */
const examDateOf = (session: SessionTimes) => {
  const from = dateOf(session.opensAt);
  const to = dateOf(session.closesAt);
  return from === to ? from : `${from} - ${to}`;
};

type Payload = Record<string, unknown>;

/**
 * Chỉ phần hiển thị của payload cho từng Loại. Bản chụp còn chứa Đáp án đúng (key), hướng dẫn chấm (rubric) và thang điểm;
 * tệp Đề không được chứa chúng (Đáp án chỉ xuất ở tệp riêng). Danh sách cho phép (không phải danh sách cấm) và bắt buộc đủ mọi
 * Loại: thêm Loại mới mà quên ở đây thì không biên dịch được.
 */
const DISPLAY_PAYLOAD: Record<QuestionType, (payload: Payload) => Payload> = {
  single_choice: (payload) => ({ options: contentsOf(payload.options) }),
  multiple_choice: (payload) => ({ options: contentsOf(payload.options) }),
  true_false_cluster: (payload) => ({ statements: contentsOf(payload.statements) }),
  essay: () => ({}),
};

const contentsOf = (list: unknown): { content: unknown }[] =>
  ((list as { content: unknown }[] | undefined) ?? []).map((entry) => ({ content: entry.content }));

const displayPayload = (type: QuestionType, payload: Payload): Payload =>
  (DISPLAY_PAYLOAD[type] as ((payload: Payload) => Payload) | undefined)?.(payload) ?? {};

export const isBlank = (richText: unknown) => plainText(richText).trim() === '';

const formOf = (items: ContentItem[]): string => {
  const essays = items.filter((item) => item.snapshot.type === 'essay').length;
  if (essays === 0) return 'Trắc nghiệm';
  return essays === items.length ? 'Tự luận' : 'Trắc nghiệm và tự luận';
};

/** Khung chung của tệp Đề và tệp Đáp án: trường, Đơn vị, Mã đề, thông tin kỳ thi (hai tệp phải khớp nhau). */
export function paperFrameOf(input: {
  content: ExamContentData;
  session: SessionTimes | null;
  unitName: string | null;
  request: PaperRequest;
}): { school: string; unit: string; examCode: string; heading: PaperHeading } {
  const { content, session, unitName, request } = input;
  const items = content.sections.flatMap((section) => section.items);
  return {
    school: SCHOOL,
    unit: unitName ?? '',
    examCode: request.examCode ?? DEFAULT_EXAM_CODE,
    heading: {
      title: request.title ?? DEFAULT_TITLE,
      examName: content.title,
      course: request.course,
      date: session ? examDateOf(session) : '',
      form: formOf(items),
      duration: session ? `${session.durationMinutes} phút` : '',
    },
  };
}

export function toPaperSpec(input: {
  content: ExamContentData;
  session: SessionTimes | null;
  unitName: string | null;
  request: PaperRequest;
}): PaperSpec {
  const { content, session, unitName, request } = input;
  return {
    ...paperFrameOf({ content, session, unitName, request }),
    preset: request.preset,
    blocks: request.blocks,
    instructions: isBlank(content.instructions) ? undefined : content.instructions,
    sections: content.sections.map((section) => ({
      title: section.title?.trim() ? section.title : null,
      instructions: isBlank(section.instructions) ? undefined : section.instructions,
      items: section.items.map((entry) => ({
        type: entry.snapshot.type,
        stem: entry.snapshot.stem,
        payload: displayPayload(entry.snapshot.type, entry.snapshot.payload),
      })),
    })),
  };
}
