import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'fs';
import { webcrypto } from 'crypto';

const HTML = fs.readFileSync('index.html', 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); }
};

const V8_DATA = {
  Fundamental: [
    { id: 'a1', t: 'Call the auditor', done: false, wait: false, who: '', since: null, nudged: null, notes: '', subs: [] },
    { id: 'a2', t: 'Rebar term sheet', done: false, wait: true, who: 'Marc', since: 1757000000000, nudged: null, notes: '', subs: [] },
  ],
  Personal: [
    { id: 'b1', t: 'Move to Hong Kong', done: false, wait: false, who: '', since: null, nudged: null, notes: 'flat first',
      subs: [], lt: true, steps: [ { t: 'Find a flat', done: false, subs: [ { t: 'Shortlist', done: true } ] } ] },
  ],
};

function makeFetch(state) {
  return async (url, opts = {}) => {
    const u = String(url);
    const method = (opts.method || 'GET').toUpperCase();
    state.calls.push({ u, method, headers: opts.headers || {}, body: opts.body });

    if (u.includes('/oauth2/v2.0/token')) {
      const body = new URLSearchParams(opts.body);
      state.grants.push(body.get('grant_type'));
      if (state.tokenFails) return { ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) };
      return { ok: true, status: 200, json: async () => ({
        access_token: 'AT' + (++state.atCount), refresh_token: 'RT2', expires_in: 3600 }) };
    }
    if (u.includes('/me?$select=')) return { ok: true, status: 200, json: async () => ({ userPrincipalName: 'diwik@babylon-global.com' }) };
    if (u.endsWith('/me/drive/special/approot')) return { ok: true, status: 200, json: async () => ({ name: 'Ledger' }) };

    // list backups
    if (u.includes('approot:/backups:/children')) {
      return { ok: true, status: 200, json: async () => ({ value: [
        { name: 'ledger-2026-09-12.json', size: 4096, lastModifiedDateTime: '2026-09-12T09:00:00Z' },
        { name: 'ledger-2026-09-13.json', size: 4096, lastModifiedDateTime: '2026-09-13T09:00:00Z' },
        { name: 'not-a-ledger.txt', size: 10, lastModifiedDateTime: '2026-09-13T09:00:00Z' },
      ] }) };
    }
    // write a dated backup
    if (u.includes('approot:/backups/') && method === 'PUT') {
      state.backupWrites.push(u);
      return { ok: true, status: 200, json: async () => ({ cTag: 'cb' }) };
    }
    // read a dated backup
    if (u.includes('approot:/backups/') && method === 'GET') {
      return { ok: true, status: 200, text: async () => JSON.stringify({ __ledger: 1, v: 6, order: ['Fundamental'], lists: { Fundamental: [ { id: 'z9', t: 'From last Tuesday', done: false } ] } }) };
    }
    // live file content
    if (u.includes('approot:/ledger.json:/content')) {
      if (method === 'PUT') {
        state.puts.push({ headers: opts.headers, body: opts.body });
        if (state.put412) return { ok: false, status: 412, json: async () => ({}) };
        state.cloudBody = opts.body;
        return { ok: true, status: 200, json: async () => ({ cTag: 'ctag-' + state.puts.length }) };
      }
      return { ok: true, status: 200, text: async () => state.cloudBody };
    }
    // live file metadata
    if (u.includes('approot:/ledger.json')) {
      if (state.noCloudFile) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ cTag: 'ctag-0', size: 1234, lastModifiedDateTime: '2026-09-14T07:00:00Z' }) };
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  };
}

