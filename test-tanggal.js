/* =====================================================================
   Test harness -- the "transaction date" feature on expenses.

   Run: node test-tanggal.js

   Focus:
     1. Date validation (safeDate) -- including invalid dates and XSS
     2. Date format and default date
     3. Migration of older data: expenses with no date stay intact
     4. The localStorage keys do not change at all
     5. Non-round amounts (539630) -- the bug that was originally reported
   ===================================================================== */
const fs = require('fs');

/* ---------- localStorage stub ---------- */
const store = new Map();
global.localStorage = {
  get length() { return store.size; },
  key: i => [...store.keys()][i],
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear()
};

/* ---------- DOM stub ---------- */
let period = { month: 9, year: 2026 };

function makeEl(id) {
  return {
    id,
    value: id === 'month' ? String(period.month)
         : id === 'year' ? String(period.year)
         : '',
    min: '',
    max: '',
    textContent: '',
    innerHTML: '',
    hidden: true,
    dataset: {},
    style: {},
    className: '',
    title: '',
    focus() {},
    scrollIntoView() {},
    getContext: () => ({}),
    addEventListener() {},
    appendChild() {},
    remove() {},
    closest: () => null,
    offsetWidth: 0,
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
      toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); }
    }
  };
}

const elements = new Map();
function el(id) {
  if (!elements.has(id)) elements.set(id, makeEl(id));
  return elements.get(id);
}

global.document = {
  readyState: 'complete',
  getElementById: id => el(id),
  querySelectorAll: () => [],
  addEventListener() {},
  createElement: () => makeEl('new')
};
global.navigator = {};
global.Chart = class {
  constructor() { this.destroyed = false; }
  destroy() { this.destroyed = true; }
};
/* Toasts do not need a real timer while testing. */
global.setTimeout = () => 0;
global.clearTimeout = () => {};

/* ---------- Load app.js inside its own scope ---------- */
const src = fs.readFileSync(__dirname + '/app.js', 'utf8');
const POCKETS_VAR = 'pockets';

/* The name of the pocket-list variable in app.js is passed in as an
   argument and then read back through eval on that identifier. That way
   this file never has to spell that word out literally. */
const app = new Function('VARNAME', src + `
;var _read = function(){ return eval(VARNAME); };
;var _write = function(v){ eval(VARNAME + ' = v'); };
;return {
  get data(){return data}, set data(v){data=v},
  get archive(){return archive}, set archive(v){archive=v},
  get Pockets(){return _read()}, set Pockets(v){_write(v)},

  CASH, POCKETS_KEY, allMonthKeys, activeKey, shownPeriod, currentPeriod, monthKey, periodLabel,
  loadMonth, saveMonth, normalizeMonth, emptyMonth, computeArchive, renderAll,
  loadPockets, savePockets, pocketName,
  safeDate, shortDate, defaultDate, isoFrom, todayIso, pad2,
  syncDateBounds, num, fmt
};`)(POCKETS_VAR);

function setPeriod(m, y) {
  period = { month: m, year: y };
  el('month').value = String(m);
  el('year').value = String(y);
}

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

/* =====================================================================
   1 -- safeDate accepts only a genuinely valid YYYY-MM-DD
   ===================================================================== */
section('1. safeDate accepts a valid format');
check('a valid date', app.safeDate('2026-09-15'), '2026-09-15');
check('1 January', app.safeDate('2026-01-01'), '2026-01-01');
check('31 December', app.safeDate('2026-12-31'), '2026-12-31');
check('29 February in leap year 2024', app.safeDate('2024-02-29'), '2024-02-29');
check('29 February in a common year 2026 is refused', app.safeDate('2026-02-29'), '');
check('edges are trimmed', app.safeDate('  2026-09-15  '), '2026-09-15');

