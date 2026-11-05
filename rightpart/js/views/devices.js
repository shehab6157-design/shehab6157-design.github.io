import { html, icon } from '../ui.js';
import { t } from '../core/i18n.js';
import { emptyState } from '../components.js';

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
      <div class="page-head"><div><h1>${t('Build guides')}</h1><p class="lede">${t('Pick a device to see it in 3D, learn its steps, or start a recorded build.')}</p></div><a class="btn" href="#/editor/new">${icon('plus')}${t('Add a device')}</a></div>
      ${list.length ? html`<div class="grid two">${list.map((d) => {
        const f = app.audit.findings.filter((x) => x.deviceId === d.id && x.severity === 'critical').length;
        return html`<a class="tile" href="#/device/${encodeURIComponent(d.id)}">
          <span class="ic ${f ? 'bad' : ''}">${icon(f ? 'alert' : 'cube')}</span>
          <h3>${d.name}</h3>
          <p>${d.description || ''}</p>
          <span class="meta">${t('{n, plural, one {# step} other {# steps}}', { n: d.instructions?.steps?.length || 0 })} · ${t('BOM rev {rev}', { rev: d.bom?.rev || '?' })} · ${f ? t('{n, plural, one {# critical issue} other {# critical issues}}', { n: f }) : t('no critical issues')}</span>
        </a>`;
      })}</div>` : emptyState(t('No devices for this company yet.'), html`<div class="row" style="justify-content:center"><a class="btn primary" href="#/editor/new">${icon('plus')}${t('Add a device')}</a><a class="btn" href="#/setup">${icon('checklist')}${t('Setup checklist')}</a></div>`)}
    </div>`,
  };
}
