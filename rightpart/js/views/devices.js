import { html, icon } from '../ui.js';
import { t } from '../core/i18n.js';
import { emptyState, productCard } from '../components.js';
import { fillPosters } from '../posters.js';

export default async function devices(ctx) {
  const { app } = ctx;
  const list = app.lib.devices || [];
  if (list.length === 1) {
    // One device: go straight to it.
    return (await import('./device.js')).default({ ...ctx, params: { id: list[0].id } });
  }
  return {
    title: t('Build guides'),
    html: html`<div class="page">
      <div class="page-head"><div><h1>${t('Build guides')}</h1></div><a class="btn" href="#/editor/new">${icon('plus')}${t('Add a device')}</a></div>
      ${list.length ? html`<div class="prods">${list.map((d) => productCard(app, d))}</div>` : emptyState(t('No devices for this company yet.'), html`<div class="row" style="justify-content:center"><a class="btn primary" href="#/editor/new">${icon('plus')}${t('Add a device')}</a><a class="btn" href="#/setup">${icon('checklist')}${t('Setup checklist')}</a></div>`)}
    </div>`,
    mount(root) { fillPosters(app, root); },
  };
}
