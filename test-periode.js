/* =====================================================================
   Test harness -- switching period (moving between month/year).

   Run: node test-periode.js

   Focus:
     1. Moving the month must never overwrite the target month
     2. Pocket balances stay stable while the period changes
     3. Each month keeps its own separate data
   ===================================================================== */
const fs = require('fs');

/* ---------- localStorage stub ---------- */
const store = new Map();
const writeLog = [];
global.localStorage = {
  get length() { return store.size; },
  key: i => [...store.keys()][i],
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); writeLog.push(k); },
  removeItem: k => { store.delete(k); writeLog.push('DEL:' + k); },
  clear: () => { store.clear(); writeLog.length = 0; }
};

/* ---------- DOM stub, with a listener recorder ---------- */
let period = { month: 9, year: 2026 };

function makeEl(id) {
  const listeners = {};
  const el = {
    id,
    value: id === 'month' ? String(period.month)
         : id === 'year' ? String(period.year)
         : '',
    min: '', max: '', textContent: '', innerHTML: '', hidden: true,
    dataset: {}, style: {}, className: '', title: '',
    focus() {}, scrollIntoView() {}, getContext: () => ({}),
    appendChild() {}, remove() {},
    closest: () => null, offsetWidth: 0,
    addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); }, toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); }
    },
    /* Mimics the user: change the value, then fire the change event. */
    setValue(v) { this.value = String(v); this.__fire('change'); },
    __fire(ev, e) { (listeners[ev] || []).forEach(fn => fn(e || { target: this })); }
  };
  return el;
}

const elements = new Map();
function el(id) { if (!elements.has(id)) elements.set(id, makeEl(id)); return elements.get(id); }

global.document = {
  readyState: 'complete',
  getElementById: id => el(id),
  querySelectorAll: () => [],
  addEventListener() {},
  createElement: () => makeEl('new')
};
global.navigator = {};
global.Chart = class { constructor() { this.destroyed = false; } destroy() { this.destroyed = true; } };
global.setTimeout = () => 0;
global.clearTimeout = () => {};

/* ---------- Load app.js exactly as it is ---------- */
const src = fs.readFileSync(__dirname + '/app.js', 'utf8');
const POCKETS_VAR = 'pockets';

const app = new Function('VARNAME', src + `
;var _read = function(){ return eval(VARNAME); };
;var _maybe = function(n){ return eval('typeof ' + n + ' === "undefined" ? null : ' + n); };
;return {
  get Pockets(){return _read()}, set Pockets(v){ eval(VARNAME + ' = v') },
  get data(){return data}, set data(v){data=v},
  get archive(){return archive}, set archive(v){archive=v},
  get activePeriod(){ return typeof activePeriod === 'undefined' ? null : activePeriod },
  switchPeriod: _maybe('switchPeriod'),
  CASH, POCKETS_KEY, monthKey, allMonthKeys,
  loadMonth, saveMonth, normalizeMonth, emptyMonth, computeArchive, renderAll,
  loadPockets, savePockets, pocketName, periodLabel, currentPeriod,
  bindEvents, num, fmt
};`)(POCKETS_VAR);

const KID = 'pocketId';

/* ---------- Assertions ---------- */
let pass = 0, fail = 0;
const section = n => console.log('\n=== ' + n + ' ===');
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  ok   ' + name + ' = ' + a); }
  else { fail++; console.log('  FAIL ' + name + '\n      actual:   ' + a + '\n      expected: ' + e); }
}
function checkTrue(name, value) {
  if (value) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}
const rp = n => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const balance = name => {
  const p = app.Pockets.find(x => x.name === name);
  return p ? app.archive.balances[p.id].balance : 'NO SUCH POCKET';
};

function resetAll() {
  store.clear();
  writeLog.length = 0;
  elements.clear();
  period = { month: 9, year: 2026 };
  app.Pockets = [
    { id: 'p1', name: 'Electricity', icon: '\uD83D\uDCA1', color: '#2563eb' },
    { id: 'p2', name: 'Groceries', icon: '\uD83C\uDF7D', color: '#16a34a' }
  ];
  app.savePockets();
  el('month').value = '9';
  el('year').value = '2026';
  app.bindEvents();
  app.loadMonth();
}

/* =====================================================================
   1 -- Reproduction: moving the month must not overwrite the target
   ===================================================================== */
section('1. Moving the month: the old month must not be copied into the new one');
resetAll();

/* Fill September the way normal use would. */
app.data.income.push({ name: 'Salary', amount: 5000000 });
app.data.allocations.push({ [KID]: 'p1', amount: 500000, note: '' });
app.data.expenses.push({ name: 'Token', amount: 539630, [KID]: 'p1', date: '2026-09-05' });
app.saveMonth();
app.renderAll();
check('September is stored', store.has('budget_tracker_2026_9'), true);
check('the Electricity balance in September', balance('Electricity'), -39630);
check('September: 1 expense', app.data.expenses.length, 1);
check('October does not exist before the move', store.has('budget_tracker_2026_10'), false);

