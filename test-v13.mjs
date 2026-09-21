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


/* ---------- 11. deadlines: the parser ---------- */
{
  const { g } = boot({ store: v10store });
  const now = 'new Date(2026, 8, 21)';   // a Monday
  const P = x => g(`parseDue(${JSON.stringify(x)}, ${now})`);
  const cases = [
    ['today','2026-09-21'], ['tmrw','2026-09-22'], ['tomorrow','2026-09-22'],
    ['fri','2026-09-25'], ['Friday','2026-09-25'], ['next fri','2026-10-02'], ['mon','2026-09-28'],
    ['+5','2026-09-26'], ['5d','2026-09-26'], ['2w','2026-10-05'],
    ['10/3','2026-10-03'], ['25/9','2026-09-25'], ['oct 3','2026-10-03'], ['3 oct','2026-10-03'],
    ['October 3rd','2026-10-03'], ['1/15','2027-01-15'], ['9/10','2026-09-10'],
    ['15','2026-10-15'], ['30','2026-09-30'], ['12/25/27','2027-12-25'], ['2026-11-02','2026-11-02'],
  ];
  cases.forEach(([inp, want]) => ok('parses "' + inp + '"', P(inp) === want));
  ok('an impossible date is refused', P('2/30') === null);
  ok('nonsense is refused', P('banana') === null);
  ok('empty clears', P('') === '');
  const F = x => g(`fmtDue(${JSON.stringify(x)}, ${now})`);
  ok('shows Today', F('2026-09-21') === 'Today');
  ok('shows Tmrw', F('2026-09-22') === 'Tmrw');
  ok('this week shows the day', F('2026-09-25') === 'Fri');
  ok('later shows the date', F('2026-10-03') === '3 Oct');
  ok('a past date reads like any other', F('2026-09-10') === '10 Sep');
  ok('another year carries the year', F('2027-01-15') === '15 Jan 27');
}

/* ---------- 12. deadlines: the row ---------- */
{
  const iso = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
  const lists = {
    Fundamental: [ item('a','Railcar comps'), item('b','Muni refresh', { due: iso(10) }), item('x','Old one', { done:true, due: iso(2) }),
                   item('p','Handover', { lt:true, steps:[] }), item('q','Late thing', { due: iso(-3) }), item('r','Board pack', { due: iso(1) }) ],
    Personal:    [ item('c','Renew visa') ],
  };
  const store = { 'ledger.v1': JSON.stringify(lists), 'ledger.v1.tabs': JSON.stringify(['Fundamental','Personal']),
                  'ledger.v1.spaces': JSON.stringify({ Fundamental:'fa', Personal:'own' }) };
  const { w, d, g } = boot({ store });
  ok('no date slots on Own', d.querySelectorAll('.due').length === 0);
  d.getElementById('sideBtn').click();
  const slots = d.querySelectorAll('.item .due');
  ok('open Fundamental items get a date slot, done and long-term do not', slots.length === 4);
  ok('an undated item shows the quiet calendar mark', !!d.querySelector('.item .due.nodate svg'));
  ok('tomorrow is picked out', [...slots].some(s => s.classList.contains('soon') && s.textContent === 'Tmrw'));
  ok('nothing says overdue anywhere', !/overdue/i.test(d.body.textContent));

  /* type a date in */
  const empty = d.querySelector('.item .due.nodate');
  empty.click();
  const inp = d.querySelector('.item .due input');
  ok('tapping the slot opens a text field', !!inp);
  ok('tapping the slot does not open the item', !d.getElementById('detail').classList.contains('up'));
  inp.value = '+3';
  inp.dispatchEvent(new w.Event('input'));
  ok('it previews the date as you type', d.querySelector('.item .due .pv').textContent !== '' && d.querySelector('.item .due .pv').textContent !== '?');
  inp.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const saved = JSON.parse(w.localStorage.getItem('ledger.v1')).Fundamental.find(i => i.id === 'a');
  ok('Enter saves it', saved.due === iso(3));

  /* an unreadable date is not saved */
  const slotB = [...d.querySelectorAll('.item .due')].find(s => s.textContent && !s.classList.contains('nodate') && s.closest('.item').textContent.includes('Muni'));
  slotB.click();
  const inpB = d.querySelector('.item .due input');
  inpB.value = 'someday'; inpB.dispatchEvent(new w.Event('input'));
  inpB.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  ok('nonsense is flagged and kept for fixing', inpB.classList.contains('bad') && d.contains(inpB));
  inpB.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('escape leaves the old date alone', JSON.parse(w.localStorage.getItem('ledger.v1')).Fundamental.find(i => i.id === 'b').due === iso(10));

  /* clearing */
  const slotR = [...d.querySelectorAll('.item .due')].find(s => s.closest('.item').textContent.includes('Board pack'));
  slotR.click();
  const inpR = d.querySelector('.item .due input');
  inpR.value = ''; inpR.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  ok('an empty field clears the date', JSON.parse(w.localStorage.getItem('ledger.v1')).Fundamental.find(i => i.id === 'r').due === undefined);

  /* ---------- 13. the waterfall ---------- */
  d.getElementById('duesBtn').click();
  ok('the waterfall opens', d.getElementById('dues').classList.contains('up'));
  const rows = [...d.querySelectorAll('#duesbody .wf')];
  const titles = rows.map(r => r.querySelector('.t').textContent);
  ok('soonest first, a past date at the top', JSON.stringify(titles) === JSON.stringify(['Late thing','Railcar comps','Muni refresh']));
  ok('done and long-term items stay out', !titles.includes('Old one') && !titles.includes('Handover'));
  ok('a past date sits quietly at today', !!rows[0].querySelector('.pt.past') && !/overdue/i.test(d.getElementById('duesbody').textContent));
  ok('bars grow down the list', parseFloat(rows[2].querySelector('.bar').style.width) > parseFloat(rows[1].querySelector('.bar').style.width));
  ok('the axis starts at today', /Today/.test(d.querySelector('.wfaxis').textContent));
  ok('menu badge counts dated items', d.getElementById('duesBadge').textContent === '3');
  rows[1].click();
  ok('tapping a row opens the item', d.getElementById('detail').classList.contains('up') && !d.getElementById('dues').classList.contains('up'));
  ok('dates ride along in the saved ledger', w.localStorage.getItem('ledger.v1').includes('"due"'));
  ok('the waterfall button is Fundamental-only', d.getElementById('duesBtn').classList.contains('fa-only'));
}

console.log('\n=== v13: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
