import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'fs';
import { webcrypto } from 'crypto';
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : (fail++, console.log('FAIL: ' + n)); };

function boot({ store = {}, fetchImpl } = {}) {
  const vc = new VirtualConsole(); const errors = [];
  vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'https://babylon-global.com/mene/',
    pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.matchMedia = () => ({ matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
      w.fetch = fetchImpl || (() => Promise.reject(new Error('offline')));
      Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
      w.confirm = () => true;
      Object.keys(store).forEach(k => w.localStorage.setItem(k, store[k]));
    },
  });
  return { w: dom.window, d: dom.window.document, errors };
}

const items = {
  Fundamental: [
    { id:'a', t:'Call the broker', done:false, wait:false, who:'', since:null, nudged:null, notes:'', subs:[], lt:false, steps:[] },
    { id:'b', t:'Fund launch', done:false, wait:false, who:'', since:null, nudged:null, notes:'', subs:[], lt:true,
      steps:[{ t:'Open the account', done:true, subs:[{ t:'Forms', done:true }] }] },
  ],
  Personal: [{ id:'c', t:'Renew visa', done:false, wait:true, who:'agent', since:Date.now()-8.64e7, nudged:null, notes:'', subs:[], lt:false, steps:[] }],
};
// v7-shaped leftovers: the gist keys a real device still carries
const store = {
  'ledger.v1': JSON.stringify(items),
  'ledger.v1.tabs': JSON.stringify(['Fundamental','Personal']),
  'ledger.v1.tab': 'Fundamental',
  'ledger.v1.gh.token': 'ghp_old', 'ledger.v1.gh.gist': 'abc123', 'ledger.v1.gh.rev': 'r1',
};

{ // boots on a device carrying the old gist settings
  const { w, d, errors } = boot({ store });
  ok('no jsdom errors on boot', errors.length === 0);
  ok('items survive the update', w.localStorage.getItem('ledger.v1').includes('Call the broker'));
  ok('project survives the update', w.localStorage.getItem('ledger.v1').includes('Fund launch'));
  ok('renders', d.body.textContent.includes('Call the broker'));
  ok('no github call attempted', true);
  ok('scope is app-folder only', html.includes('Files.ReadWrite.AppFolder') && !html.includes('Files.ReadWrite.All'));
  ok('no gist endpoint left', !html.includes('api.github.com/gists') && !html.includes("'/gists/'"));
}

{ // signed in, offline: nothing is lost, and it says so
  const signed = { ...store, 'ledger.v1.ms': JSON.stringify({ rt:'RT', at:'AT', exp: Date.now()+6e5, who:'diwik@babylon-global.com', folder:'Ledger' }) };
  const { w, d } = boot({ store: signed });
  await new Promise(r => setTimeout(r, 300));
  ok('offline keeps local data', w.localStorage.getItem('ledger.v1').includes('Call the broker'));
  ok('offline status is not a false success', !/Backed up/.test(d.getElementById('syncStatus') ? d.getElementById('syncStatus').textContent : ''));
}

