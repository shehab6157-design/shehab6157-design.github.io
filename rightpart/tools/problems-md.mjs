// Writes docs/PROBLEMS.md from js/problems.js, so the page and the document never disagree.
// Run from the rightpart folder:  node tools/problems-md.mjs
import { writeFileSync } from 'node:fs';
import { PROBLEMS, SOURCES } from '../js/problems.js';

const groups = [...new Set(PROBLEMS.map((p) => p.group))];
const anchor = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, '').trim().replace(/ +/g, '-');
const out = [];
out.push('# Problems to expect');
out.push('');
out.push(`${PROBLEMS.length} problems that products like RightPart, and the companies using them, have run into: what goes wrong, what happened elsewhere, how RightPart handles it today, and what is still open.`);
out.push('');
out.push('Most sources are vendor or consultancy articles. Read them as experience, not as statistics.');
out.push('');
out.push('The same list is in the app under **More → Problems to expect**. This file is generated from `js/problems.js` by `node tools/problems-md.mjs`; edit that file, not this one.');
out.push('');
for (const g of groups) out.push(`- [${g}](#${anchor(g)}) (${PROBLEMS.filter((p) => p.group === g).length})`);
out.push('');
for (const g of groups) {
  out.push(`## ${g}`);
  out.push('');
  for (const p of PROBLEMS.filter((x) => x.group === g)) {
    out.push(`### ${p.title}`);
    out.push('');
    out.push(p.what);
    out.push('');
    const refs = p.sources.map((k) => `[${SOURCES[k].title.split(':')[0]}](${SOURCES[k].url})`).join(', ');
    out.push(`- **Seen elsewhere:** ${p.seen}${refs ? ` (${refs})` : ''}`);
    out.push(`- **Handled today:** ${p.handled}`);
    out.push(`- **Still open:** ${p.todo}`);
    out.push('');
  }
}
out.push('## Sources');
out.push('');
for (const s of Object.values(SOURCES)) out.push(`- [${s.title}](${s.url})`);
out.push('');
writeFileSync(new URL('../docs/PROBLEMS.md', import.meta.url), out.join('\n'));
console.log(`docs/PROBLEMS.md: ${PROBLEMS.length} problems, ${Object.keys(SOURCES).length} sources`);
