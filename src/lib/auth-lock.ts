/** Pause React auth updates while we create another user via signUp (session swap). */
let locks = 0;

export function lockAuthUpdates() {
  locks += 1;
}

export function unlockAuthUpdates() {
  locks = Math.max(0, locks - 1);
}

export function isAuthLocked() {
  return locks > 0;
}
