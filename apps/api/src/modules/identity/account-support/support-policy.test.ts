import { describe, expect, it } from 'vitest';
import {
  canSupport,
  type SupportActor,
  type SupportRelation,
  type SupportTarget,
} from './support-policy';

// PR 7d-1, lát 1 (docs/plan/slice-7d-thiet-ke-kiem-thu.md K15, D-01 đến D-07): ai được hỗ trợ kích hoạt cho ai.

const admin: SupportActor = { id: 'a', isAdmin: true, roleTags: [] };
const examiner: SupportActor = { id: 'e', isAdmin: false, roleTags: ['examiner'] };
const candidate: SupportActor = { id: 'c', isAdmin: false, roleTags: ['candidate'] };

const pending: SupportTarget = { isAdmin: false, removed: false, locked: false, pending: true };
const active: SupportTarget = { ...pending, pending: false };
const none: SupportRelation = { createdByActor: false, inActiveRosterOfActor: false };
const byRequest: SupportRelation = { createdByActor: true, inActiveRosterOfActor: false };
const byRoster: SupportRelation = { createdByActor: false, inActiveRosterOfActor: true };

describe('canSupport (K15)', () => {
  it('D-01: Quản trị viên hỗ trợ mọi tài khoản chưa Xóa và không Bị Khóa, kể cả Quản trị viên khác và chính mình', () => {
    expect(canSupport(admin, pending, none)).toEqual({ allowed: true });
    expect(canSupport(admin, active, none)).toEqual({ allowed: true });
    expect(canSupport(admin, { ...active, isAdmin: true }, none)).toEqual({ allowed: true });
  });

  it('D-02: Người ra đề hỗ trợ tài khoản Chờ kích hoạt do Yêu cầu của mình đã tạo', () => {
    expect(canSupport(examiner, pending, byRequest)).toEqual({ allowed: true });
  });

  it('D-03: Người ra đề hỗ trợ tài khoản Chờ kích hoạt có trong Danh sách dự thi của Phiên thi chưa kết thúc của mình (Q384)', () => {
    expect(canSupport(examiner, pending, byRoster)).toEqual({ allowed: true });
  });

  it('D-04: Người ra đề không hỗ trợ tài khoản đã Hoạt động, dù có quan hệ', () => {
    expect(canSupport(examiner, active, byRequest)).toEqual({
      allowed: false,
      reason: 'not_pending',
    });
    expect(canSupport(examiner, active, byRoster)).toEqual({
      allowed: false,
      reason: 'not_pending',
    });
  });

  it('D-05: Người ra đề không hỗ trợ tài khoản không thuộc Yêu cầu hay Phiên thi của mình', () => {
    expect(canSupport(examiner, pending, none)).toEqual({ allowed: false, reason: 'no_relation' });
  });

  it('D-06: không ai hỗ trợ tài khoản đã Xóa hoặc đang Bị Khóa', () => {
    for (const actor of [admin, examiner]) {
      expect(canSupport(actor, { ...pending, removed: true }, byRequest)).toEqual({
        allowed: false,
        reason: 'target_removed',
      });
      expect(canSupport(actor, { ...pending, locked: true }, byRequest)).toEqual({
        allowed: false,
        reason: 'target_locked',
      });
    }
  });

  it('D-07: Người ra đề không hỗ trợ tài khoản Quản trị viên', () => {
    expect(canSupport(examiner, { ...pending, isAdmin: true }, byRequest)).toEqual({
      allowed: false,
      reason: 'target_admin',
    });
  });

  it('người không phải Quản trị viên hay Người ra đề không hỗ trợ ai', () => {
    expect(canSupport(candidate, pending, byRequest)).toEqual({
      allowed: false,
      reason: 'not_allowed_role',
    });
  });

  it('Quản trị viên mang thêm nhãn Người ra đề vẫn được coi là Quản trị viên', () => {
    expect(canSupport({ ...admin, roleTags: ['examiner'] }, active, none)).toEqual({
      allowed: true,
    });
  });
});
