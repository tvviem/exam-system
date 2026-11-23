import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { fileSlug } from '../../common/file-slug';
import { safeCell } from '../../common/safe-cell';
import { type ResultRow, ResultsService } from './results.service';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const XLSX_CONTENT_TYPE = XLSX_TYPE;

const dayText = (date: Date) =>
  date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  });

/** Khung giờ trong một ngày thì ghi ngày đó; kéo qua nhiều ngày thì ghi khoảng ngày (Q304). */
const dateRangeText = (opens: Date, closes: Date) =>
  dayText(opens) === dayText(closes) ? dayText(opens) : `${dayText(opens)} – ${dayText(closes)}`;

/** Xuất Excel Kết quả (docs/plan/slice-5.md, PR 5c; Q304): *Tổng hợp* (thông tin chung và bảng người) và *Chi tiết* (mỗi câu một cột). */
@Injectable()
export class ResultsExportService {
  constructor(private readonly results: ResultsService) {}

  async build(userId: string, sessionId: string): Promise<{ file: Buffer; filename: string }> {
    const { payload, ctx } = await this.results.exportData(userId, sessionId);
    const workbook = new ExcelJS.Workbook();
    const summary = workbook.addWorksheet('Tổng hợp');
    const { session, release, people } = payload;
    const hideEssays = payload.status.essayHidden;
    const waiting = people.filter((p) => p.state === 'waiting_essay' || p.essayHidden).length;

    summary.addRow(['Tên Phiên thi', safeCell(session.title)]);
    summary.addRow(['Ngày diễn ra', dateRangeText(session.opensAt, session.closesAt)]);
    summary.addRow(['Thời gian làm bài', `${session.durationMinutes} phút`]);
    summary.addRow(['Tổng số câu', `${session.totalItems} câu`]);
    // Với Phiên thi rút câu đây là điểm tối đa của bộ câu mỗi người nhận (Q388), không phải tổng điểm cả Bộ đề.
    summary.addRow(['Điểm tối đa mỗi người', session.maxScore]);
    if (!release.releasedAt) summary.addRow(['Trạng thái', 'Chưa Công bố']);
    if (waiting > 0) summary.addRow(['Lưu ý', `Còn ${waiting} người chờ chấm câu tự luận`]);
    summary.addRow([]);
    const header = summary.addRow([
      'Mã định danh',
      'Họ và tên',
      'Lớp',
      'Mã đề',
      'Số Lượt',
      'Điểm thô',
      'Điểm tối đa',
      'Điểm sau Mức xử lý',
      'Điểm quy đổi (thang 10)',
      'Ghi chú',
    ]);
    header.font = { bold: true };
    for (const person of people) summary.addRow(summaryRow(person, session.maxScore));
    summary.columns.forEach((column, index) => {
      column.width = [16, 28, 14, 10, 10, 12, 12, 18, 22, 36][index] ?? 14;
    });

    const detail = workbook.addWorksheet('Chi tiết');
    const itemHeaders = ctx.items.map((item) => `Câu ${item.no}`);
    const head = detail.addRow(['Mã định danh', 'Họ và tên', ...itemHeaders]);
    head.font = { bold: true };
    for (const person of people) {
      const rows = new Map(
        (
          ctx.rows.get(
            (person as ResultRow & { countedAttemptId?: string }).countedAttemptId ?? '',
          ) ?? []
        ).map((row) => [row.itemId, row]),
      );
      detail.addRow([
        safeCell(person.code ?? ''),
        safeCell(person.fullName),
        ...ctx.items.map((item) => {
          const row = rows.get(item.itemId);
          if (!row) return '';
          // Chấm ẩn tên còn che điểm tự luận thì trang Chi tiết cũng che, như bảng Kết quả (Q291).
          if (item.type === 'essay' && hideEssays) return 'đang ẩn';
          return row.scoreCenti === null ? 'chờ chấm' : row.scoreCenti / 100;
        }),
      ]);
    }
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return { file: buffer, filename: `ket-qua-${fileSlug(session.title, 'phien-thi')}.xlsx` };
  }
}

function summaryRow(person: ResultRow, maxScore: number) {
  const notes: string[] = [];
  if (person.state === 'no_attempt') notes.push('Chưa làm bài');
  if (person.state === 'waiting_essay' || person.essayHidden) notes.push('chờ chấm');
  if (person.voided) notes.push('Hủy kết quả');
  else if (person.penaltyPercent > 0) notes.push(`trừ ${person.penaltyPercent} %`);
  return [
    safeCell(person.code ?? ''),
    safeCell(person.fullName),
    safeCell(person.classLabel ?? ''),
    safeCell(person.variant ?? ''),
    person.attemptCount,
    person.rawScore ?? '',
    person.state === 'no_attempt' ? '' : maxScore,
    person.finalScore ?? '',
    person.scaledScore ?? '',
    notes.join('; '),
  ];
}