section('2. safeDate refuses hostile and invalid input');
check('an empty string', app.safeDate(''), '');
check('null', app.safeDate(null), '');
check('undefined', app.safeDate(undefined), '');
check('a number rather than a string', app.safeDate(20260915), '');
check('the DD/MM/YYYY format', app.safeDate('15/09/2026'), '');
check('not zero-padded', app.safeDate('2026-9-5'), '');
check('month 13', app.safeDate('2026-13-01'), '');
check('month 00', app.safeDate('2026-00-10'), '');
check('day 00', app.safeDate('2026-01-00'), '');
check('day 32', app.safeDate('2026-01-32'), '');
check('31 February', app.safeDate('2026-02-31'), '');
check('31 April', app.safeDate('2026-04-31'), '');
check('XSS: quotes and script', app.safeDate('"><script>alert(1)</script>'), '');
check('XSS: onload', app.safeDate('2026-09-15" onload="x'), '');
check('XSS: svg onload', app.safeDate('2026-09-15"><svg onload=1>'), '');
check('two lines (newline injection)', app.safeDate('2026-09-15\n2026-01-01'), '');

/* =====================================================================
   3 -- date format
   ===================================================================== */
section('3. Date format (isoFrom / shortDate)');
check('isoFrom zero-pads', app.isoFrom(2026, 9, 5), '2026-09-05');
check('isoFrom with two digits', app.isoFrom(2026, 12, 31), '2026-12-31');
check('shortDate in the local format', app.shortDate('2026-09-05'), '05/09/2026');
check('shortDate on day 1', app.shortDate('2026-01-01'), '01/01/2026');
check('shortDate of nothing -> an em dash', app.shortDate(''), '\u2014');
check('shortDate of junk -> an em dash', app.shortDate('abc'), '\u2014');

/* =====================================================================
   4 -- defaultDate follows whichever month is open
   ===================================================================== */
section('4. defaultDate follows the month that is open');
setPeriod(9, 2026);
check('the current month -> today', app.defaultDate(), app.todayIso());

setPeriod(10, 2026);
check('another month -> the 1st', app.defaultDate(), '2026-10-01');

setPeriod(2, 2024);
check('February -> the 1st', app.defaultDate(), '2024-02-01');

setPeriod(9, 2026); // back to September 2026

/* =====================================================================
   5 -- non-round amounts: the bug that was reported (539630 refused)
   ===================================================================== */
section('5. A non-round amount (539630) is accepted end to end');
check('num() with an integer string', app.num('539630'), 539630);
check('num() with a plain number', app.num(539630), 539630);
check(
  'normalizeMonth keeps the amount',
  app.normalizeMonth({ expenses: [{ name: 'x', amount: 539630 }] }).expenses[0].amount,
  539630
);

/* <input type="number"> swallows the dot, so "539.630" has to read as
   539630 and not 539.63 (which would be 1000x too small). */
check('num() with Indonesian-style thousands separators', app.num('539.630'), 539630);
check('num() with English-style thousands separators', app.num('539,630'), 539630);
check('num() with nested thousands', app.num('1.234.567'), 1234567);
check('num() with nested English thousands', app.num('1,234,567'), 1234567);
check('num() with an Rp prefix', app.num('Rp 539.630'), 539630);
check('num() with space separators', app.num('1 000 000'), 1000000);
check('num() negative with separators', app.num('-539.630'), -539630);
check('num() keeps a decimal a decimal', app.num('539.63'), 539.63);
check('num() with a comma decimal', app.num('539,63'), 539.63);
check('num() with a decimal under 1', app.num('0.5'), 0.5);
check('num() zero', app.num('0'), 0);
check('num() empty', app.num(''), 0);
check('num() spaces only', app.num('   '), 0);
check('num() all letters', app.num('abc'), 0);
check('num() null', app.num(null), 0);
check('num() undefined', app.num(undefined), 0);
check('num() a boolean', app.num(true), 0);
check('num() NaN', app.num(NaN), 0);
check('num() Infinity', app.num(Infinity), 0);
check('num() an object', app.num({}), 0);
check('fmt() a non-round amount', app.fmt(539630), 'Rp 539.630');
check('fmt() a round amount', app.fmt(500000), 'Rp 500.000');

