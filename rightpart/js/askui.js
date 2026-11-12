// Chat UI for the Ask assistant, used by the Ask page and the Ask panel on every page.
import { html, raw, icon, esc, toast } from './ui.js';
import { t, getLanguage } from './core/i18n.js';
import { th, rich } from './ui.js';
import { stepText, partText } from './core/content.js';
import { thumb, partHref, sevIcon } from './components.js';
import { answer, retrieveRecords } from './core/assistant.js';
import { currentWorkspace } from './store.js';
import { checkQuorum } from './core/quorum.js';

const history = []; // this session's conversation, shared by the page and the panel

function contextLabel(app, ctx) {
  const dev = ctx.deviceId ? app.index.devices.get(ctx.deviceId) : null;
  if (dev && ctx.stepId) {
    const i = dev.instructions.steps.findIndex((s) => s.id === ctx.stepId);
    if (i >= 0) return t('{device}, step {n}: {title}', { device: dev.name, n: i + 1, title: stepText(dev.instructions.steps[i], app.lib).title });
  }
  if (ctx.partId && app.index.parts.get(ctx.partId)) return `${ctx.partId} ${partText(app.index.parts.get(ctx.partId), app.lib).name}`;
  if (dev) return dev.name;
  return '';
}

function itemCard(it, lib) {
  const p = it.part;
  return html`<a class="mini ${it.flag ? 'flag' : ''}" href="${partHref(p.id)}">
    <span class="thumb">${thumb(p)}</span>
    <span><span class="t">${partText(p, lib).name}</span><br><span class="s"><span class="code">${p.id}</span>${it.torque ? html` · <span class="code">${it.torque}</span>` : ''}${it.note ? ` · ${it.note}` : ''}</span>
      ${it.codes?.length ? html`<br><span class="s">${t('Bin may read:')} <span class="code">${it.codes.join(', ')}</span></span>` : ''}
      ${it.flag ? html`<span class="warnline badline">${icon('stop')}<span>${t('Disputed: see the warning above')}</span></span>` : ''}
      ${(it.warnings || []).map((w) => html`<span class="warnline">${icon('alert')}<span>${rich(w)}</span></span>`)}
    </span>
    ${it.qty != null ? html`<span class="qty ${it.qty === 'A/R' ? 'ar' : ''}">${it.qty === 'A/R' ? t('qty::A/R') : `×${it.qty}`}</span>` : html`<span></span>`}
  </a>`;
}

export function renderAnswer(a, lib) {
  return html`<div class="a">
    ${a.text.map((line, i) => html`<p class="${i === 0 ? 'lead-line' : ''}">${rich(line)}</p>`)}
    ${a.lines.map((l) => html`<p class="warnline ${l.level === 'bad' ? 'badline' : ''}">${icon(l.level === 'bad' ? 'stop' : 'alert')}<span>${rich(l.text)}</span></p>`)}
    ${a.list.length ? (a.intent === 'how' ? html`<ol>${a.list.map((x) => html`<li>${rich(x)}</li>`)}</ol>` : html`<ul>${a.list.map((x) => html`<li>${rich(x)}</li>`)}</ul>`) : ''}
    ${a.items.length ? html`<div class="cards" style="margin-top:8px">${a.items.map((it) => itemCard(it, lib))}</div>` : ''}
    ${a.tools.length ? html`<p style="margin-top:8px"><b>${t('Tools:')}</b> ${a.tools.join(', ')}</p>` : ''}
    ${a.checks.length ? html`<p style="margin-top:8px"><b>${t('Check before moving on:')}</b></p><ul>${a.checks.map((c) => html`<li>${c}</li>`)}</ul>` : ''}
    ${a.why ? html`<p style="margin-top:8px"><b>${t('Why:')}</b> ${a.why}</p>` : ''}
    ${a.findings.length ? html`<ul>${a.findings.map((f) => html`<li><span class="warnline ${f.severity === 'critical' ? 'badline' : ''}">${sevIcon(f.severity)}<span>${rich(f.title)}</span></span></li>`)}</ul>` : ''}
    ${a.tip ? html`<p class="small muted" style="margin-top:8px">${rich(a.tip)}</p>` : ''}
    ${a.sources.length ? html`<div class="sources" style="margin-top:8px"><span class="tiny muted">${t('From:')}</span>${a.sources.map((s) => html`<a class="chip" href="${s.href}">${s.label}</a>`)}</div>` : ''}
  </div>
  ${a.followUps.length ? html`<div class="suggestions">${a.followUps.map((f) => html`<button class="chip" type="button" data-ask="${f === 'help' ? 'help' : f.replace(/\s*\([^()]*\)$/, '')}">${f === 'help' ? t('What can I ask?') : f}</button>`)}</div>` : ''}
  ${a.canAskAI ? html`<div class="suggestions" data-ai-slot></div>` : ''}`;
}

