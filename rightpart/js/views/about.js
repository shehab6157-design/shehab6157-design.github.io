import { html, icon } from '../ui.js';

export default async function about() {
  return {
    title: 'About RightPart',
    html: html`<div class="page narrow">
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
          <li><b>Private and offline</b><span>A web app that installs on a tablet and works without a network. Data stays on the device; there is no server.</span></li>
        </ol>
      </section>

      <section class="card pad stack">
        <h2>Does this exist already?</h2>
        <p>Parts of it, yes. Digital work-instruction platforms (for example VKS, Tulip, Dozuki, SwipeGuide, Azumuta, Operations1, Poka and Augmentir) replace paper with step-by-step screens, and MES or electronic device-history-record systems can require a barcode scan for each component. Phone apps identify a screw from a photo or measure it with an on-screen caliper.</p>
        <p>What is usually missing is the layer in between: one identity for a part across every code it goes by, a check that the instructions still match the BOM after every engineering change, and look-alike warnings at the moment a part is picked. That is where a wrong screw hides for years, and it is what RightPart focuses on, in a form small enough to try on one bench in a day.</p>
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
            ['Every language on the line', 'Instructions in Hebrew, Arabic, Russian, English and more, with right-to-left layouts.'],
            ['Signed records', 'User log-in, electronic signatures and an audit trail for build records, then validation for production use.'],
            ['Shared photo identifier', 'Train once on the line\'s own parts and share it between stations.'],
          ].map(([t, d]) => html`<li class="card pad"><b>${t}</b><p class="small muted" style="margin-top:2px">${d}</p></li>`)}
        </ul>
      </section>

      <section class="stack tight">
        <h2>Built with</h2>
        <p class="small muted">three.js (MIT) for 3D · TensorFlow.js and MobileNet v1 (Apache 2.0) for on-device photo identification · ZXing (Apache 2.0) for barcodes. Everything else is plain HTML, CSS and JavaScript with no build step. The demo device, its parts, codes and suppliers are fictional.</p>
      </section>
    </div>`,
  };
}