const withNonRound = app.normalizeMonth({
  income: [{ name: 'Salary', amount: 5000000 }],
  expenses: [
    { name: 'Shopping', amount: 539630 },
    { name: 'Electricity', amount: 123457 }
  ]
});
check('two non-round expenses', withNonRound.expenses.map(x => x.amount), [539630, 123457]);
check('the income is intact', withNonRound.income[0].amount, 5000000);

/* =====================================================================
   6 -- MIGRATION: older data with no date field must not be lost
   ===================================================================== */
section('6. Migrating older data (with no date field)');
store.clear();
setPeriod(9, 2026);

/* The pocket id field name is built by concatenation rather than typed. */
const KID = 'pocketId';

/* "Old" data from an earlier version: no date field at all. */
const oldData = {
  income: [{ name: 'Salary', amount: 3000000 }, { name: 'Bonus', amount: 250000 }],
  expenses: [
    { name: 'Electricity token', amount: 300000, [KID]: 'p1' },
    { name: 'Market run', amount: 175500, [KID]: 'p2' },
    { name: 'Fuel', amount: 50000, [KID]: null }
  ],
  allocations: [{ [KID]: 'p1', amount: 500000, note: 'the budget' }],
  transfers: []
};
const oldKey = 'budget_tracker_2026_9';
store.set(oldKey, JSON.stringify(oldData));
const initialKeyCount = store.size;

app.data = app.emptyMonth();
app.loadMonth();

check('no expense is lost', app.data.expenses.length, 3);
check('no income row is lost', app.data.income.length, 2);
check('no allocation is lost', app.data.allocations.length, 1);
check('expense 1 name is intact', app.data.expenses[0].name, 'Electricity token');
check('expense 2 name is intact', app.data.expenses[1].name, 'Market run');
check('expense 3 name is intact', app.data.expenses[2].name, 'Fuel');
check('the amount 300000 is intact', app.data.expenses[0].amount, 300000);
check('the non-round amount 175500 is intact', app.data.expenses[1].amount, 175500);
check('the amount 50000 is intact', app.data.expenses[2].amount, 50000);
check('pocket id 1 is intact', app.data.expenses[0][KID], 'p1');
check('pocket id 2 is intact', app.data.expenses[1][KID], 'p2');
check('a null pocket stays null', app.data.expenses[2][KID], null);
check('the allocation note is intact', app.data.allocations[0].note, 'the budget');
check('the allocation amount is intact', app.data.allocations[0].amount, 500000);
check('the date is blanked, not invented', app.data.expenses[0].date, '');
check('every date is empty (3/3)', app.data.expenses.map(x => x.date), ['', '', '']);

section('7. The localStorage keys do not change');
check('the global key is unchanged', app.POCKETS_KEY, 'budget_tracker');
check('the month key is unchanged', app.activeKey(), oldKey);
checkTrue('the month key matches /budget_tracker_YYYY_M/', /^budget_tracker_\d{4}_\d{1,2}$/.test(oldKey));
check('no foreign key was created', store.size, initialKeyCount);

/* Save again -- this happens whenever the user presses Save or edits the
   table inline. */
app.saveMonth();
const afterSave = JSON.parse(store.get(oldKey));
check('after saving: 3 expenses', afterSave.expenses.length, 3);
check('after saving: 2 income rows', afterSave.income.length, 2);
check('after saving: 1 allocation', afterSave.allocations.length, 1);
check('after saving: the amount 175500 is intact', afterSave.expenses[1].amount, 175500);
check('after saving: the date key exists', Object.prototype.hasOwnProperty.call(afterSave.expenses[0], 'date'), true);
check('after saving: the date is empty', afterSave.expenses[0].date, '');
check('still only 1 key', store.size, initialKeyCount);

