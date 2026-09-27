import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'fs';
import { webcrypto } from 'crypto';
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : (fail++, console.log('FAIL: ' + n)); };
const wait = ms => new Promise(r => setTimeout(r, ms));

function boot({ store = {}, fetchImpl, search = '', offline = false } = {}) {
  const vc = new VirtualConsole(); const errors = [];
  vc.on('jsdomError', e => errors.push(e.message));
  const calls = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'https://babylon-global.com/mene/' + search,
    pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.matchMedia = () => ({ matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
      w.fetch = (u, o = {}) => { calls.push([o.method || 'GET', String(u), o.body]); return (fetchImpl || (() => Promise.reject(new Error('offline'))))(u, o); };
      Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
      w.confirm = () => true;
      if (offline) Object.defineProperty(w.navigator, 'onLine', { get: () => false, configurable: true });
      Object.keys(store).forEach(k => w.localStorage.setItem(k, store[k]));
    },
  });
  const w = dom.window;
  /* jsdom does not leave the page: every trip to Microsoft reports itself
     as a navigation it cannot do, which is what counts the redirects */
  const navs = () => errors.filter(m => /navigation/i.test(m)).length;
  return { w, d: w.document, errors, calls, navs, g: expr => w.eval(expr) };
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
const signedIn = extra => ({ ...v10store, 'ledger.v1.ms': JSON.stringify({ rt:'RT', at:'AT', exp: Date.now()+6e5, folder:'Ledger', signin: Date.now() }), ...extra });
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
  ok('opens on General', d.documentElement.getAttribute('data-side') === 'gen');
  ok('the seal shows G lit', d.querySelector('#sideRing i.on').dataset.side === 'gen');
  ok('all three letters ride the seal', [...d.querySelectorAll('#sideRing i')].map(i => i.textContent).join('') === 'FBG');
  ok('exactly one is lit', d.querySelectorAll('#sideRing i.on').length === 1);
  const body = d.body.textContent;
  ok('General shows its panels', /Lumina/.test(d.getElementById('navwrap').textContent) && /Personal/.test(d.getElementById('navwrap').textContent));
  ok('Fundamental panel is not on General', !/Fundamental/.test(d.getElementById('navwrap').textContent));
  ok('Fundamental items hidden on General', !body.includes('Call the broker'));
  ok('no switch row under the masthead', !d.getElementById('sides'));
  ok('the seal offers Fundamental next', /Showing General\. Switch to Fundamental/.test(d.getElementById('sideBtn').getAttribute('aria-label')));
  w.save();
  const tabs = JSON.parse(w.localStorage.getItem('ledger.v1.tabs'));
  const spaces = JSON.parse(w.localStorage.getItem('ledger.v1.spaces'));
  ok('saved panel list holds every side', tabs.length === 4 && tabs.includes('Fundamental') && tabs.includes('Babylon'));
  ok('Fundamental panel migrated to the Fundamental side', spaces.Fundamental === 'fa');
  ok('everything else migrated to General', spaces.Lumina === 'gen' && spaces.Personal === 'gen');
  const stored = w.localStorage.getItem('ledger.v1');
  ok('every item survived', ['Call the broker','Fund launch','Draft memo','Renew visa'].every(t => stored.includes(t)));

  /* ---------- 2. switching ---------- */
  d.getElementById('sideBtn').click();
  ok('switch flips the palette', d.documentElement.getAttribute('data-side') === 'fa');
  ok('Fundamental items now showing', d.body.textContent.includes('Call the broker'));
  ok('General items now hidden', !d.body.textContent.includes('Draft memo'));
  ok('long-term board scoped to Fundamental', g('projectsEverywhere().live.length') === 1);
  ok('waiting scoped to Fundamental', g('totalWaiting()') === 0);
  ok('side remembered', w.localStorage.getItem('ledger.v1.side') === 'fa');
  ok('the seal now offers Babylon', /Switch to Babylon/.test(d.getElementById('sideBtn').getAttribute('aria-label')));
  ok('a switch writes nothing to the cloud', calls.length === 0);
  d.getElementById('sideBtn').click();   // Fundamental -> Babylon
  d.getElementById('sideBtn').click();   // Babylon -> General
  ok('long-term board empty on General', g('projectsEverywhere().live.length') === 0);
  ok('waiting on General', g('totalWaiting()') === 1);
  d.getElementById('sideBtn').click();

  /* ---------- 3. panels ---------- */
  ok('a name used on the other side is refused', w.addTab('Personal') === false);
  ok('a new Fundamental panel', w.addTab('Aviation') === true && g("SPACEMAP.Aviation") === 'fa');
  ok('Fundamental now has two panels', g('TABS.length') === 2 && g("ALL.filter(t => spaceOf(t) === 'fa').length") === 2);
  g("renameTab(TABS.indexOf('Aviation'), 'Lumina')");
  ok('rename into a name from the other side is refused', g("TABS.includes('Aviation')"));
  g("moveSide(TABS.indexOf('Aviation'))");
  ok('panel crossed to the next side', g("SPACEMAP.Aviation") === 'bg' && !g("TABS.includes('Aviation')") && g("ALL.includes('Aviation')"));
  g('moveSide(0)');
  ok('the last panel on a side cannot leave', g("TABS.includes('Fundamental')") && g("SPACEMAP.Fundamental") === 'fa');
  g("renameTab(0, 'FA Work')");
  ok('rename keeps side and items', g("SPACEMAP['FA Work']") === 'fa' && g("data['FA Work'].length") === 2 && g("SPACEMAP.Fundamental") === undefined);
  const tabs2 = JSON.parse(w.localStorage.getItem('ledger.v1.tabs'));
  ok('saved list holds every panel from every side', ['FA Work','Lumina','Personal','Aviation'].every(t => tabs2.includes(t)));
}

