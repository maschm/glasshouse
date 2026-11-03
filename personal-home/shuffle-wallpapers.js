/* The four upload slots point to current.jpg. Changing that link lets the
 * existing Home heartbeat crossfade to the next photo without a restart. */
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var HOUR = 60 * 60 * 1000;
var slots = ['morning', 'afternoon', 'evening', 'night'];
var photos = ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5.jpg', '6.jpg'];

function deck(start, round) {
  return photos.map(function (file) {
    return { file: file, key: crypto.createHash('sha256').update([start, round, file].join(':')).digest('hex') };
  }).sort(function (a, b) { return a.key.localeCompare(b.key); }).map(function (card) { return card.file; });
}

function photoForHour(start, now) {
  var hour = Math.max(0, Math.floor((now - start) / HOUR));
  var round = Math.floor(hour / photos.length), order = deck(start, round);
  // The previous deck's last card is unaffected by a swap of its first two.
  if (round && order[0] === deck(start, round - 1)[photos.length - 1]) {
    var first = order[0]; order[0] = order[1]; order[1] = first;
  }
  return order[hour % photos.length];
}

function linkTarget(file) {
  try { return fs.readlinkSync(file); }
  catch (e) { if (e.code === 'ENOENT' || e.code === 'EINVAL') return null; throw e; }
}

function rotate(dir, uploads, start, now) {
  var current = path.join(dir, 'current.jpg');
  // A manual upload or deletion stops the shuffle and keeps the user's edit.
  if (fs.existsSync(path.join(dir, 'disabled')) || !slots.every(function (slot) {
    return linkTarget(path.join(uploads, slot + '.jpg')) === current;
  })) return null;
  var photo = photoForHour(start, now);
  if (linkTarget(current) !== photo) {
    if (!fs.statSync(path.join(dir, photo)).isFile()) throw new Error('Wallpaper photo is not a file');
    var next = current + '.' + process.pid + '.new';
    fs.symlinkSync(photo, next);
    try { fs.renameSync(next, current); } catch (e) { fs.unlinkSync(next); throw e; }
  }
  return photo;
}

if (require.main === module) {
  var start = Number(fs.readFileSync(path.join(__dirname, 'started'), 'utf8'));
  if (!isFinite(start) || start <= 0) throw new Error('Invalid wallpaper start time');
  var timer, lastError = '';
  function refresh() {
    try {
      var photo = rotate(__dirname, '/var/lib/tvweb/home-wallpaper-uploads', start, Date.now());
      lastError = '';
      if (!photo) clearInterval(timer);
    } catch (e) {
      if (lastError !== e.message) console.error(e.message);
      lastError = e.message;
    }
  }
  timer = setInterval(refresh, 15000);
  refresh();
}

module.exports = { photoForHour: photoForHour, rotate: rotate };