/** AI answers: [record ids] become links; nothing else from the model is trusted as markup. */
export function renderAI(app, res, records, question = '') {
  const byId = new Map(records.map((r) => [r.id, r]));
  const link = (id) => {
    const r = byId.get(id);
    if (!r) return null;
    if (r.type === 'part') return { href: partHref(id.slice(5)), label: id.slice(5) };
    if (r.type === 'step') { const [dev, st] = id.slice(5).split('/'); return { href: `#/guide/${encodeURIComponent(dev)}/${encodeURIComponent(st)}?mode=learn`, label: t('step {n}', { n: r.number }) }; }
    if (r.type === 'integrity-finding') return { href: '#/audit', label: t('integrity check') };
    if (r.type === 'bom-line') return { href: `#/device/${encodeURIComponent(id.slice(4).split('/')[0])}`, label: t('BOM item {items}', { items: r.item }) };
    if (r.type === 'engineering-change') return { href: `#/device/${encodeURIComponent(app.context.deviceId || '')}`, label: id.slice(7) };
    return null;
  };
  const paras = String(res.answer || '').split(/\n{2,}/).map((p) => esc(p).replace(/\[([^\]\s]{1,80})\]/g, (m, id) => {
    const l = link(id);
    return l ? `<a class="chip" href="${esc(l.href)}">${esc(l.label)}</a>` : '';
  }).replace(/\n/g, '<br>'));
  // Quorum light: every number and code in the answer must also be in the records it cites.
  const q = checkQuorum(res.answer, records, res.cited || [], { question, index: app.index });
  const body = html`${paras.map((p) => html`<p dir="auto">${raw(p)}</p>`)}${res.truncated ? html`<p class="small muted">${t('The answer was cut short.')}</p>` : ''}`;
  if (!q.ok) {
    const values = q.unsupported.slice(0, 4).map((u) => html`<bdi class="code nobr">${u.value}</bdi>`);
    return html`<div class="a">
      <div class="callout bad held" role="alert">${icon('stop')}<div><p class="t">${t('AI answer held back')}</p><p>${th('It gives {values}, which the records it cites do not contain. Do not act on it: follow the step, and ask your engineer or supervisor.', { values: html`${values.map((v, i) => html`${i ? ', ' : ''}${v}`)}` })}</p></div></div>
      <details class="more"><summary><span class="ic">${icon('eye')}</span>${t('Show the held answer (for an engineer to check)')}</summary><div class="body held-body">${body}</div></details>
    </div>`;
  }
  return html`<div class="a">
    <p class="tiny muted">${icon('sparkle')} ${t("AI answer from the company's records. Check it against the step before acting.")}</p>
    ${body}
    ${q.checked ? html`<p class="tiny quorum-ok">${icon('checkCircle')} ${t('{n, plural, one {The # number or code in this answer is in the records it cites.} other {All # numbers and codes in this answer are in the records it cites.}}', { n: q.checked })}</p>` : ''}
  </div>`;
}

async function aiAvailable() {
  const ws = currentWorkspace();
  if (ws.kind !== 'cloud') return false;
  try {
    const cloud = await import('./cloud.js');
    return !!(cloud.serverConfig() && (await cloud.getSession()));
  } catch { return false; }
}

