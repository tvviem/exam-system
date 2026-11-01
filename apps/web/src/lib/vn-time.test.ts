import { describe, expect, it } from 'vitest';
import { isoToVnInput, vnInputToIso } from './vn-time';

describe('giờ Việt Nam (GMT+7) cho ô nhập ngày giờ (Q4 của 4a)', () => {
  it('ISO UTC sang giá trị ô nhập theo GMT+7', () => {
    expect(isoToVnInput('2026-11-10T01:00:00.000Z')).toBe('2026-11-10T08:00');
    expect(isoToVnInput('2026-11-10T17:30:00.000Z')).toBe('2026-11-11T00:30');
  });

  it('giá trị ô nhập sang ISO có múi giờ +07:00', () => {
    expect(vnInputToIso('2026-11-10T08:00')).toBe('2026-11-10T08:00:00+07:00');
  });

  it('đi và về là một', () => {
    const iso = '2026-12-31T23:59:00.000Z';
    expect(new Date(vnInputToIso(isoToVnInput(iso))).toISOString()).toBe(iso);
  });

  it('ô trống thì rỗng', () => {
    expect(isoToVnInput('')).toBe('');
    expect(vnInputToIso('')).toBe('');
  });
});
