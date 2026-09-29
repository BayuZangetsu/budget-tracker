/* =====================================================================
   Household Budget Tracker — envelope budgeting with pockets
   ---------------------------------------------------------------------
   Data model
   - Global  : `pockets` -> pocket definitions [{id, name, icon, color,
                                                  monthlyTarget}]
   - Per month: localStorage "budget_tracker_<year>_<month>"
       { income     : [{name, amount}]
       , expenses   : [{name, amount, pocketId, date}]
       , allocations: [{pocketId, amount, note}]
       , transfers  : [{type:'transfer'|'withdraw', from, to, amount, note}] }

   A pocket balance is the ACCUMULATION of every month (a ledger, not a
   stored number):
       balance = S allocated + S transferredIn
               - S expenses    - S transferredOut - S withdrawn

   Money held outside any pocket (cash) = S (income - allocated) + S withdrawnIn
   ===================================================================== */

'use strict';

/* ======================= CONSTANTS ======================= */

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const POCKETS_KEY = 'budget_tracker';
const CASH = '__cash__';

const PALETTE = [
  '#2563eb', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#0ea5e9', '#a855f7'
];

const ICON_COLORS = {
  'fas fa-lightbulb': '#fbbf24',
  'fas fa-tint': '#3b82f6',
  'fas fa-signal': '#06b6d4',
  'fas fa-home': '#f87171',
  'fas fa-shopping-cart': '#22c55e',
  'fas fa-car': '#6366f1',
  'fas fa-motorcycle': '#8b5cf6',
  'fas fa-gas-pump': '#f6ad55',
  'fas fa-graduation-cap': '#a855f7',
  'fas fa-pills': '#ec4899',
  'fas fa-baby': '#f97316',
  'fas fa-cat': '#14b8a6',
  'fas fa-gift': '#10b981',
  'fas fa-coffee': '#f59e0b',
  'fas fa-drumstick-bite': '#84cc16',
  'fas fa-mobile-alt': '#06b6d4',
  'fas fa-tshirt': '#84cc16',
  'fas fa-receipt': '#fbbf24',
  'fas fa-mosque': '#ec4899',
  'fas fa-shield-alt': '#6366f1',
  'fas fa-bullseye': '#f87171',
  'fas fa-briefcase': '#fbbf24',
  'fas fa-pump-soap': '#3b82f6',
  'fas fa-plane': '#f6ad55',
  'fas fa-chair': '#a855f7',
  'fas fa-cut': '#3b82f6',
  'fas fa-book': '#8b5cf6',
  'fas fa-fish': '#ec4899',
  'fas fa-exchange-alt': '#6366f1',
  'fas fa-sign-out-alt': '#f87171',
  'fas fa-sign-in-alt': '#22c55e',
  'fas fa-wallet': '#2563eb'
};

const ICONS = Object.keys(ICON_COLORS);

/* Used for the picker's tooltips and screen-reader labels. Deriving this
   from the class name is not reliable: "fas fa-tint".split('-') yields two
   parts, so slicing off the first two leaves nothing. */
const ICON_LABELS = {
  'fas fa-lightbulb': 'Electricity',
  'fas fa-tint': 'Water',
  'fas fa-signal': 'Internet',
  'fas fa-home': 'Rent / Installment',
  'fas fa-shopping-cart': 'Groceries',
  'fas fa-car': 'Transport',
  'fas fa-motorcycle': 'Motorcycle',
  'fas fa-gas-pump': 'Fuel',
  'fas fa-graduation-cap': 'Education',
  'fas fa-pills': 'Health',
  'fas fa-baby': 'Childcare',
  'fas fa-cat': 'Pets',
  'fas fa-gift': 'Savings',
  'fas fa-coffee': 'Coffee',
  'fas fa-drumstick-bite': 'Eating out',
  'fas fa-mobile-alt': 'Phone / Data',
  'fas fa-tshirt': 'Clothing',
  'fas fa-receipt': 'Bills',
  'fas fa-mosque': 'Zakat / Religious',
  'fas fa-shield-alt': 'Insurance',
  'fas fa-bullseye': 'Goals',
  'fas fa-briefcase': 'Work',
  'fas fa-pump-soap': 'Soap / Cleaning',
  'fas fa-plane': 'Travel',
  'fas fa-chair': 'Furniture',
  'fas fa-cut': 'Salon',
  'fas fa-book': 'Books',
  'fas fa-fish': 'Seafood',
  'fas fa-exchange-alt': 'Transfer',
  'fas fa-sign-out-alt': 'Out',
  'fas fa-sign-in-alt': 'In',
  'fas fa-wallet': 'Wallet'
};

const DEFAULT_ICON = 'fas fa-wallet';

const SUGGESTED_POCKETS = [
  { icon: 'fas fa-lightbulb', name: 'Electricity', color: '#fbbf24' },
  { icon: 'fas fa-tint', name: 'Water', color: '#3b82f6' },
  { icon: 'fas fa-signal', name: 'Internet', color: '#06b6d4' },
  { icon: 'fas fa-home', name: 'Rent / Installment', color: '#f87171' },
  { icon: 'fas fa-shopping-cart', name: 'Groceries', color: '#22c55e' },
  { icon: 'fas fa-car', name: 'Transport', color: '#6366f1' },
  { icon: 'fas fa-graduation-cap', name: 'Education', color: '#a855f7' },
  { icon: 'fas fa-pills', name: 'Health', color: '#ec4899' },
  { icon: 'fas fa-cut', name: 'Salon', color: '#3b82f6' },
  { icon: 'fas fa-gift', name: 'Savings', color: '#10b981' }
];

/* ======================= STATE ======================= */

let pockets = [];
let data = emptyMonth();
let archive = null;

/* The period whose data is actually LOADED in memory and on screen.
   This is tracked separately from the <select> value: when the user moves
   the dropdown the select has already changed by the time the handler
   runs. If saving used the select's value, the outgoing month would be
   written under the incoming month's key and the target month would be
   corrupted too. */
let activePeriod = null;

/* Live Chart.js instances. The drawing functions below are named draw* so
   they never collide with these. */
let chartPockets = null;
let chartAlloc = null;
let chartMoneyFlow = null;

/* ======================= UTILITIES ======================= */

function emptyMonth() {
  return { income: [], expenses: [], allocations: [], transfers: [] };
}

/* Read an amount out of an input and insist it is a real positive
   number. <input type="text"> accepts anything, so the amount has to be
   validated here. Empty, zero and junk are REJECTED with a clear message
   -- never silently stored as Rp 0. */
function readAmount(id, label) {
  const el = $(id);
  const raw = String(el.value || '').trim();
  const n = num(raw);
  if (!raw || !Number.isFinite(n) || n <= 0) {
    toast(label + ' must be a number greater than 0'
      + (raw ? '. Got: "' + raw.slice(0, 24) + '"' : ''), 'warn');
    el.focus();
    if (typeof el.select === 'function') el.select();
    return null;
  }
  return n;
}

/* True when a month genuinely has nothing in it. Keeps merely *opening*
   a month from leaving an empty record behind in localStorage. */
function isMonthEmpty(d) {
  return d.income.length === 0 && d.expenses.length === 0
      && d.allocations.length === 0 && d.transfers.length === 0;
}

/* Parse a number the user typed.
   Tolerates Indonesian thousands separators (539.630) and English ones
   (539,630): if they are written as group separators the value must not
   silently end up 1000x too small. A comma or dot that does not form
   exact 3-digit groups is still read as a decimal point. */
/* Read an amount from raw text. Returns null when the text CANNOT be read
   as an amount -- letters, odd characters, or no digits at all. Returns 0
   when the text really is zero.

   Callers that must tell those two apart (the auto-allocate modal:
   "skip this pocket" vs "typo") rely on this. num() for stored data is
   built on top of it, so the rules for accepting an amount live in
   exactly one place. */
function parseAmount(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v ?? '').trim();
  if (!s) return null;

  // Drop spaces and currency names, keep digits, separators and sign.
  s = s.replace(/\s+/g, '').replace(/^(?:rp|idr)/i, '');
  // Anything left that is not a digit/separator/sign means this is broken
  // input, not an amount. Digits plucked out of it would produce a WRONG
  // number that still looks plausible -- worse than rejecting it.
  if (/[^\d.,-]/.test(s)) return null;
  if (!s || !/\d/.test(s)) return null;

  // Exact 3-digit groups -> thousands separators.
  if (/^[+-]?\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');

  // Whatever comma is left counts as a decimal point.
  const n = Number(s.replace(/,/g, '.'));
  return Number.isFinite(n) ? n : null;
}

