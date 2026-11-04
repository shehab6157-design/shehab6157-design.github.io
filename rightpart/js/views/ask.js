import { html } from '../ui.js';
import { mountChat } from '../askui.js';

export default async function askView({ app, query }) {
  const q = query.get('q') || '';
  return {
    title: 'Ask',
    html: html`<div class="page narrow">
      <div class="page-head"><div>
        <h1>Ask a question</h1>
        <p class="lede">Ask the way you would ask a colleague: "which screw goes in step 7?", "torque for 100-0233?", "what is C-55013?", "difference between M3x8 and M3x10". Answers come from this company's own parts, steps and BOMs, with the source of each one, and work offline. English, Hebrew and Arabic questions are understood.</p>
      </div></div>
      <div class="ask-page" id="askHost"></div>
    </div>`,
    mount(root) {
      mountChat(root.querySelector('#askHost'), { app, initial: q, onLink: null });
    },
  };
}