const septemberBefore = store.get('budget_tracker_2026_9');

/* The user action: drag the month dropdown to October. */
el('month').setValue(10);

check('September is unchanged after the move', store.get('budget_tracker_2026_9'), septemberBefore);
check('October is not created just by being looked at', store.has('budget_tracker_2026_10'), false);
check('the dropdown points at October', el('month').value, '10');
check('the data loaded is October data (empty)', app.data.expenses.length, 0);
check('October income is empty', app.data.income.length, 0);
check('the active period is October', app.activePeriod, { month: 10, year: 2026 });
check('the Electricity balance is still -39630 in October', balance('Electricity'), -39630);

/* Adding data in October is what may finally create the October key. */
app.data.expenses.push({ name: 'Wifi bill', amount: 350000, [KID]: null, date: '2026-10-02' });
app.saveMonth();
check('October is created once there is a change', store.has('budget_tracker_2026_10'), true);
check('October holds exactly 1 expense', JSON.parse(store.get('budget_tracker_2026_10')).expenses.length, 1);
check('October did not overwrite September', store.get('budget_tracker_2026_9'), septemberBefore);

/* Back to September -> the original data is intact. */
el('month').setValue(9);
check('back in September, 1 expense', app.data.expenses.length, 1);
check('back in September, Token is 539630', app.data.expenses[0].amount, 539630);
check('September is still byte for byte the same', store.get('budget_tracker_2026_9'), septemberBefore);

/* =====================================================================
   2 -- Pocket balances stay stable while the period changes
   ===================================================================== */
section('2. Pocket balances must not change when the period changes');
resetAll();
app.data.income.push({ name: 'Salary', amount: 5000000 });
app.data.allocations.push({ [KID]: 'p1', amount: 500000, note: '' });
app.data.expenses.push({ name: 'Token', amount: 300000, [KID]: 'p1', date: '2026-09-05' });
app.saveMonth();
app.renderAll();

const before = {
  electricity: balance('Electricity'),
  groceries: balance('Groceries'),
  cash: app.archive.cash.total
};
check('Electricity before the period change', before.electricity, 200000);
check('Groceries before the period change', before.groceries, 0);
check('free cash before the period change', before.cash, 4500000);

for (const m of [10, 11, 12, 1, 2, 3, 9]) {
  el('month').setValue(m);
  app.renderAll();
  const now = { electricity: balance('Electricity'), groceries: balance('Groceries'), cash: app.archive.cash.total };
  if (now.electricity !== before.electricity || now.cash !== before.cash) {
    fail++;
    console.log('  FAIL it changed after moving to month ' + m +
      ' -> Electricity ' + rp(now.electricity) + ', free ' + rp(now.cash));
  } else {
    pass++;
    console.log('  ok   stable after moving to month ' + m +
      ' (Electricity ' + rp(now.electricity) + ', free ' + rp(now.cash) + ')');
  }
}

/* =====================================================================
   3 -- Changing the year
   ===================================================================== */
section('3. Changing the year does not overwrite another year');
resetAll();
app.data.income.push({ name: 'Salary', amount: 3000000 });
app.saveMonth();
check('2026 exists', store.has('budget_tracker_2026_9'), true);

el('year').setValue(2027);
check('2026 is stored intact', JSON.parse(store.get('budget_tracker_2026_9')).income.length, 1);
check('the 2026 amount is still 3000000', JSON.parse(store.get('budget_tracker_2026_9')).income[0].amount, 3000000);
check('2027 is not created just by being looked at', store.has('budget_tracker_2027_9'), false);
check('the view moves to 2027', app.activePeriod, { month: 9, year: 2027 });
check('the 2027 data is empty', app.data.income.length, 0);
check('2026 is not shown either', app.data.income.length, 0);

/* A change in 2027 is what may finally create the 2027 key. */
app.data.income.push({ name: 'Salary 2027', amount: 4000000 });
app.saveMonth();
check('2027 is created once there is a change', store.has('budget_tracker_2027_9'), true);
check('2027 holds 1 income row', JSON.parse(store.get('budget_tracker_2027_9')).income.length, 1);
check('2026 was not overwritten', JSON.parse(store.get('budget_tracker_2026_9')).income[0].amount, 3000000);

el('year').setValue(2026);
check('back in 2026', app.data.income.length, 1);
check('the 2026 amount is still 3000000', app.data.income[0].amount, 3000000);
check('2027 is still intact', JSON.parse(store.get('budget_tracker_2027_9')).income[0].amount, 4000000);

