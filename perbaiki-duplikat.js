/* =====================================================================
   perbaiki-duplikat.js — a snippet to paste into the Firefox console.

   What this file is for
   ------------------------------------------------------------------
   There used to be a bug: the moment you moved the month dropdown, the
   month currently on screen was written under the TARGET month's key.
   The result was that several months could hold byte-identical copies
   while the target month's real content was lost.

   This file finds groups of months whose content is exactly equal, then
   lets you pick which one to keep. The rest are deleted.

   HOW TO USE:
     1. Open budget-tracker.html in Firefox
     2. Press F12, choose the "Console" tab
     3. Paste this entire file into the console, press Enter
     4. If a list of groups appears, answer each question one by one

   Safety:
     - An automatic backup is created and downloaded BEFORE anything changes
     - Nothing is deleted without an explicit confirmation
     - Every question can be cancelled with "cancel"

   There is no need to run this when no months are duplicated.
   ===================================================================== */
(function () {
  var MONTH_KEY = /^budget_tracker_\d{4}_\d{1,2}$/;
  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];

  function bold(text) { return '%c' + text; }
  function green(text) { return '%c' + text; }
  function red(text) { return '%c' + text; }

  function monthLabel(key) {
    var parts = key.split('_');
    var month = parseInt(parts[2], 10);
    return (MONTH_NAMES[month - 1] || '?') + ' ' + parts[1];
  }

  function readAll() {
    var out = {};
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      out[key] = localStorage.getItem(key);
    }
    return out;
  }

  function countColumns(text) {
    try {
      var d = JSON.parse(text);
      return {
        income: (d.income || []).length,
        expenses: (d.expenses || []).length,
        allocations: (d.allocations || []).length,
        transfers: (d.transfers || []).length
      };
    } catch (e) {
      return null;
    }
  }

  /* Sort by year, then by month. Plain text order would put October
     before September because "10" sorts lower than "9". */
  function byPeriod(a, b) {
    var ap = a.split('_'), bp = b.split('_');
    var diff = parseInt(ap[1], 10) - parseInt(bp[1], 10);
    if (diff) return diff;
    return parseInt(ap[2], 10) - parseInt(bp[2], 10);
  }

  function duplicateGroups(all) {
    var groups = {};
    var order = [];
    Object.keys(all).forEach(function (k) {
      if (!MONTH_KEY.test(k)) return;
      var body = all[k];
      try { body = JSON.stringify(JSON.parse(body)); } catch (e) { body = 'RAW:' + body; }
      if (!groups[body]) { groups[body] = []; order.push(body); }
      groups[body].push(k);
    });
    return order.filter(function (body) { return groups[body].length > 1; })
                .map(function (body) { return groups[body].sort(byPeriod); });
  }

  /* ---------------- 1. Inspect first ---------------- */
  var all = readAll();
  var groups = duplicateGroups(all);

  console.log(bold('=== Checking for duplicate months ==='));
  console.log('total keys   : ' + Object.keys(all).length);
  console.log('month keys   : ' + Object.keys(all).filter(function (k) {
    return MONTH_KEY.test(k);
  }).length);

  if (!groups.length) {
    console.log(green('No months with identical content.'));
    console.log('Nothing to repair. You can close this file.');
    return;
  }

  console.log(red('Found ' + groups.length + ' group(s) of duplicate months.'));
  groups.forEach(function (keys, i) {
    console.log(bold('  Group ' + (i + 1) + ':'));
    keys.forEach(function (k, n) {
      var c = countColumns(all[k]);
      var body = c ? ('income ' + c.income + ', expenses ' + c.expenses +
                      ', allocations ' + c.allocations + ', transfers ' + c.transfers)
                  : 'COULD NOT BE READ';
      console.log('    [' + (n + 1) + '] ' + monthLabel(k) + '  (' + k + ')  ' + body);
    });
    console.log('    Their content is exactly equal. Most likely only one is real.');
  });

  /* ---------------- 2. Back up first ---------------- */
  var stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  var backupName = 'budget-tracker-backup-' + stamp + '.json';
  var backupBody = JSON.stringify(all, null, 2);

  try {
    var blob = new Blob([backupBody], { type: 'application/json' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = backupName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    console.log(green('✓ Backup downloaded: ' + backupName));
    console.log('  Keep that file. If anything looks wrong later, your data is still in it.');
  } catch (e) {
    console.log(red('Could not create the automatic backup: ' + e.message));
    console.log('DO NOT CONTINUE. Copy the block below by hand.');
    console.log(backupBody);
    return;
  }

  var agreed = confirm(
    'The backup has been downloaded.\n\n' +
    groups.length + ' group(s) of duplicate months will be handled one by one.\n' +
    'For each group you will be asked which month is the real one.\n\n' +
    'Continue?'
  );
  if (!agreed) {
    console.log('Cancelled. Nothing was changed.');
    return;
  }

  /* ---------------- 3. Delete the copies ---------------- */
  var removed = [];

  /* Stop the loop without spilling a stack trace into the console. */
  function stop(message) {
    var e = new Error(message);
    e.stoppedOnPurpose = true;
    throw e;
  }

  try {
    groups.forEach(function (keys, i) {
      var list = keys.map(function (k, n) {
        return '  [' + (n + 1) + '] ' + monthLabel(k) + '  (' + k + ')';
      }).join('\n');

      var answer = prompt(
        'GROUP ' + (i + 1) + ' of ' + groups.length + '\n\n' +
        'These months have exactly the same content:\n' + list + '\n\n' +
        'Type the NUMBER of the month whose content is correct and should be kept.\n' +
        'Type "cancel" to cancel the whole process.',
        '1'
      );

      if (answer === null || String(answer).trim().toLowerCase() === 'cancel') {
        stop('Nothing was changed.');
      }

      var pick = parseInt(answer, 10);
      if (!pick || pick < 1 || pick > keys.length) {
        stop('Unrecognised answer "' + answer + '". Nothing was changed.');
      }

      var keep = keys[pick - 1];
      var drop = keys.filter(function (k) { return k !== keep; });

      var sure = confirm(
        'Group ' + (i + 1) + ':\n' +
        '  KEPT    : ' + monthLabel(keep) + '  (' + keep + ')\n' +
        '  DELETED : ' + drop.map(function (k) { return monthLabel(k); }).join(', ') + '\n\n' +
        'Are you sure?'
      );
      if (!sure) {
        stop('Nothing was changed.');
      }

      drop.forEach(function (k) { localStorage.removeItem(k); });
      removed = removed.concat(drop);
      console.log(green('  Group ' + (i + 1) + ' done. Kept: ' + keep +
                        ', deleted: ' + drop.length + ' month(s)'));
    });
  } catch (e) {
    if (!e || !e.stoppedOnPurpose) throw e;
    console.log('');
    console.log(bold('=== CANCELLED ==='));
    console.log(e.message);
    if (removed.length) {
      console.log('');
      console.log('Changes that had already been applied:');
      console.log('  deleted: ' + removed.join(', '));
      console.log('  The backup is in this file: ' + backupName);
      console.log('  Reloading the page will show whatever is left.');
    }
    return;
  }

  console.log('');
  console.log(bold('=== DONE ==='));
  console.log('Months deleted: ' + (removed.length ? removed.join(', ') : '(none)'));
  console.log('Backup         : ' + backupName);
  console.log('');
  console.log('Now RELOAD the page (F5) so the pocket cards are recalculated.');
  console.log('If anything looks wrong, restore the backup file above by hand:');
  console.log('  salin-localstorage.js can write the backup data back.');
})();
