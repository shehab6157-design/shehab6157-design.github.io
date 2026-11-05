// Company server (sign-in) for RightPart, on Supabase (hosted or self-hosted).
// - People sign in with e-mail; a company admin invites them with a role.
// - The company library is published by engineers as numbered versions; every tablet downloads
//   the latest version and keeps a copy, so the floor keeps working when the network drops.
// - Build records and floor reports are uploaded when online.
// Row-level security on the server decides what each person can read or write (backend/supabase).

import config from './config.js';
import { settings, setSetting, addWorkspace, workspaces, updateWorkspace, currentWorkspace, saveLibrary, libraryMeta, all, put } from './store.js';
import { t } from './core/i18n.js';

export const ROLES = {
  owner: 'Owner: everything, including who is owner',
  admin: 'Admin: invites people and sets roles',
  engineer: 'Engineer: edits and publishes the library',
  supervisor: 'Supervisor: sees everyone\'s build records and reports',
  operator: 'Operator: builds, scans, reports doubts',
  viewer: 'Viewer: reads only',
};
// Shown in the interface: the role names stay as stored, their names and descriptions follow the language.
export const ROLE_NAMES = { owner: () => t('role::Owner'), admin: () => t('role::Admin'), engineer: () => t('role::Engineer'), supervisor: () => t('role::Supervisor'), operator: () => t('role::Operator'), viewer: () => t('role::Viewer') };
export const ROLE_HELP = { owner: () => t('everything, including who is owner'), admin: () => t('invites people and sets roles'), engineer: () => t('edits and publishes the library'), supervisor: () => t("sees everyone's build records and reports"), operator: () => t('builds, scans, reports doubts'), viewer: () => t('reads only') };
export const roleName = (r) => ROLE_NAMES[r]?.() || r || '';
export const canPublish = (role) => ['owner', 'admin', 'engineer'].includes(role);
export const canManage = (role) => ['owner', 'admin'].includes(role);

// ---------- Server settings ----------
export function serverConfig() {
  const s = settings().cloud;
  if (s?.url && s?.anonKey) return s;
  if (config.cloud?.url && config.cloud?.anonKey) return config.cloud;
  return null;
}

export function setServerConfig({ url, anonKey }) {
  url = String(url || '').trim().replace(/\/+$/, '');
  anonKey = String(anonKey || '').trim();
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(url)) throw new Error(t('The server address must look like https://your-project.supabase.co'));
  if (anonKey.length < 20) throw new Error(t('The public (anon) key looks too short'));
  setSetting('cloud', { url, anonKey });
  clientPromise = null;
}

export function clearServerConfig() {
  setSetting('cloud', null);
  clientPromise = null;
}

export const isHostedSupabase = (url) => /\.supabase\.co$/i.test(new URL(url).hostname);

// ---------- Client ----------
let clientPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.supabase?.createClient) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(t('The sign-in library could not be loaded')));
    document.head.append(s);
  });
}

async function client() {
  const cfg = serverConfig();
  if (!cfg) throw new Error(t('No company server is set up on this copy of RightPart.'));
  if (!clientPromise) {
    clientPromise = (async () => {
      await loadScript(new URL('../vendor/supabase/supabase.js', import.meta.url).href);
      return window.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'rightpart.auth' },
      });
    })().catch((e) => { clientPromise = null; throw e; });
  }
  return clientPromise;
}

function friendly(error, fallback = t('The company server did not accept that.')) {
  if (!error) return null;
  if (!navigator.onLine) return new Error(t('You are offline. Your work is kept on this device and syncs when you are back online.'));
  const m = String(error.message || '');
  if (/Invalid login credentials/i.test(m)) return new Error(t('Wrong e-mail or password.'));
  if (/Email not confirmed/i.test(m)) return new Error(t('Confirm your e-mail first: open the link we sent you.'));
  if (/User already registered/i.test(m)) return new Error(t('This e-mail already has an account: sign in instead.'));
  if (error.code === '40001') return Object.assign(new Error(t('Someone published a newer version while you were editing. Download it, apply your changes again, then publish.')), { conflict: true });
  if (error.code === '42501') return new Error(m || t('Your role does not allow this.'));
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return new Error(t('The company server cannot be reached.'));
  return new Error(m || fallback);
}