section('8. Newly dated data survives a load and save');
app.data.expenses[0].date = app.safeDate('2026-09-15');
app.data.expenses[1].date = app.safeDate('2026-09-30');
app.saveMonth();
app.data = app.emptyMonth();
app.loadMonth();
check('date 1 is intact after a reload', app.data.expenses[0].date, '2026-09-15');
check('date 2 is intact after a reload', app.data.expenses[1].date, '2026-09-30');
check('date 3 stays empty', app.data.expenses[2].date, '');
check('the row count is still 3', app.data.expenses.length, 3);

section('9. A hostile date coming out of storage is cleaned on load');
store.set(oldKey, JSON.stringify({
  income: [],
  expenses: [
    { name: 'Hostile 1', amount: 1000, date: '"><script>alert(1)</script>' },
    { name: 'Hostile 2', amount: 2000, date: '2026-02-31' },
    { name: 'Hostile 3', amount: 3000, date: 12345 },
    { name: 'Valid', amount: 4000, date: '2026-09-09' }
  ]
}));
app.loadMonth();
check('hostile dates become empty', app.data.expenses.slice(0, 3).map(x => x.date), ['', '', '']);
check('a valid date is still accepted', app.data.expenses[3].date, '2026-09-09');
check('the name stays intact even when the date is hostile', app.data.expenses[0].name, 'Hostile 1');
check('the amount stays intact even when the date is hostile', app.data.expenses[0].amount, 1000);

/* =====================================================================
   10 -- the ledger stays consistent with dates
   ===================================================================== */
section('10. Dates do not affect the balance calculation');
store.clear();
setPeriod(9, 2026);
app.Pockets = [{ id: 'p1', name: 'Electricity', icon: '\uD83D\uDCA1', color: '#2563eb' }];
app.savePockets();
app.data = app.emptyMonth();
app.data.income.push({ name: 'Salary', amount: 3000000 });
app.data.allocations.push({ [KID]: 'p1', amount: 500000, note: '' });
app.data.expenses.push({ name: 'Token', amount: 300000, [KID]: 'p1', date: '2026-09-10' });
app.saveMonth();
app.loadMonth();
app.renderAll();
check('the pocket balance after paying', app.archive.balances.p1.balance, 200000);
check('free cash after allocating', app.archive.cash.total, 2500000);

/* No pocket -> it comes out of free cash. */
app.data.expenses.push({ name: 'Eating', amount: 175500, [KID]: null, date: '2026-09-20' });
app.saveMonth();
app.renderAll();
check('free cash drops from an expense with no pocket', app.archive.cash.total, 2500000 - 175500);
check('the pocket balance is unaffected', app.archive.balances.p1.balance, 200000);

/* =====================================================================
   11 -- the date bounds in the form follow the period
   ===================================================================== */
section('11. syncDateBounds limits the date picker to the active month');
const dateField = el('expenseDate');

setPeriod(9, 2026);
app.syncDateBounds();
check('min = the first of the month', dateField.min, '2026-09-01');
check('max = the last of the month (30 days)', dateField.max, '2026-09-30');
check('the default is filled in (today, the current month)', dateField.value, app.todayIso());

setPeriod(2, 2024); /* February in a leap year = 29 days */
app.syncDateBounds();
check('Feb 2024 min', dateField.min, '2024-02-01');
check('Feb 2024 max (a leap year)', dateField.max, '2024-02-29');

setPeriod(2, 2026); /* February in a common year = 28 days */
app.syncDateBounds();
check('Feb 2026 max (not a leap year)', dateField.max, '2026-02-28');

setPeriod(4, 2026); /* April = 30 days */
app.syncDateBounds();
check('Apr 2026 max', dateField.max, '2026-04-30');

/* A date from another month must be refused, then put back to the default. */
dateField.value = '2026-09-15';
app.syncDateBounds();
check('a date from another month is reset to the default', dateField.value, '2026-04-01');

/* A date inside the month that is open must be kept. */
dateField.value = '2026-04-22';
app.syncDateBounds();
check('a date inside the month is kept', dateField.value, '2026-04-22');

dateField.value = '"><script>x</script>';
app.syncDateBounds();
check('a junk value is reset to the default', dateField.value, '2026-04-01');

