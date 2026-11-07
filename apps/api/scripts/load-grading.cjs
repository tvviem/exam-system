// Các giai đoạn SAU giờ thi của `load-exam.cjs` (S7, docs/plan/slice-5.md, Q306, Q322): 90 % Lượt bị Buộc nộp cùng lúc → chấm xong, Người ra đề
// chấm Tự luận, xem bảng Kết quả, Công bố, cả phòng mở Kết quả, Phúc khảo, Đính chính cả phòng.
// Mọi bước đi qua HTTP của api thật (worker thật chấm và chấm lại), không gọi service trực tiếp.

/** Ngưỡng p99 (mili giây) của từng nhóm số đo; ngưỡng của Q306 và nguyên tắc "không request nào quá 1 giây". */
const GRADING_LIMITS = {
  forceSubmit: 1000, // Buộc nộp cả phòng (một request)
  saveBusy: 300, // lưu bài của người làm muộn trong lúc 90 % Lượt còn lại đang được chấm
  resultsTable: 500, // mở bảng Kết quả cả phòng
  gradeQueue: 300, // hàng đợi chấm
  gradeOpen: 300, // mở một bài tự luận
  gradeSave: 150, // lưu điểm một bài
  itemStats: 500, // Thống kê câu
  excel: 1000, // xuất Excel
  release: 1000, // Công bố
  myResult: 300, // Người dự thi mở Kết quả, vào rải trong 20 giây
  myResultSpike: 1000, // cả phòng mở Kết quả cùng một khoảnh khắc (Q306 chỉ nêu 300 ms; 1 giây là nguyên tắc "không request nào quá 1 giây")
  appealSend: 1000, // 50 người gửi Phúc khảo cùng lúc
  appealList: 300,
  appealOpen: 300,
  appealResolve: 300,
  correctionPreview: 1000,
  correctionCreate: 300,
};
/** Ngưỡng thời gian chờ (ms): chấm xong 90 % Lượt kể từ Buộc nộp (Q306 nêu 500 Lượt trong 10 giây); chấm lại cả phòng sau Đính chính. */
const GRADE_DONE_LIMIT = 10_000;
const RECORRECT_LIMIT = 10_000;
const APPEALS = 50;
const RESULT_SPREAD_MS = Number(process.env.LOAD_RESULT_SPREAD_SECONDS ?? 20) * 1000; // Người dự thi mở Kết quả rải trong khoảng này
const GRADE_CONCURRENCY = 8;

async function pool(list, size, fn) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, list.length) }, async () => {
      while (next < list.length) await fn(list[next++]);
    }),
  );
}

const { appealTargetOf, APPEAL_REASON } = require('./exam-mix.cjs');