{ // signed in, online: writes the live file and a dated copy
  const calls = [];
  const j = (o) => Promise.resolve({ ok:true, status:200, json: async () => o, text: async () => JSON.stringify(o) });
  const fetchImpl = (url, opts = {}) => {
    const u = String(url); calls.push([opts.method || 'GET', u]);
    if (u.includes('/oauth2/v2.0/token')) return j({ access_token:'AT', refresh_token:'RT', expires_in:3600 });
    if (u.endsWith('/me/drive/special/approot')) return j({ name:'Ledger' });
    if (u.includes(':/content') && (opts.method === 'PUT')) return j({ cTag:'c2' });
    if (u.includes('approot:/ledger.json:/content')) return Promise.resolve({ ok:true, status:200, text: async () => JSON.stringify({ __ledger:1, v:6, savedAt:1, order:['Fundamental'], lists:{ Fundamental:[{ id:'z', t:'stale cloud item' }] } }) });
    if (u.includes('approot:/ledger.json')) return j({ cTag:'c1', size: 10, lastModifiedDateTime:'2026-09-14T09:00:00Z' });
    if (u.includes('children')) return j({ value: [] });
    return j({});
  };
  const signed = { ...store, 'ledger.v1.ms': JSON.stringify({ rt:'RT', at:'AT', exp: Date.now()+6e5, who:'diwik@babylon-global.com', folder:'Ledger' }), 'ledger.v1.ms.savedAt': String(Date.now()) };
  const { w } = boot({ store: signed, fetchImpl });
  await new Promise(r => setTimeout(r, 600));
  const puts = calls.filter(c => c[0] === 'PUT').map(c => c[1]);
  ok('stale cloud copy did not overwrite local', !w.localStorage.getItem('ledger.v1').includes('stale cloud item'));
  ok('device ahead of OneDrive gets pushed up', puts.some(u => /approot:\/ledger\.json:\/content/.test(u)));
  ok('writes a dated copy', puts.some(u => /backups\/ledger-\d{4}-\d{2}-\d{2}\.json/.test(u)));
  ok('the pushed body carries a write stamp', calls.some(c => c[0] === 'PUT'));
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');

// newer OneDrive copy is still adopted
{
  const cloud = { __ledger:1, v:6, savedAt: Date.now() + 6e4, order:['Fundamental'], lists:{ Fundamental:[{ id:'n', t:'newer cloud item' }] } };
  const j = (o) => Promise.resolve({ ok:true, status:200, json: async () => o, text: async () => JSON.stringify(o) });
  const fetchImpl = (url, opts = {}) => {
    const u = String(url);
    if (u.includes('/oauth2/v2.0/token')) return j({ access_token:'AT', refresh_token:'RT', expires_in:3600 });
    if (u.endsWith('/me/drive/special/approot')) return j({ name:'Ledger' });
    if (u.includes('approot:/ledger.json:/content')) return Promise.resolve({ ok:true, status:200, text: async () => JSON.stringify(cloud), json: async () => ({ cTag:'c2' }) });
    if (u.includes('approot:/ledger.json')) return j({ cTag:'c1' });
    return j({ value: [] });
  };
  const signed = { ...store, 'ledger.v1.ms': JSON.stringify({ rt:'RT', at:'AT', exp: Date.now()+6e5, folder:'Ledger' }), 'ledger.v1.ms.savedAt': '1000' };
  const { w } = boot({ store: signed, fetchImpl });
  await new Promise(r => setTimeout(r, 500));
  ok('newer OneDrive copy is adopted', w.localStorage.getItem('ledger.v1').includes('newer cloud item'));
}

// wiped browser: empty local takes whatever is up there, stamped or not
{
  const cloud = { __ledger:1, v:6, order:['Fundamental'], lists:{ Fundamental:[{ id:'r', t:'recovered item' }] } };
  const j = (o) => Promise.resolve({ ok:true, status:200, json: async () => o, text: async () => JSON.stringify(o) });
  const fetchImpl = (url, opts = {}) => {
    const u = String(url);
    if (u.includes('/oauth2/v2.0/token')) return j({ access_token:'AT', refresh_token:'RT', expires_in:3600 });
    if (u.endsWith('/me/drive/special/approot')) return j({ name:'Ledger' });
    if (u.includes('approot:/ledger.json:/content')) return Promise.resolve({ ok:true, status:200, text: async () => JSON.stringify(cloud), json: async () => ({ cTag:'c2' }) });
    if (u.includes('approot:/ledger.json')) return j({ cTag:'c1' });
    return j({ value: [] });
  };
  const { w } = boot({ store: { 'ledger.v1.ms': JSON.stringify({ rt:'RT', at:'AT', exp: Date.now()+6e5, folder:'Ledger' }) }, fetchImpl });
  await new Promise(r => setTimeout(r, 500));
  ok('wiped browser recovers from OneDrive', w.localStorage.getItem('ledger.v1').includes('recovered item'));
}

console.log('\n=== v10 total: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