/* ---------- 4. reopening lands on the side you left ---------- */
{
  const { d } = boot({ store: { ...v10store, 'ledger.v1.side': 'fa', 'ledger.v1.spaces': JSON.stringify({ Fundamental:'fa', Lumina:'gen', Personal:'gen' }) } });
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
  ok('a v10 backup restores with Fundamental on its own side', g2('SPACEMAP.Fundamental') === 'fa' && g2('SPACEMAP.Lumina') === 'gen');
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
  ok('pushed copy holds every side', body.order && body.order.length >= 3 && body.spaces.Babylon === 'bg');
  ok('dated copy written', calls.some(c => c[0] === 'PUT' && /backups\/ledger-\d{4}-\d{2}-\d{2}\.json/.test(c[1])));
  ok('stale copy did not overwrite', !w.localStorage.getItem('ledger.v1').includes('stale cloud item'));
}

/* ---------- 8. the guard counts both sides, not the one showing ---------- */
{
  const lists = { Fundamental:[item('a','Call the broker')], Personal:[] };
  const stale = { __ledger:1, v:6, savedAt:1, order:['Personal'], lists:{ Personal:[item('z','stale cloud item')] } };
  const store = signedIn({
    'ledger.v1': JSON.stringify(lists), 'ledger.v1.tabs': JSON.stringify(['Fundamental','Personal']),
    'ledger.v1.spaces': JSON.stringify({ Fundamental:'fa', Personal:'gen' }), 'ledger.v1.side': 'gen',
    'ledger.v1.ms.savedAt': String(Date.now()),
  });
  const { w } = boot({ store, fetchImpl: graph(stale) });
  await wait(600);
  ok('an empty side showing does not count as an empty device', w.localStorage.getItem('ledger.v1').includes('Call the broker') && !w.localStorage.getItem('ledger.v1').includes('stale cloud item'));
}

/* ---------- 9. wiped browser recovers both sides ---------- */
{
  const cloud = { __ledger:1, v:6, savedAt: Date.now(), order:['Fundamental','Personal'], spaces:{ Fundamental:'fa', Personal:'gen' },
                  lists:{ Fundamental:[item('r','recovered FA item')], Personal:[item('p','recovered own item')] } };
  const { w, g } = boot({ store: { 'ledger.v1.ms': JSON.stringify({ rt:'RT', at:'AT', exp: Date.now()+6e5, folder:'Ledger', signin: Date.now() }) }, fetchImpl: graph(cloud) });
  await wait(600);
  const s = w.localStorage.getItem('ledger.v1');
  ok('wiped browser recovers both sides', s.includes('recovered FA item') && s.includes('recovered own item'));
  ok('and the split comes back with it', g('SPACEMAP.Fundamental') === 'fa' && g('SPACEMAP.Personal') === 'gen');
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
                  'ledger.v1.spaces': JSON.stringify({ Fundamental:'fa', Aviation:'fa', Personal:'gen' }), 'ledger.v1.tab.fa': 'Fundamental' };
  const { w, d, g } = boot({ store });
  const titles = () => [...d.querySelectorAll('#stage .item .txt')].map(t => t.textContent);
  const saved = id => { const L = JSON.parse(w.localStorage.getItem('ledger.v1')); for (const k in L) { const f = L[k].find(i => i.id === id); if (f) return f; } };

  ok('General gets urgent marks too', d.querySelectorAll('#stage .item .hot').length === 1);
  ok('a flagged General item lights up', d.querySelectorAll('#stage .item.urgent').length === 1);
  ok('General masthead counts it', /^1/.test(d.querySelector('.hotlink').textContent));

  d.getElementById('sideBtn').click();
  ok('open Fundamental items get the diamond, done and long-term do not', d.querySelectorAll('#stage .item .hot').length === 3);
  ok('nothing urgent on this side yet', d.querySelectorAll('#stage .item.urgent').length === 0 && !d.querySelector('.hotlink'));

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
  ok('items from other sides never appear in it', !d.getElementById('hotbody').textContent.includes('Renew visa'));

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
  ok('switching side closes the urgent list', !d.getElementById('hot').classList.contains('up'));
  ok('the count now follows the side you are on', !d.querySelector('.hotlink'));
  ok('the flag rides along in the saved ledger', w.localStorage.getItem('ledger.v1').includes('"hot":true'));
  ok('no date slots left over', d.querySelectorAll('.due').length === 0 && !d.getElementById('dues'));
}


