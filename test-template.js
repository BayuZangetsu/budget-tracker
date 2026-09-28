/* =====================================================================
   Test harness -- the monthly target template per pocket, plus one-click
   auto allocate.

   Run: node test-template.js

   What this suite guards:
     - OLDER pockets with no monthlyTarget field stay intact (they are not
       deleted, not treated as an error) and their template starts at 0.
     - Auto allocate is a TOP-UP toward the target, not a fresh full
       template -- so repeated clicks never pile up and never damage data.
     - The auto-allocate modal value NEVER writes to the template.
     - The template value in the template modal never touches this
       month's allocations.
     - A modal entry that cannot be read as a number is refused, not
       silently stored as Rp 0 (the same defect as in test-jumlah.js, but
       through this new path).
   ===================================================================== */
const fs = require('fs');
const path = require('path');

/* ---------- Stub localStorage ---------- */
const store = new Map();
global.localStorage = {
  get length() { return store.size; },
  key: i => [...store.keys()][i],
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: k => store.delete(k),
  clear: () => store.clear()
};

/* ---------- Stub DOM ---------- */
const elements = new Map();
const toastList = [];
const confirmAsked = [];
let lastFocus = null;
let confirmJawab = true;
/* When set, the querySelectorAll stub returns this list instead -- used to
   inject deliberately corrupted modal entries. */
let forcedInputs = null;

function makeEl(id) {
  return {
    id,
    value: '', textContent: '', innerHTML: '', hidden: true,
    min: '', max: '', type: 'text', title: '', className: '',
    dataset: {}, style: {}, select() {},
    focus() { lastFocus = id; },
    scrollIntoView() {}, getContext: () => ({}),
    appendChild() {}, remove() {}, closest: () => null, offsetWidth: 0,
    addEventListener() {},
    querySelectorAll: () => [],
    querySelector: () => null,
    classList: { _s: new Set(), add() {}, remove() {}, contains: () => false, toggle() {} }
  };
}
function el(id) { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); }

function mkInput(datasetKey, id, value) {
  const o = { value: value, dataset: {} };
  o.dataset[datasetKey] = id;
  o.focus = () => { lastFocus = id; };
  return o;
}

/* Read the <input> entries that openAutoAllocate / openTemplateEditor
   really rendered, as input objects. This exercises the whole chain:
   render -> read -> store. */
function modalInputs(dataAttr, datasetKey) {
  const html = el('modalBody').innerHTML;
  const out = [];
  for (const m of html.matchAll(/<input\b[^>]*>/g)) {
    const tag = m[0];
    const dv = tag.match(new RegExp('data-' + dataAttr + '="([^"]*)"'));
    if (!dv) continue;
    const vv = tag.match(/value="([^"]*)"/);
    out.push(mkInput(datasetKey, dv[1], vv ? vv[1] : ''));
  }
  return out;
}

global.document = {
  readyState: 'complete',
  getElementById: id => el(id),
  querySelectorAll: sel => {
    if (sel.indexOf('data-auto-alloc') !== -1) {
      return forcedInputs || modalInputs('auto-alloc', 'autoAlloc');
    }
    if (sel.indexOf('data-tpl') !== -1) {
      return forcedInputs || modalInputs('tpl', 'tpl');
    }
    return [];
  },
  addEventListener() {},
  createElement: () => makeEl('new')
};
global.navigator = {};
global.Chart = class { destroy() {} };
global.setTimeout = () => 0;
global.clearTimeout = () => {};
global.confirm = msg => { confirmAsked.push(msg); return confirmJawab; };

/* ---------- Load app.js exactly as it is ---------- */
const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const NAMA_VAR = 'pockets';

const app = new Function('VARNAME', 'TOAST', src + `
;toast = TOAST;
;return {
  get Pockets(){return eval(VARNAME)}, set Pockets(v){ eval(VARNAME + ' = v') },
  get data(){return data}, set data(v){data=v},
  get archive(){return archive}, set archive(v){archive=v},
  CASH, POCKETS_KEY, loadMonth, saveMonth, computeArchive,
  loadPockets, savePockets, pocketName, periodLabel, shownPeriod,
  num, fmt, safeColor, safeIcon, parseAmount, safeMonthlyTarget, targetOf, shortfallFor,
  openAutoAllocate, refreshAutoAllocate, runAutoAllocate,
  openTemplateEditor, refreshTemplateTotals, saveTemplate,
  openEditPocket, saveEditPocket,
  addPocket, addSuggestedPocket, copyData, pasteData
};`)(NAMA_VAR, (msg, kind) => toastList.push({ msg, kind }));

/* Stub tidak mem-parse HTML seperti browser, jadi value yang ditulis app
   lewat innerHTML tidak otomatis muncul di stub elements. Ambil nilainya
   langsung from markup yang dirender. */
