#!/usr/bin/env python3
"""Build exact, unique text replacements from the stock Home to the personal Home."""
import difflib
import hashlib
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent.parent
stock = subprocess.check_output(
    ['git', 'show', 'v0.138.0:server/assets/home.html'], cwd=root
).decode('utf-8')
custom = (root / 'server/assets/home.html').read_text()
before, after = stock.splitlines(keepends=True), custom.splitlines(keepends=True)
edits = []
for group in difflib.SequenceMatcher(None, before, after, autojunk=False).get_grouped_opcodes(3):
    edits.append({
        'before': ''.join(before[group[0][1]:group[-1][2]]),
        'after': ''.join(after[group[0][3]:group[-1][4]]),
    })
result = stock
for edit in edits:
    assert result.count(edit['before']) == 1, 'Patch context must be unique'
    result = result.replace(edit['before'], edit['after'], 1)
assert edits and result == custom, 'Patch must reproduce the reviewed Home exactly'
patch = {
    'baseVersion': '0.138.0',
    'baseSha256': hashlib.sha256(stock.encode()).hexdigest(),
    'customSha256': hashlib.sha256(custom.encode()).hexdigest(),
    'edits': edits,
}
(root / 'personal-home/patch.json').write_text(json.dumps(patch, indent=2) + '\n')
print(f'Built {len(edits)} exact Home replacements; complete result verified')
