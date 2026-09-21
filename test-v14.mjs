import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'fs';
import { webcrypto } from 'crypto';
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : (fail++, console.log('FAIL: ' + n)); };
const wait = ms => new Promise(r => setTimeout(r, ms));

function boot({ store = {}, fetchImpl } = {}) {
  const vc = new VirtualConsole(); const errors = [];
  vc.on('jsdomError', e => errors.push(e.message));
  const calls = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'https://babylon-global.com/mene/',
    pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.matchMedia = () => ({ matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
      w.fetch = (u, o = {}) => { calls.push([o.method || 'GET', String(u), o.body]); return (fetchImpl || (() => Promise.reject(new Error('offline'))))(u, o); };
      Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
      w.confirm = () => true;
      Object.keys(store).forEach(k => w.localStorage.setItem(k, store[k]));
    },
  });
  const w = dom.window;
  return { w, d: w.document, errors, calls, g: expr => w.eval(expr) };
}
const item = (id, t, extra = {}) => ({ id, t, done:false, wait:false, who:'', since:null, nudged:null, notes:'', subs:[], lt:false, steps:[], ...extra });
const items = {
  Fundamental: [ item('a','Call the broker'), item('b','Fund launch', { lt:true, steps:[{ t:'Open the account', done:true, subs:[] }] }) ],
  Lumina:      [ item('l','Draft memo') ],
  Personal:    [ item('c','Renew visa', { wait:true, who:'agent', since: Date.now() - 8.64e7 }) ],
};
const v10store = {
  'ledger.v1': JSON.stringify(items),
  'ledger.v1.tabs': JSON.stringify(['Fundamental','Lumina','Personal']),
  'ledger.v1.tab': 'Fundamental',
  'ledger.v1.gh.token': 'old', 'ledger.v1.gh.gist': 'old',
};
const signedIn = extra => ({ ...v10store, 'ledger.v1.ms': JSON.stringify({ rt:'RT', at:'AT', exp: Date.now()+6e5, folder:'Ledger' }), ...extra });
const j = o => Promise.resolve({ ok:true, status:200, json: async () => o, text: async () => JSON.stringify(o) });
function graph(cloud) {
  return (url, opts = {}) => {
    const u = String(url);
    if (u.includes('/oauth2/v2.0/token')) return j({ access_token:'AT', refresh_token:'RT', expires_in:3600 });
    if (u.endsWith('/me/drive/special/approot')) return j({ name:'Ledger' });
    if (opts.method === 'PUT') return j({ cTag:'c2' });
    if (u.includes('approot:/ledger.json:/content')) return Promise.resolve({ ok:true, status:200, text: async () => JSON.stringify(cloud) });
    if (u.includes('approot:/ledger.json')) return cloud ? j({ cTag:'c1' }) : Promise.resolve({ ok:false, status:404, json: async () => ({}) });
    return j({ value: [] });
  };
}

