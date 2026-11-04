import { html, raw, icon, toast, openDialog, confirmDialog, fmtDate, esc } from '../ui.js';
import { workspaces, currentWorkspace, addWorkspace, updateWorkspace, deleteWorkspace, libraryMeta } from '../store.js';
import { switchWorkspace, reloadLibrary } from '../app.js';

const kindLabel = (w) => (w.kind === 'demo' ? 'Demo' : w.kind === 'cloud' ? `Signed in · ${w.org?.role || 'member'}` : 'On this device only');
const avatar = (w) => (w.kind === 'demo' ? icon('cube') : w.kind === 'cloud' ? icon('cloud') : raw(esc(w.name.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join(''))));

/** Quick company switcher (from the button in the top bar). */
export function workspaceDialog({ navigate }) {
  const cur = currentWorkspace();
  return openDialog({
    title: 'Switch company',
    body: String(html`<p class="muted small">Each company has its own parts, devices, steps and records. They never mix.</p>
      <div class="ws-list">${workspaces().map((w) => html`<div class="ws-item" aria-current="${w.id === cur.id}">
        <span class="av">${avatar(w)}</span>
        <span><span class="t">${w.name}</span><br><span class="s">${kindLabel(w)}</span></span>
        ${w.id === cur.id ? html`<span class="chip brand">Current</span>` : html`<button class="btn sm" type="button" data-open="${w.id}">Open</button>`}
      </div>`)}</div>
      <form class="verify-row" id="wsAdd" autocomplete="off"><input id="wsName" type="text" placeholder="New company name" aria-label="New company name" maxlength="80"><button class="btn primary" type="submit">${icon('plus')}Add</button></form>`),
    actions: [{ label: 'Companies and sign-in', value: 'manage' }, { label: 'Close', value: null }],
    onMount(d, close) {
      d.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', async () => { close(null); await switchWorkspace(b.dataset.open); }));
      d.querySelector('#wsAdd').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = d.querySelector('#wsName').value.trim();
        if (!name) { d.querySelector('#wsName').focus(); return; }
        const w = addWorkspace({ name, kind: 'local' });
        close(null);
        await switchWorkspace(w.id, '#/setup');
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
    title: 'Companies and sign-in',
    html: html`<div class="page narrow">
      <div class="page-head"><div>
        <h1>Companies and sign-in</h1>
        <p class="lede">RightPart works for any production company. Each company gets its own space: its parts and codes, its devices and BOMs, its steps and its records. Keep a company on this device only, or sign in to a company server so the whole team shares one library.</p>
      </div></div>

      <section class="card">
        <div class="card-head"><h2>Companies on this device</h2><span class="chip">${list.length}</span></div>
        <div class="card-body stack">
          <div class="ws-list">${list.map((w) => html`<div class="ws-item" aria-current="${w.id === cur.id}">
            <span class="av">${avatar(w)}</span>
            <span><span class="t">${w.name}</span><br><span class="s">${kindLabel(w)}${w.createdAt ? ` · added ${fmtDate(w.createdAt)}` : ''}</span></span>
            <span class="row" style="gap:6px;justify-content:flex-end">
              ${w.id === cur.id ? html`<span class="chip brand">Current</span>` : html`<button class="btn sm" type="button" data-open="${w.id}">Open</button>`}
              ${w.kind === 'local' ? html`<button class="btn sm ghost" type="button" data-rename="${w.id}" aria-label="Rename ${w.name}">${icon('edit')}</button>` : ''}
              ${w.kind !== 'demo' ? html`<button class="btn sm ghost danger" type="button" data-remove="${w.id}" aria-label="Remove ${w.name} from this device">${icon('trash')}</button>` : ''}
            </span>
          </div>`)}</div>
          <form class="verify-row" id="addLocal" autocomplete="off"><input id="newName" type="text" placeholder="Company name, e.g. Acme Medical" aria-label="Company name" maxlength="80"><button class="btn primary" type="submit">${icon('plus')}Add a company</button></form>
          <p class="tiny muted">A company kept on this device only is private to this browser. To share it with colleagues without a server, export its library from "Data and records" and import it on their device.</p>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>${icon('cloud')} Company server</h2>${cfg ? html`<span class="chip ok">Connected to ${new URL(cfg.url).hostname}</span>` : html`<span class="chip">Not set up</span>`}</div>
        <div class="card-body stack">
          ${!cfg ? html`
            <p>Sign-in needs a company server. RightPart uses <b>Supabase</b> (open source: hosted, or installed on the company's own servers for full control of the data). An admin sets it up once in about 15 minutes with the files in <span class="code">backend/</span>, then everyone signs in here.</p>
            <form class="stack" id="srvForm" autocomplete="off">
              <div class="field"><label for="srvUrl">Server address</label><input id="srvUrl" type="text" placeholder="https://your-project.supabase.co" spellcheck="false"></div>
              <div class="field"><label for="srvKey">Public (anon) key</label><input id="srvKey" type="text" placeholder="eyJ…" spellcheck="false"><span class="hint">The public key is safe to share: what each person can see is enforced on the server.</span></div>
              <div><button class="btn primary" type="submit">Connect</button></div>
            </form>` : ''}
          ${cfg && cloudError ? html`<div class="callout bad">${icon('stop')}<div><p class="t">The server did not answer</p><p>${cloudError}</p></div></div>` : ''}
          ${cfg && !session && !cloudError ? html`
            <form class="stack" id="signForm" autocomplete="on">
              <div class="field"><label for="email">E-mail</label><input id="email" type="text" inputmode="email" autocomplete="username" spellcheck="false"></div>
              <div class="field"><label for="password">Password</label><input id="password" type="password" autocomplete="current-password"></div>
              <div class="row"><button class="btn primary" type="submit" data-act="in">${icon('lock')}Sign in</button><button class="btn" type="button" data-act="up">Create account</button><button class="btn ghost" type="button" data-act="link">E-mail me a sign-in link</button></div>
            </form>` : ''}
          ${cfg && session ? html`
            <div class="row between"><span>${icon('user')} Signed in as <b>${session.user.email}</b></span><span class="row"><button class="btn sm" type="button" id="checkInv">${icon('sync')}Check invitations</button><button class="btn sm" type="button" id="signOut">Sign out</button></span></div>
            <h3>Your companies on the server</h3>
            ${orgs.length ? html`<div class="ws-list">${orgs.map((o) => html`<div class="ws-item"><span class="av">${icon('building')}</span><span><span class="t">${o.name}</span><br><span class="s">${o.role} · ${o.latest_version ? `library version ${o.latest_version}` : 'no library published yet'}</span></span><button class="btn sm primary" type="button" data-org="${o.id}">Open</button></div>`)}</div>` : html`<p class="muted">You are not in any company yet. Ask your admin to invite your e-mail, then press "Check invitations", or create a company.</p>`}
            <form class="verify-row" id="newOrg" autocomplete="off"><input id="orgName" type="text" placeholder="New company on the server" aria-label="New company name" maxlength="120"><button class="btn" type="submit">${icon('plus')}Create</button></form>` : ''}
          ${cfg ? html`<p class="tiny muted"><button class="btn sm ghost" type="button" id="forget">Disconnect this server</button> Only removes the connection from this device.</p>` : ''}
        </div>
      </section>

      ${cur.kind === 'cloud' ? html`<section class="card">
        <div class="card-head"><h2>${cur.name}: library and records</h2><span class="chip">${cur.org?.role}</span></div>
        <div class="card-body stack">
          <p>${meta?.version ? `This device has library version ${meta.version}` : 'No library version downloaded yet'}${meta?.dirty ? html`, <b style="color:var(--warn)">with changes not yet published</b>` : ''}.</p>
          <div class="row">
            <button class="btn" type="button" id="pull">${icon('download')}Download the latest library</button>
            ${cloud.canPublish(cur.org?.role) ? html`<button class="btn primary" type="button" id="publish">${icon('upload')}Publish this library</button>` : ''}
            <button class="btn" type="button" id="syncRec">${icon('sync')}Sync build records and reports</button>
          </div>
          <p class="tiny muted">Publishing creates a new numbered version for everyone; old versions are kept as history and cannot be changed. If someone published in the meantime, RightPart refuses instead of overwriting their work.</p>
        </div>
      </section>` : ''}

      ${team ? html`<section class="card">
        <div class="card-head"><h2>${icon('users')} Team</h2><span class="chip">${team.members.length} member${team.members.length === 1 ? '' : 's'}</span></div>
        <div class="card-body stack">
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th>Role</th><th></th></tr></thead><tbody>
            ${team.members.map((m) => html`<tr><td>${m.email || m.user_id}</td><td><select data-role="${m.user_id}" aria-label="Role of ${m.email || m.user_id}">${Object.keys(cloud.ROLES).map((r) => html`<option value="${r}" ${r === m.role ? 'selected' : ''}>${r}</option>`)}</select></td><td style="text-align:right"><button class="btn sm ghost danger" type="button" data-kick="${m.user_id}">Remove</button></td></tr>`)}
            ${team.invitations.map((i) => html`<tr><td>${i.email} <span class="chip">invited</span></td><td>${i.role}</td><td></td></tr>`)}
          </tbody></table></div>
          <form class="verify-row" id="inviteForm" autocomplete="off"><input id="invEmail" type="text" inputmode="email" placeholder="colleague@company.com" aria-label="E-mail to invite"><select id="invRole" aria-label="Role">${Object.keys(cloud.ROLES).filter((r) => r !== 'owner').map((r) => html`<option value="${r}" ${r === 'operator' ? 'selected' : ''}>${r}</option>`)}</select><button class="btn primary" type="submit">Invite</button></form>
          <ul class="list-plain small muted">${Object.entries(cloud.ROLES).map(([k, v]) => html`<li><b>${k}</b>: ${v.split(': ')[1]}</li>`)}</ul>
        </div>
      </section>` : ''}
    </div>`,
    mount(root) {
      const busy = (b, on) => { if (b) { b.disabled = on; b.setAttribute('aria-busy', String(on)); } };
      root.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => switchWorkspace(b.dataset.open)));
      root.querySelectorAll('[data-rename]').forEach((b) => b.addEventListener('click', async () => {
        let name = '';
        const ok = await openDialog({ title: 'Rename company', body: '<div class="field"><label for="rn">Name</label><input id="rn" type="text" maxlength="80"></div>', actions: [{ label: 'Cancel', value: false }, { label: 'Rename', value: true, primary: true }], onMount(d) { const i = d.querySelector('#rn'); i.value = workspaces().find((w) => w.id === b.dataset.rename)?.name || ''; i.focus(); }, onClose(d) { name = d.querySelector('#rn').value.trim(); } });
        if (ok && name) { updateWorkspace(b.dataset.rename, { name }); if (b.dataset.rename === currentWorkspace().id) await reloadLibrary(); navigate('#/companies'); }
      }));
      root.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
        const w = workspaces().find((x) => x.id === b.dataset.remove);
        if (!(await confirmDialog(`Remove ${w.name} from this device?`, w.kind === 'cloud' ? 'The copy on this device is deleted. The company and its data stay on the server.' : 'Its library, records and photo samples on this device are deleted. Export the library first if you need it.', 'Remove', true))) return;
        const wasCurrent = w.id === currentWorkspace().id;
        await deleteWorkspace(w.id);
        if (wasCurrent) await reloadLibrary();
        toast(`${w.name} removed from this device.`, 'ok');
        navigate('#/companies');
      }));
      root.querySelector('#addLocal')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = root.querySelector('#newName').value.trim();
        if (!name) { root.querySelector('#newName').focus(); return; }
        const w = addWorkspace({ name, kind: 'local' });
        await switchWorkspace(w.id, '#/setup');
      });
      root.querySelector('#srvForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        try {
          cloud.setServerConfig({ url: root.querySelector('#srvUrl').value, anonKey: root.querySelector('#srvKey').value });
          const url = root.querySelector('#srvUrl').value.trim();
          if (!cloud.isHostedSupabase(url)) toast('A self-hosted server must also be added to the Content-Security-Policy in index.html (connect-src).', 'info', 7000);
          toast('Server connected. Now sign in.', 'ok');
          navigate('#/companies');
        } catch (err) { toast(err.message, 'bad', 5000); }
      });
      const form = root.querySelector('#signForm');
      form?.addEventListener('submit', (e) => e.preventDefault());
      form?.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
        const email = root.querySelector('#email').value.trim();
        const password = root.querySelector('#password').value;
        if (!/.+@.+\..+/.test(email)) { toast('Enter your e-mail address.', 'bad'); return; }
        busy(b, true);
        try {
          if (b.dataset.act === 'in') { await cloud.signIn(email, password); toast('Signed in.', 'ok'); }
          else if (b.dataset.act === 'up') { if (password.length < 8) throw new Error('Use a password of at least 8 characters.'); const r = await cloud.signUp(email, password); toast(r.needsConfirm ? 'Account created: confirm it with the link in your e-mail.' : 'Account created.', 'ok', 6000); }
          else { await cloud.sendSignInLink(email); toast('Check your e-mail for the sign-in link.', 'ok', 6000); }
          navigate('#/companies');
        } catch (err) { toast(err.message, 'bad', 5000); } finally { busy(b, false); }
      }));
      root.querySelector('#signOut')?.addEventListener('click', async () => { await cloud.signOut(); toast('Signed out. Companies on this device stay available offline.', 'ok'); navigate('#/companies'); });
      root.querySelector('#forget')?.addEventListener('click', async () => {
        if (!(await confirmDialog('Disconnect the server?', 'You will need the address and key again to sign in. Data on this device stays.', 'Disconnect', true))) return;
        try { await cloud.signOut(); } catch { /* offline is fine */ }
        cloud.clearServerConfig();
        navigate('#/companies');
      });
      root.querySelector('#checkInv')?.addEventListener('click', async () => {
        try { const n = await cloud.acceptInvites(); toast(n ? `Joined ${n} compan${n === 1 ? 'y' : 'ies'}.` : 'No new invitations for your e-mail.', n ? 'ok' : 'info'); navigate('#/companies'); } catch (err) { toast(err.message, 'bad'); }
      });
      root.querySelectorAll('[data-org]').forEach((b) => b.addEventListener('click', async () => {
        busy(b, true);
        try {
          const org = orgs.find((o) => o.id === b.dataset.org);
          const w = cloud.linkWorkspace(org);
          (await import('../store.js')).setCurrentWorkspace(w.id);
          const r = await cloud.pullLibrary();
          await switchWorkspace(w.id, '#/');
          if (r.status === 'empty') toast(cloud.canPublish(org.role) ? 'No library on the server yet: set it up, then publish it.' : 'Your company has not published a library yet.', 'info', 6000);
        } catch (err) { toast(err.message, 'bad', 5000); } finally { busy(b, false); }
      }));
      root.querySelector('#newOrg')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = root.querySelector('#orgName').value.trim();
        if (!name) return;
        try {
          const org = await cloud.createCompany(name);
          const w = cloud.linkWorkspace(org);
          await switchWorkspace(w.id, '#/setup');
        } catch (err) { toast(err.message, 'bad', 5000); }
      });
      root.querySelector('#pull')?.addEventListener('click', async (e) => {
        busy(e.currentTarget, true);
        try {
          let r = await cloud.pullLibrary();
          if (r.status === 'local-edits') {
            const go = await confirmDialog('Unpublished changes on this device', `The server has version ${r.remote}; this device has changes on top of version ${r.local ?? '?'} that were never published. Download anyway and lose those changes?`, 'Download and replace', true);
            if (!go) return;
            r = await cloud.discardLocalAndPull();
          }
          if (r.status === 'updated') { await reloadLibrary(); toast(`Library version ${r.version} downloaded.`, 'ok'); }
          else if (r.status === 'current') toast(`Already up to date (version ${r.version}).`, 'ok');
          else if (r.status === 'empty') toast('Nothing published yet.', 'info');
          navigate('#/companies');
        } catch (err) { toast(err.message, 'bad', 6000); } finally { busy(e.currentTarget, false); }
      });
      root.querySelector('#publish')?.addEventListener('click', async () => {
        let note = '';
        const ok = await openDialog({ title: 'Publish this library', body: `<p>Everyone in ${esc(app.workspace.name)} gets this version on their next sync. Integrity check now: ${app.audit.counts.critical} critical, ${app.audit.counts.warning} warnings.</p><div class="field"><label for="pubNote">What changed?</label><input id="pubNote" type="text" maxlength="200" placeholder="Example: step 7 now uses 100-0233 per ECO-0142"></div>`, actions: [{ label: 'Cancel', value: false }, { label: 'Publish', value: true, primary: true }], onClose(d) { note = d.querySelector('#pubNote').value.trim(); } });
        if (!ok) return;
        try { const v = await cloud.publishLibrary(app.lib, note); toast(`Published as version ${v}.`, 'ok'); navigate('#/companies'); } catch (err) { toast(err.message, 'bad', 7000); }
      });
      root.querySelector('#syncRec')?.addEventListener('click', async (e) => {
        busy(e.currentTarget, true);
        try { const r = await cloud.syncRecords(); toast(`Uploaded ${r.uploaded}, received ${r.downloaded}.`, 'ok'); } catch (err) { toast(err.message, 'bad', 6000); } finally { busy(e.currentTarget, false); }
      });
      root.querySelectorAll('[data-role]').forEach((s) => s.addEventListener('change', async () => {
        try { await cloud.setRole(cur.org.id, s.dataset.role, s.value); toast('Role changed.', 'ok'); } catch (err) { toast(err.message, 'bad', 6000); navigate('#/companies'); }
      }));
      root.querySelectorAll('[data-kick]').forEach((b) => b.addEventListener('click', async () => {
        if (!(await confirmDialog('Remove this person?', 'They lose access to the company on their next sync.', 'Remove', true))) return;
        try { await cloud.removeMember(cur.org.id, b.dataset.kick); navigate('#/companies'); } catch (err) { toast(err.message, 'bad', 6000); }
      }));
      root.querySelector('#inviteForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = root.querySelector('#invEmail').value.trim();
        if (!/.+@.+\..+/.test(email)) { toast('Enter an e-mail address.', 'bad'); return; }
        try { await cloud.invite(cur.org.id, email, root.querySelector('#invRole').value); toast(`Invited ${email}. They sign in with that e-mail and press "Check invitations".`, 'ok', 6000); navigate('#/companies'); } catch (err) { toast(err.message, 'bad', 6000); }
      });
    },
  };
}