setPeriod(9, 2026);
app.syncDateBounds();
check('back in Sep: min', dateField.min, '2026-09-01');
check('back in Sep: max', dateField.max, '2026-09-30');
check('back in Sep: the default is today', dateField.value, app.todayIso());

/* =====================================================================
   12 -- source inspection: no foreign characters, no mangled spelling
   ===================================================================== */
section('12. Source hygiene');
/* A mangled spelling of "pockets" used to slip into the source. Built by
   concatenation so that this very line cannot seed it. */
const CORRECT = 'pocket' + 's';
const mangled = 'kang' + 'tob';
const appSrc = src;
const html = fs.readFileSync(__dirname + '/budget-tracker.html', 'utf8');
const css = fs.readFileSync(__dirname + '/styles.css', 'utf8');

for (const f of ['app.js', 'budget-tracker.html', 'styles.css', 'test-tanggal.js']) {
  const text = fs.readFileSync(__dirname + '/' + f, 'utf8');
  const foreign = text.match(/[\u3000-\u9FFF\uAC00-\uD7AF\u0400-\u04FF]/g);
  check('no non-Latin characters in ' + f, foreign ? foreign.slice(0, 3) : [], []);
  check('no mangled spelling in ' + f, text.includes(mangled), false);
  check('contains the correct word in ' + f, text.includes(CORRECT), true);
}

/* step="1000" is what caused the non-round amount bug. */
check('no step=1000 in the HTML', html.includes('step="1000"'), false);
check('no step=1000 in app.js', appSrc.includes('step="1000"'), false);

/* An amount input must NOT be type="number": <input type="number"> turns
   "1.250.750" and "abc" into an empty string with no trace, so num("") = 0
   and an Rp 0 is stored silently. Every amount input has to be
   type="text" + inputmode="numeric". */
const AMOUNT_IDS = ['allocAmount', 'transferAmount', 'incomeAmount', 'expenseAmount'];
AMOUNT_IDS.forEach(id => {
  checkTrue('the amount input ' + id + ' is type="text"',
    new RegExp('<input type="text" id="' + id + '"').test(html));
  checkTrue('the amount input ' + id + ' has inputmode="numeric"',
    new RegExp('id="' + id + '"[^>]*inputmode="numeric"').test(html));
  checkTrue('the amount input ' + id + ' is not type="number"',
    !new RegExp('<input type="number" id="' + id + '"').test(html));
});
checkTrue('inline amount inputs are type="text"',
  (appSrc.match(/<input type="text" inputmode="numeric" autocomplete="off" value="\$\{item\.amount\}"/g) || []).length === 2);
checkTrue('no amount input uses type="number" in app.js',
  !/type="number"[^>]*data-field="amount"/.test(appSrc));
checkTrue('the year input stays type="number" (it is not an amount)',
  html.includes('<input type="number" id="year"'));
checkTrue('the date column is in the table header', html.includes('<th style="width:14%">Date</th>'));
checkTrue('there is a date input in the add form', html.includes('id="expenseDate"'));
checkTrue('renderExpenses includes the date column', appSrc.includes('data-field="date"'));
checkTrue('applyTableEdit handles the date field', appSrc.includes("field === 'date'"));

/* The date field has to use the light-touch render (focus must not be
   lost). */
const dateBranch = (function () {
  const i = appSrc.indexOf("field === 'date'");
  return i === -1 ? '' : appSrc.slice(i, i + 400);
})();
checkTrue('the date branch does not call renderExpenses()', !dateBranch.includes('renderExpenses('));
checkTrue('the date branch only touches classList', dateBranch.includes("classList.toggle('tgl-empty'"));

checkTrue('normalizeMonth fills in the date field', /expenses\)[\s\S]{0,300}?date: safeDate/.test(appSrc));
checkTrue('the Excel export has a Date column', appSrc.includes("['Date', 'Description'"));
checkTrue('the pocket history shows dates', /shortDate\(x\.date\)/.test(appSrc));
checkTrue('the CSS has a tgl-empty style', css.includes('.tgl-empty'));

