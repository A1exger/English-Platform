// Envelope protocol for live-session events, layered OVER the board gateway
// (the existing /board namespace and its draw:* events are never modified).
// All non-drawing live events travel as an Envelope on the /session namespace.
//
// Event families (section 4 of the spec):
//   nav:goto            { pageId }   teacher -> room (teacher owns navigation)
//   session:loadMaterial{ lessonId } teacher -> room (teacher feeds material)
//   exercise:progress   { taskId, state } student -> room (teacher read-model)

import { UserRole } from '../common/constants/enums';

export const PROTOCOL_VERSION = 1;

export type EnvelopeRole = 'teacher' | 'student';

export interface Envelope<T = unknown> {
  v: number;
  type: string;
  sessionId: string;
  senderRole: EnvelopeRole;
  ts: number;
  payload: T;
}

/** Map an app user role to its envelope role; null = not allowed in a session. */
export function envelopeRoleFor(role: UserRole): EnvelopeRole | null {
  if (role === 'tutor' || role === 'admin') return 'teacher';
  if (role === 'student') return 'student';
  return null; // parents et al. do not participate in the live channel
}

/**
 * Authority model: teacher owns navigation and material; only students stream
 * their exercise progress. Unknown types are rejected. This is the single guard
 * that keeps the live channel envelope-only and non-spoofable.
 */
export function isAuthorized(type: string, senderRole: EnvelopeRole): boolean {
  switch (type) {
    case 'nav:goto':
    case 'session:loadMaterial':
      return senderRole === 'teacher';
    case 'exercise:progress':
      return senderRole === 'student';
    default:
      return false;
  }
}

/**
 * Re-stamp an incoming envelope with server-authoritative fields: the client
 * never dictates its own senderRole, sessionId, version or timestamp. Only the
 * `type` and `payload` survive from the sender.
 */
export function sealEnvelope(
  incoming: { type?: unknown; payload?: unknown },
  sessionId: string,
  senderRole: EnvelopeRole,
): Envelope {
  return {
    v: PROTOCOL_VERSION,
    type: String(incoming.type ?? ''),
    sessionId,
    senderRole,
    ts: Date.now(),
    payload: incoming.payload ?? null,
  };
}
