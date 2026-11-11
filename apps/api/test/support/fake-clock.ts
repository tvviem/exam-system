import type { Clock } from '../../src/common/clock';

export class FakeClock implements Clock {
  private current: number;

  constructor(start = '2026-11-02T08:00:00+07:00') {
    this.current = new Date(start).getTime();
  }

  now(): Date {
    return new Date(this.current);
  }

  set(at: Date): void {
    this.current = at.getTime();
  }

  advance(ms: number): void {
    this.current += ms;
  }
}

export const seconds = (n: number) => n * 1000;
export const minutes = (n: number) => n * 60_000;
export const hours = (n: number) => minutes(n * 60);
export const days = (n: number) => hours(n * 24);
