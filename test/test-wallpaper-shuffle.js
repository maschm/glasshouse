var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var shuffle = require('../personal-home/shuffle-wallpapers');
var wallpapers = require('../server/lib/home-wallpapers');
var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glasshouse-shuffle-'));
var uploads = path.join(dir, 'home-wallpaper-uploads');
var current = path.join(dir, 'current.jpg');
var slots = ['morning', 'afternoon', 'evening', 'night'];
var start = 1700000000000, hour = 3600000;
try {
  fs.mkdirSync(uploads);
  fs.writeFileSync(path.join(dir, 'home-wallpaper.json'), '{"choice":"own"}');
  for (var i = 1; i <= 6; i++) {
    var file = path.join(dir, i + '.jpg');
    fs.writeFileSync(file, String(i));
    fs.utimesSync(file, 1700000000 + i, 1700000000 + i);
  }
  slots.forEach(function (slot) { fs.symlinkSync(current, path.join(uploads, slot + '.jpg')); });
  wallpapers.init(dir);
  var previous, revisions = {}, round = {};
  for (var n = 0; n < 24; n++) {
    var now = start + n * hour;
    var photo = shuffle.rotate(dir, uploads, start, now);
    assert.notStrictEqual(photo, previous, 'no adjacent repeat across shuffle rounds');
    assert.ok(!round[photo], 'every photo appears once per round');
    round[photo] = true;
    if (n % 6 === 5) round = {};
    assert.strictEqual(shuffle.rotate(dir, uploads, start, now + hour - 1), photo, 'stable for the entire hour');
    var status = wallpapers.status();
    assert.ok(status.available);
    slots.forEach(function (slot) {
      assert.strictEqual(fs.readFileSync(wallpapers.image(slot), 'utf8') + '.jpg', photo);
    });
    revisions[status.revision] = true;
    previous = photo;
  }
  assert.strictEqual(Object.keys(revisions).length, 6, 'six distinct Glasshouse cache revisions');
  var morning = path.join(uploads, 'morning.jpg');
  fs.unlinkSync(morning);
  fs.writeFileSync(morning, 'manual upload');
  assert.strictEqual(shuffle.rotate(dir, uploads, start, start + 24 * hour), null);
  assert.strictEqual(fs.readFileSync(morning, 'utf8'), 'manual upload');
  assert.strictEqual(fs.readlinkSync(current), previous);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log('Hourly shuffle, revisions and manual upload checks passed');
