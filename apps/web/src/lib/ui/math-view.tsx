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
        katex.render(latex, host.current, {
          displayMode: display,
          throwOnError: true,
          trust: false,
          strict: 'ignore',
          maxExpand: 1000,
        });
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
      className={display ? 'my-1 block overflow-x-auto text-center' : 'inline-block max-w-full'}
      data-math={display ? 'display' : 'inline'}
    >
      <code className={`text-sm ${failed ? 'text-danger' : 'text-fg-muted'}`}>{latex}</code>
    </span>
  );
}
