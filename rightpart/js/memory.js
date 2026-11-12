// The current company's learned mix-ups: this tablet's build records plus the memory an engineer
// shared with the library. Cached per library; forget() after a wrong part is stopped.
import { listRecords } from './store.js';
import { mixupsFromRecords, mergeMixups, memoryIndex, confusedPairs } from './core/immune.js';
import { assignSignals } from './core/signals.js';

let cache = null; // { lib, memory }
let sigCache = null; // { lib, signals }

export async function getMemory(app) {
  if (cache && cache.lib === app.lib) return cache.memory;
  let local = [];
  try { local = mixupsFromRecords(await listRecords('build')); } catch { /* no records on this device */ }
  const memory = memoryIndex(mergeMixups(app.lib.memory?.mixups || [], local), app.index);
  memory.local = local;
  cache = { lib: app.lib, memory };
  return memory;
}

export function forgetMemory() { cache = null; sigCache = null; }

/** Signal marks for the current library: locked ones as printed, the others assigned from rivalries. */
export async function getSignals(app) {
  if (sigCache && sigCache.lib === app.lib) return sigCache.signals;
  const memory = await getMemory(app);
  const signals = assignSignals(app.index, { locked: app.lib.signals || {}, confused: confusedPairs(memory.all) });
  sigCache = { lib: app.lib, signals };
  return signals;
}