/* ---------- 12. the update check never hangs ---------- */
{
  const { w, d, g } = boot({ store: v10store, fetchImpl: () => new Promise(() => {}) });
  let outcome = 'pending';
  w.eval("withTimeout(new Promise(() => {}), 60)").then(() => { outcome = 'resolved'; }, e => { outcome = e.message; });
  await wait(150);
  ok('a request that never answers times out', outcome === 'timeout');
  let fast = null;
  w.eval("withTimeout(Promise.resolve(7), 60)").then(v => { fast = v; });
  await wait(20);
  ok('a quick answer passes straight through', fast === 7);
  d.getElementById('updBtn').click();
  ok('the check says it is checking', /Checking/.test(d.getElementById('updSub').textContent));
}
{
  const { d } = boot({ store: v10store, fetchImpl: () => Promise.reject(new Error('offline')) });
  d.getElementById('updBtn').click();
  await wait(50);
  ok('offline says so rather than spinning', /Could not check/.test(d.getElementById('updSub').textContent));
}
{
  const html2 = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const { d } = boot({ store: v10store, fetchImpl: () => Promise.resolve({ ok:true, status:200, text: async () => html2 }) });
  d.getElementById('updBtn').click();
  await wait(50);
  ok('a current app says it is the latest', /already the latest/.test(d.getElementById('updSub').textContent));
}


/* ---------- 13. the seal cycles all three sides ---------- */
{
  const lists = { Fundamental:[item('f','IC memo')], BGIP:[item('b','Fund docs')], Personal:[item('p','Renew visa')] };
  const { w, d, g } = boot({ store: { 'ledger.v1': JSON.stringify(lists), 'ledger.v1.tabs': JSON.stringify(['Fundamental','BGIP','Personal']) } });
  const side = () => d.documentElement.getAttribute('data-side');
  const lit  = () => { const on = d.querySelector('#sideRing i.on'); return on ? on.textContent : ''; };
  ok('BGIP lands on Babylon by name', g('SPACEMAP.BGIP') === 'bg');
  ok('Personal lands on General', g('SPACEMAP.Personal') === 'gen');
  ok('opens on General with G lit', side() === 'gen' && lit() === 'G');
  d.getElementById('sideBtn').click();
  ok('one tap: Fundamental, F lit', side() === 'fa' && lit() === 'F' && d.body.textContent.includes('IC memo'));
  d.getElementById('sideBtn').click();
  ok('two taps: Babylon, B lit', side() === 'bg' && lit() === 'B' && d.body.textContent.includes('Fund docs'));
  ok('Babylon shows only its own', !d.body.textContent.includes('IC memo') && !d.body.textContent.includes('Renew visa'));
  d.getElementById('sideBtn').click();
  ok('three taps: back to General', side() === 'gen' && lit() === 'G' && d.body.textContent.includes('Renew visa'));
  ok('the side is remembered', w.localStorage.getItem('ledger.v1.side') === 'gen');
  ok('urgent marks on this side too', d.querySelectorAll('#stage .item .hot').length === 1);
  d.getElementById('sideBtn').click();
  g("moveSide(0)");
  ok('the last panel on a side cannot leave', g('SPACEMAP.Fundamental') === 'fa');
  w.addTab('Aviation');
  g("moveSide(TABS.indexOf('Aviation'))");
  ok('a panel moves to the next side with its items', g('SPACEMAP.Aviation') === 'bg' && g("ALL.includes('Aviation')"));
  ok('the side it left still has a panel', g("ALL.filter(t => spaceOf(t) === 'fa').length") === 1);
}

/* ---------- 14. an empty ledger still has all three sides ---------- */
{
  const { g } = boot({ store: {} });
  ok('three sides exist from nothing', ['fa','bg','gen'].every(x => g(`ALL.filter(t => spaceOf(t) === '${x}').length`) >= 1));
}


