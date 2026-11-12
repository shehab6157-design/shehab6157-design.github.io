import { html, raw, icon, toast, openDialog, confirmDialog, fmtDate, esc } from '../ui.js';
import { workspaces, currentWorkspace, addWorkspace, updateWorkspace, deleteWorkspace, libraryMeta } from '../store.js';
import { switchWorkspace, reloadLibrary } from '../app.js';
import { th } from '../ui.js';
import { t } from '../core/i18n.js';

const ROLE = { owner: () => t('role::Owner'), admin: () => t('role::Admin'), engineer: () => t('role::Engineer'), supervisor: () => t('role::Supervisor'), operator: () => t('role::Operator'), viewer: () => t('role::Viewer') };
const roleName = (r) => ROLE[r]?.() || r || t('member');
const wsName = (w) => (w.kind === 'demo' ? t('Demo: Nova-1 (fictional)') : w.name);
const kindLabel = (w) => (w.kind === 'demo' ? t('Demo') : w.kind === 'cloud' ? t('Signed in · {role}', { role: roleName(w.org?.role) }) : t('On this device only'));
const avatar = (w) => (w.kind === 'demo' ? icon('cube') : w.kind === 'cloud' ? icon('cloud') : raw(esc(w.name.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join(''))));

/** Quick company switcher (from the button in the top bar). */
export function workspaceDialog({ navigate }) {
  const cur = currentWorkspace();
  return openDialog({
    title: t('Switch company'),
    body: String(html`<p class="muted small">${t('Each company has its own parts, devices, steps and records. They never mix.')}</p>
      <div class="ws-list">${workspaces().map((w) => html`<div class="ws-item" aria-current="${w.id === cur.id}">
        <span class="av">${avatar(w)}</span>
        <span><span class="t" dir="auto">${wsName(w)}</span><br><span class="s">${kindLabel(w)}</span></span>
        ${w.id === cur.id ? html`<span class="chip brand">${t('Current')}</span>` : html`<button class="btn sm" type="button" data-open="${w.id}">${t('Open')}</button>`}
      </div>`)}</div>
      <form class="verify-row" id="wsAdd" autocomplete="off"><input id="wsName" type="text" dir="auto" placeholder="${t('New company name')}" aria-label="${t('New company name')}" maxlength="80"><button class="btn primary" type="submit">${icon('plus')}${t('Add')}</button></form>`),
    actions: [{ label: t('Companies and sign-in'), value: 'manage' }, { label: t('Close'), value: null }],
    onMount(d, close) {
      d.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', async () => { close(null); await switchWorkspace(b.dataset.open); }));
      d.querySelector('#wsAdd').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = d.querySelector('#wsName').value.trim();
        if (!name) { d.querySelector('#wsName').focus(); return; }
        const w = addWorkspace({ name, kind: 'local' });
        close(null);
        await switchWorkspace(w.id, '#/load');
      });
    },
  }).then((v) => { if (v === 'manage') navigate('#/companies'); });
}

