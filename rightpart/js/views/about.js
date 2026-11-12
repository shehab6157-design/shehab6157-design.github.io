import { html, icon } from '../ui.js';
import { t, getLanguage, baseOf } from '../core/i18n.js';

export default async function about() {
  return {
    title: t('About RightPart'),
    html: html`<div class="page narrow">
      ${baseOf(getLanguage()) !== 'en' ? html`<div class="callout info lang-note">${icon('globe')}<div><p>${t('This page about the idea is in English. The screens used on the line are translated.')}</p></div></div>` : ''}
      <div lang="en" dir="ltr" class="stack">
      <div class="page-head"><div>
        <h1>Why RightPart</h1>
        <p class="lede">Most assembly lines still build from step-by-step PDFs. RightPart is a working prototype of what those documents could be if they knew what every part is, and checked themselves.</p>
      </div></div>

      <section class="card pad stack">
        <h2>The problem</h2>
        <p>One screw can go by four names: the company's internal number, the customer's number, the supplier's catalogue number and an old code nobody retired. Two screws can differ only by 2 mm of length. And a PDF cannot check anything: when an engineering change swaps one screw for another, the instructions may never be updated, and the old screw keeps being fitted, build after build, until somebody happens to notice. That can take years.</p>
        <p>Every one of those failures is a data problem that a computer can catch in milliseconds, if the data is connected.</p>
      </section>

      <section class="stack">
        <h2>What it does</h2>
        <ol class="how">
          <li><b>One part, every code</b><span>Internal, customer, supplier, manufacturer and retired codes all resolve to one record, with or without dashes. A code that points to two parts is flagged as a stop.</span></li>
          <li><b>Drawn from the data</b><span>Every screw, nut, washer and standoff is drawn from its own spec, in 2D and in 3D, at true size on a calibrated screen or on a printed label. The picture can never disagree with the data.</span></li>
          <li><b>Look-alike guard</b><span>Parts that are easy to confuse (M3×8 and M3×10, Phillips and Pozidriv, M3 and #4-40) are found automatically and shown side by side with the difference named.</span></li>
          <li><b>Verify at the bench</b><span>In build mode the operator scans the bin before fitting. The wrong part gets a red stop and the reason; every scan, step and decision goes into a build record.</span></li>
          <li><b>Integrity check</b><span>BOM against instructions against change history against the part records. It finds the step that still fits the old screw after an engineering change, and says which change it missed.</span></li>
          <li><b>Learn and explain</b><span>Each part says what it does, why it was chosen and what happens if the wrong one is fitted. A short quiz is built from the real device.</span></li>
          <li><b>Identify loose parts</b><span>Measure a screw by laying it on the screen, photograph it (the identifier learns your parts on the device), or scan any code on it.</span></li>
          <li><b>Answer questions</b><span>"Which screw goes in this step?", "what is C-55013?", "M3×8 or M3×10?" The Ask assistant answers from the company's own data, with the source of each answer, offline and without AI, in the worker's own language. It never guesses a torque or a part number, and it warns when the data disagrees.</span></li>
          <li><b>Every language on the line</b><span>The interface in English and Hebrew today, with right-to-left layouts, and questions to Ask understood in 20 languages. Each step can carry its own translations; part codes, quantities and torques stay in the data, so they are the same in every language, and a translation that changes a number is held back. A company can add any other language from a spreadsheet.</span></li>
          <li><b>Every company, its own data</b><span>Any production company adds its own space and loads its parts, BOMs and steps from spreadsheets, from the PDF work instructions it already has, or with the step editor. With a company server, people sign in, roles decide who may change what, and every tablet gets the same published library.</span></li>
          <li><b>Private and offline</b><span>A web app that installs on a tablet and works without a network. Without a company server the data never leaves the device; with one, it goes only to the company's own server.</span></li>
        </ol>
      </section>

      <section class="card pad stack">
        <h2>Does this exist already?</h2>
        <p>Parts of it, yes. Digital work-instruction platforms (for example VKS, Tulip, Dozuki, SwipeGuide, Azumuta, Operations1, Poka and Augmentir) replace paper with step-by-step screens, and MES or electronic device-history-record systems can require a barcode scan for each component. Phone apps identify a screw from a photo or measure it with an on-screen caliper.</p>
        <p>What is usually missing is the layer in between: one identity for a part across every code it goes by, a check that the instructions still match the BOM after every engineering change, and look-alike warnings at the moment a part is picked. That is where a wrong screw hides for years, and it is what RightPart focuses on, in a form small enough to try on one bench in a day.</p>
        <p><a class="btn sm" href="#/challenges">${icon('alert')}Problems to expect, and what happened to others</a></p>
      </section>

      <section class="callout warn">${icon('shield')}<div>
        <p class="t">In a regulated factory</p>
        <p>In medical-device production, software that guides or records manufacturing is part of the quality system: it has to be validated and released under document control (ISO 13485 §4.1.6 and §7.5.6; FDA QMSR, 21 CFR 820) and, for electronic records and signatures, meet 21 CFR Part 11. RightPart is a prototype for showing the idea: run it as a pilot next to the controlled work instructions, never instead of them, and only with data your company has approved for the device it runs on.</p>
      </div></section>

      <section class="stack">
        <h2>Next steps</h2>
        <ul class="list-plain">
          ${[
            ['Pilot on one sub-assembly', 'Real codes, BOM and steps from engineering, on an approved, private copy. Measure wrong scans stopped and questions answered.'],
            ['Connect to ERP and PLM', 'Read codes, BOMs and engineering changes automatically, so the integrity check runs on every change instead of once.'],
            ['3D from CAD', 'Load the real assembly model (glTF exported from the CAD system) instead of the generated one.'],
            ['Every language on the line', 'The interface is in English and Hebrew (right to left), with Arabic, Russian and 16 more languages being translated. Step text can already be translated into any language, and a translation that changes a number is held back. Next: native speakers on the line check each language, and the AI on the company server drafts step translations for an engineer to approve.'],
            ['Signed records', 'Sign-in, roles and an activity log are there; next come electronic signatures for build records, then validation for production use.'],
            ['Scanned documents', 'PDFs that are photos or scans need text recognition before their steps can be read; then AI help for documents without clear step numbers, always approved by an engineer.'],
            ['Shared photo identifier', 'Train once on the line\'s own parts and share it between stations.'],
          ].map(([title, d]) => html`<li class="card pad"><b>${title}</b><p class="small muted" style="margin-top:2px">${d}</p></li>`)}
        </ul>
      </section>

      <section class="stack tight">
        <h2>Built with</h2>
        <p class="small muted">three.js (MIT) for 3D · TensorFlow.js and MobileNet v1 (Apache 2.0) for on-device photo identification · ZXing (Apache 2.0) for barcodes · pdf.js (Apache 2.0) for reading PDF work instructions · supabase-js (MIT) for the optional company server · Claude, only for the optional AI answers on a company's own server. Everything else is plain HTML, CSS and JavaScript with no build step. The demo device, its parts, codes and suppliers are fictional.</p>
      </section>
      </div>
    </div>`,
  };
}