/* ---------- 15. a long-term project can be urgent ---------- */
{
  const lists = {
    Fundamental: [ item('a','Railcar comps'),
                   item('p','Aviation handover', { lt:true, steps:[{ t:'List positions', done:true, subs:[] }, { t:'Brief successor', done:false, subs:[] }] }),
                   item('q','Fleet review', { lt:true, steps:[] }) ],
    Personal:    [ item('z','Renew visa') ],
  };
  const store = { 'ledger.v1': JSON.stringify(lists), 'ledger.v1.tabs': JSON.stringify(['Fundamental','Personal']),
                  'ledger.v1.spaces': JSON.stringify({ Fundamental:'fa', Personal:'gen' }), 'ledger.v1.side': 'fa',
                  'ledger.v1.ui': JSON.stringify({ waitOpen:{}, ltOpen:{ Fundamental:true } }) };
  const { w, d, g } = boot({ store });
  const saved = id => JSON.parse(w.localStorage.getItem('ledger.v1')).Fundamental.find(i => i.id === id);
  const rowFor = t => [...d.querySelectorAll('#stage .item')].find(r => r.textContent.includes(t));

  ok('a long-term row carries the diamond', !!rowFor('Aviation handover').querySelector('.hot'));
  rowFor('Aviation handover').querySelector('.hot').click();
  ok('marking a project urgent sticks', saved('p').hot === true);
  ok('the project row lights up', rowFor('Aviation handover').classList.contains('urgent'));
  ok('it counts in the masthead', /^1/.test(d.querySelector('.hotlink').textContent));
  ok('it rises above the other project', [...d.querySelectorAll('#stage .item.lt .txt')].map(t => t.textContent)[0] === 'Aviation handover');

  /* folded away, the divider still says something urgent is under it */
  g("UI.ltOpen.Fundamental = false; saveUI(); render();");
  const rule = d.querySelector('.tierrule.longterm');
  ok('the folded divider flags it', rule.classList.contains('hasurgent') && /urgent/.test(rule.textContent));

  /* the urgent list gathers projects alongside quick items */
  d.querySelector('.hotlink').click();
  ok('the project appears in the urgent list', d.getElementById('hotbody').textContent.includes('Aviation handover'));
  d.getElementById('hotBack').click();

  /* and the long-term board */
  d.getElementById('projBtn').click();
  const cards = [...d.querySelectorAll('#projbody .pcard')];
  ok('the urgent project leads the board', cards[0].textContent.includes('Aviation handover'));
  ok('its card is lit', cards[0].classList.contains('urgent'));
  ok('the other card is not', !cards[1].classList.contains('urgent'));
  ok('the card carries its own diamond', !!cards[0].querySelector('.hot'));
  cards[0].querySelector('.hot').click();
  ok('lowering it from the board works', saved('p').hot === undefined);
  ok('the board redraws at once', !d.querySelector('#projbody .pcard.urgent'));
  ok('and the masthead count clears', !d.querySelector('.hotlink'));
}


/* ---------- 16. the backup guard ---------- */
{
  const lists = { Fundamental:[item('a','Railcar comps')], Personal:[item('p','Renew visa')] };
  const base = { 'ledger.v1': JSON.stringify(lists), 'ledger.v1.tabs': JSON.stringify(['Fundamental','Personal']),
                 'ledger.v1.spaces': JSON.stringify({ Fundamental:'fa', Personal:'gen' }) };
  const auth = { rt:'RT', at:'AT', exp: Date.now()+6e5, who:'diwik@babylon-global.com', folder:'Ledger', signin: Date.now() };
  const hrs = n => Date.now() - n * 3600 * 1000;

  /* never connected */
  {
    const { d } = boot({ store: base });
    const g = d.getElementById('guard');
    ok('a never-connected ledger says so on the main screen', !g.hidden);
    ok('it names the risk plainly', /Not backed up/.test(g.textContent) && /this phone only/i.test(g.textContent));
    ok('and offers to connect', d.getElementById('guardAct').textContent === 'Connect');
    ok('the banner is not inside the menu', !d.getElementById('sheet').contains(g));
    ok('it cannot be dismissed', !g.querySelector('[aria-label*="ismiss"], .close, .gdismiss'));
  }

  /* connected and current: no banner at all */
  {
    const { d } = boot({ store: { ...base, 'ledger.v1.ms': JSON.stringify(auth),
      'ledger.v1.ms.savedAt': String(Date.now()), 'ledger.v1.ms.ever': String(hrs(100)) } });
    ok('a healthy backup shows no banner', d.getElementById('guard').hidden);
  }

  /* the sign-in expired: this is the case that bit him */
  {
    const { d, g } = boot({ store: { ...base, 'ledger.v1.ms.ever': String(hrs(100)),
      'ledger.v1.ms.savedAt': String(hrs(70)), 'ledger.v1.ms.lost': String(hrs(68)),
      'ledger.v1.ms.pending': String(hrs(66)) } });
    const el = d.getElementById('guard');
    ok('an expired sign-in raises the banner', !el.hidden);
    ok('it says the backup stopped', /Backup stopped/.test(el.textContent));
    ok('it says how long ago it last saved', /3 days ago/.test(el.textContent));
    ok('it warns the edits since are only local', /only/.test(el.textContent));
    ok('and offers to reconnect', d.getElementById('guardAct').textContent === 'Reconnect');
    ok('health reads expired, not off', g('backupHealth().state') === 'expired');
  }

  /* connected, but writes are failing */
  {
    const { d, g } = boot({ store: { ...base, 'ledger.v1.ms': JSON.stringify(auth),
      'ledger.v1.ms.ever': String(hrs(100)), 'ledger.v1.ms.savedAt': String(hrs(5)),
      'ledger.v1.ms.fail': String(hrs(4)) } });
    ok('failing writes raise the banner', !d.getElementById('guard').hidden);
    ok('it says failing', /Backup failing/.test(d.getElementById('guard').textContent));
    ok('and offers a retry', d.getElementById('guardAct').textContent === 'Retry');
    ok('health reads failing', g('backupHealth().state') === 'failing');
  }

  /* connected and quiet, but nothing has reached OneDrive in days */
  {
    const { d, g } = boot({ store: { ...base, 'ledger.v1.ms': JSON.stringify(auth),
      'ledger.v1.ms.ever': String(hrs(200)), 'ledger.v1.ms.savedAt': String(hrs(40)) } });
    ok('a stale copy raises the banner even while connected', !d.getElementById('guard').hidden);
    ok('health reads stale', g('backupHealth().state') === 'stale');
  }

  /* an edit while disconnected starts the clock, and saving clears everything */
  {
    const { w, d, g } = boot({ store: { ...base, 'ledger.v1.ms.ever': String(hrs(100)),
      'ledger.v1.ms.savedAt': String(hrs(70)), 'ledger.v1.ms.lost': String(hrs(68)) } });
    ok('no pending clock before an edit', !w.localStorage.getItem('ledger.v1.ms.pending'));
    g("scheduleSync()");
    ok('an edit while disconnected starts the clock', !!w.localStorage.getItem('ledger.v1.ms.pending'));
    g("markSaved(); setSavedAt(Date.now()); renderGuard();");
    ok('a successful save clears the pending clock', !w.localStorage.getItem('ledger.v1.ms.pending'));
    ok('the banner stays up while still signed out', !d.getElementById('guard').hidden);
    g(`writeAuth(${JSON.stringify(auth)}); markConnected(); setSavedAt(Date.now()); renderGuard();`);
    ok('reconnecting takes the banner down', d.getElementById('guard').hidden);
  }
}