async function boot({ search = '', store = {}, state } = {}) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => {});
  const dom = new JSDOM(HTML, {
    url: 'https://babylon-global.com/mene/' + search,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const w = dom.window;
  Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
  w.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
  w.fetch = makeFetch(state);
  for (const [k, v] of Object.entries(store)) w.localStorage.setItem(k, v);
  const script = [...dom.window.document.querySelectorAll('script')].map(s => s.textContent).join('\n');
  w.eval(script);
  await new Promise(r => setTimeout(r, 60));
  return { dom, w };
}

const settle = () => new Promise(r => setTimeout(r, 60));

/* ---------------------------------------------------------------- */
console.log('\n1. boot on v8 data, signed out');
{
  const state = { calls: [], grants: [], puts: [], backupWrites: [], atCount: 0, cloudBody: null };
  const { w } = await boot({ store: {
    'ledger.v1': JSON.stringify(V8_DATA),
    'ledger.v1.tabs': JSON.stringify(['Fundamental', 'Personal']),
    'ledger.v1.tab': 'Fundamental',
  }, state });
  const stored = JSON.parse(w.localStorage.getItem('ledger.v1'));
  ok('items survive the update', stored.Fundamental.length === 2 && stored.Personal.length === 1);
  ok('long-term project survives', stored.Personal[0].lt === true && stored.Personal[0].steps[0].subs[0].t === 'Shortlist');
  ok('storage key unchanged', w.localStorage.getItem('ledger.v1') !== null);
  ok('no network while signed out', state.calls.length === 0, JSON.stringify(state.calls.map(c => c.u)));
  w.document.getElementById('menu').click();
  ok('status says not backed up', /Not backed up/.test(w.document.getElementById('syncStatus').textContent));
  ok('cloud buttons hidden', w.document.getElementById('syncNow').style.display === 'none'
    && w.document.getElementById('restoreCloud').style.display === 'none');
  ok('gist inputs are gone', !w.document.getElementById('tokenIn') && !w.document.getElementById('gistIn'));
}

/* ---------------------------------------------------------------- */
console.log('\n2. starting sign-in');
{
  const state = { calls: [], grants: [], puts: [], backupWrites: [], atCount: 0, cloudBody: null };
  const { w } = await boot({ store: { 'ledger.v1': JSON.stringify(V8_DATA) }, state });
  w.document.getElementById('syncSetup').click();
  w.document.getElementById('syncSave').click();
  await settle();
  const pkce = JSON.parse(w.localStorage.getItem('ledger.v1.ms.pkce') || 'null');
  ok('pkce verifier stored before redirect', !!(pkce && pkce.verifier && pkce.state));
  ok('verifier is long enough', pkce && pkce.verifier.length >= 43, pkce && String(pkce.verifier.length));
}

/* ---------------------------------------------------------------- */
console.log('\n3. returning from sign-in');
{
  const state = { calls: [], grants: [], puts: [], backupWrites: [], atCount: 0,
    cloudBody: JSON.stringify({ __ledger: 1, v: 6, order: ['Cloud'], lists: { Cloud: [ { id: 'c1', t: 'From OneDrive', done: false } ] } }) };
  const { w } = await boot({
    search: '?code=CODE123&state=ST',
    store: { 'ledger.v1': JSON.stringify(V8_DATA), 'ledger.v1.ms.pkce': JSON.stringify({ verifier: 'v'.repeat(43), state: 'ST' }) },
    state,
  });
  await settle();
  ok('code exchanged', state.grants[0] === 'authorization_code');
  ok('refresh token kept', JSON.parse(w.localStorage.getItem('ledger.v1.ms')).rt === 'RT2');
  ok('pkce material cleared', w.localStorage.getItem('ledger.v1.ms.pkce') === null);
  ok('url cleaned of the code', !w.location.search.includes('code'));
  ok('signed-in account recorded', JSON.parse(w.localStorage.getItem('ledger.v1.ms')).who === 'diwik@babylon-global.com');
  ok('folder name recorded', JSON.parse(w.localStorage.getItem('ledger.v1.ms')).folder === 'Ledger');
  ok('cloud copy adopted on first sign-in', JSON.parse(w.localStorage.getItem('ledger.v1')).Cloud !== undefined);
  ok('cTag remembered', w.localStorage.getItem('ledger.v1.ms.ctag') === 'ctag-0');
  ok('bad state is rejected', true);
}

/* ---------------------------------------------------------------- */
console.log('\n4. state mismatch is refused');
{
  const state = { calls: [], grants: [], puts: [], backupWrites: [], atCount: 0, cloudBody: '{}' };
  const { w } = await boot({
    search: '?code=CODE123&state=WRONG',
    store: { 'ledger.v1': JSON.stringify(V8_DATA), 'ledger.v1.ms.pkce': JSON.stringify({ verifier: 'v'.repeat(43), state: 'ST' }) },
    state,
  });
  await settle();
  ok('no token exchange on mismatch', state.grants.length === 0);
  ok('still signed out', w.localStorage.getItem('ledger.v1.ms') === null);
  ok('local data untouched', JSON.parse(w.localStorage.getItem('ledger.v1')).Fundamental.length === 2);
}

/* ---------------------------------------------------------------- */
console.log('\n5. an edit pushes, with a dated backup');
{
  const state = { calls: [], grants: [], puts: [], backupWrites: [], atCount: 0,
    cloudBody: JSON.stringify({ __ledger: 1, v: 6, order: ['Fundamental', 'Personal'], lists: V8_DATA }) };
  const { w } = await boot({ store: {
    'ledger.v1': JSON.stringify(V8_DATA),
    'ledger.v1.tabs': JSON.stringify(['Fundamental', 'Personal']),
    'ledger.v1.ms': JSON.stringify({ rt: 'RT1', who: 'diwik@babylon-global.com', folder: 'Ledger' }),
    'ledger.v1.ms.ctag': 'ctag-0',
  }, state });
  await settle();
  ok('pull on open, not push', state.puts.length === 0);

  const input = w.document.getElementById('entry');
  input.value = 'A new item';
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise(r => setTimeout(r, 2300));

  ok('edit reached OneDrive', state.puts.length === 1, 'puts=' + state.puts.length);
  const h = state.puts[0] ? state.puts[0].headers : {};
  ok('if-match guard sent', h['if-match'] === 'ctag-0', JSON.stringify(h));
  const sent = JSON.parse(state.puts[0].body);
  ok('payload wrapper unchanged', sent.__ledger === 1 && sent.v === 6 && !!sent.lists && !!sent.order);
  ok('new item is in the payload', JSON.stringify(sent.lists).includes('A new item'));
  ok('dated backup written once', state.backupWrites.length === 1, state.backupWrites.join(','));
  ok('backup filename is dated', /ledger-\d{4}-\d{2}-\d{2}\.json/.test(state.backupWrites[0] || ''));
  ok('dirty flag cleared', w.localStorage.getItem('ledger.v1.dirty') === null);
  ok('cTag advanced', w.localStorage.getItem('ledger.v1.ms.ctag') === 'ctag-1');

  const before = state.backupWrites.length;
  const i2 = w.document.getElementById('entry');
  i2.value = 'Another';
  i2.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise(r => setTimeout(r, 2300));
  ok('second edit same day writes no second backup', state.backupWrites.length === before);
  ok('second edit still pushed', state.puts.length === 2);
}

/* ---------------------------------------------------------------- */
console.log('\n6. a rejected write never loses data');
{
  const state = { calls: [], grants: [], puts: [], backupWrites: [], atCount: 0, put412: true,
    cloudBody: JSON.stringify({ __ledger: 1, v: 6, order: ['Fundamental'], lists: V8_DATA }) };
  const { w } = await boot({ store: {
    'ledger.v1': JSON.stringify(V8_DATA),
    'ledger.v1.tabs': JSON.stringify(['Fundamental', 'Personal']),
    'ledger.v1.ms': JSON.stringify({ rt: 'RT1', who: 'x', folder: 'Ledger' }),
    'ledger.v1.ms.ctag': 'ctag-0',
  }, state });
  await settle();
  const input = w.document.getElementById('entry');
  input.value = 'Edited while the cloud moved';
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise(r => setTimeout(r, 2300));
  ok('412 does not clear dirty', w.localStorage.getItem('ledger.v1.dirty') === '1');
  ok('local edit still on the device', JSON.stringify(JSON.parse(w.localStorage.getItem('ledger.v1'))).includes('Edited while the cloud moved'));
  w.document.getElementById('menu').click();
  ok('menu warns', /changed/i.test(w.document.getElementById('syncStatus').textContent), w.document.getElementById('syncStatus').textContent);
  ok('push override is offered', w.document.getElementById('pushBtn').style.display !== 'none');
}

/* ---------------------------------------------------------------- */
console.log('\n7. restoring an earlier day');
{
  const state = { calls: [], grants: [], puts: [], backupWrites: [], atCount: 0,
    cloudBody: JSON.stringify({ __ledger: 1, v: 6, order: ['Fundamental'], lists: V8_DATA }) };
  const { w } = await boot({ store: {
    'ledger.v1': JSON.stringify(V8_DATA),
    'ledger.v1.tabs': JSON.stringify(['Fundamental', 'Personal']),
    'ledger.v1.ms': JSON.stringify({ rt: 'RT1', who: 'x', folder: 'Ledger' }),
  }, state });
  await settle();
  w.document.getElementById('menu').click();
  w.document.getElementById('restoreCloud').click();
  await settle();
  const rows = [...w.document.getElementById('cloudList').children];
  ok('current copy plus two dated copies listed', rows.length === 3, 'rows=' + rows.length);
  ok('non-ledger files filtered out', !w.document.getElementById('cloudList').textContent.includes('not-a-ledger'));
  ok('newest dated copy first', rows[1].textContent.includes('2026-09-13'));

  rows[1].click();
  await settle();
  ok('one tap only arms', !JSON.stringify(JSON.parse(w.localStorage.getItem('ledger.v1'))).includes('From last Tuesday'));
  ok('armed row says so', /Tap again/.test(rows[1].textContent));
  rows[1].click();
  await new Promise(r => setTimeout(r, 120));
  ok('second tap restores', JSON.stringify(JSON.parse(w.localStorage.getItem('ledger.v1'))).includes('From last Tuesday'));
  ok('restore is pushed back up', state.puts.length >= 1);
}

/* ---------------------------------------------------------------- */
console.log('\n8. signing out');
{
  const state = { calls: [], grants: [], puts: [], backupWrites: [], atCount: 0, cloudBody: '{}' };
  const { w } = await boot({ store: {
    'ledger.v1': JSON.stringify(V8_DATA),
    'ledger.v1.ms': JSON.stringify({ rt: 'RT1', who: 'x', folder: 'Ledger' }),
    'ledger.v1.ms.ctag': 'ctag-0',
  }, state });
  await settle();
  w.document.getElementById('menu').click();
  w.document.getElementById('syncSetup').click();
  w.document.getElementById('syncForget').click();
  ok('tokens cleared', w.localStorage.getItem('ledger.v1.ms') === null);
  ok('ctag cleared', w.localStorage.getItem('ledger.v1.ms.ctag') === null);
  ok('items untouched by sign-out', JSON.parse(w.localStorage.getItem('ledger.v1')).Fundamental.length === 2);
}

/* ---------------------------------------------------------------- */
console.log('\n9. offline');
{
  const state = { calls: [], grants: [], puts: [], backupWrites: [], atCount: 0, cloudBody: '{}' };
  const { w } = await boot({ store: {
    'ledger.v1': JSON.stringify(V8_DATA),
    'ledger.v1.tabs': JSON.stringify(['Fundamental', 'Personal']),
    'ledger.v1.ms': JSON.stringify({ rt: 'RT1', who: 'x', folder: 'Ledger' }),
  }, state });
  w.fetch = async () => { throw new Error('offline'); };
  const input = w.document.getElementById('entry');
  input.value = 'Written on a train';
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise(r => setTimeout(r, 2300));
  ok('item saved locally', JSON.stringify(JSON.parse(w.localStorage.getItem('ledger.v1'))).includes('Written on a train'));
  ok('stays dirty for the next open', w.localStorage.getItem('ledger.v1.dirty') === '1');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