/* ---------- 1. first launch on a v10 device ---------- */
{
  const { w, d, errors, g, calls } = boot({ store: v10store });
  ok('boots clean', errors.length === 0);
  ok('opens on Own', d.documentElement.getAttribute('data-side') === 'own');
  const body = d.body.textContent;
  ok('Own shows Own panels', /Lumina/.test(d.getElementById('navwrap').textContent) && /Personal/.test(d.getElementById('navwrap').textContent));
  ok('Fundamental panel is not on Own', !/Fundamental/.test(d.getElementById('navwrap').textContent));
  ok('Fundamental items hidden on Own', !body.includes('Call the broker'));
  ok('no switch row under the masthead', !d.getElementById('sides'));
  ok('the seal offers Fundamental', d.getElementById('sideBtn').getAttribute('aria-label') === 'Switch to Fundamental');
  ok('the F sits on the seal', d.querySelector('#sideBtn .sideF').textContent === 'F');
  w.save();
  const tabs = JSON.parse(w.localStorage.getItem('ledger.v1.tabs'));
  const spaces = JSON.parse(w.localStorage.getItem('ledger.v1.spaces'));
  ok('saved panel list still holds both sides', tabs.length === 3 && tabs.includes('Fundamental'));
  ok('Fundamental panel migrated to the Fundamental side', spaces.Fundamental === 'fa');
  ok('everything else migrated to Own', spaces.Lumina === 'own' && spaces.Personal === 'own');
  const stored = w.localStorage.getItem('ledger.v1');
  ok('every item survived', ['Call the broker','Fund launch','Draft memo','Renew visa'].every(t => stored.includes(t)));

  /* ---------- 2. switching ---------- */
  d.getElementById('sideBtn').click();
  ok('switch flips the palette', d.documentElement.getAttribute('data-side') === 'fa');
  ok('Fundamental items now showing', d.body.textContent.includes('Call the broker'));
  ok('Own items now hidden', !d.body.textContent.includes('Draft memo'));
  ok('long-term board scoped to Fundamental', g('projectsEverywhere().live.length') === 1);
  ok('waiting scoped to Fundamental', g('totalWaiting()') === 0);
  ok('side remembered', w.localStorage.getItem('ledger.v1.side') === 'fa');
  ok('the seal now offers Own', d.getElementById('sideBtn').getAttribute('aria-label') === 'Switch to Own');
  ok('a switch writes nothing to the cloud', calls.length === 0);
  d.getElementById('sideBtn').click();
  ok('long-term board empty on Own', g('projectsEverywhere().live.length') === 0);
  ok('waiting on Own', g('totalWaiting()') === 1);
  d.getElementById('sideBtn').click();

  /* ---------- 3. panels ---------- */
  ok('a name used on the other side is refused', w.addTab('Personal') === false);
  ok('a new Fundamental panel', w.addTab('Aviation') === true && g("SPACEMAP.Aviation") === 'fa');
  ok('Fundamental now has two panels', g('TABS.length') === 2 && g('ALL.length') === 4);
  g("renameTab(TABS.indexOf('Aviation'), 'Lumina')");
  ok('rename into a name from the other side is refused', g("TABS.includes('Aviation')"));
  g("moveSide(TABS.indexOf('Aviation'))");
  ok('panel crossed to Own', g("SPACEMAP.Aviation") === 'own' && !g("TABS.includes('Aviation')") && g("ALL.includes('Aviation')"));
  g('moveSide(0)');
  ok('the last panel on a side cannot leave', g("TABS.includes('Fundamental')") && g("SPACEMAP.Fundamental") === 'fa');
  g("renameTab(0, 'FA Work')");
  ok('rename keeps side and items', g("SPACEMAP['FA Work']") === 'fa' && g("data['FA Work'].length") === 2 && g("SPACEMAP.Fundamental") === undefined);
  const tabs2 = JSON.parse(w.localStorage.getItem('ledger.v1.tabs'));
  ok('saved list holds every panel from both sides', ['FA Work','Lumina','Personal','Aviation'].every(t => tabs2.includes(t)));
}

/* ---------- 4. reopening lands on the side you left ---------- */
{
  const { d } = boot({ store: { ...v10store, 'ledger.v1.side': 'fa', 'ledger.v1.spaces': JSON.stringify({ Fundamental:'fa', Lumina:'own', Personal:'own' }) } });
  ok('reopens on Fundamental', d.documentElement.getAttribute('data-side') === 'fa' && d.body.textContent.includes('Call the broker'));
}

/* ---------- 5. a device with no Fundamental panel still gets one ---------- */
{
  const lists = { Lumina:[item('l','Draft memo')], Personal:[] };
  const { g } = boot({ store: { 'ledger.v1': JSON.stringify(lists), 'ledger.v1.tabs': JSON.stringify(['Lumina','Personal']) } });
  ok('empty Fundamental side is created', g("ALL.filter(t => spaceOf(t) === 'fa').length") === 1);
}

/* ---------- 6. backups carry the split ---------- */
{
  const { w, g } = boot({ store: v10store });
  const ok1 = g(`adoptLists(${JSON.stringify(items)}, ['Fundamental','Lumina','Personal'], { Lumina: 'fa' })`);
  ok('restore applies the saved sides', ok1 && g('SPACEMAP.Lumina') === 'fa' && g('SPACEMAP.Fundamental') === 'fa');
  const { g: g2 } = boot({ store: v10store });
  g2(`adoptLists(${JSON.stringify(items)}, ['Fundamental','Lumina','Personal'], null)`);
  ok('a v10 backup restores with Fundamental on its own side', g2('SPACEMAP.Fundamental') === 'fa' && g2('SPACEMAP.Lumina') === 'own');
}

