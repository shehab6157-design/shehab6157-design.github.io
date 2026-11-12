// Learned from nature: the seven safeguards copied from designs that already work in creation (and
// one proven in space), each with the problem it answers, what it does here, and its state now.
import { html, th, icon, toast, openDialog } from '../ui.js';
import { t, getLanguage } from '../core/i18n.js';
import { settings, setSetting, listRecords } from '../store.js';
import { getMemory, getSignals } from '../memory.js';
import { unsharedCount } from '../core/immune.js';
import { policyOf, nightWatchState } from '../core/nightwatch.js';
import { depositsFrom, trails, libraryDeposits } from '../core/trails.js';
import { chambers } from '../chambers.js';

const clock = (h) => { try { return new Date(2020, 0, 1, Math.floor(h), Math.round((h % 1) * 60)).toLocaleTimeString(getLanguage(), { hour: 'numeric', minute: '2-digit', numberingSystem: 'latn' }); } catch { return `${h}:00`; } };

export default async function nature({ app, navigate }) {
  const memory = await getMemory(app);
  const signals = await getSignals(app);
  const unshared = unsharedCount(app.lib.memory, memory.local);
  const marks = [...signals.marks.values()];
  const policy = policyOf(app.lib);
  const nw = nightWatchState(Date.now(), policy, settings().session);
  const previewOn = (settings().nightPreviewUntil || 0) > Date.now();
  const { trustList } = await import('./sync.js');
  const trusted = (await trustList()).length;
  const versions = await chambers();
  const records = await listRecords();
  const tr = trails([...depositsFrom(records), ...libraryDeposits(app.lib)]);
  const hot = [];
  for (const [devId, d] of tr) {
    const dev = app.index.devices.get(devId);
    if (!dev || !d.visible) continue;
    for (const [stepId, st] of d.steps) {
      const no = (dev.instructions?.steps || []).findIndex((s) => s.id === stepId) + 1;
      if (no) hot.push({ dev, no, st });
    }
  }
  hot.sort((a, b) => b.st.strength - a.st.strength);

  const card = (id, ic, title, from, problem, does, status, actions = '') => html`<article class="card nature-card" id="${id}">
    <div class="card-head"><h2>${icon(ic)} ${title}</h2></div>
    <div class="card-body stack tight">
      <p class="from"><b>${t('From nature:')}</b> ${from}</p>
      <p><b>${t('The problem:')}</b> ${problem}</p>
      <p><b>${t('In RightPart:')}</b> ${does}</p>
      <p class="state">${status}</p>
      ${actions ? html`<div class="row">${actions}</div>` : ''}
    </div>
  </article>`;

  return {
    title: t('Learned from nature'),
    html: html`<div class="page narrow">
      <div class="page-head"><div>
        <h1>${t('Learned from nature')}</h1>
        <p class="lede">${t('Each safeguard here copies a design that already works in creation, on land and in the sea, or one already proven in space. Each answers a problem that work-instruction products and the companies using them keep running into.')}</p>
      </div></div>

      ${card('memory', 'antibody', t('Learned mix-ups'),
        t('A body that has met an infection once fights it faster the second time: immune memory.'),
        t('Look-alike parts get mixed up, and the lesson stays with the one person who made the mistake.'),
        t('Every wrong part stopped at the bench is remembered at its step. The next person there is warned before picking, the quiz asks about real mix-ups first, like a vaccine, and an engineer can share the memory with every tablet.'),
        memory.total ? t('{n, plural, one {# mix-up remembered} other {# mix-ups remembered}} at {s, plural, one {# step} other {# steps}}.', { n: memory.total, s: memory.byStep.size }) + (unshared ? ` ${t('{n, plural, one {# on this tablet is not shared yet.} other {# on this tablet are not shared yet.}}', { n: unshared })}` : '') : t('Nothing learned yet.'),
        html`<a class="btn sm" href="#/audit">${icon('shield')}${t('Learned mix-ups')}</a>`)}

      ${card('marks', 'tag', t('Signal marks'),
        t('Where two similar species live side by side, they evolve to look more different than where they live apart: character displacement.'),
        t('M3×8 next to M3×10 cannot be told apart at a glance, and not everyone on the line reads the same language or sees every colour.'),
        t('Parts that look alike, or that were really mixed up, and that are used in the same device get marks that differ in colour and in shape: on the bin label, on the screen and next to the scan box. The colours are safe for colour-blind eyes, and a shape needs no reading.'),
        marks.length ? t('{n, plural, one {# part carries a mark} other {# parts carry a mark}}, {k} locked.', { n: marks.length, k: marks.filter((m) => m.locked).length }) + (signals.clashes.length ? ` ${t('{n, plural, one {# pair still shares a colour or a shape.} other {# pairs still share a colour or a shape.}}', { n: signals.clashes.length })}` : '') : t('No look-alike parts share a device: no marks needed.'),
        html`<a class="btn sm" href="#/labels">${icon('print')}${t('Signal marks and labels')}</a>`)}

      ${card('quorum', 'sparkle', t('Quorum light'),
        t('Glowing bacteria in the bobtail squid light up only when enough of them signal together, and an immune cell acts only after a second, confirming signal.'),
        t('An AI can give a confident, wrong torque or part number.'),
        t('An AI answer is shown only if every number and part code in it is also in the company records it cites, or in the question. Otherwise it is held back and the worker is told to follow the step and ask. The offline assistant answers only from the records.'),
        t('On for every AI answer from the company server.'))}

      ${card('night', 'moon', t('Night watch'),
        t('The body clock: alertness is lowest in the early morning hours, and mistakes are about 30% more likely on night shifts than on mornings, more than twice as likely by the 12th hour on duty.'),
        t('The same check that is enough at 10 a.m. may not be enough at 4 a.m.'),
        t('From {from} to {to}, or after {h} hours of use without a long pause, parts that have a look-alike get a second look after the scan: point at the part and say its size, as Japanese railway workers point and call. It reads the clock and the tablet’s use, never a person.', { from: clock(policy.from), to: clock(policy.to), h: policy.longHours || '–' }),
        !policy.enabled ? t('Off for this company.') : previewOn ? t('Being tried now, for a few minutes.') : nw.active ? t('On right now.') : t('On for this company; not active right now.'),
        html`<button class="btn sm" type="button" id="tryNight">${icon('moon')}${previewOn ? t('Stop trying it') : t('Try it for 10 minutes')}</button><button class="btn sm" type="button" id="nightSettings">${icon('edit')}${t('Settings')}</button>`)}

      ${card('light', 'light', t('Light sync'),
        t('Fireflies and deep-sea animals talk with light; NASA moves data between spacecraft by store and forward; the EU COVID certificate and Bitcoin hardware wallets already carry signed data in QR codes.'),
        t('Factory Wi-Fi drops, some rooms allow no network at all, and some customers forbid the cloud.'),
        t('Tablets pass the library, build records and their keys through the screen and the camera. Missed frames do not matter, and every package is signed: a tablet installs a library only from a key it trusts, after comparing eight symbols with the sender’s screen.'),
        t('{n, plural, one {# trusted key} other {# trusted keys}} on this tablet.', { n: trusted }),
        html`<a class="btn sm" href="#/sync">${icon('light')}${t('Light sync')}</a>`)}

      ${card('trails', 'layers', t('Floor trails'),
        t('Ants leave scent where they walk: used paths grow strong, unused ones evaporate, and the trail says many passed, never which ant.'),
        t('Instructions are written in an office, and people feel watched when every mistake carries their name.'),
        t('Wrong parts, overrides, reports, unknown codes and long pauses leave a mark on their step, and every mark fades by half in two weeks. Engineers see which steps trouble the floor now, and whether a change to the instructions made the trail fade. No names are kept, and trails show only once several builds contribute.'),
        hot.length ? th('Strongest trail now: {where}.', { where: html`<a href="#/device/${encodeURIComponent(hot[0].dev.id)}">${hot[0].dev.name} · ${t('step {n}', { n: hot[0].no })}</a>` }) : t('No trails yet.'),
        hot.length ? html`<a class="btn sm" href="#/device/${encodeURIComponent(hot[0].dev.id)}">${icon('layers')}${t('Floor trails')}</a>` : '')}

      ${card('seals', 'lock', t('Sealed chambers'),
        t('A nautilus seals each chamber it outgrows, and no inner tree ring can change without cutting through every ring outside it.'),
        t('In regulated production, records must show if anything was changed afterwards, and a bad update must not stop the line.'),
        t('Every library version a tablet runs and every build it completes is sealed into a chain. Change an old one and every seal after it breaks; anyone can check this offline. The last versions are kept whole, so the line can go back to one in a minute.'),
        t('{n, plural, one {# version sealed} other {# versions sealed}} on this tablet.', { n: versions.length }) + (app.sealOk === false ? ` ${t('The running library does not match its seal.')}` : ''),
        html`<a class="btn sm" href="#/data?go=versions">${icon('lock')}${t('Sealed versions')}</a>`)}

      <p class="small muted">${th('These are safeguards around the released documents, not a replacement for them: RightPart is a prototype, not validated for regulated production. See {problems}.', { problems: html`<a href="#/challenges">${t('Problems to expect')}</a>` })}</p>
    </div>`,
    mount(root) {
      root.querySelector('#tryNight')?.addEventListener('click', () => {
        setSetting('nightPreviewUntil', previewOn ? null : Date.now() + 10 * 60e3);
        toast(previewOn ? t('Night watch is back to the clock.') : t('Night watch is on for 10 minutes: start a build to see the second look.'), 'ok', 5000);
        navigate('#/nature');
      });
      root.querySelector('#nightSettings')?.addEventListener('click', async () => {
        let next = null;
        const ok = await openDialog({
          title: t('Night watch for this company'),
          body: String(html`<label class="check"><input type="checkbox" id="nwOn" ${policy.enabled ? 'checked' : ''}><span>${t('On')}</span></label>
            <div class="row"><div class="field"><label for="nwFrom">${t('From (hour, 0–24)')}</label><input id="nwFrom" type="number" min="0" max="24" step="0.5" value="${policy.from}"></div>
            <div class="field"><label for="nwTo">${t('To (hour, 0–24)')}</label><input id="nwTo" type="number" min="0" max="24" step="0.5" value="${policy.to}"></div></div>
            <div class="field"><label for="nwLong">${t('Also after this many hours of use without a long pause (0 = never)')}</label><input id="nwLong" type="number" min="0" max="24" step="1" value="${policy.longHours}"></div>
            <p class="tiny muted">${t('This is a company choice: it travels with the library to every tablet.')}</p>`),
          actions: [{ label: t('Cancel'), value: false }, { label: t('Save'), value: true, primary: true }],
          onClose(d) { next = { enabled: d.querySelector('#nwOn').checked, from: +d.querySelector('#nwFrom').value, to: +d.querySelector('#nwTo').value, longHours: +d.querySelector('#nwLong').value }; },
        });
        if (!ok || !next) return;
        const { commitLibrary } = await import('../importflows.js');
        await commitLibrary(app, { ...app.lib, policy: { ...(app.lib.policy || {}), nightWatch: policyOf({ policy: { nightWatch: next } }) } }, t('Night watch settings saved.'));
        navigate('#/nature');
      });
    },
  };
}