// ---------- Sign-in ----------
export async function getSession() {
  if (!serverConfig()) return null;
  const c = await client();
  const { data } = await c.auth.getSession();
  return data?.session || null;
}

export async function signIn(email, password) {
  const c = await client();
  const { data, error } = await c.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw friendly(error);
  await acceptInvites().catch(() => 0);
  return data.session;
}

export async function signUp(email, password) {
  const c = await client();
  const { data, error } = await c.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: location.href.split('#')[0] } });
  if (error) throw friendly(error);
  if (data.session) await acceptInvites().catch(() => 0);
  return { session: data.session, needsConfirm: !data.session };
}

export async function sendSignInLink(email) {
  const c = await client();
  const { error } = await c.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: location.href.split('#')[0], shouldCreateUser: true } });
  if (error) throw friendly(error);
}

export async function signOut() {
  const c = await client();
  await c.auth.signOut();
}

// ---------- Companies and people ----------
export async function myCompanies() {
  const c = await client();
  const { data, error } = await c.rpc('my_organizations');
  if (error) throw friendly(error);
  return data || [];
}

export async function createCompany(name) {
  const c = await client();
  const { data, error } = await c.rpc('create_organization', { p_name: name });
  if (error) throw friendly(error);
  return { ...data, role: 'owner' };
}

export async function acceptInvites() {
  const c = await client();
  const { data, error } = await c.rpc('accept_invitations');
  if (error) throw friendly(error);
  return data || 0;
}

export async function invite(orgId, email, role) {
  const c = await client();
  const { data, error } = await c.rpc('invite_member', { p_org: orgId, p_email: email, p_role: role });
  if (error) throw friendly(error);
  return data;
}

export async function members(orgId) {
  const c = await client();
  const [{ data: m, error: e1 }, { data: inv }] = await Promise.all([
    c.from('memberships').select('user_id, role, email, created_at').eq('org_id', orgId).order('created_at'),
    c.from('invitations').select('email, role, created_at').eq('org_id', orgId).is('accepted_at', null),
  ]);
  if (e1) throw friendly(e1);
  return { members: m || [], invitations: inv || [] };
}

export async function setRole(orgId, userId, role) {
  const c = await client();
  const { data, error } = await c.from('memberships').update({ role }).eq('org_id', orgId).eq('user_id', userId).select();
  if (error) throw friendly(error);
  if (!data?.length) throw new Error(t('Your role does not allow this change.'));
}

export async function removeMember(orgId, userId) {
  const c = await client();
  const { error } = await c.from('memberships').delete().eq('org_id', orgId).eq('user_id', userId);
  if (error) throw friendly(error);
}

/** The workspace on this device that holds a signed-in company (created on first open). */
export function linkWorkspace(org) {
  const existing = workspaces().find((w) => w.kind === 'cloud' && w.org?.id === org.id);
  if (existing) { updateWorkspace(existing.id, { name: org.name, org: { id: org.id, name: org.name, role: org.role } }); return existing; }
  return addWorkspace({ name: org.name, kind: 'cloud', org: { id: org.id, name: org.name, role: org.role } });
}

// ---------- Library versions ----------
/** Download the latest published version, unless this device holds unpublished edits. */
export async function pullLibrary() {
  const ws = currentWorkspace();
  if (ws.kind !== 'cloud') return { status: 'local' };
  const c = await client();
  const { data, error } = await c.from('library_versions').select('version, data, note, published_at')
    .eq('org_id', ws.org.id).order('version', { ascending: false }).limit(1).maybeSingle();
  if (error) throw friendly(error);
  if (!data) return { status: 'empty' };
  const meta = await libraryMeta();
  if (meta?.version === data.version) return { status: 'current', version: data.version };
  if (meta?.dirty) return { status: 'local-edits', remote: data.version, local: meta.version };
  await saveLibrary(data.data, ws.name, { version: data.version, dirty: false, note: data.note, publishedAt: data.published_at });
  return { status: 'updated', version: data.version, note: data.note };
}