/* ---------- 17. a dead sign-in never strands the app ---------- */
{
  const lists = { Fundamental:[item('a','Railcar comps')] };
  const base = { 'ledger.v1': JSON.stringify(lists), 'ledger.v1.tabs': JSON.stringify(['Fundamental']) };
  const hrs = n => Date.now() - n * 3600 * 1000;

  {
    const { w, d, g, navs } = boot({ store: { ...base, 'ledger.v1.ms.ever': String(hrs(100)), 'ledger.v1.ms.lost': String(hrs(2)) } });
    await wait(80);
    ok('opening with a dead token says it is reconnecting first', !d.getElementById('guard').hidden && /Reconnecting OneDrive/.test(d.getElementById('guard').textContent));
    ok('and has not left yet', navs() === 0);
    await wait(700);
    ok('then goes to Microsoft once', navs() === 1 && g("lastAuthUrl").indexOf('https://login.microsoftonline.com/') === 0);
    ok('never with prompt=none', !/prompt=none/.test(g("lastAuthUrl")));
    ok('and nothing silent is attempted', !w.localStorage.getItem('ledger.v1.ms.silent'));
  }

  /* the reconnect tap skips the account picker */
  {
    const auth = JSON.stringify({ rt:'', at:'', exp:0, who:'diwik@babylon-global.com' });
    const { d, g } = boot({ store: { ...base, 'ledger.v1.ms': auth, 'ledger.v1.ms.ever': String(hrs(100)) } });
    d.getElementById('guardAct').click();
    await wait(120);
    const url = g("lastAuthUrl");
    ok('the reconnect goes to Microsoft', url.indexOf('https://login.microsoftonline.com/') === 0);
    ok('it carries a login hint', /login_hint=diwik/.test(url));
    ok('it does not ask for a silent sign-in', !/prompt=none/.test(url));
  }

  /* a sign-in error still reads correctly */
  {
    const { d, g } = boot({ store: { ...base, 'ledger.v1.ms.ever': String(hrs(100)) },
                            search: '?error=login_required&error_description=x' });
    await wait(80);
    ok('an error return raises the banner', !d.getElementById('guard').hidden);
    ok('health reads expired', g('backupHealth().state') === 'expired');
  }
}

