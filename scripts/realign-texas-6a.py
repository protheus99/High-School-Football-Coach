"""Realigns the hand-tuned Texas 6A world (src/data/texas-6a.json) and its importable district files (public/leagues/texas/)
to the UIL 2026-28 football alignment.

    python scripts/realign-texas-6a.py [expansionDir]

The 6A membership and district numbers come from the expansion data (expansion/final/texas.csv, Class 6A), which is built
from the UIL 2026-28 PDFs (expansion/texas_uil_2026.py). A school already in the world keeps its hand-tuned entry (name,
short name, mascot, colors, prestige, schemes), so its id and every save keep finding it; a school new to 6A gets its
expansion row (PPI as prestige) with the team data's colors and schemes. Regions follow UIL: districts 1-8, 9-16, 17-24
and 25-32. build-state-leagues.py runs this after it rebuilds Texas from the design spec, so the alignment is not lost.
"""
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
WORLD = REPO / 'src' / 'data' / 'texas-6a.json'
LEAGUES = REPO / 'public' / 'leagues'
TEAMS = REPO / 'src' / 'data' / 'teams' / 'texas.json'

# expansion FullName -> the world's name for the same school, where the two spell it differently
ALIAS = {
    'Northwest Nelson': 'Northwest Nelson (Byron)',
    'Laredo Johnson': 'Laredo LBJ',
    'Pharr-San Juan-Alamo': 'PSJA High',
}

# District areas for the 2026-28 alignment (labels only)
AREAS = {
    1: 'El Paso Metro', 2: 'Permian Basin & West Texas', 3: 'Arlington, Parker & Hood County',
    4: 'Keller, Northwest ISD & Southlake', 5: 'Denton & Lewisville ISD', 6: 'Collin County / North DFW',
    7: 'Plano, Richardson & Coppell', 8: 'HEB, Irving & Grand Prairie', 9: 'Garland & Wylie',
    10: 'East Texas & Rockwall', 11: 'The DFW "District of Doom"', 12: 'Central Texas / Brazos Valley',
    13: 'North Houston / Conroe ISD', 14: 'North Houston / Spring & Aldine ISD', 15: 'Northwest Houston / Klein & Tomball',
    16: 'Cy-Fair ISD', 17: 'East Houston & Humble ISD', 18: 'Clear Creek ISD & the Bay Area',
    19: 'Pearland, Brazoria & Pasadena', 20: 'Houston ISD, Alief & Spring Branch', 21: 'Fort Bend ISD',
    22: 'Katy ISD', 23: 'Cy-Fair West, Lamar CISD & Waller', 24: 'Leander, Cedar Park & Hutto',
    25: 'Round Rock ISD & West Austin', 26: 'Central Austin & Hays County', 27: 'Northeast San Antonio & Comal County',
    28: 'San Antonio North East ISD', 29: 'San Antonio Northside ISD', 30: 'Laredo, Eagle Pass & Del Rio',
    31: 'Rio Grande Valley Upper', 32: 'Rio Grande Valley Coastal / Lower',
}
REGION_AREAS = {
    1: 'West Texas, North Texas & DFW West',
    2: 'East DFW, Central Texas & North Houston',
    3: 'Houston, Katy, Fort Bend & the Gulf Coast',
    4: 'Austin, San Antonio, Laredo & the Rio Grande Valley',
}


def key(name: str) -> str:
    s = name.lower().replace('&', ' and ')
    s = re.sub(r'\b(high|senior|school|the)\b', ' ', s)
    return re.sub(r'[^a-z0-9]', '', s)


def find_expansion(arg):
    if arg:
        return Path(arg)
    for p in [REPO, *REPO.parents]:
        if (p / 'expansion' / 'final' / 'texas.csv').exists():
            return p / 'expansion'
    sys.exit('expansion/final/texas.csv not found; pass the expansion folder')


def read_csv(path):
    import csv
    with open(path, encoding='utf-8', newline='') as fh:
        return list(csv.DictReader(fh))