/** Force-download the latest version, dropping unpublished edits on this device. */
export async function discardLocalAndPull() {
  const { resetLibrary } = await import('./store.js');
  await resetLibrary();
  return pullLibrary();
}

export async function publishLibrary(lib, note) {
  const ws = currentWorkspace();
  const c = await client();
  const meta = await libraryMeta();
  const base = meta?.version && meta.version > 0 ? meta.version : null;
  const { data: version, error } = await c.rpc('publish_library', { p_org: ws.org.id, p_data: lib, p_note: note || null, p_base_version: base });
  if (error) throw friendly(error);
  await saveLibrary(lib, ws.name, { version, dirty: false, note });
  return version;
}

/** Called after local edits in a signed-in company: keep them, marked as not yet published. */
export async function markEdited(lib) {
  const ws = currentWorkspace();
  const meta = await libraryMeta();
  await saveLibrary(lib, ws.name, { version: meta?.version ?? null, dirty: ws.kind === 'cloud' });
}

// ---------- Records ----------
export async function syncRecords() {
  const ws = currentWorkspace();
  if (ws.kind !== 'cloud') return { uploaded: 0, downloaded: 0 };
  const c = await client();
  const session = await getSession();
  if (!session) throw new Error(t('Sign in to sync records.'));
  const local = await all('records');
  let uploaded = 0;
  for (const r of local.filter((x) => !x.synced && !x.remoteBy)) {
    const { error } = await c.from('records').upsert({ org_id: ws.org.id, id: r.id, type: r.type, data: { ...r, synced: true } });
    if (error) throw friendly(error);
    await put('records', { ...r, synced: true });
    uploaded++;
  }
  const { data, error } = await c.from('records').select('id, type, data, created_by, updated_at')
    .eq('org_id', ws.org.id).order('created_at', { ascending: false }).limit(300);
  if (error) throw friendly(error);
  let downloaded = 0;
  const byId = new Map(local.map((r) => [r.id, r]));
  for (const row of data || []) {
    const mine = row.created_by === session.user.id;
    const have = byId.get(row.id);
    if (have && (mine || have.synced)) continue;
    await put('records', { ...row.data, id: row.id, type: row.type, synced: true, remoteBy: mine ? undefined : row.created_by });
    downloaded++;
  }
  return { uploaded, downloaded };
}

/** Quiet refresh when the app opens: newer library and records, no errors shown. */
export async function backgroundSync() {
  if (!serverConfig() || !navigator.onLine) return;
  const ws = currentWorkspace();
  if (ws.kind !== 'cloud') return;
  const session = await getSession().catch(() => null);
  if (!session) return;
  const r = await pullLibrary().catch(() => null);
  await syncRecords().catch(() => null);
  if (r?.status === 'updated') {
    const { reloadLibrary } = await import('./app.js');
    const { toast } = await import('./ui.js');
    await reloadLibrary();
    toast(r.note ? t('Library updated to version {v}: {note}.', { v: r.version, note: r.note }) : t('Library updated to version {v}.', { v: r.version }), 'ok', 5000);
  }
}

// ---------- AI answers (optional, needs the "ask" function on the server) ----------
export async function askAI({ question, records, language = 'en' }) {
  const ws = currentWorkspace();
  if (ws.kind !== 'cloud') throw new Error(t('AI answers need a signed-in company.'));
  const c = await client();
  const { data, error } = await c.functions.invoke('ask', { body: { orgId: ws.org.id, question, records, language } });
  if (error) {
    let msg = error.message;
    try { msg = (await error.context?.json?.())?.error || msg; } catch { /* keep message */ }
    throw new Error(msg || t('The AI answer is not available.'));
  }
  return data;
}