/* ---------- 7. OneDrive: the write carries the sides ---------- */
{
  const stale = { __ledger:1, v:6, savedAt:1, order:['Fundamental'], lists:{ Fundamental:[item('z','stale cloud item')] } };
  const { w, calls } = boot({ store: signedIn({ 'ledger.v1.ms.savedAt': String(Date.now()) }), fetchImpl: graph(stale) });
  await wait(600);
  const put = calls.find(c => c[0] === 'PUT' && /approot:\/ledger\.json:\/content/.test(c[1]));
  ok('device ahead is pushed', !!put);
  const body = put ? JSON.parse(put[2]) : {};
  ok('pushed copy records the sides', body.spaces && body.spaces.Fundamental === 'fa');
  ok('pushed copy holds both sides', body.order && body.order.length === 3);
  ok('dated copy written', calls.some(c => c[0] === 'PUT' && /backups\/ledger-\d{4}-\d{2}-\d{2}\.json/.test(c[1])));
  ok('stale copy did not overwrite', !w.localStorage.getItem('ledger.v1').includes('stale cloud item'));
}

/* ---------- 8. the guard counts both sides, not the one showing ---------- */
{
  const lists = { Fundamental:[item('a','Call the broker')], Personal:[] };
  const stale = { __ledger:1, v:6, savedAt:1, order:['Personal'], lists:{ Personal:[item('z','stale cloud item')] } };
  const store = signedIn({
    'ledger.v1': JSON.stringify(lists), 'ledger.v1.tabs': JSON.stringify(['Fundamental','Personal']),
    'ledger.v1.spaces': JSON.stringify({ Fundamental:'fa', Personal:'own' }), 'ledger.v1.side': 'own',
    'ledger.v1.ms.savedAt': String(Date.now()),
  });
  const { w } = boot({ store, fetchImpl: graph(stale) });
  await wait(600);
  ok('an empty side showing does not count as an empty device', w.localStorage.getItem('ledger.v1').includes('Call the broker') && !w.localStorage.getItem('ledger.v1').includes('stale cloud item'));
}

/* ---------- 9. wiped browser recovers both sides ---------- */
{
  const cloud = { __ledger:1, v:6, savedAt: Date.now(), order:['Fundamental','Personal'], spaces:{ Fundamental:'fa', Personal:'own' },
                  lists:{ Fundamental:[item('r','recovered FA item')], Personal:[item('p','recovered own item')] } };
  const { w, g } = boot({ store: { 'ledger.v1.ms': JSON.stringify({ rt:'RT', at:'AT', exp: Date.now()+6e5, folder:'Ledger' }) }, fetchImpl: graph(cloud) });
  await wait(600);
  const s = w.localStorage.getItem('ledger.v1');
  ok('wiped browser recovers both sides', s.includes('recovered FA item') && s.includes('recovered own item'));
  ok('and the split comes back with it', g('SPACEMAP.Fundamental') === 'fa' && g('SPACEMAP.Personal') === 'own');
}

/* ---------- 10. a newer OneDrive copy still wins ---------- */
{
  const cloud = { __ledger:1, v:6, savedAt: Date.now() + 6e4, order:['Fundamental'], lists:{ Fundamental:[item('n','newer cloud item')] } };
  const { w } = boot({ store: signedIn({ 'ledger.v1.ms.savedAt': '1000' }), fetchImpl: graph(cloud) });
  await wait(600);
  ok('newer OneDrive copy adopted', w.localStorage.getItem('ledger.v1').includes('newer cloud item'));
}