/* ---------- 18. the sign-in renews itself ---------- */
{
  const lists = { Fundamental:[item('a','Railcar comps')], Personal:[item('p','Renew visa')] };
  const base = { 'ledger.v1': JSON.stringify(lists), 'ledger.v1.tabs': JSON.stringify(['Fundamental','Personal']),
                 'ledger.v1.spaces': JSON.stringify({ Fundamental:'fa', Personal:'gen' }) };
  const hrs = n => Date.now() - n * 3600 * 1000;
  const mins = n => Date.now() - n * 60000;
  const who = 'diwik@babylon-global.com';
  const live = (signin, extra = {}) => ({ ...base,
    'ledger.v1.ms': JSON.stringify({ rt:'RT', at:'AT', exp: Date.now()+6e5, who, folder:'Ledger', ...(signin ? { signin } : {}) }),
    'ledger.v1.ms.savedAt': String(Date.now()), 'ledger.v1.ms.ever': String(hrs(200)), ...extra });
  const dead = extra => ({ ...base, 'ledger.v1.ms': JSON.stringify({ who }),
    'ledger.v1.ms.ever': String(hrs(200)), 'ledger.v1.ms.savedAt': String(hrs(30)), 'ledger.v1.ms.lost': String(hrs(2)), ...extra });
  const cloud = { __ledger:1, v:6, savedAt: 1, order:['Fundamental'], lists:{ Fundamental:[item('z','old cloud item')] } };
  const auth = w => JSON.parse(w.localStorage.getItem('ledger.v1.ms') || 'null');
  const q = url => new URL(url).searchParams;

  /* a sign-in 21 hours old goes by itself, and says so first */
  {
    const { d, g, navs, calls } = boot({ store: live(hrs(21)), fetchImpl: graph(cloud) });
    await wait(150);
    const gd = d.getElementById('guard');
    ok('21 hours: the banner says it is reconnecting', !gd.hidden && /Reconnecting OneDrive/.test(gd.textContent));
    ok('21 hours: the notice is up before anything leaves', navs() === 0);
    ok('21 hours: the notice has no button to press', d.getElementById('guardAct').hidden);
    await wait(900);
    const url = g("lastAuthUrl");
    ok('21 hours: exactly one redirect', navs() === 1);
    ok('21 hours: to the authorize endpoint', url.indexOf('https://login.microsoftonline.com/') === 0 && /\/oauth2\/v2\.0\/authorize\?/.test(url));
    ok('21 hours: with the account as login_hint', q(url).get('login_hint') === who);
    ok('21 hours: and no prompt at all', !q(url).has('prompt'));
    ok('21 hours: the trip is marked automatic', JSON.parse(g("localStorage.getItem('ledger.v1.ms.pkce')")).auto === true);
    ok('21 hours: the ledger is not written to OneDrive on the way out', !calls.some(c => c[0] === 'PUT'));
  }

  /* a fresh sign-in stays put */
  {
    const { navs, calls } = boot({ store: live(hrs(2)), fetchImpl: graph(cloud) });
    await wait(1000);
    ok('2 hours: no redirect', navs() === 0);
    ok('2 hours: it syncs as usual', calls.some(c => /approot:\/ledger\.json/.test(c[1])));
  }

  /* installed before the stamp existed */
  {
    const { navs, g } = boot({ store: live(0), fetchImpl: graph(cloud) });
    await wait(1000);
    ok('no stamp: counts as due, one redirect', navs() === 1 && q(g("lastAuthUrl")).get('login_hint') === who);
  }

  /* the sign-in is already gone */
  {
    const { d, navs, g } = boot({ store: dead() });
    await wait(150);
    ok('auth state: reconnecting shown', /Reconnecting OneDrive/.test(d.getElementById('guard').textContent));
    await wait(900);
    ok('auth state: one redirect with the hint and no prompt', navs() === 1 && q(g("lastAuthUrl")).get('login_hint') === who && !q(g("lastAuthUrl")).has('prompt'));
  }
  {
    const { navs, g } = boot({ store: { ...dead(), 'ledger.v1.ms': '' } });
    await wait(1000);
    ok('no account known: one tap on the picker instead', navs() === 1 && q(g("lastAuthUrl")).get('prompt') === 'select_account' && !q(g("lastAuthUrl")).has('login_hint'));
  }
  {
    const { navs } = boot({ store: { ...dead(), 'ledger.v1.ms.lost': '' } });
    await wait(1000);
    ok('signed out from the menu: the app stays put', navs() === 0);
  }

  /* offline */
  {
    const { d, navs } = boot({ store: dead(), offline: true });
    await wait(1000);
    ok('offline: no redirect', navs() === 0);
    ok('offline: the banner stays up', !d.getElementById('guard').hidden && /Backup stopped/.test(d.getElementById('guard').textContent));
    ok('offline: with its one-tap Reconnect', d.getElementById('guardAct').textContent === 'Reconnect' && !d.getElementById('guardAct').hidden);
  }
  {
    const { navs } = boot({ store: live(hrs(21)), offline: true, fetchImpl: graph(cloud) });
    await wait(1000);
    ok('offline with a sign-in due: no redirect', navs() === 0);
  }

  /* coming back to the front */
  {
    const { w, d, navs } = boot({ store: live(hrs(2)), fetchImpl: graph(cloud) });
    await wait(300);
    const a = auth(w); a.signin = hrs(21); w.localStorage.setItem('ledger.v1.ms', JSON.stringify(a));
    const resume = () => d.dispatchEvent(new w.Event('visibilitychange'));
    const entry = d.getElementById('entry');
    entry.focus();
    ok('resume: the add line has focus', d.activeElement === entry);
    resume();
    await wait(900);
    ok('resume while typing: no redirect', navs() === 0);
    ok('resume while typing: no reconnecting notice either', !/Reconnecting/.test(d.getElementById('guard').textContent));
    entry.blur();
    entry.value = 'half written';
    resume();
    await wait(900);
    ok('resume with text left in the add line: no redirect', navs() === 0);
    entry.value = '';
    resume();
    await wait(900);
    ok('resume with nothing in hand: one redirect', navs() === 1);
  }
  {
    /* typing starts while the notice is up: the trip is called off */
    const { d, navs } = boot({ store: live(hrs(21)), fetchImpl: graph(cloud) });
    await wait(150);
    d.getElementById('entry').focus();
    await wait(900);
    ok('typing during the notice calls the trip off', navs() === 0);
    ok('and the notice goes', d.getElementById('guard').hidden);
  }

  /* the loop guard */
  {
    const { navs } = boot({ store: live(hrs(21), { 'ledger.v1.ms.bounce': String(mins(2)) }), fetchImpl: graph(cloud) });
    await wait(1000);
    ok('a second open within 5 minutes: no redirect', navs() === 0);
  }
  {
    const { navs } = boot({ store: live(hrs(21), { 'ledger.v1.ms.bounce': String(mins(6)) }), fetchImpl: graph(cloud) });
    await wait(1000);
    ok('after 5 minutes it may go again', navs() === 1);
  }

  /* an automatic trip that comes back with error= */
  {
    const pkce = JSON.stringify({ verifier:'v'.repeat(43), state:'ST', auto:true });
    const { w, d, g, navs } = boot({ store: dead({ 'ledger.v1.ms.pkce': pkce, 'ledger.v1.ms.bounce': String(mins(1)) }),
                                     search: '?error=interaction_required&error_description=x&state=ST' });
    await wait(1000);
    ok('error return: no automatic redirect', navs() === 0);
    ok('error return: the back-off starts', +w.localStorage.getItem('ledger.v1.ms.hold') > mins(1));
    ok('error return: the banner says it plainly', /OneDrive needs you to sign in/.test(d.getElementById('guard').textContent));
    ok('error return: with Reconnect', d.getElementById('guardAct').textContent === 'Reconnect' && !d.getElementById('guardAct').hidden);
    ok('error return: the address is cleaned', !/error=/.test(w.location.search));
    d.getElementById('guardAct').click();
    await wait(200);
    ok('a manual Reconnect still goes, back-off or not', navs() === 1 && q(g("lastAuthUrl")).get('login_hint') === who && !q(g("lastAuthUrl")).has('prompt'));
    ok('a manual trip is not marked automatic', JSON.parse(w.localStorage.getItem('ledger.v1.ms.pkce')).auto === false);
  }
  {
    /* later that day, past the loop guard but inside the six hours */
    const { d, navs } = boot({ store: dead({ 'ledger.v1.ms.hold': String(hrs(2)), 'ledger.v1.ms.bounce': String(hrs(2)) }) });
    await wait(1000);
    ok('inside six hours: no automatic redirect', navs() === 0);
    ok('inside six hours: the banner still asks', /OneDrive needs you to sign in/.test(d.getElementById('guard').textContent));
  }
  {
    const { d, navs } = boot({ store: live(hrs(21), { 'ledger.v1.ms.hold': String(hrs(2)), 'ledger.v1.ms.bounce': String(hrs(2)) }), fetchImpl: graph(cloud) });
    await wait(1000);
    ok('held while the old sign-in still works: no redirect', navs() === 0);
    ok('held while the old sign-in still works: the banner asks for a tap', !d.getElementById('guard').hidden && /OneDrive needs you to sign in/.test(d.getElementById('guard').textContent) && d.getElementById('guardAct').textContent === 'Reconnect');
  }
  {
    const { navs } = boot({ store: dead({ 'ledger.v1.ms.hold': String(hrs(7)), 'ledger.v1.ms.bounce': String(hrs(7)) }) });
    await wait(1000);
    ok('after six hours it goes by itself again', navs() === 1);
  }
  {
    /* a manual trip that is cancelled does not start the back-off */
    const pkce = JSON.stringify({ verifier:'v'.repeat(43), state:'ST', auto:false });
    const { w } = boot({ store: dead({ 'ledger.v1.ms.pkce': pkce }), search: '?error=access_denied&state=ST' });
    await wait(200);
    ok('a cancelled manual trip does not hold off the next', !w.localStorage.getItem('ledger.v1.ms.hold'));
  }
  {
    const pkce = JSON.stringify({ verifier:'v'.repeat(43), state:'ST', auto:true });
    const { w, navs } = boot({ store: dead({ 'ledger.v1.ms.pkce': pkce }), search: '?code=C&state=WRONG' });
    await wait(1000);
    ok('a state mismatch holds off too', !!w.localStorage.getItem('ledger.v1.ms.hold') && navs() === 0);
  }
  {
    const pkce = JSON.stringify({ verifier:'v'.repeat(43), state:'ST', auto:true });
    const refuse = (u, o) => /oauth2\/v2\.0\/token/.test(String(u))
      ? Promise.resolve({ ok:false, status:400, json: async () => ({ error:'invalid_grant' }) }) : graph(cloud)(u, o);
    const { w, navs } = boot({ store: dead({ 'ledger.v1.ms.pkce': pkce }), search: '?code=C&state=ST', fetchImpl: refuse });
    await wait(1000);
    ok('a failed code exchange holds off too', !!w.localStorage.getItem('ledger.v1.ms.hold') && navs() === 0);
  }

  /* coming back with a code */
  {
    const pkce = JSON.stringify({ verifier:'v'.repeat(43), state:'ST', auto:true });
    const { w, d, g, calls, navs } = boot({
      store: dead({ 'ledger.v1.ms.pkce': pkce, 'ledger.v1.ms.pending': String(hrs(1)), 'ledger.v1.ms.hold': String(hrs(7)),
                    'ledger.v1.ms.resume': JSON.stringify({ kind:'item', tab:'Personal', id:'p' }) }),
      search: '?code=C&state=ST', fetchImpl: graph(cloud) });
    await wait(150);
    const t = d.getElementById('toast');
    ok('code: exchanged for tokens', calls.some(c => /oauth2\/v2\.0\/token/.test(c[1]) && /grant_type=authorization_code/.test(c[2])));
    ok('code: signin stamped', Math.abs(auth(w).signin - Date.now()) < 5000);
    ok('code: the toast says so', t.classList.contains('up') && t.textContent === 'OneDrive reconnected');
    await wait(500);
    const put = calls.find(c => c[0] === 'PUT' && /approot:\/ledger\.json:\/content/.test(c[1]));
    ok('code: the sync runs straight away', !!put);
    ok('code: the edit made while lapsed goes up', !!put && JSON.parse(put[2]).lists.Personal.some(i => i.t === 'Renew visa'));
    ok('code: the old cloud copy did not win', !w.localStorage.getItem('ledger.v1').includes('old cloud item'));
    ok('code: the banner comes down', d.getElementById('guard').hidden);
    ok('code: the back-off is cleared', !w.localStorage.getItem('ledger.v1.ms.hold'));
    ok('code: no second trip', navs() === 0);
    ok('code: the open item is put back', d.getElementById('detail').classList.contains('up') && g('openItem && openItem.id') === 'p');
    ok('code: the menu is not thrown open on a reconnect', !d.getElementById('syncSheet').classList.contains('up'));
    ok('code: nothing about the sign-in reaches the ledger or the cloud copy',
       !/signin|RT/.test(w.localStorage.getItem('ledger.v1')) && !/signin/.test(put ? put[2] : ''));
  }
  {
    /* nothing pending: it pulls */
    const newer = { __ledger:1, v:6, savedAt: Date.now() + 6e4, order:['Fundamental'], lists:{ Fundamental:[item('n','newer cloud item')] } };
    const pkce = JSON.stringify({ verifier:'v'.repeat(43), state:'ST', auto:true });
    const { w } = boot({ store: dead({ 'ledger.v1.ms.pkce': pkce }), search: '?code=C&state=ST', fetchImpl: graph(newer) });
    await wait(700);
    ok('code with nothing pending: a newer OneDrive copy is pulled', w.localStorage.getItem('ledger.v1').includes('newer cloud item'));
  }

  /* a refresh keeps the original stamp */
  {
    const signin = hrs(3);
    const { w, calls, navs } = boot({ store: { ...live(signin), 'ledger.v1.ms': JSON.stringify({ rt:'RT0', at:'OLD', exp: Date.now() - 1000, who, folder:'Ledger', signin }) },
                                      fetchImpl: graph(cloud) });
    await wait(700);
    ok('refresh: a refresh ran', calls.some(c => /grant_type=refresh_token/.test(c[2] || '')));
    ok('refresh: the new token is kept', auth(w).at === 'AT' && auth(w).rt === 'RT');
    ok('refresh: signin is unchanged', auth(w).signin === signin);
    ok('refresh: no redirect', navs() === 0);
  }

  /* the account survives a refused token, for the hint */
  {
    const refuse = (u, o) => /oauth2\/v2\.0\/token/.test(String(u))
      ? Promise.resolve({ ok:false, status:400, json: async () => ({ error:'invalid_grant' }) }) : graph(cloud)(u, o);
    const { w, g, navs } = boot({ store: { ...live(hrs(3)), 'ledger.v1.ms': JSON.stringify({ rt:'RT0', at:'OLD', exp: Date.now() - 1000, who, folder:'Ledger', signin: hrs(3) }) },
                                  fetchImpl: refuse });
    await wait(1200);
    ok('refused: the refresh token is gone', !auth(w).rt);
    ok('refused: the account is kept for the hint', auth(w).who === who);
    ok('refused: and it goes to Microsoft with it', navs() === 1 && q(g("lastAuthUrl")).get('login_hint') === who);
  }
}

console.log('\n=== v23: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