/**
 * Builds the chat inside `root`: transcript, suggestions and the question box.
 * Returns { ask(q), destroy() }.
 */
export function mountChat(root, { app, onLink, initial, autofocus = true }) {
  const ctx = { ...app.context };
  const label = contextLabel(app, ctx);
  root.innerHTML = String(html`<div class="chat" id="chatLog" aria-live="polite"></div>
    <form class="ask-form" id="askForm" autocomplete="off">
      ${label ? html`<div class="ctx row between nowrap"><span class="row nowrap" style="gap:6px;min-width:0">${icon('target')}<span>${th('About: {what}', { what: html`<b>${label}</b>` })}</span></span><button class="btn sm ghost" type="button" id="ctxClear">${t('Ask in general')}</button></div>` : ''}
      <div class="row">
        <textarea id="askIn" rows="1" dir="auto" placeholder="${t('Ask about a part, a step, a code or a size…')}" aria-label="${t('Your question')}" enterkeyhint="send"></textarea>
        <button class="btn primary" type="submit" aria-label="${t('Ask')}">${icon('send', 'flip')}</button>
      </div>
    </form>`);
  const log = root.querySelector('#chatLog');
  const input = root.querySelector('#askIn');

  const scroll = () => { log.scrollTop = log.scrollHeight; };
  const paint = () => {
    if (!history.length) {
      log.innerHTML = String(html`<div class="msg">${renderAnswer(answer(app.index, app.audit, 'help', ctx), app.lib)}</div>`);
      return;
    }
    log.innerHTML = String(html`${history.map((h) => html`<div class="msg"><div class="q" dir="auto">${h.q}</div>${raw(h.html)}</div>`)}`);
    scroll();
  };

  const ask = async (q) => {
    q = String(q || '').trim();
    if (!q) return;
    const a = answer(app.index, app.audit, q, ctx);
    const entry = { q, html: String(html`${renderAnswer(a, app.lib)}`), a };
    history.push(entry);
    paint();
    if (a.canAskAI && (await aiAvailable())) {
      const slot = log.querySelector('.msg:last-child [data-ai-slot]');
      if (slot) slot.innerHTML = String(html`<button class="chip" type="button" data-ai="${history.length - 1}">${icon('sparkle')}${t("Ask the AI with the company's records")}</button>`);
    }
  };

  root.addEventListener('submit', (e) => { e.preventDefault(); const q = input.value; input.value = ''; input.style.height = ''; ask(q); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); root.querySelector('#askForm').requestSubmit(); } });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(140, input.scrollHeight)}px`; });
  root.querySelector('#ctxClear')?.addEventListener('click', (e) => { ctx.deviceId = ctx.stepId = ctx.partId = null; e.currentTarget.closest('.ctx').remove(); input.focus(); });
  root.addEventListener('click', async (e) => {
    const chip = e.target.closest('[data-ask]');
    if (chip) { ask(chip.dataset.ask); return; }
    const ai = e.target.closest('[data-ai]');
    if (ai) {
      const h = history[+ai.dataset.ai];
      ai.disabled = true;
      ai.innerHTML = String(html`<span class="spinner" style="width:16px;height:16px;border-width:2px"></span>${t('Asking…')}`);
      try {
        const records = retrieveRecords(app.index, app.audit, h.q, ctx);
        const cloud = await import('./cloud.js');
        // The AI answers in the worker's language; the records it cites stay as they are.
        const res = await cloud.askAI({ question: h.q, records, language: getLanguage() });
        h.html += String(res.refused ? html`<div class="a"><p>${res.message}</p></div>` : renderAI(app, res, records, h.q));
        paint();
      } catch (err) { toast(err.message, 'bad', 5000); ai.disabled = false; ai.textContent = t('Try the AI again'); }
      return;
    }
    const a = e.target.closest('a[href^="#/"]');
    if (a && onLink) onLink(a.getAttribute('href'));
  });

  paint();
  if (initial) ask(initial);
  if (autofocus && !matchMedia('(pointer: coarse)').matches) input.focus();
  return { ask };
}