/* =====================================================================
   4 -- Going back and forth does not duplicate anything
   ===================================================================== */
section('4. Going back and forth neither duplicates nor damages data');
resetAll();
app.data.income.push({ name: 'Salary', amount: 5000000 });
app.data.expenses.push({ name: 'Electricity', amount: 300000, [KID]: 'p1', date: '2026-09-05' });
app.saveMonth();
const original9 = store.get('budget_tracker_2026_9');

for (let i = 0; i < 5; i++) {
  el('month').setValue(10);
  el('month').setValue(9);
}
check('September did not change by a single byte', store.get('budget_tracker_2026_9') === original9, true);
check('September still has 1 expense', JSON.parse(store.get('budget_tracker_2026_9')).expenses.length, 1);
check('September still has 1 income row', JSON.parse(store.get('budget_tracker_2026_9')).income.length, 1);
check('October was never created', store.has('budget_tracker_2026_10'), false);
check('only 1 month key is in storage', [...store.keys()].filter(k => /^budget_tracker_\d{4}_\d+$/.test(k)).length, 1);
check('free cash did not multiply', app.archive.cash.total, 5000000);
check('the Electricity balance did not multiply', balance('Electricity'), -300000);

/* =====================================================================
   5 -- Which key gets written when the period changes
   ===================================================================== */
section('5. The key written must belong to the month currently loaded');
resetAll();
app.data.income.push({ name: 'Start', amount: 111000 });
app.saveMonth();

/* Simulate an unsaved change: the user is still typing in the inline
   column and drags the month dropdown without blurring first. */
app.data.income.push({ name: 'Not saved yet', amount: 222000 });

writeLog.length = 0;
el('month').setValue(10);
check('the September key is written (the old data is saved first)', writeLog.includes('budget_tracker_2026_9'), true);
check('the October key is NOT written just by being looked at', writeLog.includes('budget_tracker_2026_10'), false);
checkTrue('not one new month key was written',
  writeLog.filter(k => /^budget_tracker_\d{4}_\d+$/.test(k)).every(k => k === 'budget_tracker_2026_9'));
check('September holds 2 rows', JSON.parse(store.get('budget_tracker_2026_9')).income.length, 2);
check('the unsaved row is saved along with it',
  JSON.parse(store.get('budget_tracker_2026_9')).income[1].amount, 222000);

/* =====================================================================
   6 -- A month that has never been used
   ===================================================================== */
section('6. Moving to a month that has never existed');
resetAll();
app.data.income.push({ name: 'Salary', amount: 5000000 });
app.data.expenses.push({ name: 'Electricity', amount: 300000, [KID]: 'p1', date: '2026-09-05' });
app.saveMonth();

const originalSeptember = store.get('budget_tracker_2026_9');

el('month').setValue(7); /* July, never used */
check('July is not created just by being looked at', store.has('budget_tracker_2026_7'), false);
check('July displays empty', app.data.expenses.length, 0);
check('the active period is July', app.activePeriod, { month: 7, year: 2026 });
check('Electricity is still -300.000 in July', balance('Electricity'), -300000);
check('free cash is still 5.000.000 in July', app.archive.cash.total, 5000000);
check('September did not change along with it', store.get('budget_tracker_2026_9'), originalSeptember);

el('month').setValue(9);
check('back in September, the data is intact', app.data.expenses.length, 1);
check('the Electricity balance is back to -300.000', balance('Electricity'), -300000);
check('September is still byte for byte the same', store.get('budget_tracker_2026_9'), originalSeptember);

/* =====================================================================
   7 -- app.js must contain the safety steps
   ===================================================================== */
section('7. Guards in the source');
checkTrue('app.js remembers which period is loaded', /activePeriod/.test(src));
checkTrue('there is a switchPeriod function', /^function switchPeriod\(/m.test(src));
checkTrue('saveMonth uses the active period key', /function saveMonth[\s\S]{0,200}?activeKey\(\)/.test(src));
checkTrue('loadMonth records the active period', /function loadMonth[\s\S]{0,200}?activePeriod\s*=/.test(src));
checkTrue('there is no bare saveMonth in the month handler',
  !/\$?\('month'\)\.addEventListener\('change', \(\) => \{\s*saveMonth\(\);/.test(src));
checkTrue('there is no bare saveMonth in the year handler',
  !/\$?\('year'\)\.addEventListener\('change', \(\) => \{\s*saveMonth\(\);/.test(src));

/* ---------- Summary ---------- */
console.log('\n================================');
console.log('PASS: ' + pass + '   FAIL: ' + fail);
console.log('================================');
process.exit(fail ? 1 : 0);