/* Amounts for ledger arithmetic. Unreadable text counts as 0, the same as
   corrupted data that was already stored. */
function num(v) {
  const n = parseAmount(v);
  return n === null ? 0 : n;
}

function fmt(n) {
  return 'Rp ' + Math.round(num(n)).toLocaleString('id-ID');
}

function fmtShort(n) {
  n = Math.round(num(n));
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(1).replace('.0', '') + ' B';
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + ' M';
  if (a >= 1e3) return (n / 1e3).toFixed(0) + ' K';
  return String(n);
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function uid() {
  return 'k' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function nextColor() {
  return PALETTE[pockets.length % PALETTE.length];
}

// Colors and icons land in style/class attributes, so they must come from
// a whitelist.
function safeColor(c) {
  return PALETTE.includes(String(c)) ? String(c) : PALETTE[0];
}
function safeIcon(i) {
  return ICONS.includes(String(i)) ? String(i) : DEFAULT_ICON;
}

function $(id) {
  return document.getElementById(id);
}

/* ======================= DATES ======================= */
// Dates are stored as the string 'YYYY-MM-DD' (the <input type="date">
// format). A record with no date stays empty -- its contents are never
// invented.
function safeDate(t) {
  const s = String(t ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
  const d = new Date(s + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  // Reject impossible dates such as 2026-02-31 (the browser would silently
  // roll them over).
  const [y, m, dnum] = s.split('-').map(Number);
  if (d.getFullYear() !== y || d.getMonth() + 1 !== m || d.getDate() !== dnum) return '';
  return s;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function isoFrom(year, month, day) {
  return year + '-' + pad2(month) + '-' + pad2(day);
}

function todayIso() {
  const d = new Date();
  return isoFrom(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// Default date when adding an expense: today if the open period is the
// current month, otherwise the 1st of that month.
function defaultDate() {
  const p = currentPeriod();
  const now = new Date();
  if (now.getFullYear() === p.year && now.getMonth() + 1 === p.month) return todayIso();
  return isoFrom(p.year, p.month, 1);
}

/* Clamp the add-expense date picker to the open month so the user cannot
   fat-finger a year in a calendar that is full of dates they do not mean.
   Existing rows can still be re-dated freely through the table. */
function syncDateBounds() {
  const el = $('expenseDate');
  if (!el) return;
  const p = currentPeriod();
  el.min = isoFrom(p.year, p.month, 1);
  el.max = isoFrom(p.year, p.month, new Date(p.year, p.month, 0).getDate());
  const v = safeDate(el.value);
  el.value = v && v >= el.min && v <= el.max ? v : defaultDate();
}

function shortDate(t) {
  const s = safeDate(t);
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return d + '/' + m + '/' + y;
}

function toast(message, kind = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = message;
  $('toastWrap').appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  }, 2400);
}

/* ======================= PERIOD / KEYS ======================= */

function currentPeriod() {
  return {
    month: parseInt($('month').value, 10) || 1,
    year: parseInt($('year').value, 10) || new Date().getFullYear()
  };
}

function monthKey(p) {
  return `budget_tracker_${p.year}_${p.month}`;
}

/* The period whose data is genuinely on screen. */
function shownPeriod() {
  return activePeriod || currentPeriod();
}

/* The key the on-screen data MUST be written to. Not the key derived from
   the select, because the select may already have moved on. */
function activeKey() {
  return monthKey(shownPeriod());
}

function periodLabel(p) {
  return `${MONTH_NAMES[p.month] || '?'} ${p.year}`;
}

function allMonthKeys() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && /^budget_tracker_\d{4}_\d{1,2}$/.test(k)) out.push(k);
  }
  return out.sort();
}

function parseKey(k) {
  const m = /^budget_tracker_(\d{4})_(\d{1,2})$/.exec(k);
  return m ? { year: Number(m[1]), month: Number(m[2]) } : null;
}

/* ======================= NORMALISATION ======================= */

function normalizeMonth(d) {
  const out = emptyMonth();
  if (!d || typeof d !== 'object') return out;

  (Array.isArray(d.income) ? d.income : []).forEach(i => {
    out.income.push({ name: String(i.name ?? ''), amount: num(i.amount) });
  });
  (Array.isArray(d.expenses) ? d.expenses : []).forEach(i => {
    out.expenses.push({
      name: String(i.name ?? ''),
      amount: num(i.amount),
      pocketId: i.pocketId || null,
      // An expense with no date stays '' (empty); never fabricate one.
      date: safeDate(i.date)
    });
  });
  (Array.isArray(d.allocations) ? d.allocations : []).forEach(i => {
    out.allocations.push({
      pocketId: i.pocketId || null,
      amount: num(i.amount),
      note: String(i.note ?? '')
    });
  });
  (Array.isArray(d.transfers) ? d.transfers : []).forEach(i => {
    out.transfers.push({
      type: i.type === 'transfer' ? 'transfer' : 'withdraw',
      from: i.from || null,
      to: i.to || null,
      amount: num(i.amount),
      note: String(i.note ?? '')
    });
  });
  return out;
}

function readMonth(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return normalizeMonth(JSON.parse(raw));
  } catch (e) {
    return null;
  }
}

/* ======================= LOAD / SAVE ======================= */

function loadPockets() {
  try {
    const raw = localStorage.getItem(POCKETS_KEY);
    const arr = raw ? JSON.parse(raw) : null;
    pockets = Array.isArray(arr)
      ? arr.filter(p => p && p.id).map(p => ({
          id: String(p.id),
          name: String(p.name || 'Unnamed'),
          icon: safeIcon(p.icon),
          color: safeColor(p.color),
          monthlyTarget: safeMonthlyTarget(p.monthlyTarget)
        }))
      : [];
  } catch (e) {
    pockets = [];
  }
}

function savePockets() {
  localStorage.setItem(POCKETS_KEY, JSON.stringify(pockets));
}

function loadMonth() {
  // Record first, then read: from here on activeKey() == the select's key.
  activePeriod = currentPeriod();
  data = readMonth(activeKey()) || emptyMonth();
  syncDateBounds();
  renderAll();
}

function saveMonth(manual = false) {
  // Write to the period on screen, not to the newest select value.
  const key = activeKey();
  const body = JSON.stringify(data);
  const stored = localStorage.getItem(key);
  // Do not write when the content is byte-identical, and never create an
  // empty record for a month that was merely opened.
  if (stored !== body && (stored !== null || !isMonthEmpty(data))) {
    localStorage.setItem(key, body);
  }
  if (manual) {
    toast('Data for ' + periodLabel(shownPeriod()) + ' saved');
    savePockets();
  }
}

/* Used when the user switches month/year: save to the period still on
   screen (unchanged so far), then load the new period. */
function switchPeriod() {
  const before = shownPeriod();
  saveMonth();
  loadMonth();
  const after = shownPeriod();
  if (before !== after) {
    toast('Showing ' + periodLabel(after), 'ok');
  }
}

function forEachMonth(fn) {
  allMonthKeys().forEach(key => {
    const d = readMonth(key);
    if (!d) return;
    if (fn(d) === true) {
      localStorage.setItem(key, JSON.stringify(d));
    }
  });
}

/* ======================= ARCHIVE / LEDGER ======================= */

function computeArchive() {
  const balances = {};
  const thisMonth = {};

  pockets.forEach(p => {
    balances[p.id] = {
      allocated: 0, spent: 0, transferIn: 0, transferOut: 0, withdrawn: 0, balance: 0
    };
    thisMonth[p.id] = { allocated: 0, spent: 0 };
  });

  const cash = { total: 0, thisMonth: 0, income: 0, allocated: 0 };
  const currentKey = activeKey();

  const add = (table, id, field, v) => {
    if (id && table[id]) table[id][field] += v;
  };

  allMonthKeys().forEach(key => {
    const d = readMonth(key);
    if (!d) return;
    const isCurrent = key === currentKey;

    const inc = d.income.reduce((s, i) => s + num(i.amount), 0);
    const alloc = d.allocations.reduce((s, i) => s + num(i.amount), 0);
    cash.total += inc - alloc;
    if (isCurrent) {
      cash.thisMonth = inc - alloc;
      cash.income = inc;
      cash.allocated = alloc;
    }

    d.allocations.forEach(a => {
      const v = num(a.amount);
      add(balances, a.pocketId, 'allocated', v);
      if (isCurrent) add(thisMonth, a.pocketId, 'allocated', v);
    });

    d.expenses.forEach(e => {
      const v = num(e.amount);
      if (!e.pocketId) {
        // Spent straight from free cash outside every pocket -> cash drops.
        cash.total -= v;
        if (isCurrent) cash.thisMonth -= v;
        return;
      }
      add(balances, e.pocketId, 'spent', v);
      if (isCurrent) add(thisMonth, e.pocketId, 'spent', v);
    });

    // A transfer is always two-sided: out of CASH lowers cash, into CASH
    // raises it.
    d.transfers.forEach(t => {
      const v = num(t.amount);
      if (t.from === CASH) cash.total -= v;
      else add(balances, t.from, 'transferOut', v);
      if (t.to === CASH) cash.total += v;
      else add(balances, t.to, 'transferIn', v);
    });
  });

  Object.values(balances).forEach(b => {
    b.balance = b.allocated + b.transferIn - b.spent - b.transferOut - b.withdrawn;
  });

  return { balances, thisMonth, cash };
}

/* ======================= RENDER ======================= */

function renderAll() {
  archive = computeArchive();
  renderSummary();
  renderPockets();
  renderAllocations();
  renderIncome();
  renderExpenses();
  renderSuggestions();
  renderCharts();
}

function renderSummary() {
  const per = currentPeriod();
  $('summaryPeriod').textContent = periodLabel(per);

  const inc = data.income.reduce((s, i) => s + num(i.amount), 0);
  const out = data.expenses.reduce((s, i) => s + num(i.amount), 0);
  const alloc = data.allocations.reduce((s, i) => s + num(i.amount), 0);
  // "Unallocated" = income - already allocated - spending taken straight
  // from free cash
  const unallocated = archive.cash.thisMonth;
  const totalBalance = pockets.reduce((s, p) => s + archive.balances[p.id].balance, 0);

  $('totalIncome').textContent = fmt(inc);
  $('totalExpenses').textContent = fmt(out);
  $('totalAllocated').textContent = fmt(alloc);

  const elUnalloc = $('unallocated');
  elUnalloc.textContent = fmt(unallocated);
  elUnalloc.className = 'value ' + (unallocated < 0 ? 'negative' : unallocated === 0 ? 'neutral' : 'positive');

  const elTotal = $('totalPocketBalance');
  elTotal.textContent = fmt(totalBalance);
  elTotal.className = 'value ' + (totalBalance < 0 ? 'negative' : 'neutral');

  const elCash = $('freeCash');
  elCash.textContent = fmt(archive.cash.total);
  elCash.className = 'value ' + (archive.cash.total < 0 ? 'negative' : 'neutral');
}

function renderPockets() {
  const wrap = $('pocketGrid');
  $('pocketCount').textContent = pockets.length + ' pockets';

  if (!pockets.length) {
    wrap.innerHTML = `
      <div class="empty-pockets">
        <span class="big" style="color:#fbbf24"><i class="fas fa-briefcase"></i></span>
        No pockets yet. <b>Create one first</b>, then allocate funds into it
        (for example: allocate Rp 500,000 to <i>Electricity</i>).
        <div style="margin-top:14px">${suggestionChips()}</div>
      </div>`;
    return;
  }

  wrap.innerHTML = pockets.map(p => pocketCard(p)).join('');
}

function suggestionChips() {
  return SUGGESTED_POCKETS
    .filter(s => !pockets.some(p => p.name.toLowerCase() === s.name.toLowerCase()))
    .map(s => `<button class="chip" onclick="addSuggestedPocket('${esc(s.name)}','${esc(s.icon)}')"><span class="${esc(s.icon)} fa-fw" style="color:${s.color}"></span> ${esc(s.name)}</button>`)
    .join('');
}

function renderSuggestions() {
  const el = $('pocketSuggestions');
  if (el) el.innerHTML = suggestionChips();
}

function pocketCard(p) {
  const b = archive.balances[p.id];
  const m = archive.thisMonth[p.id];
  const over = b.balance < 0;
  const left = m.allocated - m.spent;

  let pct = 0;
  if (m.allocated > 0) pct = Math.min(100, (m.spent / m.allocated) * 100);
  else if (m.spent > 0) pct = 100;

  const barClass = left < 0 ? 'hot' : '';
  const iconColor = ICON_COLORS[p.icon] || p.color;

  return `
  <div class="pocket ${over ? 'over' : ''}" style="--acc:${esc(p.color)}">
    <div class="pocket-top">
      <span class="pocket-icon" style="color:${iconColor}"><i class="${esc(p.icon)}"></i></span>
      <span class="pocket-name" title="${esc(p.name)}">${esc(p.name)}</span>
      <span class="pocket-actions">
        <button title="Allocate funds" onclick="focusAllocation('${esc(p.id)}')"><i class="fas fa-bolt"></i></button>
        <button title="Move funds" onclick="focusTransfer('${esc(p.id)}')"><i class="fas fa-exchange-alt"></i></button>
        <button title="History" onclick="openHistory('${esc(p.id)}')"><i class="fas fa-receipt"></i></button>
        <button title="Edit" onclick="openEditPocket('${esc(p.id)}')"><i class="fas fa-edit"></i></button>
        <button class="del" title="Delete" onclick="deletePocket('${esc(p.id)}')"><i class="fas fa-trash"></i></button>
      </span>
    </div>
    <div class="pocket-balance ${over ? 'neg' : ''}">${fmt(b.balance)}</div>
    <div class="pocket-caption">Pocket balance</div>
    <div class="pocket-bar"><i class="${barClass}" style="width:${pct.toFixed(0)}%"></i></div>
    <div class="pocket-meta"><span>Target /mo</span><b>${fmt(targetOf(p.id))}</b></div>
    <div class="pocket-meta"><span>Allocated this month</span><b>${fmt(m.allocated)}</b></div>
    <div class="pocket-meta"><span>Spent this month</span><b>${fmt(m.spent)}</b></div>
    ${m.allocated > 0 ? `<div class="pocket-meta"><span>Left this month</span><b class="${left < 0 ? 'warn' : ''}">${fmt(left)}</b></div>` : ''}
    ${over ? `<span class="badge-over">⚠ Over ${fmt(-b.balance)}</span>` : ''}
  </div>`;
}

function renderAllocations() {
  const left = archive.cash.thisMonth;
  const pill = $('unallocatedPill');
  pill.textContent = 'Not yet allocated: ' + fmt(left);
  pill.className = 'remaining-pill' + (left < 0 ? ' negative' : '');

  fillSelect($('allocPocket'), pocketOptions());
  fillSelect($('transferFrom'), pocketOptions());
  fillSelect($('transferTo'), pocketOptions().concat([{ value: CASH, label: 'Cash outside pockets' }]));
  fillSelect($('expensePocket'), pocketOptions({ allowEmpty: true }));
}

function pocketOptions({ allowEmpty = false } = {}) {
  const list = pockets.map(p => {
    const s = archive ? archive.balances[p.id].balance : 0;
    /* Text only. A <select> cannot show a Font Awesome glyph or a colour:
       an <option> is a text-only rendering context, so anything marked up
       inside one never enters the layout tree. The icon is therefore not
       part of this label -- the pocket cards carry the coloured icon. */
    return { value: p.id, label: `${p.name} · ${fmtShort(s)}` };
  });
  if (allowEmpty) list.unshift({ value: '', label: '— No pocket (free cash) —' });
  if (!list.length && !allowEmpty) list.push({ value: '', label: '— No pockets yet —' });
  return list;
}

function fillSelect(el, options) {
  if (!el) return;
  const previous = el.value;
  el.innerHTML = options
    .map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`)
    .join('');
  if (options.some(o => o.value === previous)) el.value = previous;
}

function renderIncome() {
  const tbody = $('incomeBody');
  if (!data.income.length) {
    tbody.innerHTML = '<tr class="empty"><td colspan="3">No income recorded this month.</td></tr>';
    return;
  }
  tbody.innerHTML = data.income.map((item, i) => `
    <tr>
      <td><input type="text" value="${esc(item.name)}" data-row="${i}" data-list="income" data-field="name"></td>
      <td class="amount"><input type="text" inputmode="numeric" autocomplete="off" value="${item.amount}" data-row="${i}" data-list="income" data-field="amount"></td>
      <td><button class="danger" onclick="deleteIncome(${i})">Delete</button></td>
    </tr>`).join('');
}

function renderExpenses() {
  const tbody = $('expenseBody');
  if (!data.expenses.length) {
    tbody.innerHTML = '<tr class="empty"><td colspan="5">No expenses recorded this month.</td></tr>';
    return;
  }
  const options = pocketOptions({ allowEmpty: true });

  tbody.innerHTML = data.expenses.map((item, i) => {
    const over = item.pocketId && archive.balances[item.pocketId] && archive.balances[item.pocketId].balance < 0;
    // Always sanity-check here, not just on load: an invalid value must
    // render blank AND get flagged, not just sail through.
    const d = safeDate(item.date);
    return `
    <tr class="${over ? 'over' : ''}" data-row="${i}">
      <td class="tgl ${d ? '' : 'tgl-empty'}"><input type="date" value="${esc(d)}" data-row="${i}" data-list="expenses" data-field="date" title="${d ? esc(d) : 'Not set yet — click to pick a date'}"></td>
      <td><input type="text" value="${esc(item.name)}" data-row="${i}" data-list="expenses" data-field="name"></td>
      <td><select data-row="${i}" data-list="expenses" data-field="pocketId">
        ${options.map(o => `<option value="${esc(o.value)}" ${o.value === (item.pocketId || '') ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
      </select></td>
      <td class="amount"><input type="text" inputmode="numeric" autocomplete="off" value="${item.amount}" data-row="${i}" data-list="expenses" data-field="amount"></td>
      <td><button class="danger" onclick="deleteExpense(${i})">Delete</button></td>
    </tr>`;
  }).join('');
}

// Flag expense rows whose pocket is overspent, without rebuilding the
// table (so an open <select> does not lose focus while it is in use).
function markOver() {
  const tbody = $('expenseBody');
  if (!tbody) return;
  tbody.querySelectorAll('tr[data-row]').forEach(tr => {
    const item = data.expenses[Number(tr.dataset.row)];
    const s = item && item.pocketId ? archive.balances[item.pocketId] : null;
    tr.classList.toggle('over', !!(s && s.balance < 0));
  });
}

/* ======================= POCKET CRUD ======================= */

/* ---------------------------------------------------------------------
   The icon picker

   This is deliberately NOT a <select>. An <option> is a text-only
   rendering context: markup placed inside one is parsed into the DOM but
   never enters the layout tree, so the glyph is created and then paints
   nothing. That is why the old <select> either showed the raw class name
   ("fas fa-tint") or, once an <i> was added, showed nothing at all.

   So the picker is a grid of buttons. Each one carries its icon in the
   colour ICON_COLORS assigns to it -- water blue, electricity amber, and
   so on -- which is what the Unicode emoji used to do for free.
   ------------------------------------------------------------------ */
function iconButtons(selected) {
  const cur = safeIcon(selected);
  return ICONS.map(i => {
    const label = ICON_LABELS[i] || i;
    return `<button type="button" class="ip-btn${i === cur ? ' on' : ''}" data-icon="${i}"`
      + ` title="${esc(label)}" aria-label="${esc(label)}"`
      + ` aria-pressed="${i === cur}" style="color:${ICON_COLORS[i]}">`
      + `<i class="${i}" aria-hidden="true"></i></button>`;
  }).join('');
}

/* Read the chosen icon. The value lives on the container's data-icon
   attribute, so it survives the grid being re-rendered. */
function pickedIcon(pickerId) {
  const el = $(pickerId);
  if (!el) return DEFAULT_ICON;
  return ICONS.includes(el.dataset.icon) ? el.dataset.icon : DEFAULT_ICON;
}

/* Move the highlight onto a button without rebuilding the grid, so the
   icons do not flicker on every click. */
function setPickedIcon(pickerId, icon) {
  const el = $(pickerId);
  if (!el) return;
  const next = safeIcon(icon);
  el.dataset.icon = next;
  el.querySelectorAll('.ip-btn').forEach(b => {
    const on = b.dataset.icon === next;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

function renderIconPicker() {
  const el = $('pocketIcon');
  if (!el) return;
  if (!ICONS.includes(el.dataset.icon)) el.dataset.icon = DEFAULT_ICON;
  el.innerHTML = iconButtons(el.dataset.icon);
}

/* The accent colour works the same way: a grid of swatches, not a
   <select>. A <span> inside an <option> has no box, so the old swatch
   square was invisible and only the hex text showed. */
function pickedColor(swId) {
  const el = $(swId);
  if (!el) return PALETTE[0];
  return safeColor(el.dataset.color);
}

function setPickedColor(swId, color) {
  const el = $(swId);
  if (!el) return;
  const next = safeColor(color);
  el.dataset.color = next;
  el.querySelectorAll('.sw').forEach(b => {
    const on = b.dataset.color === next;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

function addPocket(ev) {
  if (ev) ev.preventDefault();
  const name = $('pocketName').value.trim();
  if (!name) {
    toast('Enter a pocket name first', 'warn');
    $('pocketName').focus();
    return false;
  }
  if (pockets.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    toast('Pocket "' + name + '" already exists', 'warn');
    return false;
  }
  pockets.push({
    id: uid(),
    name,
    icon: pickedIcon('pocketIcon'),
    color: nextColor(),
    monthlyTarget: safeMonthlyTarget($('newPocketTarget').value)
  });
  savePockets();
  $('pocketName').value = '';
  $('newPocketTarget').value = '';
  renderAll();
  toast('Pocket "' + name + '" created');
  return false;
}

function addSuggestedPocket(name, icon) {
  name = String(name);
  if (pockets.some(p => p.name.toLowerCase() === name.toLowerCase())) return;
  pockets.push({ id: uid(), name, icon: safeIcon(icon), color: nextColor(), monthlyTarget: 0 });
  savePockets();
  renderAll();
  toast('Pocket "' + name + '" created');
}

function openEditPocket(id) {
  const p = pockets.find(x => x.id === id);
  if (!p) return;
  const b = archive.balances[id];

  $('modalTitle').textContent = 'Edit Pocket';
  $('modalBody').innerHTML = `
    <div class="form-row">
      <label>Icon</label>
      <div class="icon-picker" id="editIcon" data-icon="${esc(p.icon)}" role="group" aria-label="Pocket icon">${iconButtons(p.icon)}</div>
    </div>
    <div class="form-row">
      <label>Pocket Name</label>
      <input type="text" id="editName" value="${esc(p.name)}">
    </div>
    <div class="form-row">
      <label>Color</label>
      <div class="swatches" id="editColor" data-color="${esc(p.color)}" role="group" aria-label="Pocket color">
        ${PALETTE.map(c => `<button type="button" class="sw${c === p.color ? ' on' : ''}" data-color="${c}"`
          + ` title="${c}" aria-label="${c}" aria-pressed="${c === p.color}"`
          + ` style="background:${c}"></button>`).join('')}
      </div>
    </div>
    <div class="form-row">
      <label>Monthly Plot Template (Rp)</label>
      <input type="text" inputmode="numeric" autocomplete="off" id="editMonthlyTarget" value="${safeMonthlyTarget(p.monthlyTarget)}">
    </div>
    <p class="hint" style="margin-top:0">
      This is the <b>template</b> value: the <b>Auto Allocate</b> button uses it as
      the target every month. Changing it applies to future months and does not touch
      allocations already recorded this month.
    </p>
    <p class="hint">
      Current balance <b>${fmt(b.balance)}</b> (accumulated across all months). History is unaffected.
    </p>
    <div class="form-actions">
      <button class="secondary" onclick="closeModal()">Cancel</button>
      <button class="success" onclick="saveEditPocket('${esc(id)}')">Save</button>
    </div>`;
  openModal();
}

function saveEditPocket(id) {
  const p = pockets.find(x => x.id === id);
  if (!p) return;
  const name = $('editName').value.trim();
  if (!name) return toast('Name cannot be empty', 'warn');
  p.name = name;
  p.icon = pickedIcon('editIcon');
  p.color = pickedColor('editColor');
  p.monthlyTarget = safeMonthlyTarget($('editMonthlyTarget').value);
  savePockets();
  closeModal();
  renderAll();
  toast('Pocket updated');
}

function deletePocket(id) {
  const p = pockets.find(x => x.id === id);
  if (!p) return;

  let usedByAlloc = 0, usedByExpense = 0, usedByTransfer = 0;
  forEachMonth(d => {
    usedByAlloc += d.allocations.filter(a => a.pocketId === id).length;
    usedByExpense += d.expenses.filter(e => e.pocketId === id).length;
    usedByTransfer += d.transfers.filter(t => t.from === id || t.to === id).length;
  });

  const left = archive.balances[id].balance;
  let message = 'Delete pocket "' + p.name + '"?\n\n';
  message += 'Balance lost: ' + fmt(left) + '\n';
  message += '• ' + usedByAlloc + ' allocation entries\n';
  message += '• ' + usedByExpense + ' expense entries\n';
  message += '• ' + usedByTransfer + ' transfer entries';
  if (usedByExpense) message += '\n\nRelated expenses will be changed to "No pocket".';
  message += '\n\nContinue?';
  if (!confirm(message)) return;

  forEachMonth(d => {
    let changed = false;
    d.expenses.forEach(e => {
      if (e.pocketId === id) { e.pocketId = null; changed = true; }
    });
    const keptAlloc = d.allocations.filter(a => a.pocketId !== id);
    if (keptAlloc.length !== d.allocations.length) { d.allocations = keptAlloc; changed = true; }
    const keptTransfers = d.transfers.filter(t => t.from !== id && t.to !== id);
    if (keptTransfers.length !== d.transfers.length) { d.transfers = keptTransfers; changed = true; }
    return changed;
  });

  pockets = pockets.filter(x => x.id !== id);
  savePockets();
  loadMonth();
  toast('Pocket "' + p.name + '" deleted', 'warn');
}

function focusAllocation(id) {
  fillSelect($('allocPocket'), pocketOptions());
  $('allocPocket').value = id;
  $('allocAmount').focus();
  flashBlock('formAlloc');
}

function focusTransfer(id) {
  fillSelect($('transferFrom'), pocketOptions());
  $('transferFrom').value = id;
  $('transferAmount').focus();
  flashBlock('formTransfer');
}

function flashBlock(formId) {
  const form = $(formId);
  if (!form) return;
  const block = form.closest('.sub-block');
  if (!block) return;
  block.scrollIntoView({ behavior: 'smooth', block: 'center' });
  block.classList.remove('flash');
  void block.offsetWidth;
  block.classList.add('flash');
  setTimeout(() => block.classList.remove('flash'), 1200);
}

/* ======================= ALLOCATION & TRANSFER CRUD ======================= */

function addAllocation(ev) {
  if (ev) ev.preventDefault();
  const id = $('allocPocket').value;
  if (!id) return toast('Create a pocket first', 'warn');
  const amount = readAmount('allocAmount', 'Allocation amount');
  if (amount === null) return false;

  const left = archive.balances[id].balance;
  if (left < 0) {
    const message =
      'Pocket "' + pocketName(id) + '" is over by ' + fmt(-left) + '.\n\n' +
      'Allocate ' + fmt(amount) + '?\nBalance after allocating: ' + fmt(left + amount);
    if (!confirm(message)) return false;
  }

  data.allocations.push({ pocketId: id, amount, note: $('allocNote').value.trim() });
  saveMonth();
  $('allocAmount').value = '';
  $('allocNote').value = '';
  $('allocAmount').focus();
  renderAll();
  toast('Allocate: ' + fmt(amount) + ' → ' + pocketName(id));
  return false;
}

/* ---------- AUTO ALLOCATE (1 click) ---------- */

/* The auto-allocate modal. Every field starts at the SHORTFALL toward the
   pocket's monthly template, so repeated clicks only finish the target and
   never stack on top of it. The values in this modal are FOR THIS MONTH
   ONLY; the template stored on the pocket is left untouched. */
function openAutoAllocate() {
  if (!pockets.length) return toast('Create a pocket first', 'warn');

  const left = archive.cash.thisMonth;
  const rows = pockets.map(p => `
    <tr>
      <td class="alloc-name"><span style="color:${ICON_COLORS[p.icon] || p.color}"><i class="${esc(p.icon)}"></i></span> ${esc(p.name)}</td>
      <td class="alloc-num">${fmt(archive.thisMonth[p.id] ? archive.thisMonth[p.id].allocated : 0)}</td>
      <td class="alloc-num">${fmt(targetOf(p.id))}</td>
      <td class="alloc-input">
        <input type="text" inputmode="numeric" autocomplete="off"
               value="${shortfallFor(p.id)}" data-auto-alloc="${esc(p.id)}"
               oninput="refreshAutoAllocate()">
      </td>
    </tr>`).join('');

  $('modalTitle').textContent = 'Auto Allocate — ' + periodLabel(shownPeriod());
  $('modalBody').innerHTML = `
    <p class="hint" style="margin-top:0">
      Allocate to every pocket in one go. Each field is prefilled with the
      <b>shortfall</b> toward the target, so it is safe to click repeatedly.
      Want to go above the target? Change the value here, or allocate manually
      with the <b>Allocate</b> button on the page.
    </p>
    <div class="alloc-table-wrap">
      <table class="alloc-table">
        <thead><tr>
          <th>Pocket</th>
          <th class="alloc-num">Already allocated</th>
          <th class="alloc-num">Target /mo</th>
          <th class="alloc-num">Add now</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="alloc-total">
      <div><span>Not yet allocated</span><b>${fmt(left)}</b></div>
      <div><span>Will be allocated</span><b id="autoAllocTotal">Rp 0</b></div>
      <div><span>Left after allocating</span><b id="autoAllocRemainder">${fmt(left)}</b></div>
    </div>
    <p class="hint">
      The values in this modal apply <b>to this month only</b>. The monthly
      template does not change — edit it under <b>Manage Plot Template</b>.
    </p>
    <div class="form-actions">
      <button class="secondary" onclick="closeModal()">Cancel</button>
      <button class="success" onclick="runAutoAllocate()"><i class="fas fa-bolt"></i> Allocate Now</button>
    </div>`;
  openModal();
  refreshAutoAllocate();
}

/* Recompute the totals row as the modal fields are typed into. */
function refreshAutoAllocate() {
  let total = 0;
  document.querySelectorAll('#modalBody input[data-auto-alloc]').forEach(el => {
    const v = num(el.value);
    if (Number.isFinite(v) && v > 0) total += v;
  });
  const left = archive.cash.thisMonth;
  const elTotal = $('autoAllocTotal');
  if (elTotal) elTotal.textContent = fmt(total);
  const elLeft = $('autoAllocRemainder');
  if (elLeft) {
    elLeft.textContent = fmt(left - total);
    elLeft.className = left - total < 0 ? 'neg' : '';
  }
}

function runAutoAllocate() {
  if (!pockets.length) return toast('Create a pocket first', 'warn');

  const fields = [...document.querySelectorAll('#modalBody input[data-auto-alloc]')];
  if (!fields.length) return toast('The modal contains no pockets', 'warn');

  const plan = [];
  for (const el of fields) {
    const id = el.dataset.autoAlloc;
    const raw = String(el.value || '').trim();
    // Cleared out = skip this pocket. A value of "0" is also valid and
    // means skip -- only text that cannot be read as an amount counts as a
    // typo, because coercing that to 0 would store an invisible Rp 0 allocation.
    if (raw === '') continue;
    const v = parseAmount(raw);
    if (v === null || v < 0) {
      el.focus();
      return toast('Allocation for "' + pocketName(id) + '" must be 0 or more'
        + '. Got: "' + raw.slice(0, 24) + '"', 'warn');
    }
    if (v > 0) plan.push({ id: id, amount: v });
  }

  if (!plan.length) return toast('Every field is 0 — nothing was allocated', 'warn');

  const total = plan.reduce((s, r) => s + r.amount, 0);
  const left = archive.cash.thisMonth;
  if (total > left) {
    const message =
      'Total allocation ' + fmt(total) + ' exceeds the unallocated amount (' + fmt(left) + ').\n\n' +
      'Short by ' + fmt(total - left) + '. Cash outside pockets will become ' +
      fmt(archive.cash.total - total) + '.\n\nContinue?';
    if (!confirm(message)) return false;
  }

  plan.forEach(r => data.allocations.push({ pocketId: r.id, amount: r.amount, note: 'auto allocation' }));
  saveMonth();
  closeModal();
  renderAll();
  toast('Auto Allocate: ' + plan.length + ' pockets allocated, total ' + fmt(total));
  return false;
}

/* ---------- MANAGE TEMPLATE (persistent setting) ---------- */

function openTemplateEditor() {
  if (!pockets.length) return toast('Create a pocket first', 'warn');

  const rows = pockets.map(p => `
    <tr>
      <td class="alloc-name"><span style="color:${ICON_COLORS[p.icon] || p.color}"><i class="${esc(p.icon)}"></i></span> ${esc(p.name)}</td>
      <td class="alloc-input">
        <input type="text" inputmode="numeric" autocomplete="off"
               value="${safeMonthlyTarget(p.monthlyTarget)}" data-tpl="${esc(p.id)}"
               oninput="refreshTemplateTotals()">
      </td>
    </tr>`).join('');

  $('modalTitle').textContent = 'Monthly Plot Template';
  $('modalBody').innerHTML = `
    <p class="hint" style="margin-top:0">
      The <b>template</b> values the <b>Auto Allocate</b> button uses as its target
      every month. They apply to future months until you change them here.
      Allocations already recorded this month are <b>not</b> affected.
    </p>
    <div class="alloc-table-wrap">
      <table class="alloc-table">
        <thead><tr>
          <th>Pocket</th>
          <th class="alloc-num">Default allocation / month (Rp)</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="alloc-total">
      <div><span>Template total per month</span><b id="templateTotal">Rp 0</b></div>
    </div>
    <div class="form-actions">
      <button class="secondary" onclick="closeModal()">Cancel</button>
      <button class="success" onclick="saveTemplate()">Save Template</button>
    </div>`;
  openModal();
  refreshTemplateTotals();
}

function refreshTemplateTotals() {
  let total = 0;
  document.querySelectorAll('#modalBody input[data-tpl]').forEach(el => {
    const v = num(el.value);
    if (Number.isFinite(v) && v > 0) total += v;
  });
  const el = $('templateTotal');
  if (el) el.textContent = fmt(total);
}

function saveTemplate() {
  const fields = [...document.querySelectorAll('#modalBody input[data-tpl]')];
  if (!fields.length) return toast('The modal contains no pockets', 'warn');

  const next = {};
  for (const el of fields) {
    const id = el.dataset.tpl;
    const raw = String(el.value || '').trim();
    const v = raw === '' ? 0 : parseAmount(raw);
    if (v === null || v < 0) {
      el.focus();
      return toast('Template for "' + pocketName(id) + '" must be 0 or more'
        + '. Got: "' + raw.slice(0, 24) + '"', 'warn');
    }
    next[id] = v > 0 ? Math.round(v) : 0;
  }

  pockets.forEach(p => { p.monthlyTarget = next[p.id] || 0; });
  savePockets();
  closeModal();
  renderAll();
  const total = pockets.reduce((s, p) => s + safeMonthlyTarget(p.monthlyTarget), 0);
  toast('Template saved · total ' + fmt(total) + ' / month');
  return false;
}

function addTransfer(ev) {
  if (ev) ev.preventDefault();
  const from = $('transferFrom').value;
  const to = $('transferTo').value;

  if (!from || !to) return toast('Pick a source and a destination', 'warn');
  if (from === to) return toast('Source and destination must differ', 'warn');
  const amount = readAmount('transferAmount', 'Transfer amount');
  if (amount === null) return false;

  if (from !== CASH) {
    const balance = archive.balances[from].balance;
    if (amount > balance) {
      const message =
        'Balance of "' + pocketName(from) + '" is only ' + fmt(balance) + '.\n\n' +
        'Move ' + fmt(amount) + ' anyway?\n' +
        'The source pocket will become ' + fmt(balance - amount) + '.';
      if (!confirm(message)) return false;
    }
  }

  const type = (from === CASH || to === CASH) ? 'withdraw' : 'transfer';
  data.transfers.push({
    type,
    from: from,
    to: to,
    amount,
    note: $('transferNote').value.trim()
  });
  saveMonth();
  $('transferAmount').value = '';
  $('transferNote').value = '';
  $('transferAmount').focus();
  renderAll();

  const source = from === CASH ? 'Free Cash' : pocketName(from);
  const dest = to === CASH ? 'Free Cash' : pocketName(to);
  toast('Transfer: ' + source + ' → ' + dest);
  return false;
}

function pocketName(id) {
  const p = pockets.find(x => x.id === id);
  return p ? p.name : (id === CASH ? 'Cash outside pockets' : '?');
}

/* ======================= MONTHLY TARGET ======================= */

/* The monthly target: a whole amount >= 0. A pocket that has no
   monthlyTarget counts as 0 -- the template is filled in by the user, not
   guessed from past allocations. */
function safeMonthlyTarget(v) {
  const n = typeof v === 'number' ? v : num(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/* The monthly target value for one pocket. */
function targetOf(id) {
  const p = pockets.find(x => x.id === id);
  return p ? safeMonthlyTarget(p.monthlyTarget) : 0;
}

/* Shortfall toward this month's target. Auto allocate tops up by this
   shortfall rather than the full template, so the button is safe to click
   over and over. */
function shortfallFor(id) {
  const done = archive.thisMonth[id] ? archive.thisMonth[id].allocated : 0;
  return Math.max(0, targetOf(id) - done);
}

/* ======================= INCOME CRUD ======================= */

function addIncome(ev) {
  if (ev) ev.preventDefault();
  const name = $('incomeSource').value.trim();
  const amount = readAmount('incomeAmount', 'Income amount');
  if (amount === null) return false;
  if (!name) {
    toast('Enter an income source', 'warn');
    $('incomeSource').focus();
    return false;
  }
  data.income.push({ name, amount });
  saveMonth();
  $('incomeSource').value = '';
  $('incomeAmount').value = '';
  $('incomeSource').focus();
  renderAll();
  toast('Income +' + fmt(amount));
  return false;
}

function deleteIncome(i) {
  const it = data.income[i];
  if (!confirm('Delete "' + (it ? it.name : '') + '"?')) return;
  data.income.splice(i, 1);
  saveMonth();
  renderAll();
}

function applyTableEdit(el) {
  const i = Number(el.dataset.row);
  const listName = el.dataset.list;
  const field = el.dataset.field;
  const list = data[listName];
  if (!list || !list[i]) return;

  if (field === 'amount') {
    const next = num(el.value);
    if (!Number.isFinite(next) || next <= 0) {
      // Put the stored value back. Writing 0 here would erase the real
      // amount without leaving a trace.
      el.value = list[i].amount;
      toast('Amount must be a number greater than 0. Restored to '
        + fmt(list[i].amount), 'warn');
      return;
    }
    list[i].amount = next;
  }
  else if (field === 'pocketId') list[i].pocketId = el.value || null;
  else if (field === 'date') {
    list[i].date = safeDate(el.value);
    saveMonth();
    // Light re-render: the table is not rebuilt so focus is not lost.
    const cell = el.closest('td');
    if (cell) cell.classList.toggle('tgl-empty', !list[i].date);
    toast(list[i].date ? 'Date · ' + shortDate(list[i].date) : 'Date cleared', 'warn');
    return;
  }
  else list[i][field] = el.value;

  saveMonth();

  // Light re-render: the table being edited is NOT rebuilt so focus on the
  // input/select is not lost.
  archive = computeArchive();
  renderSummary();
  renderPockets();
  renderAllocations();
  renderCharts();
  markOver();
}

/* ======================= EXPENSE CRUD ======================= */

function addExpense(ev) {
  if (ev) ev.preventDefault();
  const name = $('expenseName').value.trim();
  const amount = readAmount('expenseAmount', 'Expense amount');
  if (amount === null) return false;
  const pocketId = $('expensePocket').value || null;
  const date = safeDate($('expenseDate').value) || defaultDate();

  if (!name) {
    toast('Enter what this was for', 'warn');
    $('expenseName').focus();
    return false;
  }

  if (pocketId) {
    const s = archive.balances[pocketId].balance;
    if (amount > s) {
      const message =
        'Balance of pocket "' + pocketName(pocketId) + '" is only ' + fmt(s) + '.\n\n' +
        'Record ' + fmt(amount) + ' anyway?\n' +
        'The pocket will go over by ' + fmt(amount - s) + '.';
      if (!confirm(message)) return false;
    }
  }

  data.expenses.push({ name, amount, pocketId, date });
  saveMonth();
  $('expenseName').value = '';
  $('expenseAmount').value = '';
  $('expenseDate').value = defaultDate();
  $('expenseName').focus();
  renderAll();

  toast(
    pocketId
      ? 'Expense: ' + fmt(amount) + ' from ' + pocketName(pocketId)
          + ' · ' + shortDate(date)
      : 'Expense: ' + fmt(amount) + ' (no pocket) · ' + shortDate(date),
    pocketId ? 'ok' : 'warn'
  );
  return false;
}

function deleteExpense(i) {
  const it = data.expenses[i];
  if (!confirm('Delete "' + (it ? it.name : '') + '"?')) return;
  data.expenses.splice(i, 1);
  saveMonth();
  renderAll();
}

/* ======================= POCKET HISTORY ======================= */

function openHistory(id) {
  const p = pockets.find(x => x.id === id);
  if (!p) return;
  const b = archive.balances[id];
  const m = archive.thisMonth[id];
  const iconColor = ICON_COLORS[p.icon] || p.color;

  $('modalTitle').innerHTML = `<i class="${esc(p.icon)}" style="color:${iconColor}"></i> History · ${esc(p.name)}`;
  $('modalBody').innerHTML = `
    <div class="summary-grid" style="margin-bottom:16px">
      <div class="summary-item"><div class="label">Balance Now</div>
        <div class="value ${b.balance < 0 ? 'negative' : 'neutral'}">${fmt(b.balance)}</div></div>
      <div class="summary-item"><div class="label">Total In</div>
        <div class="value positive">${fmt(b.allocated + b.transferIn)}</div></div>
      <div class="summary-item"><div class="label">Total Out</div>
        <div class="value negative">${fmt(b.spent + b.transferOut + b.withdrawn)}</div></div>
    </div>
    <div class="pocket-meta" style="margin-bottom:14px">
      <span>Allocated this month <b>${fmt(m.allocated)}</b></span>
      <span>Spent this month <b>${fmt(m.spent)}</b></span>
    </div>
    <div id="historyBody"></div>`;
  openModal();
  $('historyBody').innerHTML = historyHtml(id);
}

function historyHtml(id) {
  const p = pockets.find(x => x.id === id);
  const months = [];

  allMonthKeys().forEach(key => {
    const period = parseKey(key);
    const d = readMonth(key);
    if (!d) return;
    const rows = [];

    d.allocations.forEach(x => {
      if (x.pocketId !== id) return;
      rows.push({ ico: 'fas fa-bolt', icoColor: ICON_COLORS['fas fa-bolt'], label: 'Funds allocated', sub: x.note, amount: num(x.amount), plus: true });
    });
    d.expenses.forEach(x => {
      if (x.pocketId !== id) return;
      rows.push({
        ico: 'fas fa-shopping-cart',
        icoColor: ICON_COLORS['fas fa-shopping-cart'],
        label: x.name || '(no name)',
        sub: x.date ? shortDate(x.date) : 'no date',
        amount: num(x.amount), plus: false
      });
    });
    d.transfers.forEach(t => {
      const v = num(t.amount);
      if (t.from === id) {
        const isWithdraw = t.type === 'withdraw';
        rows.push({
          ico: isWithdraw ? 'fas fa-sign-out-alt' : 'fas fa-exchange-alt',
          icoColor: isWithdraw ? ICON_COLORS['fas fa-sign-out-alt'] : ICON_COLORS['fas fa-exchange-alt'],
          label: isWithdraw ? 'Withdrawn to free cash' : 'Out → ' + pocketName(t.to),
          sub: t.note, amount: v, plus: false
        });
      }
      if (t.to === id) {
        rows.push({ ico: 'fas fa-sign-in-alt', icoColor: ICON_COLORS['fas fa-sign-in-alt'], label: 'In from ' + pocketName(t.from), sub: t.note, amount: v, plus: true });
      }
    });

    if (rows.length) months.push({ label: periodLabel(period), rows });
  });

  if (!months.length) {
    return '<div class="history-empty">No history in pocket "' + esc(p ? p.name : '') + '".</div>';
  }

  return months.map(g => `
    <div class="history-month">
      <h4>${esc(g.label)}</h4>
      ${g.rows.map(r => `
        <div class="history-item">
          <span class="ico" style="color:${r.icoColor}"><i class="${r.ico}"></i></span>
          <span class="label-text">${esc(r.label)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span>
          <span class="hist-amount ${r.plus ? 'plus' : 'minus'}">${r.plus ? '+' : '-'} ${fmt(r.amount)}</span>
        </div>`).join('')}
    </div>`).join('');
}

/* ======================= MODAL ======================= */

function openModal() {
  $('modal').hidden = false;
}

function closeModal() {
  $('modal').hidden = true;
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('modal').hidden) closeModal();
});
$('modal').addEventListener('click', e => {
  if (e.target === $('modal')) closeModal();
});

/* ======================= CHARTS ======================= */

function renderCharts() {
  drawPocketSpending();
  drawAllocations();
  drawMoneyFlow();
}

function drawPocketSpending() {
  const ctx = $('chartPockets').getContext('2d');
  if (chartPockets) chartPockets.destroy();

  const label = [];
  const value = [];
  const color = [];

  pockets.forEach(p => {
    const v = archive.thisMonth[p.id].spent;
    if (v > 0) { label.push(p.name); value.push(v); color.push(p.color); }
  });
  const loose = data.expenses
    .filter(e => !e.pocketId)
    .reduce((s, e) => s + num(e.amount), 0);
  if (loose > 0) { label.push('No pocket'); value.push(loose); color.push('#94a3b8'); }

  chartPockets = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: label.length ? label : ['No expenses yet'],
      datasets: [{
        data: label.length ? value : [1],
        backgroundColor: label.length ? color : ['#e2e8f0'],
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: 'Spending per Pocket (This Month)' },
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: c => c.label + ': ' + fmt(c.parsed)
          }
        }
      }
    }
  });
}

function drawAllocations() {
  const ctx = $('chartAllocations').getContext('2d');
  if (chartAlloc) chartAlloc.destroy();

  const label = [];
  const alloc = [];
  const spent = [];
  const color = [];

  pockets.forEach(p => {
    const m = archive.thisMonth[p.id];
    if (m.allocated > 0 || m.spent > 0) {
      label.push(p.name);
      alloc.push(m.allocated);
      spent.push(m.spent);
      color.push(p.color);
    }
  });

  chartAlloc = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: label.length ? label : ['Nothing allocated yet'],
      datasets: [
        { label: 'Allocated', data: alloc.length ? alloc : [0], backgroundColor: '#94a3b8', borderRadius: 4 },
        { label: 'Spent', data: spent.length ? spent : [0], backgroundColor: color.length ? color : '#16a34a', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: 'Allocated vs Spent per Pocket' },
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: c => c.dataset.label + ': ' + fmt(c.parsed.y) } }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => fmtShort(v) }
        }
      }
    }
  });
}

