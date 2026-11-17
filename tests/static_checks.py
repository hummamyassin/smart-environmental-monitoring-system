"""Recovery-authored static checks; no board, database or credentials required."""
from pathlib import Path
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
firmware = (ROOT / 'firmware/main/main.ino').read_text(encoding='utf-8')
config = (ROOT / 'firmware/main/config.example.h').read_text(encoding='utf-8')
defined = set(re.findall(r'^#define\s+(\w+)', config, re.M))
used = set(re.findall(r'\b(?:PIN_\w+|THRESH_\w+|DUST_\w+|ADC_\w+|WIFI_\w+|FIREBASE_\w+|MQ_WARMUP_MS|SENSOR_READ_MS|DHT_MIN_INTERVAL_MS|SERIAL_DIVIDER|RELAY_ACTIVE_LOW|DHTTYPE)\b', firmware))
assert not used - defined, f'Missing firmware settings: {used - defined}'
for key, value in {'PIN_DHT11':'22','PIN_RELAY':'21','PIN_DUST_AOUT':'0','PIN_DUST_LED':'23','PIN_SOUND':'1','PIN_MQ135':'2'}.items():
    assert re.search(r'^#define\s+' + key + r'\s+' + value + r'\b', config, re.M)
rules = json.loads((ROOT / 'firebase/database.rules.example.json').read_text())
assert rules == {'rules': {'.read': False, '.write': False}}
payload = json.loads((ROOT / 'firebase/latest.example.json').read_text())
fields = set(re.findall(r'\\"(\w+)\\":', firmware))
assert set(payload) == fields, (set(payload), fields)
assert isinstance(payload['fan'], bool) and isinstance(payload['sound'], int)
html = (ROOT / 'web-dashboard/frontend/index.html').read_text(encoding='utf-8')
ids = re.findall(r'\bid="([^"]+)"', html)
assert len(ids) == len(set(ids)), 'Duplicate HTML IDs'
for name in ['config.h', 'web-dashboard/firebase/firebase-config.js', '.env', 'credentials.json']:
    assert subprocess.run(['git', 'check-ignore', '--quiet', '--no-index', name], cwd=ROOT).returncode == 0, name
for p in [ROOT / 'README.md', *(ROOT / 'docs').glob('*.md')]:
    for target in re.findall(r'\]\(([^)]+)\)', p.read_text(encoding='utf-8')):
        if '://' not in target and not target.startswith('#'):
            assert (p.parent / target.split('#')[0]).exists(), f'Broken link {p.name}: {target}'
assert '<<<<<<<' not in (ROOT / 'README.md').read_text(encoding='utf-8')
print(f'PASS: {len(used)} firmware settings, final pin map, deny-all rules, {len(fields)} payload fields, HTML IDs, ignore patterns and documentation links')
