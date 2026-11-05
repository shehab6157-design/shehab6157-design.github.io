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
        <p class="lede">${t('Ask the way you would ask a colleague: "which screw goes in step 7?", "torque for 100-0233?", "what is C-55013?", "difference between M3x8 and M3x10". Answers come from this company\'s own parts, steps and BOMs, with the source of each one, and work offline. Ask in your own language: questions are understood in every language RightPart offers.')}</p>
      </div></div>
      <div class="ask-page" id="askHost"></div>
    </div>`,
    mount(root) {
      mountChat(root.querySelector('#askHost'), { app, initial: q, onLink: null });
    },
  };
}
