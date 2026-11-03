var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var source = fs.readFileSync(path.join(__dirname, '../server/assets/home.html'), 'utf8');
var start = source.indexOf('  function dockNext(');
var end = source.indexOf('\n  function move(', start);
assert.ok(start > 0 && end > start, 'dock navigation exists');
var next = vm.runInNewContext(source.slice(start, end) + '\ndockNext;');

assert.strictEqual(next(0, 10, 0, -1), 0, 'left edge stays on first app');
assert.strictEqual(next(4, 10, 0, 1), 4, 'right edge does not wrap into lower line');
assert.strictEqual(next(5, 10, 0, -1), 5, 'lower left edge does not wrap into upper line');
assert.strictEqual(next(2, 10, 1, 0), 7, 'down stays in column');
assert.strictEqual(next(7, 10, -1, 0), 2, 'up stays in column');
assert.strictEqual(next(8, 10, 1, 0), null, 'down from bottom leaves apps');
assert.strictEqual(next(3, 10, -1, 0), null, 'up from top reaches header');
assert.strictEqual(next(4, 6, 1, 0), 5, 'short lower line keeps its last available tile');
assert.strictEqual(next(2, 4, 1, 0), null, 'one-line dock has no phantom second line');
assert.strictEqual(next(4, 20, 0, 1), 10, 'next page keeps upper line');
assert.strictEqual(next(10, 20, 0, -1), 4, 'previous page keeps upper line');
assert.strictEqual(next(9, 20, 0, 1), 15, 'next page keeps lower line');
assert.strictEqual(next(15, 20, 0, -1), 9, 'previous page keeps lower line');
assert.strictEqual(next(9, 12, 0, 1), 9, 'missing lower line on next page is not focused');

function functionSource(name, following) {
  return source.slice(source.indexOf('  function ' + name + '('), source.indexOf('  function ' + following + '('));
}
var pointer = {
  state: { settings: false, rail: false, bar: -1 }, data: {}, layout: {}, layoutBusy: false,
  finder: { open: false }, folder: { open: false }, recents: { open: false },
  scenic: function () { return true; }, searchOn: function () { return true; },
  within: function (target, id) { return target === id; }, applyFocus: function () {},
  openSearch: function () { pointer.opened = 'search'; },
  postJson: function () { pointer.opened = 'settings'; }
};
vm.runInNewContext(functionSource('hoverTile', 'onClick') + functionSource('activate', 'scenic'), pointer);
pointer.hoverTile('scenicSettings');
assert.strictEqual(pointer.state.settings, true, 'pointer focuses settings');
pointer.hoverTile('rail');
pointer.activate();
assert.strictEqual(pointer.state.settings, false, 'search clears settings focus');
assert.strictEqual(pointer.opened, 'search', 'OK on search does not launch settings');
console.log('ALL test-home-dock.js assertions passed!');
