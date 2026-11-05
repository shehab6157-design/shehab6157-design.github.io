// Finds parts that are easy to mistake for each other, and says how to tell them apart.
// Pure functions: works on part records { id, category, spec }.

import { HEADS, DRIVES, MATERIALS, isFastener } from './dims.js';
import { t, lower } from './i18n.js';

const HEAD_GAP = {
  'pan|cheese': 0.22, 'pan|button': 0.25, 'button|cheese': 0.28, 'button|socket': 0.3, 'cheese|socket': 0.25, 'pan|socket': 0.32,
};
const headGap = (a, b) => (a === b ? 0 : HEAD_GAP[[a, b].sort().join('|')] ?? 0.5);

const DRIVE_GAP = { 'phillips|pozidriv': 0.06, 'hex|torx': 0.16, 'phillips|torx': 0.28, 'phillips|slotted': 0.3, 'pozidriv|torx': 0.28 };
const driveGap = (a, b) => (a === b ? 0 : DRIVE_GAP[[a, b].sort().join('|')] ?? 0.4);

const isMetal = (m) => MATERIALS[m]?.metal !== false;
const matLabel = (m) => MATERIALS[m]?.label || m || t('unknown');
const r2 = (v) => Math.round(v * 100) / 100;

function sizeGap(sa, sb, diffs) {
  const da = sa.d, db = sb.d;
  if (da == null || db == null) return 0;
  const sysA = sa.system || 'metric', sysB = sb.system || 'metric';
  const dd = Math.abs(da - db);
  if (sysA !== sysB) {
    diffs.push({ field: 'thread', important: true, text: t("Thread: {a} vs {b}. One is metric, the other is inch (unified). They look almost the same but will not screw into each other's holes: forcing it strips the thread.", { a: sa.thread || 'M' + da, b: sb.thread || 'M' + db }) });
    return dd <= 0.4 ? 0.08 : dd <= 0.8 ? 0.2 : 0.6;
  }
  if (dd < 0.01) {
    if (sa.pitch && sb.pitch && Math.abs(sa.pitch - sb.pitch) > 0.001) {
      diffs.push({ field: 'pitch', important: true, text: t('Thread pitch: {a} mm vs {b} mm. Same diameter, different thread: they will not mate.', { a: sa.pitch, b: sb.pitch }) });
      return 0.05;
    }
    return 0;
  }
  diffs.push({ field: 'diameter', important: true, text: [t('Thread diameter: {a} vs {b} ({gap} mm apart).', { a: sa.thread || 'M' + da, b: sb.thread || 'M' + db, gap: r2(dd) }), dd <= 0.5 ? t('Very close by eye: check with the gauge or try the nut.') : ''].filter(Boolean).join(' ') });
  return dd <= 0.5 ? 0.15 : dd <= 1 ? 0.32 : 0.65;
}

function lengthGap(la, lb, diffs, body = false) {
  if (la == null || lb == null) return 0;
  const dl = Math.abs(la - lb);
  if (dl < 0.01) return 0;
  const v = { a: la, b: lb, gap: r2(dl) };
  const main = body
    ? (lb > la ? t('Body length: {a} mm vs {b} mm ({gap} mm longer).', v) : t('Body length: {a} mm vs {b} mm ({gap} mm shorter).', v))
    : (lb > la ? t('Length: {a} mm vs {b} mm ({gap} mm longer).', v) : t('Length: {a} mm vs {b} mm ({gap} mm shorter).', v));
  diffs.push({ field: 'length', important: true, text: [main, dl <= 2.5 ? t('Hard to see by eye: lay it on the true-scale drawing or use the gauge.') : ''].filter(Boolean).join(' ') });
  const rel = dl / Math.max(la, lb);
  if (dl <= 2.5 && rel <= 0.35) return 0.08;
  if (dl <= 4) return 0.16;
  if (dl <= 6) return 0.3;
  return 0.55;
}

function materialGap(ma, mb, diffs) {
  if (!ma || !mb || ma === mb) return 0;
  const metalA = isMetal(ma), metalB = isMetal(mb);
  const why = metalA !== metalB ? t('Plastic and metal are not interchangeable.') : ma.startsWith('A') || mb.startsWith('A') ? t('Stainless and plated steel look alike under bench light; a magnet tells them apart (A2 barely sticks).') : '';
  diffs.push({ field: 'material', important: metalA !== metalB, text: [t('Material: {a} vs {b}.', { a: matLabel(ma), b: matLabel(mb) }), why].filter(Boolean).join(' ') });
  return metalA !== metalB ? 0.2 : 0.06;
}

/**
 * Compare two parts. Returns { score 0..1, diffs: [{field, text, important}] }.
 * 1 means identical spec (a probable duplicate record); above 0.6 is a look-alike.
 */
