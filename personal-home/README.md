# Personal C2 Home protection

Keeps the scenic two-row Home through compatible Glasshouse updates. This is
a separate package for the rooted C2 running webOS 10.3.1 and Node 16.20.2;
the upstream installer does not install it.

The guard reapplies the reviewed changes from stock v0.138.0. All text
replacements must match exactly once before any change is written. Other
changes from the new release are retained. A conflict keeps the installed Home
untouched, preserves the last themed copy and shows one notification requesting
review. Exact text matching cannot establish semantic compatibility with every
future release: check the remote, app launch and Home return after updates.

## Install

Copy `guard.js` and `patch.json` to `/var/lib/glasshouse-home-theme` (directory
mode 0700, files 0600), and `51-glasshouse-home-theme` to
`/var/lib/webosbrew/init.d/51-glasshouse-home-theme` (mode 0755). Run that hook
once. Do not replace Glasshouse's own `50-tvweb` hook. Re-running the hook
leaves an already-running guard alone.

After about 15 seconds, `status.json` in the theme directory should say
`active`, meaning the theme is installed on disk. `last-stock-home.html` and
`last-themed-home.html` are recovery copies. The PID file is
`/var/run/glasshouse-home-theme.pid`. Nothing listens
on a network port, and no credentials are included in this package.

An update normally restores the theme within 15–25 seconds of its files
settling. Glasshouse caches the page in memory, so a notification explains
that a TV restart may be needed to display it. The guard never restarts
Glasshouse: it must not interrupt an app installation. Uploaded wallpapers and
layout settings remain in Glasshouse's existing persistent storage.

## Pause or recover

Create `/var/lib/glasshouse-home-theme/disabled` to stop the guard on its next
check and keep it off at boot. Delete only that marker and run the hook to
resume. For stock Home, disable the guard first, then reinstall the current
official Glasshouse release. The LG Home tile remains the normal escape route.

If `status.json` says `review-required`, keep the new working Home until the
theme has been checked against that release. Do not blindly copy an older
full Home page over a new release. If the theme is `active` on disk but the
previous Home is still showing, restart the TV to load it.

For a revised theme, review `server/assets/home.html`, run
`python3 personal-home/build-patch.py`, and run
`node test/test-personal-home.js` before replacing the package files. The
builder pins the original v0.138.0 base. A theme rebased onto a different stock
release needs its base version and hashes regenerated and tested together.

LG firmware updates, factory resets and loss of root are outside this package.
Future changes to installation paths, boot hooks or Home APIs may require
repair. The last saved theme remains available for that work.

## Background and verification

The minimal dark background is saved as [abstract-slate.jpg](abstract-slate.jpg),
with its [generation prompt](wallpaper.md). Upload it through Home's wallpaper
settings for each of the four time slots. Glasshouse stores these uploads
outside its release assets.

The translucent dock gives the nine household streaming apps their own
gradients. It lifts the marks from the TV's installed artwork when the known
flat colour is present. Apps with other artwork keep their original icons.
The selected tile keeps its gradient and shows its name and a bright outline.

On 3 November 2026, the official v0.138.0 updater reinstalled 165 files on an
OLED65C26LD running webOS 10.3.1. The guard reapplied the custom Home within
20 seconds; the guard, boot hook, settings, layout and all four wallpapers
survived unchanged. A full TV reboot started the guard automatically and
served the custom page. The guard regression suite also passed on the TV's
Node 16.20.2 runtime. API requests without the access token still returned 401.
