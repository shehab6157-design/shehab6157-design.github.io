// Finds parts that are easy to mistake for each other, and says how to tell them apart.
// Pure functions: works on part records { id, category, spec }.

import { HEADS, DRIVES, MATERIALS, isFastener } from './dims.js';

const HEAD_GAP = {
  'pan|cheese': 0.22, 'pan|button': 0.25, 'button|cheese': 0.28, 'button|socket': 0.3, 'cheese|socket': 0.25, 'pan|socket': 0.32,
};
const headGap = (a, b) => (a === b ? 0 : HEAD_GAP[[a, b].sort().join('|')] ?? 0.5);

const DRIVE_GAP = { 'phillips|pozidriv': 0.06, 'hex|torx': 0.16, 'phillips|torx': 0.28, 'phillips|slotted': 0.3, 'pozidriv|torx': 0.28 };
const driveGap = (a, b) => (a === b ? 0 : DRIVE_GAP[[a, b].sort().join('|')] ?? 0.4);

const isMetal = (m) => MATERIALS[m]?.metal !== false;
const matLabel = (m) => MATERIALS[m]?.label || m || 'unknown';
const r2 = (v) => Math.round(v * 100) / 100;

function sizeGap(sa, sb, diffs) {
  const da = sa.d, db = sb.d;
  if (da == null || db == null) return 0;
  const sysA = sa.system || 'metric', sysB = sb.system || 'metric';
  const dd = Math.abs(da - db);
  if (sysA !== sysB) {
    diffs.push({ field: 'thread', important: true, text: `Thread: ${sa.thread || 'M' + da} vs ${sb.thread || 'M' + db}. One is metric, the other is inch (unified). They look almost the same but will not screw into each other's holes: forcing it strips the thread.` });
    return dd <= 0.4 ? 0.08 : dd <= 0.8 ? 0.2 : 0.6;
  }
  if (dd < 0.01) {
    if (sa.pitch && sb.pitch && Math.abs(sa.pitch - sb.pitch) > 0.001) {
      diffs.push({ field: 'pitch', important: true, text: `Thread pitch: ${sa.pitch} mm vs ${sb.pitch} mm. Same diameter, different thread: they will not mate.` });
      return 0.05;
    }
    return 0;
  }
  diffs.push({ field: 'diameter', important: true, text: `Thread diameter: ${sa.thread || 'M' + da} vs ${sb.thread || 'M' + db} (${r2(dd)} mm apart). ${dd <= 0.5 ? 'Very close by eye: check with the gauge or try the nut.' : ''}`.trim() });
  return dd <= 0.5 ? 0.15 : dd <= 1 ? 0.32 : 0.65;
}

function lengthGap(la, lb, diffs, label = 'Length') {
  if (la == null || lb == null) return 0;
  const dl = Math.abs(la - lb);
  if (dl < 0.01) return 0;
  const longer = lb > la ? 'longer' : 'shorter';
  diffs.push({ field: 'length', important: true, text: `${label}: ${la} mm vs ${lb} mm (${r2(dl)} mm ${longer}). ${dl <= 2.5 ? 'Hard to see by eye: lay it on the true-scale drawing or use the gauge.' : ''}`.trim() });
  const rel = dl / Math.max(la, lb);
  if (dl <= 2.5 && rel <= 0.35) return 0.08;
  if (dl <= 4) return 0.16;
  if (dl <= 6) return 0.3;
  return 0.55;
}

