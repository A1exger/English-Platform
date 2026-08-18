import {
  envelopeRoleFor,
  isAuthorized,
  PROTOCOL_VERSION,
  sealEnvelope,
} from './envelope';

describe('envelope role mapping', () => {
  it('maps tutor/admin to teacher and student to student', () => {
    expect(envelopeRoleFor('tutor')).toBe('teacher');
    expect(envelopeRoleFor('admin')).toBe('teacher');
    expect(envelopeRoleFor('student')).toBe('student');
    expect(envelopeRoleFor('parent')).toBeNull();
  });
});

describe('isAuthorized (teacher-driven authority)', () => {
  it('only the teacher may navigate and feed material', () => {
    expect(isAuthorized('nav:goto', 'teacher')).toBe(true);
    expect(isAuthorized('nav:goto', 'student')).toBe(false);
    expect(isAuthorized('session:loadMaterial', 'teacher')).toBe(true);
    expect(isAuthorized('session:loadMaterial', 'student')).toBe(false);
  });

  it('only the student may stream exercise progress', () => {
    expect(isAuthorized('exercise:progress', 'student')).toBe(true);
    expect(isAuthorized('exercise:progress', 'teacher')).toBe(false);
  });

  it('unknown event types are rejected', () => {
    expect(isAuthorized('draw:stroke', 'teacher')).toBe(false);
    expect(isAuthorized('anything', 'student')).toBe(false);
  });
});

describe('sealEnvelope (server-authoritative fields)', () => {
  it('ignores client-supplied role/session/version, keeps type+payload', () => {
    const sealed = sealEnvelope(
      { type: 'nav:goto', payload: { pageId: 'p1' }, senderRole: 'teacher', v: 99 } as never,
      'lesson-1',
      'teacher',
    );
    expect(sealed.v).toBe(PROTOCOL_VERSION);
    expect(sealed.sessionId).toBe('lesson-1');
    expect(sealed.senderRole).toBe('teacher');
    expect(sealed.type).toBe('nav:goto');
    expect(sealed.payload).toEqual({ pageId: 'p1' });
    expect(typeof sealed.ts).toBe('number');
  });
});
