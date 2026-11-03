// PROTOTYPE (Q207), vứt đi sau khi chọn: dữ liệu giả 300 người cho màn Theo dõi. Không gọi API, không lưu gì.
// Mô phỏng đúng nhịp thật: server gộp thay đổi và đẩy mỗi 2 giây (docs/plan/slice-4.md, "Thời gian thực").
// Để xem được cả buổi thi trong vài phút, mỗi nhịp 2 giây thật tương ứng SIM_STEP giây trong phòng thi.
import { useCallback, useEffect, useRef, useState } from 'react';

export type RoomState = 'not_started' | 'working' | 'disconnected' | 'submitted' | 'suspended';
export type DeviceState = 'ok' | 'new' | 'revoked';

export interface RoomEvent {
  at: number;
  text: string;
}

export interface Person {
  id: number;
  name: string;
  /** Tên gọi (từ cuối của họ tên), dùng để xếp như danh sách lớp. */
  givenName: string;
  code: string;
  className: string;
  state: RoomState;
  answered: number;
  startedAt: number | null;
  extraSeconds: number;
  hiddenCount: number;
  warnings: number;
  device: DeviceState;
  deviceLabel: string;
  events: RoomEvent[];
}

export const TOTAL_QUESTIONS = 40;
export const DURATION_SECONDS = 45 * 60;
export const SIM_STEP = 15;
const TICK_MS = 2000;
const HEADCOUNT = 300;

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FAMILY = [
  'Nguyễn',
  'Trần',
  'Lê',
  'Phạm',
  'Hoàng',
  'Huỳnh',
  'Phan',
  'Vũ',
  'Đặng',
  'Bùi',
  'Đỗ',
  'Ngô',
];
const MIDDLE = [
  'Văn',
  'Thị',
  'Minh',
  'Quốc',
  'Hoàng',
  'Thu',
  'Ngọc',
  'Gia',
  'Đức',
  'Thanh',
  'Anh',
  'Bảo',
];
const GIVEN = [
  'An',
  'Bình',
  'Châu',
  'Dũng',
  'Đạt',
  'Giang',
  'Hà',
  'Hải',
  'Hiếu',
  'Hùng',
  'Khánh',
  'Lan',
  'Linh',
  'Long',
  'Mai',
  'Nam',
  'Ngân',
  'Phúc',
  'Quân',
  'Quỳnh',
  'Sơn',
  'Thảo',
  'Trang',
  'Tuấn',
  'Vy',
  'Yến',
];
const CLASSES = ['CNTT-K26A', 'CNTT-K26B', 'KTPM-K26', 'HTTT-K26'];
const DEVICES = [
  'Chrome · Windows',
  'Chrome · Android',
  'Safari · iPhone',
  'Edge · Windows',
  'Firefox · Linux',
];

const pick = <T>(random: () => number, list: T[]): T =>
  list[Math.floor(random() * list.length)] as T;

export function buildRoom(simNow: number): Person[] {
  const random = rng(20261103);
  const people: Person[] = [];
  for (let i = 0; i < HEADCOUNT; i++) {
    const given = pick(random, GIVEN);
    const name = `${pick(random, FAMILY)} ${pick(random, MIDDLE)} ${given}`;
    const roll = random();
    // Phân bố lúc mở màn: phần lớn đang làm, vài người nộp sớm, vài người chưa vào, vài ca bất thường.
    let state: RoomState = 'working';
    if (roll < 0.04) state = 'not_started';
    else if (roll < 0.17) state = 'submitted';
    else if (roll < 0.22) state = 'disconnected';
    else if (roll < 0.235) state = 'suspended';
    const startedAt =
      state === 'not_started' ? null : simNow - Math.floor(random() * 0.8 * DURATION_SECONDS);
    const elapsed = startedAt === null ? 0 : simNow - startedAt;
    const pace = 0.55 + random() * 0.6;
    const answered =
      state === 'submitted'
        ? Math.floor(TOTAL_QUESTIONS * (0.7 + random() * 0.3))
        : Math.min(
            TOTAL_QUESTIONS,
            Math.floor((elapsed / DURATION_SECONDS) * TOTAL_QUESTIONS * pace * 1.25),
          );
    const odd = random();
    people.push({
      id: i + 1,
      name,
      givenName: given,
      code: `SV26${String(100 + i).padStart(3, '0')}`,
      className: pick(random, CLASSES),
      state,
      answered,
      startedAt,
      extraSeconds: 0,
      hiddenCount:
        odd > 0.93 ? 3 + Math.floor(random() * 6) : odd > 0.8 ? 1 + Math.floor(random() * 2) : 0,
      warnings: odd > 0.97 ? 1 : 0,
      device: odd < 0.012 ? 'revoked' : odd < 0.03 ? 'new' : 'ok',
      deviceLabel: pick(random, DEVICES),
      events: [],
    });
  }
  return people.sort(
    (a, b) => a.givenName.localeCompare(b.givenName, 'vi') || a.name.localeCompare(b.name, 'vi'),
  );
}

