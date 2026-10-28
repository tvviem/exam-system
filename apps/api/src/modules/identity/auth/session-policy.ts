const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface SessionLifetime {
  idleMs: number;
  absoluteMs: number;
}

/** Thời hạn phiên theo docs/plan/slice-1.md (Q44, Q45). */
export function sessionLifetimeFor(user: { isAdmin: boolean }): SessionLifetime {
  return user.isAdmin
    ? { idleMs: 30 * MINUTE, absoluteMs: 12 * HOUR }
    : { idleMs: 12 * HOUR, absoluteMs: 7 * DAY };
}