function drawMoneyFlow() {
  const ctx = $('chartMoneyFlow').getContext('2d');
  if (chartMoneyFlow) chartMoneyFlow.destroy();

  const inc = data.income.reduce((s, i) => s + num(i.amount), 0);
  const out = data.expenses.reduce((s, i) => s + num(i.amount), 0);
  const alloc = data.allocations.reduce((s, i) => s + num(i.amount), 0);

  chartMoneyFlow = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Income', 'Allocated', 'Expenses'],
      datasets: [{
        label: 'Amount (Rp)',
        data: [inc, alloc, out],
        backgroundColor: ['#16a34a', '#3b82f6', '#dc2626'],
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: 'Money Flow This Month' },
        legend: { display: false },
        tooltip: { callbacks: { label: c => fmt(c.parsed.y) } }
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: v => fmtShort(v) } }
      }
    }
  });
}

/* ======================= COPY / PASTE ======================= */

function copyData() {
  const payload = {
    _v: 3,
    _period: periodLabel(currentPeriod()),
    pockets: pockets.map(p => ({
      id: p.id, name: p.name, icon: p.icon, color: p.color,
      monthlyTarget: safeMonthlyTarget(p.monthlyTarget)
    })),
    income: data.income,
    expenses: data.expenses,
    allocations: data.allocations,
    transfers: data.transfers
  };
  const json = JSON.stringify(payload, null, 2);
  $('pasteArea').value = json;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(json)
      .then(() => toast('Data copied to the clipboard'))
      .catch(() => toast('Data is shown in the box below — copy it manually (Ctrl+A, Ctrl+C)', 'warn'));
  } else {
    toast('Data is shown in the box below — copy it manually', 'warn');
  }
}