/* ---------- 11. urgent ---------- */
{
  const lists = {
    Fundamental: [ item('a','Railcar comps'), item('b','Muni refresh'), item('c','IC memo'),
                   item('x','Old one', { done:true, hot:true }), item('p','Handover', { lt:true, steps:[] }) ],
    Aviation:    [ item('v','Lease return'), item('w','Engine audit') ],
    Personal:    [ item('o','Renew visa', { hot:true }) ],
  };
  const store = { 'ledger.v1': JSON.stringify(lists), 'ledger.v1.tabs': JSON.stringify(['Fundamental','Aviation','Personal']),
                  'ledger.v1.spaces': JSON.stringify({ Fundamental:'fa', Aviation:'fa', Personal:'own' }), 'ledger.v1.tab.fa': 'Fundamental' };
  const { w, d, g } = boot({ store });
  const titles = () => [...d.querySelectorAll('#stage .item .txt')].map(t => t.textContent);
  const saved = id => { const L = JSON.parse(w.localStorage.getItem('ledger.v1')); for (const k in L) { const f = L[k].find(i => i.id === id); if (f) return f; } };

  ok('Own has no urgent marks', d.querySelectorAll('.hot').length === 0);
  ok('a flag on an Own item does not light it', d.querySelectorAll('.item.urgent').length === 0);
  ok('Own masthead shows no urgent count', !d.querySelector('.hotlink'));

  d.getElementById('sideBtn').click();
  ok('open Fundamental items get the diamond, done and long-term do not', d.querySelectorAll('#stage .item .hot').length === 3);
  ok('nothing urgent yet', d.querySelectorAll('.item.urgent').length === 0 && !d.querySelector('.hotlink'));

  /* raise the last item */
  const rowC = [...d.querySelectorAll('#stage .item')].find(r => r.textContent.includes('IC memo'));
  rowC.querySelector('.hot').click();
  ok('tapping the diamond marks it urgent', saved('c').hot === true);
  ok('tapping the diamond does not open the item', !d.getElementById('detail').classList.contains('up'));
  ok('the urgent row is lit', d.querySelector('.item.urgent .txt').textContent === 'IC memo');
  ok('and it rises to the top', titles()[0] === 'IC memo');
  ok('the rest keep your order', JSON.stringify(titles().slice(1, 3)) === JSON.stringify(['Railcar comps','Muni refresh']));
  ok('the masthead leads with it', d.querySelector('#count .hotlink') && d.querySelector('#count').firstChild.classList.contains('hotlink') && /^1/.test(d.querySelector('.hotlink').textContent));
  ok('menu badge counts it', d.getElementById('hotBadge').textContent === '1');

  /* two urgent items across two panels */
  g("data.Aviation[1].hot = true; save(); render();");
  d.querySelector('.hotlink').click();
  ok('the urgent list opens from the masthead', d.getElementById('hot').classList.contains('up'));
  const hotTitles = [...d.querySelectorAll('#hotbody .item .txt')].map(t => t.textContent);
  ok('it gathers urgent items across Fundamental panels', JSON.stringify(hotTitles) === JSON.stringify(['IC memo','Engine audit']));
  ok('grouped by panel when there is more than one', [...d.querySelectorAll('#hotbody .hotgroup')].map(h => h.textContent).join(',') === 'Fundamental,Aviation');
  ok('Own items never appear in it', !d.getElementById('hotbody').textContent.includes('Renew visa'));

  /* finishing one from the urgent list */
  [...d.querySelectorAll('#hotbody .item')].find(r => r.textContent.includes('Engine audit')).querySelector('.box').click();
  ok('ticking it off drops it from the urgent list', ![...d.querySelectorAll('#hotbody .item .txt')].some(t => t.textContent === 'Engine audit'));
  ok('count follows', /^1/.test(d.querySelector('.hotlink').textContent));

  /* lowering */
  [...d.querySelectorAll('#hotbody .item')].find(r => r.textContent.includes('IC memo')).querySelector('.hot').click();
  ok('tapping again makes it less urgent', saved('c').hot === undefined);
  ok('the list empties quietly', /Nothing urgent/.test(d.getElementById('hotbody').textContent));
  ok('the masthead count goes', !d.querySelector('.hotlink'));

  /* leaving Fundamental */
  g("data.Fundamental[0].hot = true; save(); render();");
  d.querySelector('.hotlink').click();
  d.getElementById('sideBtn').click();
  ok('switching to Own closes the urgent list', !d.getElementById('hot').classList.contains('up'));
  ok('and hides the urgent count', !d.querySelector('.hotlink'));
  ok('the flag rides along in the saved ledger', w.localStorage.getItem('ledger.v1').includes('"hot":true'));
  ok('no date slots left over', d.querySelectorAll('.due').length === 0 && !d.getElementById('dues'));
}

console.log('\n=== v14: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
