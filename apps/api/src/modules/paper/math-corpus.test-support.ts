/**
 * Bộ công thức đại diện cho đề thi STEM tiếng Việt (đại số, giải tích, hình học, vật lý, hóa, xác suất), dùng để kiểm bộ chuyển
 * LaTeX sang công thức Word. Ngân hàng câu hỏi thật chưa có dữ liệu nên bộ này viết theo kiểu đề thi; bốn công thức đầu lấy từ
 * bài kiểm thử của dự án.
 */
export interface Sample {
  id: string;
  group: string;
  latex: string;
  display: boolean;
}

const s = (group: string, latex: string, display = false): Omit<Sample, 'id'> => ({
  group,
  latex,
  display,
});

const raw: Omit<Sample, 'id'>[] = [
  // từ bài kiểm thử của dự án
  s('kho', '\\frac{1}{2}'),
  s('kho', 'x^2'),
  s('kho', 'n=1'),
  s('kho', '\\int_0^1 x\\,dx', true),
  // đại số
  s('dai-so', 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}', true),
  s('dai-so', '\\sqrt[3]{x+1}'),
  s('dai-so', 'a^{n}_{i} + b_{i}^{n}'),
  s('dai-so', '\\left| x-2 \\right| \\le 3'),
  s('dai-so', '\\log_{a} b = \\frac{\\ln b}{\\ln a}'),
  s('dai-so', '\\binom{n}{k} = \\frac{n!}{k!\\,(n-k)!}', true),
  s('dai-so', '(a+b)^n = \\sum_{k=0}^{n} \\binom{n}{k} a^k b^{n-k}', true),
  s('dai-so', '\\dfrac{x^2-1}{x+1} \\neq 0'),
  s('dai-so', '\\begin{cases} x+y=5 \\\\ x-y=1 \\end{cases}', true),
  s('dai-so', '\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}', true),
  s('dai-so', '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix} = ad - bc', true),
  s('dai-so', 'A=\\begin{bmatrix} 1 & 0 & 2 \\\\ 0 & 1 & 3 \\end{bmatrix}', true),
  // giải tích
  s('giai-tich', '\\lim_{x\\to 0} \\frac{\\sin x}{x} = 1', true),
  s('giai-tich', '\\int_{a}^{b} f(x)\\,dx', true),
  s('giai-tich', '\\frac{d}{dx}\\left(x^n\\right) = n x^{n-1}', true),
  s('giai-tich', '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}', true),
  s('giai-tich', '\\prod_{k=1}^{5} k = 120'),
  s('giai-tich', 'e^{i\\pi} + 1 = 0'),
  s('giai-tich', '\\sin^2 x + \\cos^2 x = 1'),
  s('giai-tich', "f'(x) = \\lim_{h\\to 0}\\frac{f(x+h)-f(x)}{h}", true),
  // hình học, vectơ
  s('hinh-hoc', '\\overrightarrow{AB} \\cdot \\overrightarrow{AC} = 0'),
  s('hinh-hoc', '\\vec{u} \\perp \\vec{v}'),
  s('hinh-hoc', '\\widehat{ABC} = 90^\\circ'),
  s('hinh-hoc', 'AB \\parallel CD'),
  s('hinh-hoc', '\\overline{AB} = 5\\,\\text{cm}'),
  s('hinh-hoc', 'S = \\frac{1}{2} a h'),
  // tập hợp, logic
  s('tap-hop', 'x \\in \\mathbb{R} \\setminus \\{0\\}'),
  s('tap-hop', 'A \\cup B \\subset C \\cap D'),
  s('tap-hop', 'p \\Rightarrow q \\Leftrightarrow \\neg q \\Rightarrow \\neg p'),
  // chữ tiếng Việt trong công thức, đơn vị
  s('chu-viet', '\\text{Vận tốc } v = \\frac{s}{t}'),
  s('chu-viet', 'F = m \\cdot a \\quad (\\text{đơn vị: N})'),
  s('chu-viet', 'T = 2\\pi\\sqrt{\\frac{l}{g}}'),
  s('chu-viet', '\\text{Diện tích hình tròn: } S = \\pi r^2'),
  // hóa, xác suất
  s('hoa-xs', '\\mathrm{H_2SO_4} + 2\\mathrm{NaOH} \\to \\mathrm{Na_2SO_4} + 2\\mathrm{H_2O}'),
  s('hoa-xs', 'P(A) = \\frac{n(A)}{n(\\Omega)}'),
  s('hoa-xs', 'C_{n}^{k} = \\frac{n!}{k!(n-k)!}'),
  // kiểu khó, để xem giới hạn của bộ chuyển đổi
  s('kho-hon', '\\underbrace{a+b+c}_{3\\text{ số hạng}}', true),
  s('kho-hon', '\\begin{aligned} x &= 2y + 1 \\\\ y &= 3 \\end{aligned}', true),
  s('kho-hon', '\\overset{def}{=}'),
  s('kho-hon', '\\xrightarrow{t^\\circ} '),
  s('kho-hon', '\\frac{\\frac{a}{b}}{\\frac{c}{d}}', true),
];

export const MATH_CORPUS: Sample[] = raw.map((item, index) => ({
  id: `F${String(index + 1).padStart(2, '0')}`,
  ...item,
}));