function materialGap(ma, mb, diffs) {
  if (!ma || !mb || ma === mb) return 0;
  const metalA = isMetal(ma), metalB = isMetal(mb);
  diffs.push({ field: 'material', important: metalA !== metalB, text: `Material: ${matLabel(ma)} vs ${matLabel(mb)}.${metalA !== metalB ? ' Plastic and metal are not interchangeable.' : ma.startsWith('A') || mb.startsWith('A') ? ' Stainless and plated steel look alike under bench light; a magnet tells them apart (A2 barely sticks).' : ''}` });
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
      diffs.push({ field: 'head', important: true, text: `Head: ${HEADS[sa.head]?.label || sa.head} vs ${HEADS[sb.head]?.label || sb.head}.` });
    }
    if (sa.drive !== sb.drive) {
      gap += driveGap(sa.drive, sb.drive);
      const pp = [sa.drive, sb.drive].sort().join('|') === 'phillips|pozidriv';
      diffs.push({ field: 'drive', important: pp, text: `Drive: ${DRIVES[sa.drive]?.label || sa.drive} vs ${DRIVES[sb.drive]?.label || sb.drive}.${pp ? ' Look for the 4 fine lines between the arms: those mark Pozidriv.' : ''}` });
    }
    gap += sizeGap(sa, sb, diffs);
    gap += lengthGap(sa.length, sb.length, diffs);
    gap += materialGap(sa.material, sb.material, diffs);
    if (!!sa.tapping !== !!sb.tapping) { gap += 0.25; diffs.push({ field: 'type', important: true, text: 'One is a self-tapping screw, the other a machine screw.' }); }
  } else if (a.category === 'washer') {
    if ((sa.variant || 'flat') !== (sb.variant || 'flat')) {
      gap += 0.35;
      diffs.push({ field: 'type', important: true, text: `Type: ${washerName(sa.variant)} vs ${washerName(sb.variant)}. They do different jobs.` });
    }
    gap += sizeGap(sa, sb, diffs);
    if (sa.od && sb.od && Math.abs(sa.od - sb.od) > 0.01) { gap += Math.abs(sa.od - sb.od) <= 1.5 ? 0.08 : 0.2; diffs.push({ field: 'od', important: false, text: `Outside diameter: ${sa.od} mm vs ${sb.od} mm.` }); }
    gap += materialGap(sa.material, sb.material, diffs);
  } else if (a.category === 'nut') {
    if ((sa.variant || 'hex') !== (sb.variant || 'hex')) {
      gap += 0.12;
      diffs.push({ field: 'type', important: true, text: `Type: ${nutName(sa.variant)} vs ${nutName(sb.variant)}. A plain nut can shake loose where a lock nut is required.` });
    }
    gap += sizeGap(sa, sb, diffs);
    gap += materialGap(sa.material, sb.material, diffs);
  } else if (a.category === 'standoff') {
    if ((sa.gender || 'M-F') !== (sb.gender || 'M-F')) { gap += 0.2; diffs.push({ field: 'type', important: true, text: `Ends: ${sa.gender} vs ${sb.gender}.` }); }
    gap += sizeGap(sa, sb, diffs);
    gap += lengthGap(sa.length, sb.length, diffs, 'Body length');
    gap += materialGap(sa.material, sb.material, diffs);
  }
  return { score: Math.max(0, Math.round((1 - gap) * 100) / 100), diffs };
}

const washerName = (v) => ({ flat: 'plain washer', 'star-ext': 'star washer (external teeth)', 'star-int': 'star washer (internal teeth)', split: 'split spring washer' }[v || 'flat'] || v);
const nutName = (v) => ({ hex: 'plain hex nut', nyloc: 'nylon-insert lock nut' }[v || 'hex'] || v);

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
  if (sa.system && sb.system && sa.system !== sb.system) return 'inch thread, not metric';
  if (sa.d != null && sb.d != null && Math.abs(sa.d - sb.d) >= 0.01) return `${sb.thread || 'M' + sb.d}, not ${sa.thread || 'M' + sa.d}`;
  if (sa.length != null && sb.length != null && Math.abs(sa.length - sb.length) >= 0.01) {
    const dl = r2(Math.abs(sb.length - sa.length));
    return `${dl} mm ${sb.length > sa.length ? 'longer' : 'shorter'}`;
  }
  if (sa.head !== sb.head && sb.head) return `${HEADS[sb.head]?.label.toLowerCase() || sb.head}`;
  if (sa.drive !== sb.drive && sb.drive) return `${DRIVES[sb.drive]?.label || sb.drive} drive`;
  if ((sa.variant || '') !== (sb.variant || '')) return a.category === 'nut' ? nutName(sb.variant) : washerName(sb.variant);
  if (sa.material !== sb.material) return matLabel(sb.material).toLowerCase();
  return 'identical spec';
}
