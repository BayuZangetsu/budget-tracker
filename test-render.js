/* =====================================================================
   Security and markup test: a pocket name is user input that gets
   rendered into innerHTML. Make sure esc() closes every breakout path.

   Run: node test-render.js
   ===================================================================== */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/app.js', 'utf8');

/* Pull the text of one function out of app.js: from "function name(" to
   the closing brace of its body. A default parameter can contain {}, so
   the bracket depth is tracked through the parameter list first. */
const take = (name) => {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('function ' + name + ' not found');
  /* Skip the parameter list up to its matching close paren. */
  let p = src.indexOf('(', i), depth = 0, end = -1;
  for (let k = p; k < src.length; k++) {
    const c = src[k];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  const j = src.indexOf('{', end);
  let d = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('the body of ' + name + ' is not closed');
};

const esc = new Function(take('esc') + '; return esc;')();

let pass = 0, fail = 0;
const ok = n => { pass++; console.log('  ok   ' + n); };
const no = (n, d) => { fail++; console.log('  FAIL ' + n + '\n      ' + d); };

/* ---------- 1. esc closes every dangerous character ---------- */
console.log('\n=== 1. esc() closes every breakout path ===');
const cases = [
  ['<script>alert(1)</script>', 'a script tag'],
  ['" onmouseover="alert(1)', 'double quote + handler'],
  ["' onfocus='alert(1)", 'single quote + handler'],
  ['<img src=x onerror=alert(1)>', 'img onerror'],
  ['</div><script>x</script>', 'a closing tag'],
  ['javascript:alert(1)', 'a javascript: URL'],
  ['a & b < c > d', 'an ampersand and angle brackets'],
  ['`${alert(1)}`', 'a template literal'],
  ['""><svg onload=alert(1)>', 'svg onload']
];
for (const [input, name] of cases) {
  const out = esc(input);
  const safe = !/[<>]/.test(out.replace(/&lt;|&gt;/g, ''))
    && !/"/.test(out.replace(/&quot;/g, ''))
    && !/'/.test(out.replace(/&#39;/g, ''));
  if (safe) ok('esc: ' + name + ' -> ' + out);
  else no('esc: ' + name, 'a raw character survived: ' + out);
}

/* ---------- 2. A hostile name inside a pocket card ---------- */
console.log('\n=== 2. A hostile name renders safely inside a pocket card ===');
const archiveStub = {
  balances: { x: { allocated: 1, spent: 0, transferIn: 0, transferOut: 0, withdrawn: 0, balance: 1 } },
  thisMonth: { x: { allocated: 1, spent: 0 } }
};
const pocketCard = new Function(
  'esc', 'fmt', 'archive', 'targetOf',
  take('pocketCard') + '; return pocketCard;'
)(esc, n => 'Rp ' + n, archiveStub, id => (id === 'x' ? 800000 : 0));

const hostile = {
  id: 'x',
  name: '"><script>alert(1)</script>',
  icon: '<img src=x onerror=alert(1)>',
  color: 'red;background:url(javascript:alert(1))'
};
const html = pocketCard(hostile);

/* The handlers we install ourselves -- not an injection. */
const ourHandlers = ['focusAllocation', 'focusTransfer', 'openHistory', 'openEditPocket', 'deletePocket'];
const allHandlers = [...html.matchAll(/\son([a-z]+)\s*=\s*"([^"]*)"/gi)]
  .map(m => [m[1].toLowerCase(), m[2]]);
const foreignHandlers = allHandlers.filter(([ev, val]) =>
  ev !== 'click' || !ourHandlers.some(fn => val.trim().startsWith(fn + '(')));

const hasScriptTag = /<script/i.test(html);
const hasSvgTag = /<svg/i.test(html);
const hasImgTag = /<img/i.test(html);

if (!hasScriptTag) ok('no <script> was injected');
else no('injection', 'a <script> reached the HTML: ' + html.slice(0, 200));
if (!hasSvgTag) ok('no <svg onload>');
else no('injection', 'an <svg> reached the HTML');
if (!hasImgTag) ok('no <img onerror>');
else no('injection', 'an <img> reached the HTML');
if (!foreignHandlers.length) ok('only the handlers we install are present (' +
  ourHandlers.length + ' buttons)');
else no('handler injection', 'foreign handlers: ' + JSON.stringify(foreignHandlers));

/* ---------- 2b. Colour and icon must come from a whitelist ---------- */
console.log('\n=== 2b. Sanitising colour and icon (anti CSS injection) ===');
const { safeColor, safeIcon } = new Function(
  'PALETTE', 'ICONS',
  take('safeColor') + take('safeIcon') + '; return { safeColor, safeIcon };'
)(['#2563eb', '#16a34a'], ['\uD83D\uDCA1', '\uD83D\uDCB0']);

const hostileColor = 'red;background:url(javascript:alert(1))';
if (safeColor(hostileColor) === '#2563eb') ok('a hostile colour falls back safely: ' + safeColor(hostileColor));
else no('colour leaked through', safeColor(hostileColor));
if (safeColor('#16a34a') === '#16a34a') ok('a valid hex colour passes through');
else no('a valid colour was rejected', safeColor('#16a34a'));
if (safeIcon('<img src=x>') === '\uD83D\uDCB0') ok('a hostile icon falls back: ' + safeIcon('<img src=x>'));
else no('icon leaked through', safeIcon('<img src=x>'));
if (safeIcon('\uD83D\uDCA1') === '\uD83D\uDCA1') ok('a valid icon passes through');
else no('a valid icon was rejected', safeIcon('\uD83D\uDCA1'));

/* Sanitising happens at the input layer (add/edit/load), so here we only
   check that every write path calls the sanitiser. */
const writePaths = [
  ['loadPockets', 'loadPockets()'],
  ['addPocket', 'addPocket()'],
  ['addSuggestedPocket', 'addSuggestedPocket()'],
  ['saveEditPocket', 'saveEditPocket()'],
  ['pasteData', 'pasteData()']
];
for (const [fn, label] of writePaths) {
  const body = take(fn);
  const usesSanitiser = /safeColor|safeIcon/.test(body);
  if (usesSanitiser) ok('the write path ' + label + ' calls safeColor/safeIcon');
  else no('the write path ' + label, 'it never calls safeColor/safeIcon');
}

/* A card rendered from already-sanitised data may only use a palette colour. */
const cardFromCleanData = pocketCard({
  id: 'x', name: 'Probe', icon: safeIcon('<b>x</b>'), color: safeColor(hostileColor)
});
const accent = (cardFromCleanData.match(/--acc:([^";]*)/) || [])[1];
if (accent === '#2563eb') ok('the card uses a palette colour: --acc:' + accent);
else no('the colour was not sanitised', '--acc:' + accent);

/* ---------- 4. Balanced HTML tags ---------- */
console.log('\n=== 4. The HTML tags on a card are balanced ===');
const opens = (html.match(/<div\b/g) || []).length;
const closes = (html.match(/<\/div>/g) || []).length;
if (opens === closes) ok('divs are balanced (' + opens + ' open / ' + closes + ' close)');
else no('divs are not balanced', opens + ' open vs ' + closes + ' close');
if ((html.match(/<span\b/g) || []).length === (html.match(/<\/span>/g) || []).length) ok('spans are balanced');
else no('spans are not balanced', '');

/* ---------- 5. A valid colour still lands in the style attribute ---------- */
console.log('\n=== 5. A valid colour is still used as the accent ===');
const archiveStub2 = {
  balances: { p1: { allocated: 1, spent: 0, transferIn: 0, transferOut: 0, withdrawn: 0, balance: 1 } },
  thisMonth: { p1: { allocated: 1, spent: 0 } }
};
const card2 = new Function('esc', 'fmt', 'archive', 'targetOf',
  take('pocketCard') + '; return pocketCard;')(esc, n => 'Rp ' + n, archiveStub2, () => 0);
const html2 = card2({ id: 'p1', name: 'Electricity', icon: '\uD83D\uDCA1', color: '#2563eb' });
if (html2.includes('style="--acc:#2563eb"')) ok('a valid hex colour is carried through');
else no('a valid hex colour was lost', html2.slice(0, 120));
if (html2.includes('Electricity') && html2.includes('Rp 1')) ok('the card shows the name and the balance');
else no('the card is incomplete', html2.slice(0, 200));

/* ---------- 6. esc on <select> options ---------- */
console.log('\n=== 6. <select> options are escaped when rendered ===');
const pocketOptions = new Function('pockets', 'archive', 'fmtShort', 'CASH',
  take('pocketOptions') + '; return pocketOptions;')(
    [{ id: 'a', name: '"><script>x</script>', icon: '\uD83D\uDCA1', color: '#000' }],
    { balances: { a: { balance: 0 } } },
    n => String(n), '__cash__'
  );
const options = pocketOptions();

/* pocketOptions returns DATA; the escaping happens in fillSelect at render
   time, so that is what has to be inspected. */
const stubSelect = { value: '', innerHTML: '' };
const fillSelect = new Function('esc', '$', take('fillSelect') + '; return fillSelect;')(esc, () => stubSelect);
fillSelect(stubSelect, options);
const htmlSelect = stubSelect.innerHTML;

if (htmlSelect.includes('&lt;script&gt;')) ok('the select label is escaped: ' + htmlSelect.slice(0, 90));
else no('the select label leaked', htmlSelect.slice(0, 120));
if (!/<script/i.test(htmlSelect)) ok('no <script> inside an <option>');
else no('injection', 'a <script> reached an option');
if (/value="a"/.test(htmlSelect)) ok('the option value is intact (not over-escaped)');
else no('the option value is broken', htmlSelect.slice(0, 120));

console.log('\n================================');
console.log('PASS: ' + pass + '   FAIL: ' + fail);
console.log('================================');
process.exit(fail ? 1 : 0);
