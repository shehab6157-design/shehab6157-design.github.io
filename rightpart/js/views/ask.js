import { html } from '../ui.js';
import { t } from '../core/i18n.js';
import { mountChat } from '../askui.js';

export default async function askView({ app, query }) {
  const q = query.get('q') || '';
  return {
    title: t('Ask'),
    html: html`<div class="page narrow">
      <div class="page-head"><div>
        <h1>${t('Ask a question')}</h1>
        <p class="lede">${t('Ask like you would ask a colleague, in your own language. Every answer shows where it comes from.')}</p>
      </div></div>
      <div class="ask-page" id="askHost"></div>
    </div>`,
    mount(root) {
      mountChat(root.querySelector('#askHost'), { app, initial: q, onLink: null });
    },
  };
}