function nilaiModal(id) {
  const html = el('modalBody').innerHTML;
  for (const m of html.matchAll(/<input\b[^>]*>/g)) {
    if (m[0].indexOf('id="' + id + '"') === -1) continue;
    const vv = m[0].match(/value="([^"]*)"/);
    return vv ? vv[1] : null;
  }
  return null;
}

/* ---------- Assertion ---------- */
let pass = 0, fail = 0;
const section = n => console.log('\n=== ' + n + ' ===');
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  OK    ' + name + ' = ' + a); }
  else { fail++; console.log('  FAIL ' + name + '\n      actual:   ' + a + '\n      expected: ' + e); }
}
function checkTrue(name, value) {
  if (value) { pass++; console.log('  OK    ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}
const toastTerakhir = () => toastList.length ? toastList[toastList.length - 1] : null;

function reset(daftarKantong) {
  store.clear();
  toastList.length = 0;
  confirmAsked.length = 0;
  forcedInputs = null;
  lastFocus = null;
  confirmJawab = true;
  elements.clear();
  el('month').value = '9';
  el('year').value = '2026';
  app.Pockets = daftarKantong || [
    { id: 'p1', name: 'Electricity', icon: '\uD83D\uDCA1', color: '#2563eb' },
    { id: 'p2', name: 'Groceries', icon: '\uD83C\uDF7D', color: '#16a34a' }
  ];
  app.savePockets();
  app.loadMonth();
}

/* Susun ulang agar pocket + template tertentu siap dipakai. */
function withTemplate(list) {
  reset(list.map(([id, name, tpl]) => ({
    id, name, icon: '\uD83D\uDCA1', color: '#2563eb', monthlyTarget: tpl
  })));
}

/* =====================================================================
   1 -- safeMonthlyTarget(): sanitasi value template
   ===================================================================== */
section('1. safeMonthlyTarget(): accepts only a whole amount >= 0');
check('800000', app.safeMonthlyTarget(800000), 800000);
check('0', app.safeMonthlyTarget(0), 0);
check('1', app.safeMonthlyTarget(1), 1);
check('negatif jadi 0', app.safeMonthlyTarget(-5000), 0);
check('a fraction is rounded', app.safeMonthlyTarget(800.4), 800);
check('a .6 fraction is rounded up', app.safeMonthlyTarget(800.6), 801);
check('a numeric string', app.safeMonthlyTarget('800000'), 800000);
check('a thousands separator', app.safeMonthlyTarget('1.250.750'), 1250750);
check('an Rp prefix', app.safeMonthlyTarget('rp 800000'), 800000);
check('junk becomes 0', app.safeMonthlyTarget('abc'), 0);
check('letters mixed with digits become 0', app.safeMonthlyTarget('12abc'), 0);
check('undefined', app.safeMonthlyTarget(undefined), 0);
check('null', app.safeMonthlyTarget(null), 0);
check('NaN', app.safeMonthlyTarget(NaN), 0);
check('Infinity', app.safeMonthlyTarget(Infinity), 0);
check('-Infinity', app.safeMonthlyTarget(-Infinity), 0);
check('boolean true', app.safeMonthlyTarget(true), 0);
check('boolean false', app.safeMonthlyTarget(false), 0);
check('array', app.safeMonthlyTarget([]), 0);
check('an object', app.safeMonthlyTarget({}), 0);
check('a thousands comma is a separator too', app.safeMonthlyTarget('1,250,750'), 1250750);
check('a comma decimal is read and rounded', app.safeMonthlyTarget('800,5'), 801);

/* =====================================================================
   1b -- parseAmount(): bedakan "tidak terbaca" from "nol"
   ===================================================================== */
section('1b. parseAmount() tells null apart from 0');
check('zero -> 0, not null', app.parseAmount('0'), 0);
check('zero with spaces -> 0', app.parseAmount(' 0 '), 0);
check('negative zero -> -0.5', app.parseAmount('-0.5'), -0.5);
check('a string -> a number', app.parseAmount('500000'), 500000);
check('a thousands separator', app.parseAmount('1.250.750'), 1250750);
check('an Rp prefix', app.parseAmount('rp 500'), 500);
check('an IDR prefix', app.parseAmount('idr 500'), 500);
check('the number 0 -> 0', app.parseAmount(0), 0);
check('a text string -> null', app.parseAmount('abc'), null);
check('a mix of digits and letters -> null', app.parseAmount('12abc'), null);
check('a strange symbol -> null', app.parseAmount('500#'), null);
check('no digits -> null', app.parseAmount('---'), null);
check('an empty string -> null', app.parseAmount(''), null);
check('spaces only -> null', app.parseAmount('   '), null);
check('undefined -> null', app.parseAmount(undefined), null);
check('null -> null', app.parseAmount(null), null);
check('NaN -> null', app.parseAmount(NaN), null);
check('Infinity -> null', app.parseAmount(Infinity), null);
check('a boolean -> null', app.parseAmount(true), null);
check('an object -> null', app.parseAmount({}), null);
/* num() harus tetap memakai aturan yang sama, hanya dituliskan 0. */
check('num("abc") still returns 0', app.num('abc'), 0);
check('num("0") still returns 0', app.num('0'), 0);
check('num("500000") still returns 500000', app.num('500000'), 500000);
section('2. Migration: older pockets with no monthlyTarget are not lost');
store.clear();
elements.clear();
el('month').value = '9';
el('year').value = '2026';
/* Bentuk persis data versi lama: tanpa field monthlyTarget sama sekali. */
localStorage.setItem('budget_tracker', JSON.stringify([
  { id: 'lama1', name: 'Bayar Listrik', icon: '\uD83D\uDCA1', color: '#2563eb' },
  { id: 'lama2', name: 'Tabungan', icon: '\uD83C\uDFE6', color: '#16a34a' }
]));
app.loadPockets();
check('the older pocket amount is intact', app.Pockets.length, 2);
check('older name 1 is intact', app.Pockets[0].name, 'Bayar Listrik');
check('older name 2 is intact', app.Pockets[1].name, 'Tabungan');
check('the older icon is intact', app.Pockets[0].icon, '\uD83D\uDCA1');
check('the older colour is intact', app.Pockets[0].color, '#2563eb');
check('older template 1 starts at 0', app.Pockets[0].monthlyTarget, 0);
check('older template 2 starts at 0', app.Pockets[1].monthlyTarget, 0);
check('the localStorage keys do not change', localStorage.getItem('budget_tracker') !== null, true);
check('every id stays a string', app.Pockets.every(k => typeof k.id === 'string'), true);

store.clear();
elements.clear();
el('month').value = '9';
el('year').value = '2026';
localStorage.setItem('budget_tracker', JSON.stringify([
  { id: 'a', name: 'A', icon: '\uD83D\uDCA1', color: '#111', monthlyTarget: 800000 },
  { id: 'b', name: 'B', icon: '\uD83D\uDCA1', color: '#111', monthlyTarget: '650000' },
  { id: 'c', name: 'C', icon: '\uD83D\uDCA1', color: '#111', monthlyTarget: -7 },
  { id: 'd', name: 'D', icon: '\uD83D\uDCA1', color: '#111', monthlyTarget: 'sampah' },
  { name: 'tanpaId', icon: '\uD83D\uDCA1', color: '#111' },
  null,
  { id: 'e', name: 'E', icon: '\uD83D\uDCA1', color: '#111' }
]));
app.loadPockets();
check('an entry with no id, or null, is dropped', app.Pockets.length, 5);
check('a numeric template is kept', app.Pockets[0].monthlyTarget, 800000);
check('a string template becomes a number', app.Pockets[1].monthlyTarget, 650000);
check('a negative template becomes 0', app.Pockets[2].monthlyTarget, 0);
check('a junk template becomes 0', app.Pockets[3].monthlyTarget, 0);

/* =====================================================================
   3 -- targetOf() & shortfallFor()
   ===================================================================== */
section('3. targetOf() and shortfallFor()');
withTemplate([['p1', 'Electricity', 800000], ['p2', 'Groceries', 0]]);
check('the p1 template', app.targetOf('p1'), 800000);
check('the p2 template', app.targetOf('p2'), 0);
check('a template for an unknown id', app.targetOf('nope'), 0);
check('the shortfall before anything is allocated', app.shortfallFor('p1'), 800000);
check('a 0 template gives a 0 shortfall', app.shortfallFor('p2'), 0);

withTemplate([['p1', 'Electricity', 800000]]);
/* Plot 500.000 month ini lewat jalur resmi, lalu tebak kekurangannya. */
el('allocPocket').value = 'p1';
el('allocAmount').value = '500000';
app.data.allocations.push({ [ 'pocketId' ]: 'p1', amount: 500000, note: '' });
app.saveMonth();
app.loadMonth();
app.computeArchive();
check('500.000 is already allocated this month', app.archive.thisMonth.p1.allocated, 500000);
check('the shortfall is target minus what is done', app.shortfallFor('p1'), 300000);

app.data.allocations.push({ [ 'pocketId' ]: 'p1', amount: 300000, note: '' });
app.saveMonth();
app.loadMonth();
app.computeArchive();
check('the target is already met', app.archive.thisMonth.p1.allocated, 800000);
check('the shortfall becomes 0', app.shortfallFor('p1'), 0);

app.data.allocations.push({ [ 'pocketId' ]: 'p1', amount: 250000, note: '' });
app.saveMonth();
app.loadMonth();
app.computeArchive();
check('an over-allocation does not go negative', app.shortfallFor('p1'), 0);

/* =====================================================================
   4 -- openAutoAllocate(): isi modal = kekurangan, template tak tersentuh
   ===================================================================== */
section('4. openAutoAllocate() renders the modal correctly');
withTemplate([['p1', 'Electricity', 800000], ['p2', 'Groceries', 1500000]]);
el('newPocketTarget').value = '';
app.data.income.push({ name: 'Salary', amount: 5000000 });
app.saveMonth();
app.loadMonth();
app.computeArchive();
app.openAutoAllocate();
check('the modal opens', el('modal').hidden, false);
checkTrue('the title names the month', el('modalTitle').textContent.indexOf('September') !== -1);
const autoInputs = modalInputs('auto-alloc', 'autoAlloc');
check('the row amount matches the pocket amount', autoInputs.length, 2);
check('row 1 has id p1', autoInputs[0].dataset.autoAlloc, 'p1');
check('row 1 shows the 800.000 shortfall', autoInputs[0].value, '800000');
check('row 2 shows the 1.500.000 shortfall', autoInputs[1].value, '1500000');
checkTrue('the "already allocated" column is there', el('modalBody').innerHTML.indexOf('Already allocated') !== -1);
checkTrue('the target column is there', el('modalBody').innerHTML.indexOf('Target /mo') !== -1);
checkTrue('the "add now" column is there', el('modalBody').innerHTML.indexOf('Add now') !== -1);
checkTrue('a note saying it is only for this month is there',
  el('modalBody').innerHTML.indexOf('to this month only') !== -1);
check('the total is computed', el('autoAllocTotal').textContent, app.fmt(2300000));
check('the remainder after allocating', el('autoAllocRemainder').textContent, app.fmt(5000000 - 2300000));
check('the p1 template does not change', app.targetOf('p1'), 800000);
check('template p2 tidak berubah', app.targetOf('p2'), 1500000);

withTemplate([]);
el('openModal');
app.openAutoAllocate();
check('with no pockets there is a warning toast', toastTerakhir().kind, 'warn');
check('with no pockets the modal stays closed', el('modal').hidden, true);

/* =====================================================================
   5 -- refreshAutoAllocate(): total ikut berubah saat diketik
   ===================================================================== */
section('5. refreshAutoAllocate() recalculates the total');
withTemplate([['p1', 'Electricity', 800000]]);
el('pemasukanNama').value = 'Salary';
el('pemasukanJumlah').value = '1000000';
app.data.income.push({ name: 'Salary', amount: 1000000 });
app.saveMonth();
app.loadMonth();
app.computeArchive();
app.openAutoAllocate();
check('the starting total equals the target', el('autoAllocTotal').textContent, app.fmt(800000));
check('the starting remainder', el('autoAllocRemainder').textContent, app.fmt(200000));
check('a positive remainder carries no neg class', el('autoAllocRemainder').className, '');

/* Dipilih di atas sisa Rp 1.000.000 supaya sisa jadi negatif. */
forcedInputs = [mkInput('autoAlloc', 'p1', '1200000')];
app.refreshAutoAllocate();
check('the total after editing', el('autoAllocTotal').textContent, app.fmt(1200000));
check('the remainder goes negative', el('autoAllocRemainder').textContent, app.fmt(1000000 - 1200000));
check('a negative remainder is marked', el('autoAllocRemainder').className, 'neg');

forcedInputs = [mkInput('autoAlloc', 'p1', 'abc')];
app.refreshAutoAllocate();
check('junk counts as 0, not an error', el('autoAllocTotal').textContent, app.fmt(0));

/* =====================================================================
   6 -- runAutoAllocate(): validasi, tidak pernah menulis Rp 0
   ===================================================================== */
section('6. runAutoAllocate() refuses an invalid entry');
withTemplate([['p1', 'Electricity', 800000]]);
app.data.income.push({ name: 'Salary', amount: 1000000 });
app.saveMonth(); app.loadMonth(); app.computeArchive();
app.openAutoAllocate();

forcedInputs = [mkInput('autoAlloc', 'p1', 'abc')];
app.runAutoAllocate();
check('junk raises a warning toast', toastTerakhir().kind, 'warn');
checkTrue('the message names the pocket', toastTerakhir().msg.indexOf('Electricity') !== -1);
check('focus moves to the offending field', lastFocus, 'p1');
check('no allocation is stored', app.data.allocations.length, 0);
check('the income does not change', app.data.income.length, 1);

forcedInputs = [mkInput('autoAlloc', 'p1', '12abc')];
app.runAutoAllocate();
check('mixed-in letters are refused', app.data.allocations.length, 0);
check('the toast is still a warning', toastTerakhir().kind, 'warn');

forcedInputs = [mkInput('autoAlloc', 'p1', '-5000')];
app.runAutoAllocate();
check('a negative value is refused', app.data.allocations.length, 0);

forcedInputs = [mkInput('autoAlloc', 'p1', 'NaN')];
app.runAutoAllocate();
check('NaN is refused', app.data.allocations.length, 0);

forcedInputs = [mkInput('autoAlloc', 'p1', '800.000')];
app.runAutoAllocate();
check('a thousands separator is accepted', app.data.allocations.length, 1);
check('the amount is read in full', app.data.allocations[0].amount, 800000);

/* =====================================================================
   7 -- runAutoAllocate(): jalurTeachers happy + top-up idempoten
   ===================================================================== */
section('7. Auto allocate = a top-up toward the target, not a pile-up');
withTemplate([['p1', 'Electricity', 800000], ['p2', 'Groceries', 1500000]]);
app.data.income.push({ name: 'Salary', amount: 6000000 });
app.data.allocations.push({ [ 'pocketId' ]: 'p1', amount: 500000, note: 'manual' });
app.saveMonth(); app.loadMonth(); app.computeArchive();

app.openAutoAllocate();
const isi1 = modalInputs('auto-alloc', 'autoAlloc');
check('the p1 shortfall is 300.000', isi1[0].value, '300000');
check('the p2 shortfall is 1.500.000', isi1[1].value, '1500000');
app.runAutoAllocate();
check('two new allocations are stored', app.data.allocations.length, 3);
check('the p1 allocation is 300.000', app.data.allocations[1].amount, 300000);
check('the p2 allocation is 1.500.000', app.data.allocations[2].amount, 1500000);
check('pocketId p1 is correct', app.data.allocations[1]['pocketId'], 'p1');
check('an auto allocation note', app.data.allocations[1].note, 'auto allocation');
check('every allocation is greater than 0', app.data.allocations.every(p => p.amount > 0), true);
check('the modal closes after allocating', el('modal').hidden, true);
check('the p1 template stays at 800.000', app.targetOf('p1'), 800000);
check('the p2 template stays at 1.500.000', app.targetOf('p2'), 1500000);

app.loadMonth();
app.computeArchive();
check('p1 is now exactly at the target', app.archive.thisMonth.p1.allocated, 800000);
check('p2 is now exactly at the target', app.archive.thisMonth.p2.allocated, 1500000);

/* Klik kedua: target sudah tercapai, jadi tidak boleh menumpuk. */
app.openAutoAllocate();
const isi2 = modalInputs('auto-alloc', 'autoAlloc');
check('the second click: the p1 shortfall is 0', isi2[0].value, '0');
check('the second click: the p2 shortfall is 0', isi2[1].value, '0');
app.runAutoAllocate();
check('the second click does not allocate any more', app.data.allocations.length, 3);
checkTrue('not an error message, but "there is nothing to allocate"',
  toastTerakhir().msg.indexOf('nothing was allocated') !== -1);

/* Regression: isian "0" berarti LEWATI, bukan salah ketik. Pockets dengan
   template 0 selalu muncul di modal, jadi kalau "0" diperlakukan galat,
   seluruh allocation otomatis akan dibatalkan setiap kali ada Pockets baru. */
withTemplate([['p1', 'Electricity', 0], ['p2', 'Groceries', 750000]]);
app.data.income.push({ name: 'Salary', amount: 2000000 });
app.saveMonth(); app.loadMonth(); app.computeArchive();
app.openAutoAllocate();
const isiCampur = modalInputs('auto-alloc', 'autoAlloc');
check('a 0 template is rendered as 0', isiCampur[0].value, '0');
check('a 750.000 template is rendered in full', isiCampur[1].value, '750000');
app.runAutoAllocate();
check('row 0 does not cancel the other rows', app.data.allocations.length, 1);
check('only pockets with a template are allocated', app.data.allocations[0]['pocketId'], 'p2');
check('there is no error', toastTerakhir().kind, undefined);

app.openAutoAllocate();
forcedInputs = [mkInput('autoAlloc', 'p1', '0'), mkInput('autoAlloc', 'p2', '0')];
app.runAutoAllocate();
check('all entries are 0, so nothing is allocated', app.data.allocations.length, 1);
checkTrue('the message says there is nothing to allocate', toastTerakhir().msg.indexOf('nothing was allocated') !== -1);

/* =====================================================================
   8 -- Batas uang: total melebihi sisa -> konfirmasi
   ===================================================================== */
section('8. The total exceeds what is still unallocated');
withTemplate([['p1', 'Electricity', 800000]]);
app.data.income.push({ name: 'Salary', amount: 500000 });
app.saveMonth(); app.loadMonth(); app.computeArchive();
app.openAutoAllocate();
check('the remainder before allocating', el('autoAllocRemainder').textContent, app.fmt(500000 - 800000));
confirmJawab = false;
confirmAsked.length = 0;
app.runAutoAllocate();
check('the confirmation really is called', confirmAsked.length, 1);
checkTrue('the message names the missing amount',
  confirmAsked[0].indexOf(app.fmt(300000)) !== -1);
check('answering no cancels the allocation', app.data.allocations.length, 0);
check('template tetap', app.targetOf('p1'), 800000);

app.openAutoAllocate();
confirmJawab = true;
confirmAsked.length = 0;
app.runAutoAllocate();
check('answering yes still allocates', app.data.allocations.length, 1);
check('the confirmation appears once', confirmAsked.length, 1);

withTemplate([['p1', 'Electricity', 800000]]);
app.data.income.push({ name: 'Salary', amount: 800000 });
app.saveMonth(); app.loadMonth(); app.computeArchive();
app.openAutoAllocate();
confirmAsked.length = 0;
app.runAutoAllocate();
check('a total equal to the remainder needs no confirmation', confirmAsked.length, 0);
check('the allocation still goes in', app.data.allocations.length, 1);

withTemplate([['p1', 'Electricity', 800000]]);
app.data.income.push({ name: 'Salary', amount: 2000000 });
app.saveMonth(); app.loadMonth(); app.computeArchive();
app.openAutoAllocate();
confirmAsked.length = 0;
app.runAutoAllocate();
check('a total below the remainder needs no confirmation', confirmAsked.length, 0);

/* =====================================================================
   9 -- Isian kosong di modal diperlakukan sebagai lewati
   ===================================================================== */
section('9. An empty entry is not an error');
withTemplate([['p1', 'Electricity', 0]]);
app.data.income.push({ name: 'Salary', amount: 1000000 });
app.saveMonth(); app.loadMonth(); app.computeArchive();
app.openAutoAllocate();
forcedInputs = [mkInput('autoAlloc', 'p1', '')];
app.runAutoAllocate();
checkTrue('empty means "there is nothing to allocate", not an error',
  toastTerakhir().msg.indexOf('nothing was allocated') !== -1);
check('no allocation', app.data.allocations.length, 0);

forcedInputs = [mkInput('autoAlloc', 'p1', '   ')];
app.runAutoAllocate();
check('spaces alone count as empty', app.data.allocations.length, 0);

/* Regression: "0" dan kosong sama-sama berarti lewati, bukan salah ketik. */
withTemplate([['p1', 'Electricity', 0]]);
app.data.income.push({ name: 'Salary', amount: 1000000 });
app.saveMonth(); app.loadMonth(); app.computeArchive();
app.openAutoAllocate();
forcedInputs = [mkInput('autoAlloc', 'p1', '0')];
app.runAutoAllocate();
check('a "0" entry is not an error', app.data.allocations.length, 0);
checkTrue('the message says there is nothing to allocate', toastTerakhir().msg.indexOf('nothing was allocated') !== -1);

withTemplate([['p1', 'Electricity', 0], ['p2', 'Groceries', 0]]);
app.data.income.push({ name: 'Salary', amount: 1000000 });
app.saveMonth(); app.loadMonth(); app.computeArchive();
app.openAutoAllocate();
forcedInputs = [mkInput('autoAlloc', 'p1', ''), mkInput('autoAlloc', 'p2', '250000')];
app.runAutoAllocate();
check('only the pockets that were filled in are allocated', app.data.allocations.length, 1);
check('p2 is what gets allocated', app.data.allocations[0]['pocketId'], 'p2');

/* =====================================================================
   10 -- Modal template: Affects template, tidak menyentuh allocation month ini
   ===================================================================== */
section('10. Managing the template: only the template changes');
withTemplate([['p1', 'Electricity', 800000], ['p2', 'Groceries', 0]]);
app.data.income.push({ name: 'Salary', amount: 3000000 });
app.saveMonth(); app.loadMonth(); app.computeArchive();
const allocBefore = JSON.stringify(app.data.allocations);
app.openTemplateEditor();
check('the template modal opens', el('modal').hidden, false);
check('the template modal title', el('modalTitle').textContent, 'Monthly Plot Template');
const tplInputs = modalInputs('tpl', 'tpl');
check('the row amount is the template', tplInputs.length, 2);
check('the p1 template value is carried over', tplInputs[0].value, '800000');
check('the p2 template value is carried over', tplInputs[1].value, '0');
check('the starting template total', el('templateTotal').textContent, app.fmt(800000));

forcedInputs = [mkInput('tpl', 'p1', '1200000'), mkInput('tpl', 'p2', '2000000')];
app.saveTemplate();
check('the p1 template is stored', app.targetOf('p1'), 1200000);
check('the p2 template is stored', app.targetOf('p2'), 2000000);
check('the new template total', app.Pockets.reduce((s, k) => s + k.monthlyTarget, 0), 3200000);
check('this month\'s allocation does not change', JSON.stringify(app.data.allocations), allocBefore);
check('the income does not change', app.data.income.length, 1);
check('modal tertutup', el('modal').hidden, true);

const tersimpan = JSON.parse(localStorage.getItem('budget_tracker'));
check('the template is written to localStorage too', tersimpan[0].monthlyTarget, 1200000);
check('the p2 template is written', tersimpan[1].monthlyTarget, 2000000);
check('the name is still in localStorage', tersimpan[0].name, 'Electricity');
check('the colour is still in localStorage', tersimpan[0].color, '#2563eb');

/* The template value is stored as a number, not a string. */
withTemplate([['p1', 'Electricity', 0]]);
app.openTemplateEditor();
forcedInputs = [mkInput('tpl', 'p1', '1.250.750')];
app.saveTemplate();
check('a thousands separator in a template', app.targetOf('p1'), 1250750);
check('stored as a number', typeof JSON.parse(localStorage.getItem('budget_tracker'))[0].monthlyTarget, 'number');

withTemplate([['p1', 'Electricity', 800000]]);
app.openTemplateEditor();
forcedInputs = [mkInput('tpl', 'p1', 'abc')];
app.saveTemplate();
check('template sampah -> warn', toastTerakhir().kind, 'warn');
check('the older template is intact', app.targetOf('p1'), 800000);
check('focus goes to the offending field', lastFocus, 'p1');

withTemplate([['p1', 'Electricity', 800000]]);
app.openTemplateEditor();
forcedInputs = [mkInput('tpl', 'p1', '')];
app.saveTemplate();
check('an empty template becomes 0', app.targetOf('p1'), 0);

withTemplate([]);
app.openTemplateEditor();
check('with no pockets there is a warning', toastTerakhir().kind, 'warn');

/* Template 0 berarti Pockets tidak ikut auto allocation. */
withTemplate([['p1', 'Electricity', 0], ['p2', 'Groceries', 500000]]);
app.data.income.push({ name: 'Salary', amount: 2000000 });
app.saveMonth(); app.loadMonth(); app.computeArchive();
app.openAutoAllocate();
const isiMix = modalInputs('auto-alloc', 'autoAlloc');
check('a 0 template gives an entry of 0', isiMix[0].value, '0');
check('a 500.000 template gives an entry of 500.000', isiMix[1].value, '500000');
app.runAutoAllocate();
check('only p2 is allocated', app.data.allocations.length, 1);
check('p2 is the one recorded', app.data.allocations[0]['pocketId'], 'p2');

/* =====================================================================
   11 -- Modal ubah Pockets punya field template
   ===================================================================== */
section('11. The edit pocket modal stores the template');
withTemplate([['p1', 'Electricity', 800000]]);
app.computeArchive();
app.openEditPocket('p1');
check('the edit modal opens', el('modal').hidden, false);
checkTrue('the editMonthlyTarget field is there', el('modalBody').innerHTML.indexOf('editMonthlyTarget') !== -1);
checkTrue('the template input is type text',
  /id="editMonthlyTarget"[^>]*type="text"/.test(el('modalBody').innerHTML) ||
  /type="text"[^>]*id="editMonthlyTarget"/.test(el('modalBody').innerHTML));
check('the template value is carried in the markup', nilaiModal('editMonthlyTarget'), '800000');
checkTrue('the template explanation is there',
  el('modalBody').innerHTML.indexOf('template') !== -1);

el('editName').value = 'Electricity';
el('editIcon').value = '\uD83D\uDCA1';
el('editColor').value = '#2563eb';
el('editMonthlyTarget').value = '1.500.000';
app.saveEditPocket('p1');
check('a new template from the edit modal', app.targetOf('p1'), 1500000);
check('the name stays', app.Pockets[0].name, 'Electricity');

el('editMonthlyTarget').value = 'ngawur';
app.openEditPocket('p1');
el('editName').value = 'Electricity';
el('editIcon').value = '\uD83D\uDCA1';
el('editColor').value = '#2563eb';
app.saveEditPocket('p1');
check('a junk template becomes 0', app.targetOf('p1'), 0);

/* =====================================================================
   12 -- Form tambah Pockets: template opsional
   ===================================================================== */
section('12. Adding a pocket: the template is optional on creation');
reset([]);
el('pocketName').value = 'New';
el('pocketIcon').value = '\uD83D\uDCA1';
el('newPocketTarget').value = '';
app.addPocket({ preventDefault() {} });
check('the pocket is created', app.Pockets.length, 1);
check('an empty template becomes 0', app.targetOf(app.Pockets[0].id), 0);

reset([]);
el('pocketName').value = 'New';
el('pocketIcon').value = '\uD83D\uDCA1';
el('newPocketTarget').value = '800000';
app.addPocket({ preventDefault() {} });
check('the template is stored too', app.targetOf(app.Pockets[0].id), 800000);
check('the template field is emptied again', el('newPocketTarget').value, '');
check('the name field is emptied', el('pocketName').value, '');

reset([]);
el('pocketName').value = 'New';
el('pocketIcon').value = '\uD83D\uDCA1';
el('newPocketTarget').value = 'ngawur';
app.addPocket({ preventDefault() {} });
check('a junk template becomes 0', app.targetOf(app.Pockets[0].id), 0);

reset([]);
app.addSuggestedPocket('Quick', '\uD83D\uDCA1');
check('the quick pocket is created', app.Pockets.length, 1);
check('the quick pocket has a template of 0', app.targetOf(app.Pockets[0].id), 0);

/* =====================================================================
   13 -- Salin & tempel: template ikut, tapi tidak menimpa template yang ada
   ===================================================================== */
section('13. Copy and paste data and templates');
withTemplate([['p1', 'Electricity', 800000], ['p2', 'Groceries', 500000]]);
app.copyData();
const salinan = JSON.parse(el('pasteArea').value);
check('the copy holds 2 pockets', salinan.pockets.length, 2);
check('the copy carries the p1 template', salinan.pockets[0].monthlyTarget, 800000);
check('the copy carries the p2 template', salinan.pockets[1].monthlyTarget, 500000);
check('the copy carries the name', salinan.pockets[0].name, 'Electricity');

/* Tempel to app yang template-nya sudah berbeda: template lama harus menang. */
withTemplate([['p1', 'Electricity', 250000], ['p2', 'Groceries', 500000]]);
el('pasteArea').value = JSON.stringify({
  _v: 2,
  pockets: [
    { id: 'x1', name: 'Electricity', icon: '\uD83D\uDCA1', color: '#111', monthlyTarget: 9990000 },
    { id: 'x2', name: 'Groceries', icon: '\uD83D\uDCA1', color: '#111', monthlyTarget: 500000 }
  ],
  income: [{ name: 'Salary', amount: 2000000 }],
  expenses: [],
  allocations: [],
  transfers: []
});
app.pasteData();
check('the app\'s own template is not overwritten', app.targetOf('p1'), 250000);
check('the p2 template stays', app.targetOf('p2'), 500000);
check('month ini terisi from tempelan', app.data.income.length, 1);
check('no new pocket is created', app.Pockets.length, 2);

/* Pockets yang benar-benar baru ikut membawa template from tempelan. */
withTemplate([['p1', 'Electricity', 250000]]);
el('pasteArea').value = JSON.stringify({
  _v: 2,
  pockets: [
    { id: 'x1', name: 'Electricity', icon: '\uD83D\uDCA1', color: '#111', monthlyTarget: 9990000 },
    { id: 'x2', name: 'New', icon: '\uD83D\uDCA1', color: '#111', monthlyTarget: 700000 }
  ],
  income: [{ name: 'Salary', amount: 2000000 }],
  expenses: [],
  allocations: [],
  transfers: []
});
app.pasteData();
check('the new pocket is created', app.Pockets.length, 2);
check('the new pocket carries the template', app.targetOf(app.Pockets[1].id), 700000);
check('the older pocket keeps its template', app.targetOf('p1'), 250000);

/* =====================================================================
   14 -- The new markup, handlers and styles
   ===================================================================== */
section('14. The new markup, handlers and styles');
const html = fs.readFileSync(path.join(__dirname, 'budget-tracker.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');

checkTrue('the auto allocate button is there', html.indexOf('openAutoAllocate()') !== -1);
checkTrue('the manage template button is there', html.indexOf('openTemplateEditor()') !== -1);
checkTrue('the template field exists in the add form', html.indexOf('id="newPocketTarget"') !== -1);
checkTrue('the template field is not a number',
  /id="newPocketTarget"[^>]*inputmode="numeric"/.test(html) && !/id="newPocketTarget"[^>]*type="number"/.test(html));
checkTrue('the one-click explainer is there', html.indexOf('Auto Allocate') !== -1);
checkTrue('style .alloc-table exists', css.indexOf('.alloc-table') !== -1);
checkTrue('style .alloc-total exists', css.indexOf('.alloc-total') !== -1);
checkTrue('style .alloc-table-wrap exists', css.indexOf('.alloc-table-wrap') !== -1);
checkTrue('style .neg for a negative remainder exists', /\.alloc-total b\.neg/.test(css));
checkTrue('the pocket card shows the target',
  app.fmt ? fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8').indexOf('Target /mo') !== -1 : false);

/* =====================================================================
   Ringkasan
   ===================================================================== */
console.log('\n================================');
console.log('PASS: ' + pass + '   FAIL: ' + fail);
console.log('================================');
process.exit(fail ? 1 : 0);
