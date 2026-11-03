var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var crypto = require('crypto');
var vm = require('vm');
var guard = require('../personal-home/guard');
var patchFile = path.join(__dirname, '../personal-home/patch.json');
var patch = JSON.parse(fs.readFileSync(patchFile, 'utf8'));
var custom = fs.readFileSync(path.join(__dirname, '../server/assets/home.html'), 'utf8');
var stock = guard.replaceExact(custom, patch.edits, true);
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
assert.strictEqual(hash(stock), patch.baseSha256, 'reverse patch recovers the pinned stock page');
assert.strictEqual(hash(custom), patch.customSha256, 'patch is current with the reviewed theme');
assert.strictEqual(guard.replaceExact(stock, patch.edits, false), custom, 'complete theme is reproduced exactly');

var temp = path.join(os.tmpdir(), 'glasshouse-personal-home-' + process.pid + '-' + Date.now());
var install = path.join(temp, 'tvweb'), theme = path.join(temp, 'theme');
fs.mkdirSync(temp);
fs.mkdirSync(install);
fs.mkdirSync(path.join(install, 'assets'));
fs.mkdirSync(theme);
fs.writeFileSync(path.join(theme, 'patch.json'), fs.readFileSync(patchFile));
var home = path.join(install, 'assets/home.html');
function apply() { return guard.applyTheme(install, theme); }
try {
  fs.writeFileSync(home, custom);
  assert.strictEqual(apply().state, 'active', 'existing custom Home is adopted without a restart');
  assert.strictEqual(fs.readFileSync(path.join(theme, 'last-stock-home.html'), 'utf8'), stock, 'stock recovery copy saved');
  fs.writeFileSync(home, stock);
  assert.strictEqual(apply().state, 'restored', 'stock reinstall automatically gets the theme');
  assert.strictEqual(fs.readFileSync(home, 'utf8'), custom);
  assert.strictEqual(apply().state, 'active', 'unchanged page does not request another restart');

  var future = stock + '\n<!-- unrelated future release change -->\n';
  fs.writeFileSync(home, future);
  assert.strictEqual(apply().state, 'restored');
  assert.ok(fs.readFileSync(home, 'utf8').indexOf('unrelated future release change') !== -1, 'unrelated upstream changes survive');
  var savedTheme = fs.readFileSync(path.join(theme, 'last-themed-home.html'), 'utf8');

  var conflict = stock.replace(patch.edits[0].before, '<!-- changed upstream context -->\n');
  fs.writeFileSync(home, conflict);
  assert.strictEqual(apply().state, 'review-required', 'conflicting release requests review');
  assert.strictEqual(fs.readFileSync(home, 'utf8'), conflict, 'conflict leaves installed page byte-for-byte intact');
  assert.strictEqual(fs.readFileSync(path.join(theme, 'last-themed-home.html'), 'utf8'), savedTheme, 'conflict preserves saved custom Home');
  assert.strictEqual(apply().state, 'unchanged', 'same conflict does not repeatedly notify or restart');
  fs.writeFileSync(home, stock + patch.edits[0].before);
  assert.strictEqual(apply().state, 'review-required', 'ambiguous context is refused');

  fs.writeFileSync(home, stock);
  ['.update', '.deploy'].forEach(function (name) {
    fs.mkdirSync(path.join(install, name));
    assert.strictEqual(apply().state, 'waiting', 'installer staging prevents writes');
    assert.strictEqual(fs.readFileSync(home, 'utf8'), stock);
    fs.rmdirSync(path.join(install, name));
  });
  fs.writeFileSync(path.join(theme, 'disabled'), '');
  assert.strictEqual(apply().state, 'disabled');
  assert.strictEqual(fs.readFileSync(home, 'utf8'), stock, 'disable marker prevents reapplication');
  assert.throws(function () { guard.replaceExact('safe', [{before:'',after:'unsafe'}], false); }, /Invalid/);
  assert.throws(function () { guard.replaceExact('safe', [], false); }, /no replacements/);

  fs.unlinkSync(path.join(theme, 'disabled'));
  var tick, restarts = 0, messages = [], stopped = false, failRestart = false;
  var context = {
    module: { exports: {} }, install: install, theme: theme, now: 30000,
    require: function (name) {
      if (name !== 'child_process') return require(name);
      return { execFile: function (file, args, options, cb) {
        if (file === '/bin/sh') { restarts++; cb(failRestart ? new Error('restart failed') : null); }
        else { messages.push(args); cb(null); }
      } };
    },
    setInterval: function (fn) { tick = fn; return 1; },
    clearInterval: function () { stopped = true; }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../personal-home/guard.js'), 'utf8') +
    '\nDate.now = function () { return now; }; run(install, theme);', context);
  context.now += 10000; tick();
  assert.strictEqual(restarts, 0, 'guard waits for the page to settle');
  fs.mkdirSync(path.join(install, '.deploy')); tick();
  fs.rmdirSync(path.join(install, '.deploy'));
  context.now += 5000; tick();
  assert.strictEqual(restarts, 0, 'finishing staging starts a fresh settling period');
  context.now += 15000; tick();
  assert.strictEqual(restarts, 1, 'restored page restarts Glasshouse once to clear its cache');
  tick();
  assert.strictEqual(restarts, 1, 'active theme does not restart again');

  fs.writeFileSync(home, stock);
  fs.utimesSync(home, new Date(1000), new Date(1000));
  failRestart = true;
  tick(); context.now += 15000; tick();
  assert.strictEqual(restarts, 2);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(theme, 'status.json'), 'utf8')).state, 'restart-required');
  tick();
  assert.strictEqual(restarts, 2, 'failed restart does not loop');
  assert.strictEqual(messages.length, 1, 'failed restart requests manual recovery once');

  fs.writeFileSync(path.join(theme, 'patch.json'), '{invalid');
  context.now += 15000; tick(); tick();
  assert.strictEqual(messages.length, 2, 'a malformed patch reports one error without repeated notifications');
  assert.strictEqual(fs.readFileSync(home, 'utf8'), custom, 'malformed patch leaves Home intact');
  fs.writeFileSync(path.join(theme, 'disabled'), ''); tick();
  assert.strictEqual(stopped, true, 'disabled marker stops polling immediately');
} finally {
  (function remove(dir) {
    fs.readdirSync(dir).forEach(function (name) {
      var file = path.join(dir, name);
      if (fs.statSync(file).isDirectory()) remove(file); else fs.unlinkSync(file);
    });
    fs.rmdirSync(dir);
  })(temp);
}
console.log('ALL test-personal-home.js assertions passed!');