function pasteData() {
  const text = $('pasteArea').value.trim();
  if (!text) return toast('The paste box is still empty', 'warn');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return toast('Invalid JSON — make sure this came from this app\'s Copy Data', 'err');
  }
  if (!parsed || typeof parsed !== 'object') {
    return toast('Unrecognized format', 'err');
  }
  if (!parsed.income || !parsed.expenses) {
    return toast('The data has no income/expenses', 'err');
  }

  if (!confirm(
    'The data for ' + periodLabel(currentPeriod()) + ' will be replaced by the pasted data.\n\n' +
    'Note: pocket balances accumulate across all months and are NOT changed by pasting.\n\n' +
    'Continue?'
  )) return;

  // Map old pockets -> the pockets that exist now (by name)
  const byOldId = {};
  const incoming = Array.isArray(parsed.pockets) ? parsed.pockets : [];
  incoming.forEach(p => {
    if (!p || !p.name) return;
    const name = String(p.name);
    let match = pockets.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (!match) {
      // A brand new pocket brings its template along from the pasted data.
      // If the pocket already exists, the user's own template wins: pasting
      // only fills in this month and must never change the template.
      match = {
        id: uid(), name, icon: safeIcon(p.icon),
        color: safeColor(p.color || nextColor()),
        monthlyTarget: safeMonthlyTarget(p.monthlyTarget)
      };
      pockets.push(match);
    }
    byOldId[String(p.id)] = match.id;
  });

  // Pocket ids from the pasted data are mapped onto the pockets that exist now.
  const remap = id => {
    if (!id || id === CASH) return id || null;
    if (byOldId[String(id)]) return byOldId[String(id)];
    return pockets.some(p => p.id === id) ? id : null;
  };

  const next = normalizeMonth(parsed);
  next.expenses.forEach(e => { e.pocketId = remap(e.pocketId); });
  next.allocations.forEach(a => { a.pocketId = remap(a.pocketId); });
  next.transfers.forEach(t => {
    t.from = remap(t.from);
    t.to = remap(t.to);
  });

  // Drop allocations/transfers whose target no longer exists
  next.allocations = next.allocations.filter(a => a.pocketId);
  next.transfers = next.transfers.filter(t => t.from || t.to);

  data = next;
  savePockets();
  saveMonth();
  renderAll();
  toast('Data pasted (' + (next.income.length) + ' income, ' +
    (next.expenses.length) + ' expenses, ' + (next.allocations.length) + ' allocations)');
}

