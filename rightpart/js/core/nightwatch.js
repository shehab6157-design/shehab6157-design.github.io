// Night watch: the body clock.
// Mistakes are more likely at night: in shift-work studies the risk was about 30% higher on night
// shifts than on morning shifts, and by the 12th hour on duty it had more than doubled (Folkard and
// Tucker, 2003). Alertness is lowest in the early morning hours. So between 2 and 6 a.m., or when
// this tablet has been in use for a long stretch, parts that have a look-alike get a second look:
// point at the part and say its size out loud. Pointing and calling comes from Japanese railways,
// where a 1994 study found it cut mistakes on a simple task by almost 85%.
// It reads the clock and this tablet's own use, never a person: no hours are kept for anyone.
// Pure: time, policy and session in, state out.

export const DEFAULT_POLICY = { enabled: true, from: 2, to: 6, longHours: 10 };

/** The company's choice, carried by the library (lib.policy.nightWatch), over the defaults. */
export function policyOf(lib) {
  const p = { ...DEFAULT_POLICY, ...(lib?.policy?.nightWatch || {}) };
  const hour = (v, d) => (Number.isFinite(+v) && +v >= 0 && +v <= 24 ? +v : d);
  return { enabled: p.enabled !== false, from: hour(p.from, 2), to: hour(p.to, 6), longHours: Number.isFinite(+p.longHours) && +p.longHours > 0 ? +p.longHours : 0 };
}

/** Is `hour` (0–24, fractions allowed) inside [from, to)? Windows may cross midnight (22 → 6). */
export function inWindow(hour, from, to) {
  if (from === to) return false;
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

/**
 * { active, reason: 'night' | 'long' | null, hours } for this moment.
 * `session` = { start, last } in ms: this tablet's current stretch of use.
 */
export function nightWatchState(now, policy, session) {
  const p = policy || DEFAULT_POLICY;
  const hours = session?.start && session?.last && now - session.last < 3 * 3.6e6 ? (now - session.start) / 3.6e6 : 0;
  if (!p.enabled) return { active: false, reason: null, hours };
  const d = new Date(now);
  if (inWindow(d.getHours() + d.getMinutes() / 60, p.from, p.to)) return { active: true, reason: 'night', hours };
  if (p.longHours && hours >= p.longHours) return { active: true, reason: 'long', hours };
  return { active: false, reason: null, hours };
}

/**
 * This tablet's stretch of use, updated at every build event. A pause of `gapHours` or more, or a
 * different operator starting a build, begins a new stretch. Only a start and a last time are kept.
 */
export function touchSession(session, now = Date.now(), { gapHours = 3, newOperator = false } = {}) {
  if (newOperator || !session?.start || !session?.last || now < session.last || now - session.last >= gapHours * 3.6e6) return { start: now, last: now };
  return { start: session.start, last: now };
}
