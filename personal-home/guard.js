/* Installed outside Glasshouse's release files. Only exact, unique patch
 * contexts are accepted: a changed Home stays stock rather than being guessed. */
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var execFile = require('child_process').execFile;

function hash(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}
function writeAtomic(file, text) {
  fs.writeFileSync(file + '.new', text, { mode: parseInt('600', 8) });
  fs.renameSync(file + '.new', file);
}
function replaceExact(text, edits, reverse) {
  if (!Array.isArray(edits) || !edits.length) throw new Error('Theme has no replacements');
  edits.forEach(function (edit, i) {
    var before = reverse ? edit.after : edit.before, after = reverse ? edit.before : edit.after;
    if (typeof before !== 'string' || !before || typeof after !== 'string') throw new Error('Invalid replacement ' + i);
    var at = text.indexOf(before);
    if (at < 0 || text.indexOf(before, at + 1) !== -1) throw new Error('Home changed near replacement ' + (i + 1));
    text = text.slice(0, at) + after + text.slice(at + before.length);
  });
  return text;
}
function updating(installDir) {
  return fs.existsSync(path.join(installDir, '.update')) || fs.existsSync(path.join(installDir, '.deploy'));
}

function applyTheme(installDir, themeDir) {
  if (fs.existsSync(path.join(themeDir, 'disabled'))) return { state: 'disabled' };
  var home = path.join(installDir, 'assets/home.html');
  if (!fs.existsSync(home) || updating(installDir)) return { state: 'waiting' };
  var source = fs.readFileSync(home, 'utf8'), sourceHash = hash(source);
  var patchText = fs.readFileSync(path.join(themeDir, 'patch.json'), 'utf8');
  var patch = JSON.parse(patchText), patchHash = hash(patchText);
  var statusFile = path.join(themeDir, 'status.json'), previous = readJson(statusFile) || {};
  if (previous.activeSha256 === sourceHash && previous.patchSha256 === patchHash) return { state: 'active' };
  if (previous.state === 'review-required' && previous.sourceSha256 === sourceHash && previous.patchSha256 === patchHash) return { state: 'unchanged' };
  var stock = source, themed, alreadyInstalled = sourceHash === patch.customSha256;
  try {
    if (alreadyInstalled) {
      stock = replaceExact(source, patch.edits, true);
      if (hash(stock) !== patch.baseSha256) throw new Error('Original Home does not match the saved base');
      themed = source;
    } else {
      themed = replaceExact(source, patch.edits, false);
    }
  } catch (e) {
    var refused = { state: 'review-required', sourceSha256: sourceHash, patchSha256: patchHash, reason: e.message };
    writeAtomic(statusFile, JSON.stringify(refused) + '\n');
    return refused;
  }
  // An installer may have replaced the page while the candidate was prepared.
  if (updating(installDir) || hash(fs.readFileSync(home, 'utf8')) !== sourceHash) return { state: 'waiting' };
  writeAtomic(path.join(themeDir, 'last-stock-home.html'), stock);
  writeAtomic(path.join(themeDir, 'last-themed-home.html'), themed);
  if (!alreadyInstalled) {
    var pending = home + '.personal-new';
    fs.writeFileSync(pending, themed, { mode: parseInt('644', 8) });
    fs.renameSync(pending, home);
  }
  var status = { state: 'active', sourceSha256: hash(stock), activeSha256: hash(themed), patchSha256: patchHash,
    appliedAt: new Date().toISOString() };
  writeAtomic(statusFile, JSON.stringify(status) + '\n');
  return { state: alreadyInstalled ? 'active' : 'restored' };
}

function run(installDir, themeDir) {
  var busy = false, lastError = '', timer, observedMtime = null, settledSince = 0;
  function notify(message) {
    execFile('/usr/bin/luna-send', ['-n', '1', '-w', '3000', 'luna://com.webos.notification/createToast', JSON.stringify({ message: message })],
      { timeout: 5000 }, function () {});
  }
  function check() {
    if (busy) return;
    busy = true;
    try {
      if (fs.existsSync(path.join(themeDir, 'disabled'))) { clearInterval(timer); busy = false; return; }
      var home = path.join(installDir, 'assets/home.html');
      if (updating(installDir)) { observedMtime = null; busy = false; return; }
      var mtime = fs.existsSync(home) ? Number(fs.statSync(home).mtime) : null;
      if (mtime !== observedMtime) { observedMtime = mtime; settledSince = Date.now(); }
      // Leave time for the installer's service restart after it removes staging.
      if (mtime !== null && Date.now() - settledSince < 15000) { busy = false; return; }
      var result = applyTheme(installDir, themeDir);
      lastError = '';
      if (result.state === 'disabled') { clearInterval(timer); busy = false; return; }
      if (result.state === 'review-required') notify('The custom Home needs a compatibility check. The current Home is unchanged and the saved theme is kept.');
      if (result.state !== 'restored') { busy = false; return; }
      // Glasshouse caches assets in memory, so replacing the file needs one restart.
      execFile('/bin/sh', [path.join(installDir, 'tvwebctl'), 'restart'], { timeout: 30000 }, function (error) {
        busy = false;
        if (error) {
          var status = readJson(path.join(themeDir, 'status.json')) || {};
          status.state = 'restart-required';
          try { writeAtomic(path.join(themeDir, 'status.json'), JSON.stringify(status) + '\n'); } catch (e) {}
          notify('The custom Home is restored. Restart the TV to finish loading it.');
        }
      });
    } catch (error) {
      busy = false;
      if (error.message !== lastError) {
        lastError = error.message;
        try { writeAtomic(path.join(themeDir, 'status.json'), JSON.stringify({ state: 'error', reason: error.message }) + '\n'); } catch (e) {}
        notify('Custom Home protection needs attention. The current Home remains available.');
      }
    }
  }
  timer = setInterval(check, 5000);
  check();
}

if (require.main === module) run('/var/lib/tvweb', __dirname);
module.exports = { replaceExact: replaceExact, applyTheme: applyTheme };
