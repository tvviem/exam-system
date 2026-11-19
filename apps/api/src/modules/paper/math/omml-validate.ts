import { SENTINEL_START } from './fences';
import { tokenize } from './omml-repair';

/**
 * Vấn đề cấu trúc còn lại sau khi sửa: thẻ không cân, thẻ lạ trong `m:t`, chữ trần ngoài `m:t`, giá trị "undefined", ký tự giữ chỗ sót.
 * Công thức có vấn đề thì không đưa vào tệp (Word có thể từ chối mở cả tệp), mà dùng chỗ giữ chữ đỏ.
 */
export function ommlProblems(omml: string): string[] {
  const problems: string[] = [];
  const stack: string[] = [];
  for (const token of tokenize(omml)) {
    if (token.kind === 'open') stack.push(token.name as string);
    else if (token.kind === 'close') {
      if (stack.pop() !== token.name) problems.push(`thẻ đóng lệch: ${token.name}`);
    } else if (
      token.kind === 'text' &&
      token.raw.trim() !== '' &&
      !['m:t', 'w:t'].includes(stack[stack.length - 1] ?? '')
    ) {
      problems.push(`chữ trần ngoài m:t: "${token.raw.trim().slice(0, 20)}"`);
    }
    if (token.kind === 'open' || token.kind === 'self') {
      if (stack.includes('m:t') && (token.kind === 'self' || token.name !== 'm:t'))
        problems.push(`thẻ ${token.name} nằm trong m:t`);
      if (/m:val="undefined"/.test(token.raw)) problems.push('giá trị undefined');
    }
  }
  if (omml.includes(SENTINEL_START)) problems.push('còn mã giữ chỗ');
  if (stack.length) problems.push('thẻ chưa đóng');
  return [...new Set(problems)];
}