export const deadlineOf = (p: Person) =>
  p.startedAt === null ? null : p.startedAt + DURATION_SECONDS + p.extraSeconds;

/** Giây còn lại (null nếu chưa vào hoặc đã kết thúc). */
export function remainingOf(p: Person, simNow: number) {
  const deadline = deadlineOf(p);
  if (deadline === null || p.state === 'submitted' || p.state === 'suspended') return null;
  return Math.max(0, deadline - simNow);
}

export type Reason = 'disconnected' | 'hidden' | 'device' | 'slow';

/** Lý do cần chú ý (phương án C dùng làm hàng đầu; A và B chỉ gắn dấu). "slow" là cách bắt người im lặng. */
export function reasonsOf(p: Person, simNow: number): Reason[] {
  const out: Reason[] = [];
  if (p.state === 'disconnected') out.push('disconnected');
  if (p.hiddenCount >= 3) out.push('hidden');
  if (p.device !== 'ok') out.push('device');
  if (p.state === 'working' && p.startedAt !== null) {
    const elapsed = (simNow - p.startedAt) / DURATION_SECONDS;
    if (elapsed > 0.25 && p.answered / TOTAL_QUESTIONS < elapsed - 0.3) out.push('slow');
  }
  return out;
}

export interface RoomActions {
  extend: (ids: number[], minutes: number) => void;
  forceSubmit: (ids: number[]) => void;
  revoke: (id: number) => void;
  pardon: (id: number) => void;
  warn: (id: number) => void;
  suspend: (id: number) => void;
}

export function useRoom() {
  const [simNow, setSimNow] = useState(Math.floor(DURATION_SECONDS * 0.55));
  const [people, setPeople] = useState<Person[]>(() =>
    buildRoom(Math.floor(DURATION_SECONDS * 0.55)),
  );
  const [entryClosed, setEntryClosed] = useState(false);
  const [paused, setPaused] = useState(false);
  const simRef = useRef(simNow);
  const entryRef = useRef(entryClosed);
  entryRef.current = entryClosed;

  useEffect(() => {
    if (paused) return;
    const random = rng(Date.now() & 0xffff);
    const timer = setInterval(() => {
      simRef.current += SIM_STEP;
      const now = simRef.current;
      setSimNow(now);
      setPeople((current) =>
        current.map((p) => {
          const next = { ...p };
          if (p.state === 'not_started' && !entryRef.current && random() < 0.08) {
            next.state = 'working';
            next.startedAt = now;
          } else if (p.state === 'working') {
            if (random() < 0.5 && next.answered < TOTAL_QUESTIONS) next.answered += 1;
            if (random() < 0.006) next.state = 'disconnected';
            if (random() < 0.012) next.hiddenCount += 1;
            const deadline = deadlineOf(p);
            if (
              (deadline !== null && now >= deadline) ||
              (next.answered >= TOTAL_QUESTIONS && random() < 0.2)
            ) {
              next.state = 'submitted';
            }
          } else if (p.state === 'disconnected' && random() < 0.22) {
            next.state = 'working';
          }
          return next;
        }),
      );
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [paused]);

  const log = (p: Person, text: string): Person => ({
    ...p,
    events: [{ at: simRef.current, text }, ...p.events].slice(0, 20),
  });
  const mutate = useCallback((ids: number[], change: (p: Person) => Person) => {
    const set = new Set(ids);
    setPeople((current) => current.map((p) => (set.has(p.id) ? change(p) : p)));
  }, []);

  const actions: RoomActions = {
    extend: (ids, minutes) =>
      mutate(ids, (p) =>
        p.state === 'working' || p.state === 'disconnected'
          ? log({ ...p, extraSeconds: p.extraSeconds + minutes * 60 }, `Cộng giờ ${minutes} phút`)
          : p,
      ),
    forceSubmit: (ids) =>
      mutate(ids, (p) =>
        p.state === 'working' || p.state === 'disconnected'
          ? log({ ...p, state: 'submitted' }, 'Buộc nộp')
          : p,
      ),
    revoke: (id) => mutate([id], (p) => log({ ...p, device: 'revoked' }, 'Thu hồi thiết bị')),
    pardon: (id) => mutate([id], (p) => log({ ...p, device: 'ok' }, 'Hoàn tác Thu hồi')),
    warn: (id) => mutate([id], (p) => log({ ...p, warnings: p.warnings + 1 }, 'Vi phạm: Cảnh cáo')),
    suspend: (id) =>
      mutate([id], (p) =>
        log({ ...p, state: 'suspended', warnings: p.warnings + 1 }, 'Vi phạm: Đình chỉ'),
      ),
  };

  return { people, simNow, actions, entryClosed, setEntryClosed, paused, setPaused };
}

export const clock = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};