/* ======================= EXCEL EXPORT ======================= */

function exportExcel() {
  const per = currentPeriod();
  const label = periodLabel(per);
  const inc = data.income.reduce((s, i) => s + num(i.amount), 0);
  const out = data.expenses.reduce((s, i) => s + num(i.amount), 0);
  const alloc = data.allocations.reduce((s, i) => s + num(i.amount), 0);
  const totalBalance = pockets.reduce((s, p) => s + archive.balances[p.id].balance, 0);

  const summary = [
    ['HOUSEHOLD BUDGET TRACKER — POCKETS'],
    ['Period', label],
    ['Exported', new Date().toLocaleString('id-ID')],
    [],
    ['SUMMARY'],
    ['Income This Month', inc],
    ['Already Allocated to Pockets', alloc],
    ['Not Yet Allocated', inc - alloc],
    ['Expenses This Month', out],
    ['Total Pocket Balance (accumulated)', totalBalance],
    ['Cash Outside Pockets (accumulated)', archive.cash.total]
  ];

  const pocketRows = [
    ['Icon', 'Pocket', 'Color', 'Allocated This Month', 'Spent This Month', 'Left This Month',
      'Total In (all months)', 'Total Out (all months)', 'Pocket Balance']
  ];
  pockets.forEach(p => {
    const b = archive.balances[p.id];
    const m = archive.thisMonth[p.id];
    pocketRows.push([
      p.icon, p.name, p.color, m.allocated, m.spent, m.allocated - m.spent,
      b.allocated + b.transferIn, b.spent + b.transferOut + b.withdrawn, b.balance
    ]);
  });
  if (pockets.length) {
    pocketRows.push([]);
    pocketRows.push(['', 'TOTAL', '', alloc,
      data.expenses.filter(e => e.pocketId).reduce((s, e) => s + num(e.amount), 0),
      '', '', '', totalBalance]);
  }

  const incomeRows = [['Income Source', 'Amount (Rp)'], ...data.income.map(i => [i.name, i.amount]), [], ['TOTAL', inc]];

  const allocRows = [['Pocket', 'Amount (Rp)', 'Note']];
  data.allocations.forEach(i => allocRows.push([pocketName(i.pocketId), i.amount, i.note || '']));
  allocRows.push([], ['TOTAL', alloc]);

  const expenseRows = [['Date', 'Description', 'Pocket', 'Amount (Rp)']];
  data.expenses.forEach(i =>
    expenseRows.push([i.date || '', i.name, i.pocketId ? pocketName(i.pocketId) : 'No pocket', i.amount]));
  expenseRows.push([], ['', 'TOTAL', '', out]);

  const transferRows = [['Type', 'From', 'To', 'Amount (Rp)', 'Note']];
  data.transfers.forEach(t => {
    const from = t.from === CASH ? 'Cash outside pockets' : pocketName(t.from);
    const to = t.to === CASH ? 'Cash outside pockets' : pocketName(t.to);
    transferRows.push([t.type === 'withdraw' ? 'Withdraw / Deposit' : 'Transfer', from, to, t.amount, t.note || '']);
  });

  const wb = XLSX.utils.book_new();

  const addSheet = (rows, name, widths) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = widths.map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  addSheet(summary, 'Summary', [36, 22]);
  addSheet(pocketRows, 'Pockets', [7, 24, 10, 20, 19, 16, 21, 22, 18]);
  addSheet(incomeRows, 'Income', [32, 16]);
  addSheet(allocRows, 'Allocations', [24, 16, 32]);
  addSheet(expenseRows, 'Expenses', [13, 30, 22, 16]);
  addSheet(transferRows, 'Transfers', [20, 24, 24, 16, 30]);

  XLSX.writeFile(wb, `Budget_Pockets_${MONTH_NAMES[per.month]}_${per.year}.xlsx`);
  toast('Excel file downloaded');
}

