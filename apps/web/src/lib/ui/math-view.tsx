import { KATEX_OPTIONS } from '@exam/shared';
import { useEffect, useRef, useState } from 'react';

// Hiển thị công thức LaTeX bằng KaTeX (Q121, Q131). KaTeX và font tải lười lần đầu có công thức,
// nên trang không có công thức không tải thêm gì. Dựng vào phần tử qua `katex.render`, không dùng HTML thô.

let katexModule: Promise<typeof import('katex').default> | undefined;
const loadKatex = () => {
  katexModule ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(
    ([module]) => module.default,
  );
  return katexModule;
};

/**
 * Vẽ thử các công thức ngoài màn hình để trình duyệt tải đúng những file phông KaTeX mà đề cần (bản làm bài ngoại tuyến
 * cần có sẵn trong bộ nhớ đệm). Chỉ tải mã và CSS thì chưa đủ: file phông chỉ được tải khi có chữ dùng đến nó.
 */
export function preloadFormulas(formulas: { latex: string; display: boolean }[]) {
  void loadKatex().then(async (katex) => {
    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    // Không dùng display:none: phần tử không dàn trang thì trình duyệt không tải phông.
    probe.style.cssText =
      'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none';
    for (const { latex, display } of formulas) {
      const host = document.createElement('span');
      try {
        katex.render(latex, host, { ...KATEX_OPTIONS, displayMode: display });
      } catch {
        continue; // công thức lỗi thì MathView hiện mã LaTeX, không cần phông
      }
      probe.append(host);
    }
    document.body.append(probe);
    void probe.offsetHeight; // dàn trang ngay để các yêu cầu tải phông bắt đầu trước khi chờ `fonts.ready`
    try {
      await document.fonts.ready;
    } finally {
      probe.remove();
    }
  });
}

/** Dựng thử `latex`; trả `null` nếu hợp lệ, ngược lại là thông báo lỗi của KaTeX. */
export async function latexError(latex: string): Promise<string | null> {
  const katex = await loadKatex();
  try {
    katex.renderToString(latex, {
      throwOnError: true,
      trust: false,
      strict: 'ignore',
      maxExpand: 1000,
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function MathView({ latex, display }: { latex: string; display: boolean }) {
  const host = useRef<HTMLSpanElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    void loadKatex().then((katex) => {
      if (cancelled || !host.current) return;
      try {
        katex.render(latex, host.current, { ...KATEX_OPTIONS, displayMode: display });
      } catch {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [latex, display]);

  // Trong lúc tải, hoặc khi công thức lỗi (bản cũ, nhập từ nơi khác), hiện mã LaTeX để vẫn đọc được.
  return (
    <span
      ref={host}
      className={
        display
          ? 'my-1 block overflow-x-auto text-center'
          : 'inline-block max-w-full overflow-x-auto overflow-y-hidden align-middle'
      }
      data-math={display ? 'display' : 'inline'}
    >
      <code className={`text-sm ${failed ? 'text-danger' : 'text-fg-muted'}`}>{latex}</code>
    </span>
  );
}
