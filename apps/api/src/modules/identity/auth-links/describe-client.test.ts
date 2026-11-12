import { describe, expect, it } from 'vitest';
import { describeClient } from './describe-client';

describe('describeClient', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      { browser: 'Chrome 130', os: 'Windows' },
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      { browser: 'Edge 130', os: 'Windows' },
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      { browser: 'Safari 17', os: 'iOS' },
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
      { browser: 'Chrome 129', os: 'Android' },
    ],
    [
      'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
      { browser: 'Firefox 131', os: 'Linux' },
    ],
  ])('%s', (userAgent, expected) => {
    expect(describeClient(userAgent)).toEqual(expected);
  });

  it('thiếu hoặc lạ thì không đoán bừa', () => {
    expect(describeClient(null)).toEqual({});
    expect(describeClient('curl/8.0')).toEqual({});
  });
});
