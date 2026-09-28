/* =====================================================================
   salin-localstorage.js — a snippet to run in the Firefox console.

   HOW TO USE:
     1. Open budget-tracker.html in Firefox
     2. Press F12, choose the "Console" tab
     3. Paste this entire file into the console, press Enter
     4. The JSON copy lands on your clipboard automatically
     5. Paste it here

   It changes nothing in the app. It only reads.
   ===================================================================== */
(function () {
  var MONTH_KEY = /^budget_tracker_\d{4}_\d{1,2}$/;
  var dump = {};

  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    dump[key] = localStorage.getItem(key);
  }

  var months = Object.keys(dump).filter(function (k) { return MONTH_KEY.test(k); });
  var json = JSON.stringify(dump, null, 2);

  console.log('%c=== localStorage ===', 'font-weight:bold;font-size:14px');
  console.log('total keys   : ' + Object.keys(dump).length);
  console.log('month keys   : ' + months.length + (months.length ? '  -> ' + months.join(', ') : ''));
  console.log('other keys   : ' + Object.keys(dump).filter(function (k) { return !MONTH_KEY.test(k); }).join(', '));
  console.log('JSON size    : ' + json.length + ' characters');

  /* A per-month summary, so you can eyeball it without reading everything. */
  months.sort().forEach(function (k) {
    try {
      var d = JSON.parse(dump[k]);
      var inc = (d.income || []).length;
      var exp = (d.expenses || []).length;
      var alloc = (d.allocations || []).length;
      var tr = (d.transfers || []).length;
      var dated = (d.expenses || []).filter(function (x) {
        return x && x.date;
      }).length;
      console.log('  ' + k + '  income:' + inc + '  expenses:' + exp +
        '  allocations:' + alloc + '  transfers:' + tr + '  with date:' + dated + '/' + exp);
    } catch (e) {
      console.log('  ' + k + '  COULD NOT BE READ: ' + e.message);
    }
  });

  try {
    copy(json);
    console.log('%c✓ The copy is on your clipboard. Paste it here.', 'color:green;font-weight:bold');
  } catch (e) {
    console.log('%cCould not copy to the clipboard automatically: ' + e.message, 'color:red');
    console.log('Copy the last line by hand:');
    console.log(json);
  }
})();