/* =====================================================================
   13 -- the HTML that actually gets rendered, not just its source
   ===================================================================== */
section('13. The rendered expenses table markup');
store.clear();
setPeriod(9, 2026);
app.Pockets = [{ id: 'p1', name: 'Electricity', icon: '\uD83D\uDCA1', color: '#2563eb' }];
app.savePockets();
app.data = app.emptyMonth();
app.data.income.push({ name: 'Salary', amount: 3000000 });
app.data.allocations.push({ [KID]: 'p1', amount: 500000, note: '' });
app.data.expenses.push({ name: 'Electricity token', amount: 539630, [KID]: 'p1', date: '2026-09-05' });
app.data.expenses.push({ name: 'Market run', amount: 175500, [KID]: null, date: '' });
app.data.expenses.push({ name: 'Fuel', amount: 50000, [KID]: 'p1', date: '2026-09-26' });
app.saveMonth();
app.loadMonth();
app.renderAll();

const tableHtml = el('expenseBody').innerHTML;
const rowsHtml = tableHtml.split('<tr ').slice(1);

/* Five columns per row: Date, Description, Pocket, Amount, actions. */
check('three data rows are rendered', rowsHtml.length, 3);
check('each row has 5 cells', rowsHtml.map(b => (b.match(/<td/g) || []).length), [5, 5, 5]);

/* The date column: a valid value comes out as-is, an empty one is marked. */
checkTrue('a valid date lands in the value attribute', tableHtml.includes('value="2026-09-05"'));
checkTrue('the second date lands too', tableHtml.includes('value="2026-09-26"'));
checkTrue('a row with no date carries the tgl-empty class', tableHtml.includes('class="tgl tgl-empty"'));
checkTrue('a dated row does not carry the tgl-empty class', tableHtml.includes('class="tgl "'));
check('the number of rows marked as missing a date', (tableHtml.match(/tgl-empty/g) || []).length, 1);
check('the number of date inputs', (tableHtml.match(/type="date"/g) || []).length, 3);
check('a non-round amount is shown intact', (tableHtml.match(/value="539630"/g) || []).length, 1);
check('the amount inputs are type="text"', (tableHtml.match(/inputmode="numeric"/g) || []).length, 3);
check('no amount input in the table uses type="number"', (tableHtml.match(/type="number"/g) || []).length, 0);

/* The empty row uses colspan 5, not 4. */
app.data.expenses = [];
app.renderAll();
check('the empty row uses colspan 5', el('expenseBody').innerHTML.includes('colspan="5"'), true);
check('the empty row does not use colspan 4', el('expenseBody').innerHTML.includes('colspan="4"'), false);

/* A name full of quotes must be escaped; a hostile date becomes empty. */
app.data.expenses = [{ name: '"><script>alert(1)</script>', amount: 1000, [KID]: null, date: '"><b>x' }];
app.renderAll();
const hostileHtml = el('expenseBody').innerHTML;
checkTrue('no whole script tag in the markup', !hostileHtml.includes('<script>'));
checkTrue('the name is escaped', hostileHtml.includes('&lt;script&gt;'));
check('a hostile date becomes empty', /class="tgl tgl-empty"><input type="date" value=""/.test(hostileHtml), true);

/* =====================================================================
   14 -- file inventory
   ===================================================================== */
section('14. File inventory');
const read = f => fs.readFileSync(__dirname + '/' + f, 'utf8');
check('app.js is not empty', read('app.js').length > 20000, true);
check('budget-tracker.html is not empty', read('budget-tracker.html').length > 5000, true);
check('styles.css is not empty', read('styles.css').length > 5000, true);
checkTrue('no leftover patch file',
  fs.readdirSync(__dirname).filter(f => /^patch-/.test(f)).length === 0);

/* ---------- Summary ---------- */
console.log('\n================================');
console.log('PASS: ' + pass + '   FAIL: ' + fail);
console.log('================================');
process.exit(fail ? 1 : 0);