export function compareParts(a, b) {
  const diffs = [];
  if (!a || !b || a.id === b.id || a.category !== b.category || !isFastener(a)) return { score: 0, diffs };
  const sa = a.spec || {}, sb = b.spec || {};
  let gap = 0;
  if (a.category === 'screw') {
    if (sa.head !== sb.head) {
      gap += headGap(sa.head, sb.head);
      diffs.push({ field: 'head', important: true, text: t('Head: {a} vs {b}.', { a: HEADS[sa.head]?.label || sa.head, b: HEADS[sb.head]?.label || sb.head }) });
    }
    if (sa.drive !== sb.drive) {
      gap += driveGap(sa.drive, sb.drive);
      const pp = [sa.drive, sb.drive].sort().join('|') === 'phillips|pozidriv';
      diffs.push({ field: 'drive', important: pp, text: [t('Drive: {a} vs {b}.', { a: DRIVES[sa.drive]?.label || sa.drive, b: DRIVES[sb.drive]?.label || sb.drive }), pp ? t('Look for the 4 fine lines between the arms: those mark Pozidriv.') : ''].filter(Boolean).join(' ') });
    }
    gap += sizeGap(sa, sb, diffs);
    gap += lengthGap(sa.length, sb.length, diffs);
    gap += materialGap(sa.material, sb.material, diffs);
    if (!!sa.tapping !== !!sb.tapping) { gap += 0.25; diffs.push({ field: 'type', important: true, text: t('One is a self-tapping screw, the other a machine screw.') }); }
  } else if (a.category === 'washer') {
    if ((sa.variant || 'flat') !== (sb.variant || 'flat')) {
      gap += 0.35;
      diffs.push({ field: 'type', important: true, text: t('Type: {a} vs {b}. They do different jobs.', { a: washerName(sa.variant), b: washerName(sb.variant) }) });
    }
    gap += sizeGap(sa, sb, diffs);
    if (sa.od && sb.od && Math.abs(sa.od - sb.od) > 0.01) { gap += Math.abs(sa.od - sb.od) <= 1.5 ? 0.08 : 0.2; diffs.push({ field: 'od', important: false, text: t('Outside diameter: {a} mm vs {b} mm.', { a: sa.od, b: sb.od }) }); }
    gap += materialGap(sa.material, sb.material, diffs);
  } else if (a.category === 'nut') {
    if ((sa.variant || 'hex') !== (sb.variant || 'hex')) {
      gap += 0.12;
      diffs.push({ field: 'type', important: true, text: t('Type: {a} vs {b}. A plain nut can shake loose where a lock nut is required.', { a: nutName(sa.variant), b: nutName(sb.variant) }) });
    }
    gap += sizeGap(sa, sb, diffs);
    gap += materialGap(sa.material, sb.material, diffs);
  } else if (a.category === 'standoff') {
    if ((sa.gender || 'M-F') !== (sb.gender || 'M-F')) { gap += 0.2; diffs.push({ field: 'type', important: true, text: t('Ends: {a} vs {b}.', { a: sa.gender, b: sb.gender }) }); }
    gap += sizeGap(sa, sb, diffs);
    gap += lengthGap(sa.length, sb.length, diffs, true);
    gap += materialGap(sa.material, sb.material, diffs);
  }
  return { score: Math.max(0, Math.round((1 - gap) * 100) / 100), diffs };
}

const washerName = (v) => ({ flat: () => t('plain washer'), 'star-ext': () => t('star washer (external teeth)'), 'star-int': () => t('star washer (internal teeth)'), split: () => t('split spring washer') }[v || 'flat']?.() || v);
const nutName = (v) => ({ hex: () => t('plain hex nut'), nyloc: () => t('nylon-insert lock nut') }[v || 'hex']?.() || v);

export const LOOKALIKE_MIN = 0.6;

/** Parts in the library that look like `part`, best first. */
export function findLookalikes(parts, part, { min = LOOKALIKE_MIN, limit = 8 } = {}) {
  if (!isFastener(part)) return [];
  const out = [];
  for (const q of parts) {
    if (q.id === part.id) continue;
    const c = compareParts(part, q);
    if (c.score >= min) out.push({ part: q, score: c.score, diffs: c.diffs, duplicate: c.score >= 0.999 && c.diffs.length === 0 });
  }
  out.sort((x, y) => y.score - x.score);
  return out.slice(0, limit);
}

/** Short reason, e.g. "2 mm longer" or "Pozidriv, not Phillips". */
export function shortDifference(a, b) {
  const sa = a.spec || {}, sb = b.spec || {};
  if (sa.system && sb.system && sa.system !== sb.system) return t('inch thread, not metric');
  if (sa.d != null && sb.d != null && Math.abs(sa.d - sb.d) >= 0.01) return t('{b}, not {a}', { b: sb.thread || 'M' + sb.d, a: sa.thread || 'M' + sa.d });
  if (sa.length != null && sb.length != null && Math.abs(sa.length - sb.length) >= 0.01) {
    const dl = r2(Math.abs(sb.length - sa.length));
    return sb.length > sa.length ? t('{n} mm longer', { n: dl }) : t('{n} mm shorter', { n: dl });
  }
  if (sa.head !== sb.head && sb.head) return HEADS[sb.head] ? lower(HEADS[sb.head].label) : sb.head;
  if (sa.drive !== sb.drive && sb.drive) return t('{drive} drive', { drive: DRIVES[sb.drive]?.label || sb.drive });
  if ((sa.variant || '') !== (sb.variant || '')) return a.category === 'nut' ? nutName(sb.variant) : washerName(sb.variant);
  if (sa.material !== sb.material) return lower(matLabel(sb.material));
  return t('identical spec');
}