export default async function companies({ app, navigate }) {
  const cloud = await import('../cloud.js');
  const cfg = cloud.serverConfig();
  const cur = currentWorkspace();
  let session = null, orgs = [], cloudError = null, team = null;
  if (cfg) {
    try {
      session = await cloud.getSession();
      if (session) orgs = await cloud.myCompanies();
      if (session && cur.kind === 'cloud' && cloud.canManage(cur.org?.role)) team = await cloud.members(cur.org.id);
    } catch (e) { cloudError = e.message; }
  }
  const meta = await libraryMeta();
  const list = workspaces();
  return {
    title: t('Companies and sign-in'),
    html: html`<div class="page narrow">
      <div class="page-head"><div>
        <h1>${t('Companies and sign-in')}</h1>
        <p class="lede">${t('RightPart works for any production company. Each company gets its own space: its parts and codes, its devices and BOMs, its steps and its records. Keep a company on this device only, or sign in to a company server so the whole team shares one library.')}</p>
      </div></div>

      <section class="card">
        <div class="card-head"><h2>${t('Companies on this device')}</h2><span class="chip">${list.length}</span></div>
        <div class="card-body stack">
          <div class="ws-list">${list.map((w) => html`<div class="ws-item" aria-current="${w.id === cur.id}">
            <span class="av">${avatar(w)}</span>
            <span><span class="t" dir="auto">${wsName(w)}</span><br><span class="s">${kindLabel(w)}${w.createdAt ? ` · ${t('added {date}', { date: fmtDate(w.createdAt) })}` : ''}</span></span>
            <span class="row" style="gap:6px;justify-content:flex-end">
              ${w.id === cur.id ? html`<span class="chip brand">${t('Current')}</span>` : html`<button class="btn sm" type="button" data-open="${w.id}">${t('Open')}</button>`}
              ${w.kind === 'local' ? html`<button class="btn sm ghost" type="button" data-rename="${w.id}" aria-label="${t('Rename {name}', { name: w.name })}">${icon('edit')}</button>` : ''}
              ${w.kind !== 'demo' ? html`<button class="btn sm ghost danger" type="button" data-remove="${w.id}" aria-label="${t('Remove {name} from this device', { name: w.name })}">${icon('trash')}</button>` : ''}
            </span>
          </div>`)}</div>
          <form class="verify-row" id="addLocal" autocomplete="off"><input id="newName" type="text" dir="auto" placeholder="${t('Company name, e.g. Acme Medical')}" aria-label="${t('Company name')}" maxlength="80"><button class="btn primary" type="submit">${icon('plus')}${t('Add a company')}</button></form>
          <p class="tiny muted">${t('A company kept on this device only is private to this browser. To share it with colleagues without a server, export its library from "Data and records" and import it on their device.')}</p>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>${icon('cloud')} ${t('Company server')}</h2>${cfg ? html`<span class="chip ok">${t('Connected to {host}', { host: new URL(cfg.url).hostname })}</span>` : html`<span class="chip">${t('Not set up')}</span>`}</div>
        <div class="card-body stack">
          ${!cfg ? html`
            <p>${th("Sign-in needs a company server. RightPart uses {supabase} (open source: hosted, or installed on the company's own servers for full control of the data). An admin sets it up once in about 15 minutes with the files in {folder}, then everyone signs in here.", { supabase: html`<b>Supabase</b>`, folder: html`<span class="code">backend/</span>` })}</p>
            <form class="stack" id="srvForm" autocomplete="off">
              <div class="field"><label for="srvUrl">${t('Server address')}</label><input id="srvUrl" type="text" dir="ltr" placeholder="https://your-project.supabase.co" spellcheck="false"></div>
              <div class="field"><label for="srvKey">${t('Public (anon) key')}</label><input id="srvKey" type="text" dir="ltr" placeholder="eyJ…" spellcheck="false"><span class="hint">${t('The public key is safe to share: what each person can see is enforced on the server.')}</span></div>
              <div><button class="btn primary" type="submit">${t('Connect')}</button></div>
            </form>` : ''}
          ${cfg && cloudError ? html`<div class="callout bad">${icon('stop')}<div><p class="t">${t('The server did not answer')}</p><p>${cloudError}</p></div></div>` : ''}
          ${cfg && !session && !cloudError ? html`
            <form class="stack" id="signForm" autocomplete="on">
              <div class="field"><label for="email">${t('E-mail')}</label><input id="email" type="text" dir="ltr" inputmode="email" autocomplete="username" spellcheck="false"></div>
              <div class="field"><label for="password">${t('Password')}</label><input id="password" type="password" dir="ltr" autocomplete="current-password"></div>
              <div class="row"><button class="btn primary" type="submit" data-act="in">${icon('lock')}${t('Sign in')}</button><button class="btn" type="button" data-act="up">${t('Create account')}</button><button class="btn ghost" type="button" data-act="link">${t('E-mail me a sign-in link')}</button></div>
            </form>` : ''}
          ${cfg && session ? html`
            <div class="row between"><span>${icon('user')} ${th('Signed in as {email}', { email: html`<b>${session.user.email}</b>` })}</span><span class="row"><button class="btn sm" type="button" id="checkInv">${icon('sync')}${t('Check invitations')}</button><button class="btn sm" type="button" id="signOut">${t('Sign out')}</button></span></div>
            <h3>${t('Your companies on the server')}</h3>
            ${orgs.length ? html`<div class="ws-list">${orgs.map((o) => html`<div class="ws-item"><span class="av">${icon('building')}</span><span><span class="t" dir="auto">${o.name}</span><br><span class="s">${roleName(o.role)} · ${o.latest_version ? t('library version {v}', { v: o.latest_version }) : t('no library published yet')}</span></span><button class="btn sm primary" type="button" data-org="${o.id}">${t('Open')}</button></div>`)}</div>` : html`<p class="muted">${t('You are not in any company yet. Ask your admin to invite your e-mail, then press "Check invitations", or create a company.')}</p>`}
            <form class="verify-row" id="newOrg" autocomplete="off"><input id="orgName" type="text" dir="auto" placeholder="${t('New company on the server')}" aria-label="${t('New company name')}" maxlength="120"><button class="btn" type="submit">${icon('plus')}${t('Create')}</button></form>` : ''}
          ${cfg ? html`<p class="tiny muted"><button class="btn sm ghost" type="button" id="forget">${t('Disconnect this server')}</button> ${t('Only removes the connection from this device.')}</p>` : ''}
        </div>
      </section>

      ${cur.kind === 'cloud' ? html`<section class="card">
        <div class="card-head"><h2>${t('{company}: library and records', { company: cur.name })}</h2><span class="chip">${roleName(cur.org?.role)}</span></div>
        <div class="card-body stack">
          <p>${meta?.version ? t('This device has library version {v}', { v: meta.version }) : t('No library version downloaded yet')}${meta?.dirty ? html`, <b style="color:var(--warn)">${t('with changes not yet published')}</b>` : ''}.</p>
          <div class="row">
            <button class="btn" type="button" id="pull">${icon('download')}${t('Download the latest library')}</button>
            ${cloud.canPublish(cur.org?.role) ? html`<button class="btn primary" type="button" id="publish">${icon('upload')}${t('Publish this library')}</button>` : ''}
            <button class="btn" type="button" id="syncRec">${icon('sync')}${t('Sync build records and reports')}</button>
          </div>
          <p class="tiny muted">${t('Publishing creates a new numbered version for everyone; old versions are kept as history and cannot be changed. If someone published in the meantime, RightPart refuses instead of overwriting their work.')}</p>
        </div>
      </section>` : ''}

      ${team ? html`<section class="card">
        <div class="card-head"><h2>${icon('users')} ${t('Team')}</h2><span class="chip">${t('{n, plural, one {# member} other {# members}}', { n: team.members.length })}</span></div>
        <div class="card-body stack">
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>${t('Person')}</th><th>${t('Role')}</th><th></th></tr></thead><tbody>
            ${team.members.map((m) => html`<tr><td>${m.email || m.user_id}</td><td><select data-role="${m.user_id}" aria-label="${t('Role of {person}', { person: m.email || m.user_id })}">${Object.keys(cloud.ROLES).map((r) => html`<option value="${r}" ${r === m.role ? 'selected' : ''}>${roleName(r)}</option>`)}</select></td><td style="text-align:end"><button class="btn sm ghost danger" type="button" data-kick="${m.user_id}">${t('Remove')}</button></td></tr>`)}
            ${team.invitations.map((i) => html`<tr><td>${i.email} <span class="chip">${t('invited')}</span></td><td>${roleName(i.role)}</td><td></td></tr>`)}
          </tbody></table></div>
          <form class="verify-row" id="inviteForm" autocomplete="off"><input id="invEmail" type="text" dir="ltr" inputmode="email" placeholder="colleague@company.com" aria-label="${t('E-mail to invite')}"><select id="invRole" aria-label="${t('Role')}">${Object.keys(cloud.ROLES).filter((r) => r !== 'owner').map((r) => html`<option value="${r}" ${r === 'operator' ? 'selected' : ''}>${roleName(r)}</option>`)}</select><button class="btn primary" type="submit">${t('Invite')}</button></form>
          <ul class="list-plain small muted">${Object.keys(cloud.ROLES).map((k) => html`<li><b>${roleName(k)}</b>: ${cloud.ROLE_HELP[k]()}</li>`)}</ul>
        </div>
      </section>` : ''}
    </div>`,
    mount(root) {
      const busy = (b, on) => { if (b) { b.disabled = on; b.setAttribute('aria-busy', String(on)); } };
      root.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => switchWorkspace(b.dataset.open)));
      root.querySelectorAll('[data-rename]').forEach((b) => b.addEventListener('click', async () => {
        let name = '';
        const ok = await openDialog({ title: t('Rename company'), body: `<div class="field"><label for="rn">${esc(t('Name'))}</label><input id="rn" type="text" dir="auto" maxlength="80"></div>`, actions: [{ label: t('Cancel'), value: false }, { label: t('Rename'), value: true, primary: true }], onMount(d) { const i = d.querySelector('#rn'); i.value = workspaces().find((w) => w.id === b.dataset.rename)?.name || ''; i.focus(); }, onClose(d) { name = d.querySelector('#rn').value.trim(); } });
        if (ok && name) { updateWorkspace(b.dataset.rename, { name }); if (b.dataset.rename === currentWorkspace().id) await reloadLibrary(); navigate('#/companies'); }
      }));
      root.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
        const w = workspaces().find((x) => x.id === b.dataset.remove);
        if (!(await confirmDialog(t('Remove {name} from this device?', { name: w.name }), w.kind === 'cloud' ? t('The copy on this device is deleted. The company and its data stay on the server.') : t('Its library, records and photo samples on this device are deleted. Export the library first if you need it.'), t('Remove'), true))) return;
        const wasCurrent = w.id === currentWorkspace().id;
        await deleteWorkspace(w.id);
        if (wasCurrent) await reloadLibrary();
        toast(t('{name} removed from this device.', { name: w.name }), 'ok');
        navigate('#/companies');
      }));
      root.querySelector('#addLocal')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = root.querySelector('#newName').value.trim();
        if (!name) { root.querySelector('#newName').focus(); return; }
        const w = addWorkspace({ name, kind: 'local' });
        await switchWorkspace(w.id, '#/load');
      });
      root.querySelector('#srvForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        try {
          cloud.setServerConfig({ url: root.querySelector('#srvUrl').value, anonKey: root.querySelector('#srvKey').value });
          const url = root.querySelector('#srvUrl').value.trim();
          if (!cloud.isHostedSupabase(url)) toast(t('A self-hosted server must also be added to the Content-Security-Policy in index.html (connect-src).'), 'info', 7000);
          toast(t('Server connected. Now sign in.'), 'ok');
          navigate('#/companies');
        } catch (err) { toast(err.message, 'bad', 5000); }
      });
      const form = root.querySelector('#signForm');
      form?.addEventListener('submit', (e) => e.preventDefault());
      form?.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
        const email = root.querySelector('#email').value.trim();
        const password = root.querySelector('#password').value;
        if (!/.+@.+\..+/.test(email)) { toast(t('Enter your e-mail address.'), 'bad'); return; }
        busy(b, true);
        try {
          if (b.dataset.act === 'in') { await cloud.signIn(email, password); toast(t('Signed in.'), 'ok'); }
          else if (b.dataset.act === 'up') { if (password.length < 8) throw new Error(t('Use a password of at least 8 characters.')); const r = await cloud.signUp(email, password); toast(r.needsConfirm ? t('Account created: confirm it with the link in your e-mail.') : t('Account created.'), 'ok', 6000); }
          else { await cloud.sendSignInLink(email); toast(t('Check your e-mail for the sign-in link.'), 'ok', 6000); }
          navigate('#/companies');
        } catch (err) { toast(err.message, 'bad', 5000); } finally { busy(b, false); }
      }));
      root.querySelector('#signOut')?.addEventListener('click', async () => { await cloud.signOut(); toast(t('Signed out. Companies on this device stay available offline.'), 'ok'); navigate('#/companies'); });
      root.querySelector('#forget')?.addEventListener('click', async () => {
        if (!(await confirmDialog(t('Disconnect the server?'), t('You will need the address and key again to sign in. Data on this device stays.'), t('Disconnect'), true))) return;
        try { await cloud.signOut(); } catch { /* offline is fine */ }
        cloud.clearServerConfig();
        navigate('#/companies');
      });
      root.querySelector('#checkInv')?.addEventListener('click', async () => {
        try { const n = await cloud.acceptInvites(); toast(n ? t('{n, plural, one {Joined # company.} other {Joined # companies.}}', { n }) : t('No new invitations for your e-mail.'), n ? 'ok' : 'info'); navigate('#/companies'); } catch (err) { toast(err.message, 'bad'); }
      });
      root.querySelectorAll('[data-org]').forEach((b) => b.addEventListener('click', async () => {
        busy(b, true);
        try {
          const org = orgs.find((o) => o.id === b.dataset.org);
          const w = cloud.linkWorkspace(org);
          (await import('../store.js')).setCurrentWorkspace(w.id);
          const r = await cloud.pullLibrary();
          await switchWorkspace(w.id, '#/');
          if (r.status === 'empty') toast(cloud.canPublish(org.role) ? t('No library on the server yet: set it up, then publish it.') : t('Your company has not published a library yet.'), 'info', 6000);
        } catch (err) { toast(err.message, 'bad', 5000); } finally { busy(b, false); }
      }));
      root.querySelector('#newOrg')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = root.querySelector('#orgName').value.trim();
        if (!name) return;
        try {
          const org = await cloud.createCompany(name);
          const w = cloud.linkWorkspace(org);
          await switchWorkspace(w.id, '#/load');
        } catch (err) { toast(err.message, 'bad', 5000); }
      });
      root.querySelector('#pull')?.addEventListener('click', async (e) => {
        busy(e.currentTarget, true);
        try {
          let r = await cloud.pullLibrary();
          if (r.status === 'local-edits') {
            const go = await confirmDialog(t('Unpublished changes on this device'), t('The server has version {remote}; this device has changes on top of version {local} that were never published. Download anyway and lose those changes?', { remote: r.remote, local: r.local ?? '?' }), t('Download and replace'), true);
            if (!go) return;
            r = await cloud.discardLocalAndPull();
          }
          if (r.status === 'updated') { await reloadLibrary(); toast(t('Library version {v} downloaded.', { v: r.version }), 'ok'); }
          else if (r.status === 'current') toast(t('Already up to date (version {v}).', { v: r.version }), 'ok');
          else if (r.status === 'empty') toast(t('Nothing published yet.'), 'info');
          navigate('#/companies');
        } catch (err) { toast(err.message, 'bad', 6000); } finally { busy(e.currentTarget, false); }
      });
      root.querySelector('#publish')?.addEventListener('click', async () => {
        let note = '';
        const ok = await openDialog({ title: t('Publish this library'), body: `<p>${esc(t('Everyone in {company} gets this version on their next sync. Integrity check now: {critical} critical, {warnings} warnings.', { company: app.workspace.name, critical: app.audit.counts.critical, warnings: app.audit.counts.warning }))}</p><div class="field"><label for="pubNote">${esc(t('What changed?'))}</label><input id="pubNote" type="text" dir="auto" maxlength="200" placeholder="${esc(t('Example: step 7 now uses 100-0233 per ECO-0142'))}"></div>`, actions: [{ label: t('Cancel'), value: false }, { label: t('Publish'), value: true, primary: true }], onClose(d) { note = d.querySelector('#pubNote').value.trim(); } });
        if (!ok) return;
        try { const v = await cloud.publishLibrary(app.lib, note); toast(t('Published as version {v}.', { v }), 'ok'); navigate('#/companies'); } catch (err) { toast(err.message, 'bad', 7000); }
      });
      root.querySelector('#syncRec')?.addEventListener('click', async (e) => {
        busy(e.currentTarget, true);
        try { const r = await cloud.syncRecords(); toast(t('Uploaded {up}, received {down}.', { up: r.uploaded, down: r.downloaded }), 'ok'); } catch (err) { toast(err.message, 'bad', 6000); } finally { busy(e.currentTarget, false); }
      });
      root.querySelectorAll('[data-role]').forEach((s) => s.addEventListener('change', async () => {
        try { await cloud.setRole(cur.org.id, s.dataset.role, s.value); toast(t('Role changed.'), 'ok'); } catch (err) { toast(err.message, 'bad', 6000); navigate('#/companies'); }
      }));
      root.querySelectorAll('[data-kick]').forEach((b) => b.addEventListener('click', async () => {
        if (!(await confirmDialog(t('Remove this person?'), t('They lose access to the company on their next sync.'), t('Remove'), true))) return;
        try { await cloud.removeMember(cur.org.id, b.dataset.kick); navigate('#/companies'); } catch (err) { toast(err.message, 'bad', 6000); }
      }));
      root.querySelector('#inviteForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = root.querySelector('#invEmail').value.trim();
        if (!/.+@.+\..+/.test(email)) { toast(t('Enter an e-mail address.'), 'bad'); return; }
        try { await cloud.invite(cur.org.id, email, root.querySelector('#invRole').value); toast(t('Invited {email}. They sign in with that e-mail and press "Check invitations".', { email }), 'ok', 6000); navigate('#/companies'); } catch (err) { toast(err.message, 'bad', 6000); }
      });
    },
  };
}