def slug(text: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')


def main():
    exp = find_expansion(sys.argv[1] if len(sys.argv) > 1 else None)
    rows = [r for r in read_csv(exp / 'final' / 'texas.csv') if r['Class'] == '6A']
    world = json.loads(WORLD.read_text(encoding='utf-8'))
    old = {}
    old_district = {}
    for reg in world['regions']:
        for d in reg['districts']:
            for s in d['schools']:
                old[key(s['name'])] = s
                old_district[key(s['name'])] = d
    team_data = json.loads(TEAMS.read_text(encoding='utf-8'))
    data_school = {}
    for c in team_data['classes']:
        if c['className'] != '6A':
            continue
        for d in c['districts']:
            for s in d['schools']:
                data_school[key(s['name'])] = s

    districts = {n: [] for n in range(1, 33)}
    kept, added, used = [], [], set()
    overlap = {n: {} for n in range(1, 33)}
    for r in rows:
        num = int(r['District'].split('-')[0])
        k = key(ALIAS.get(r['FullName'], r['FullName']))
        if k in old and k not in used:
            entry = dict(old[k])
            used.add(k)
            kept.append(entry['name'])
            od = old_district[k]['area']
            overlap[num][od] = overlap[num].get(od, 0) + 1
        else:
            ds = data_school.get(key(r['FullName']), {})
            entry = {'name': r['FullName']}
            if len(r['FullName']) > 12 and r['ShortName'] and r['ShortName'] != r['FullName']:
                entry['shortName'] = r['ShortName']
            entry.update({
                'city': r['City'], 'mascot': r['Mascot'] or ds.get('mascot', ''),
                'prestige': max(40, min(99, round(float(r['PPI'] or 70)))),
                'primaryColor': ds.get('primaryColor', '#475569'), 'secondaryColor': ds.get('secondaryColor', '#FFFFFF'),
                'offenseScheme': ds.get('offenseScheme', 'SPREAD'), 'defenseScheme': ds.get('defenseScheme', 'FOUR_THREE'),
            })
            added.append((r['FullName'], num))
        districts[num].append(entry)
    dropped = [s['name'] for k, s in old.items() if k not in used]

    regions = []
    for i in range(4):
        reg = {'name': f'Region {i + 1}', 'area': REGION_AREAS[i + 1], 'districts': []}
        for num in range(i * 8 + 1, i * 8 + 9):
            best = max(overlap[num].items(), key=lambda kv: kv[1])[0] if overlap[num] else ''
            area = AREAS.get(num, best)
            reg['districts'].append({'number': num, 'name': f'District {num}-6A', 'area': area,
                                     'schools': sorted(districts[num], key=lambda s: s['name'])})
        regions.append(reg)
    world = {'state': 'Texas', 'classification': '6A', 'regions': regions}
    WORLD.write_text(json.dumps(world, indent=1, ensure_ascii=False) + '\n', encoding='utf-8')

    # importable district files: one per district, same shape build-state-leagues.py writes
    out = LEAGUES / 'texas'
    for f in out.glob('*.json'):
        f.unlink()
    index_path = LEAGUES / 'index.json'
    index = json.loads(index_path.read_text(encoding='utf-8'))
    entries = []
    for reg in regions:
        for d in reg['districts']:
            name = f"{d['name']} ({d['area']})"
            file = f"texas/{slug(name)}.json"
            schools = [{k: v for k, v in s.items() if k not in ('city', 'shortName')} for s in d['schools']]
            payload = {'state': 'Texas', 'classification': '6A', 'districtId': f"texas_{slug(name)}", 'districtName': name,
                       'schools': schools}
            (LEAGUES / file).write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
            entries.append({'name': name, 'file': file, 'schools': len(schools)})
    index = [e for e in index if e['state'] != 'Texas'] + [{'state': 'Texas', 'districts': entries}]
    index.sort(key=lambda e: e['state'])
    index_path.write_text(json.dumps(index, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    print(f'Texas 6A 2026-28: {sum(len(v) for v in districts.values())} schools ({len(kept)} kept, {len(added)} new, {len(dropped)} left 6A)')
    print('NEW:', added)
    print('LEFT 6A:', sorted(dropped))
    for num in range(1, 33):
        print(f'  {num}: {AREAS.get(num) or "(from overlap)"} | overlap {overlap[num]}')


if __name__ == '__main__':
    main()
