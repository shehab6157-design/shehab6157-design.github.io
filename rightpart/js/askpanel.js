// The Ask panel: opens from the button on every page and knows where the person is
// (device, step or part), so "which screw here?" answers for the step on screen.
import { html, icon } from './ui.js';
import { t } from './core/i18n.js';
import { mountChat } from './askui.js';

let open = null;

export function openAskPanel({ app, navigate }) {
  if (open) { open.querySelector('#askIn')?.focus(); return; }
  const d = document.createElement('dialog');
  d.className = 'dlg sheet';
  d.setAttribute('aria-label', t('Ask a question'));
  d.innerHTML = String(html`<div class="dh"><h2>${icon('chat')} ${t('Ask')}</h2><div class="row nowrap"><a class="btn sm ghost" href="#/ask" data-full>${t('Full page')}</a><button class="icon-btn" type="button" data-close aria-label="${t('Close')}">${icon('x')}</button></div></div><div class="ask-body" style="display:grid;grid-template-rows:1fr auto;min-height:0;overflow:hidden"></div>`);
  document.body.append(d);
  open = d;
  const close = () => d.close();
  d.addEventListener('close', () => { d.remove(); open = null; });
  d.addEventListener('click', (e) => {
    if (e.target === d || e.target.closest('[data-close]')) close();
    const full = e.target.closest('[data-full]');
    if (full) { e.preventDefault(); close(); navigate('#/ask'); }
  });
  d.showModal();
  mountChat(d.querySelector('.ask-body'), {
    app,
    onLink: (href) => { close(); navigate(href); },
  });
}