async function runGradingPhases(ctx) {
  const { teacher, db, sessionId, examId, ready, samples, errors, sleep, itemCount } = ctx;
  const say = (text) => console.log(`[sau giờ thi] ${text}`);
  const scalars = {};
  const flags = [];
  for (const label of [...Object.keys(GRADING_LIMITS), 'gradeSaveBulk', 'monitorAfter', 'closeEntry', 'gradeItems', 'correctionItems', 'correctionProgress']) samples[label] ??= [];
  const timed = (label, who, ...args) => who.call(label, ...args);
  const base = `/sessions/${sessionId}`;

  const forced = ready.filter((_, index) => index % 10 !== 9); // 90% bị Buộc nộp cả phòng
  const late = ready.filter((_, index) => index % 10 === 9); // 10% làm muộn, vẫn lưu bài trong lúc phòng đang được chấm
  const gradedCount = async (handles) =>
    (
      await db.query(
        `select count(*)::int as n from response_grades g where g.attempt_id = any($1::uuid[])`,
        [handles.map((h) => h.attemptId)],
      )
    ).rows[0].n;
  const waitGraded = async (handles) => {
    const started = performance.now();
    const want = handles.length * itemCount;
    for (;;) {
      if ((await gradedCount(handles)) >= want) return performance.now() - started;
      if (performance.now() - started > 120_000) throw new Error(`Chưa chấm xong sau 120 giây (${handles.length} Lượt)`);
      await sleep(50);
    }
  };

  // 1. Buộc nộp 90% cùng lúc; 10% làm muộn vẫn lưu bài trong lúc chấm (đo ảnh hưởng tới lưu bài).
  let busy = true;
  const lateWork = Promise.all(
    late.map(async (taker) => {
      while (busy) {
        await sleep(300 + Math.random() * 500);
        if (busy) await taker.saveOne('saveBusy');
      }
    }),
  );
  say(`Buộc nộp ${forced.length} Lượt cùng lúc, ${late.length} Lượt còn làm bài`);
  const t0 = performance.now();
  const submitted = await timed('forceSubmit', teacher, 'POST', `${base}/force-submit`, { attemptIds: forced.map((h) => h.attemptId) });
  if (!submitted) throw new Error('Buộc nộp thất bại');
  await waitGraded(forced);
  scalars.gradeDone = performance.now() - t0; // tính từ lúc gửi Buộc nộp
  say(`chấm xong ${forced.length} Lượt (${forced.length * itemCount} dòng điểm) sau ${scalars.gradeDone.toFixed(0)} ms kể từ Buộc nộp`);

  // 2. Người làm muộn nộp, chờ chấm xong; đóng cửa vào thi.
  busy = false;
  await lateWork;
  const t1 = performance.now();
  for (const taker of late) await taker.finish(true);
  scalars.gradeLate = late.length ? await waitGraded(late) : 0;
  await Promise.all(forced.map((taker) => taker.finish(false)));
  say(`chấm nốt ${late.length} Lượt làm muộn sau ${(performance.now() - t1).toFixed(0)} ms`);
  await timed('closeEntry', teacher, 'POST', `${base}/close-entry`);

  // 3. Người ra đề: bảng Kết quả, chấm Tự luận (hàng đợi ẩn tên, mở bài, lưu điểm), Thống kê câu, Excel.
  await timed('resultsTable', teacher, 'GET', `${base}/results`);
  const essays = (await timed('gradeItems', teacher, 'GET', `${base}/grading/items`))?.items ?? [];
  say(`chấm ${essays.length} câu Tự luận × ${ready.length} bài bằng ${GRADE_CONCURRENCY} luồng`);
  const tGrade = performance.now();
  let graded = 0;
  for (const essay of essays) {
    const queue = (await timed('gradeQueue', teacher, 'GET', `${base}/grading/items/${essay.itemId}/queue?filter=pending`))?.entries ?? [];
    for (const entry of queue.slice(0, 20)) await timed('gradeOpen', teacher, 'GET', `${base}/grading/items/${essay.itemId}/attempts/${entry.attemptId}`);
    // 40 bài đầu của câu đầu chấm lần lượt (một Người ra đề thật chấm từng bài một): đây mới là số đo "lưu điểm một bài" của Q306. Phần còn
    // lại chấm song song 8 luồng chỉ để xong nhanh; số đo của phần đó (`gradeSaveBulk`) chứa thời gian xếp hàng nên không có ngưỡng.
    const save = async (label, entry) => {
      const res = await timed(label, teacher, 'PUT', `${base}/grading/attempts/${entry.attemptId}/items/${essay.itemId}`, { score: 1 + (graded % 3) * 0.5, feedback: null });
      if (res) graded += 1;
    };
    const first = essay === essays[0] ? queue.slice(0, 40) : [];
    for (const entry of first) await save('gradeSave', entry);
    await pool(queue.slice(first.length), GRADE_CONCURRENCY, (entry) => save('gradeSaveBulk', entry));
  }
  scalars.gradeEssays = performance.now() - tGrade;
  say(`đã chấm ${graded} bài tự luận trong ${(scalars.gradeEssays / 1000).toFixed(1)} giây`);
  await timed('itemStats', teacher, 'GET', `${base}/results/item-stats`);
  {
    const started = performance.now();
    const res = await fetch(`${teacher.base}/api${base}/results.xlsx`, { headers: { cookie: [...teacher.cookies].map(([k, v]) => `${k}=${v}`).join('; ') } });
    const bytes = (await res.arrayBuffer()).byteLength;
    samples.excel.push(performance.now() - started);
    if (!res.ok) errors.push(`excel ${res.status}`);
    scalars.excelKB = bytes / 1024;
  }

  // 4. Công bố; 500 Người dự thi mở Kết quả (rải 20 giây, rồi cùng một lúc).
  const released = await timed('release', teacher, 'POST', `${base}/release`, { appealPeriodDays: 3 });
  if (!released) throw new Error('Công bố thất bại');
  const results = new Map();
  await Promise.all(
    ready.map(async (taker) => {
      await sleep(Math.random() * RESULT_SPREAD_MS);
      results.set(taker, await timed('myResult', taker.c, 'GET', `/take/sessions/${taker.sessionId}/result`));
    }),
  );
  await Promise.all(ready.map((taker) => timed('myResultSpike', taker.c, 'GET', `/take/sessions/${taker.sessionId}/result`)));

  // 5. Phúc khảo: một nhóm Người dự thi gửi cùng lúc; Người ra đề xem danh sách, mở, xử lý.
  const wants = [];
  for (const taker of ready) {
    const result = results.get(taker);
    if (result && wants.length < APPEALS) wants.push({ taker, no: appealTargetOf(result).no });
  }
  await Promise.all(
    wants.map(({ taker, no }) =>
      timed('appealSend', taker.c, 'POST', `/take/sessions/${taker.sessionId}/appeals`, { target: 'response', no, reason: APPEAL_REASON }),
    ),
  );
  const open = (await timed('appealList', teacher, 'GET', `${base}/appeals?status=open`))?.items ?? [];
  say(`${wants.length} Phúc khảo đã gửi, ${open.length} đang chờ`);
  for (const a of open.slice(0, 10)) await timed('appealOpen', teacher, 'GET', `${base}/appeals/${a.id}`);
  for (const a of open) await timed('appealResolve', teacher, 'POST', `${base}/appeals/${a.id}/resolve`, { response: 'Đã xem xét lại, ghi nhận một phần.', score: 0.5 });

  // 6. Đính chính cả phòng: đổi đáp án một câu Chọn một, xem trước, xác nhận, chờ worker chấm lại.
  const keyItems = (await timed('correctionItems', teacher, 'GET', `/exams/${examId}/key-correction-items`))?.items ?? [];
  const target = keyItems.find((it) => it.type === 'single_choice');
  if (!target) flags.push('không tìm thấy câu Chọn một để Đính chính');
  else {
    const newKey = ['b'];
    const preview = await timed('correctionPreview', teacher, 'POST', `/exams/${examId}/items/${target.itemId}/key-correction/preview`, { newKey });
    say(`xem trước Đính chính: ${preview?.increase ?? '?'} tăng / ${preview?.decrease ?? '?'} giảm / ${preview?.unchanged ?? '?'} giữ nguyên (${preview?.attempts ?? '?'} Lượt)`);
    const tc = performance.now();
    const created = await timed('correctionCreate', teacher, 'POST', `/exams/${examId}/items/${target.itemId}/key-correction`, { newKey, reason: 'Đáp án đúng là B, đo tải Đính chính.' });
    let progress = null;
    if (created) {
      for (;;) {
        progress = await teacher.call('correctionProgress', 'GET', `/exams/${examId}/key-corrections/${created.id}`);
        if (!progress || progress.status !== 'running') break;
        if (performance.now() - tc > 120_000) break;
        await sleep(100);
      }
      scalars.recorrect = performance.now() - tc;
      scalars.recorrectAttempts = progress?.total ?? 0;
      if (progress?.status !== 'done') flags.push(`Đính chính kết thúc ở trạng thái ${progress?.status}`);
      else if (progress.processed !== progress.total) flags.push(`chấm lại ${progress.processed}/${progress.total} Lượt`);
      else if (preview && progress.increase !== preview.increase) flags.push(`xem trước ${preview.increase} tăng nhưng thực tế ${progress.increase}`);
      say(`Đính chính xong ${progress?.processed}/${progress?.total} Lượt trong ${scalars.recorrect.toFixed(0)} ms (${progress?.increase} tăng, ${progress?.decrease} giảm)`);
    }
    await timed('resultsTable', teacher, 'GET', `${base}/results`);
  }
  return { scalars, flags, limits: GRADING_LIMITS, minSamples: { saveBusy: 20 }, gradeDoneLimit: GRADE_DONE_LIMIT, recorrectLimit: RECORRECT_LIMIT };
}

module.exports = { runGradingPhases, GRADING_LIMITS, GRADE_DONE_LIMIT, RECORRECT_LIMIT };
