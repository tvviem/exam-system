import { describe, expect, it } from 'vitest';
import { parseCookieHeader } from './cookies';

describe('parseCookieHeader', () => {
  it('tách nhiều cookie, bỏ khoảng trắng và giải mã', () => {
    expect(parseCookieHeader('exam_sid=abc; exam_did=x%20y;  theme=dark')).toEqual({
      exam_sid: 'abc',
      exam_did: 'x y',
      theme: 'dark',
    });
  });

  it('chịu được header thiếu, rỗng hoặc hỏng', () => {
    expect(parseCookieHeader(undefined)).toEqual({});
    expect(parseCookieHeader('')).toEqual({});
    expect(parseCookieHeader('rác; =x; a=%E0%A4%A')).toEqual({ a: '%E0%A4%A' });
  });
});
