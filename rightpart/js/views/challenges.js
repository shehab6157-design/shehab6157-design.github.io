import { html, icon } from '../ui.js';
import { t, getLanguage, baseOf } from '../core/i18n.js';
import { PROBLEMS, SOURCES } from '../problems.js';

export default async function challenges() {
  const groups = [...new Set(PROBLEMS.map((p) => p.group))];
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    title: t('Problems to expect'),
    html: html`<div class="page narrow">
      <div class="page-head"><div>
        <h1>${t('Problems to expect')}</h1>
        <p class="lede">${t('{n} problems that products like RightPart, and the companies using them, have run into: what goes wrong, what happened elsewhere, how RightPart handles it today, and what is still open. Most sources are vendor or consultancy articles: read them as experience, not as statistics.', { n: PROBLEMS.length })}</p>
      </div></div>
      ${baseOf(getLanguage()) !== 'en' ? html`<div class="callout info lang-note">${icon('globe')}<div><p>${t('This research page is in English, with its sources. The screens used on the line are translated.')}</p></div></div>` : ''}
      <div lang="en" dir="ltr" class="stack">
      <nav class="toc" aria-label="Groups">${groups.map((g) => html`<a class="chip" href="#/challenges" data-jump="${slug(g)}">${g} (${PROBLEMS.filter((p) => p.group === g).length})</a>`)}</nav>
      ${groups.map((g) => html`<section class="stack anchor-target" id="g-${slug(g)}">
        <h2>${g}</h2>
        ${PROBLEMS.filter((p) => p.group === g).map((p) => html`<article class="risk">
          <h3>${p.title}</h3>
          <p>${p.what}</p>
          <p class="seen"><b>Seen elsewhere:</b> ${p.seen}${p.sources.length ? html` ${p.sources.map((k) => html`<a href="${SOURCES[k].url}" target="_blank" rel="noopener noreferrer" class="tiny">[${SOURCES[k].title.split(':')[0]}]</a> `)}` : ''}</p>
          <p class="fix"><b>Handled today: </b>${p.handled}</p>
          <p class="todo"><b>Still open: </b>${p.todo}</p>
        </article>`)}
      </section>`)}
      <section class="card pad stack">
        <h2>Sources</h2>
        <ul class="list-plain small">${Object.values(SOURCES).map((s) => html`<li>${icon('external')} <a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.title}</a></li>`)}</ul>
      </section>
      </div>
    </div>`,
    mount(root) {
      root.querySelectorAll('[data-jump]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); root.querySelector(`#g-${a.dataset.jump}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    },
  };
}