/* ======================= INIT ======================= */

function bindEvents() {
  $('incomeBody').addEventListener('change', e => {
    if (e.target.dataset.list) applyTableEdit(e.target);
  });
  $('expenseBody').addEventListener('change', e => {
    if (e.target.dataset.list) applyTableEdit(e.target);
  });
  $('month').addEventListener('change', switchPeriod);
  $('year').addEventListener('change', switchPeriod);

  /* Delegated so it covers both the add form's picker and the one inside
     the edit modal, which is created and destroyed on every open. */
  document.addEventListener('click', e => {
    const icon = e.target.closest('.ip-btn');
    if (icon) {
      setPickedIcon(icon.closest('.icon-picker').id, icon.dataset.icon);
      return;
    }
    const sw = e.target.closest('.sw');
    if (sw) setPickedColor(sw.closest('.swatches').id, sw.dataset.color);
  });
}

function exportJSON() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    data[key] = localStorage.getItem(key);
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'budget-data.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      localStorage.clear();
      Object.entries(data).forEach(([key, value]) => {
        localStorage.setItem(key, value);
      });
      alert('Data imported successfully! Please reload the page to apply the changes.');
    } catch (error) {
      alert('Error importing JSON file: ' + error.message);
    }
  };

  reader.readAsText(file);
  event.target.value = '';
}

function init() {
  const now = new Date();
  $('month').value = now.getMonth() + 1;
  $('year').value = now.getFullYear();

  renderIconPicker();
  loadPockets();
  bindEvents();
  loadMonth();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
