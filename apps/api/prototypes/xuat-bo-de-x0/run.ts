// PROTOTYPE BỎ ĐI (PR X0, docs/plan/xuat-bo-de-thiet-ke.md). Một lệnh:  npm install && node run.ts
// Chuyển bộ công thức mẫu LaTeX -> OMML, dựng out/mau-x0.docx để MỞ BẰNG WORD xem thật, và in bảng kết quả.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { latexToOmml } from './convert.ts';
import { SAMPLES } from './corpus.ts';
import {
  buildDocx,
  cell,
  inlineImage,
  mathBlock,
  mathInline,
  para,
  questionNo,
  run,
  table,
} from './docx.ts';

const ICON = new URL('../../../web/public/icon-192.png', import.meta.url);
const results = SAMPLES.map((sample) => ({ sample, ...latexToOmml(sample.latex, sample.display) }));

// ---- bảng kết quả ----
const rawOk = results.filter((r) => r.raw?.ok);
const ok = results.filter((r) => r.ok);
const same = ok.filter((r) => r.roundtripSame);
console.log(`\nCông thức: ${results.length}`);
console.log(
  `  đường ống NGUYÊN BẢN (KaTeX + mathml2omml): hợp lệ và không cảnh báo ${rawOk.length}/${results.length}`,
);
console.log(
  `  SAU xử lý của bản thử                      : hợp lệ về cấu trúc    ${ok.length}/${results.length} | khứ hồi khớp ${same.length}/${ok.length}`,
);
console.log(
  `  thời gian chuyển: tổng ${results.reduce((a, r) => a + r.ms, 0).toFixed(0)} ms, lớn nhất ${Math.max(...results.map((r) => r.ms)).toFixed(1)} ms`,
);
console.log('\n-- Ca nguyên bản hỏng nhưng đã sửa được:');
for (const r of results.filter((x) => !x.raw?.ok && x.ok))
  console.log(
    `   ${r.sample.id} ${r.sample.latex}  (nguyên bản: ${r.raw?.warnings.join('; ').slice(0, 70)})`,
  );
console.log('\n-- Ca SAU xử lý vẫn có vấn đề (cần dự phòng):');
for (const r of results.filter((x) => !x.ok || x.warnings.length))
  console.log(
    `   ${r.sample.id} ${r.sample.latex}  -> ${r.error ?? r.warnings.join('; ').slice(0, 90)}`,
  );
if (process.argv.includes('--chi-tiet')) {
  console.log('\n-- Chi tiết khứ hồi các ca khác:');
  for (const r of ok.filter((x) => !x.roundtripSame))
    console.log(`   ${r.sample.id} ${r.sample.latex}\n        => ${r.roundtrip}`);
}

// ---- dựng tệp .docx ----
const body: string[] = [];
body.push(para(run('THI KẾT THÚC HỌC PHẦN (BẢN THỬ X0)'), 'TieuDeDeThi'));
body.push(
  table([
    cell(5000, para(run('Học phần: ', '') + run('Nguyên lý xây dựng phần mềm', '<w:b/>'))) +
      cell(5942, para(run('Mã SV: .............................................'))),
  ]),
);
body.push(para(run('NỘI DUNG CÂU HỎI'), 'TieuDePhan'));
let n = 0;
for (const r of results) {
  n += 1;
  const formula = r.ok ? r.omml : '';
  const fallback = r.ok
    ? ''
    : run(`[không chuyển được: ${r.sample.latex}]`, '<w:color w:val="FF0000"/>');
  if (r.sample.display) {
    body.push(para(questionNo(n) + run(`(${r.sample.id}) Cho công thức:`), 'Cau'));
    body.push(r.ok ? mathBlock(formula) : para(fallback));
  } else {
    body.push(
      para(
        questionNo(n) +
          run(`(${r.sample.id}) Cho biểu thức `) +
          mathInline(formula) +
          fallback +
          run(' . Phát biểu nào đúng?'),
        'Cau',
      ),
    );
  }
  const a = SAMPLES[(n * 7) % SAMPLES.length];
  const opt = (letter: string, text: string) =>
    para(run(`${letter}. `, '<w:b/><w:color w:val="0000FF"/>') + run(text), 'PhuongAn');
  body.push(
    opt('A', 'Đúng với mọi giá trị xác định'),
    opt('B', `Chỉ đúng khi ${a?.id ?? ''} thỏa mãn`),
  );
}
body.push(para(run('Câu hỏi có hình minh họa: '), 'Cau'));
body.push(para(inlineImage('rIdImg1', 1, 30, 30, 'Biểu tượng thử (192 px)')));
body.push(para(run('----------- HẾT ----------', '<w:b/>'), undefined, '<w:jc w:val="center"/>'));

const bytes = await buildDocx({
  body: body.join(''),
  school: 'Trường Đại học Bạc Liêu',
  unit: 'Khoa Kỹ thuật và Công nghệ',
  examCode: '132',
  imagePng: readFileSync(ICON),
});
mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
writeFileSync(new URL('./out/mau-x0.docx', import.meta.url), bytes);
writeFileSync(
  new URL('./out/ket-qua.json', import.meta.url),
  JSON.stringify(
    results.map((r) => ({
      id: r.sample.id,
      latex: r.sample.latex,
      ok: r.ok,
      khuHoiKhop: r.roundtripSame,
      khuHoi: r.roundtrip,
      loi: r.error,
    })),
    null,
    1,
  ),
);
console.log(`\nĐã ghi out/mau-x0.docx (${(bytes.length / 1024).toFixed(0)} KB)`);
