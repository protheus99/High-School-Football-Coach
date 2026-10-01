"""
Builds importable state district files (public/leagues/) from the state database tables in the
design spec text ("HSFC - updated code.txt").

Usage:  python scripts/build-state-leagues.py "<path to HSFC - updated code.txt>"

Tables come in two forms: markdown rows (| **School** | Location | Mascot | PPI | Offense | Defense |)
and box-drawing tables (│ ... │) whose columns are located from their header row.
Where a state has both a summary and a full database, the full database wins.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

# (first line, last line, state, is_full_database) - 1-based line ranges in the spec text
SECTIONS = [
    (15086, 15116, 'Texas', False), (15117, 15147, 'Florida', False), (15148, 15177, 'Georgia', False),
    (15178, 15207, 'California', False), (15208, 15236, 'Ohio', False), (15237, 15263, 'Pennsylvania', False),
    (15264, 15293, 'Maryland', False),
    (15294, 15701, 'Texas', True), (15702, 15886, 'California', True), (15887, 16000, 'Ohio', True),
    (16001, 16154, 'Pennsylvania', True),
    (16155, 16202, 'Louisiana', False), (16203, 16255, 'Alabama', False), (16256, 16296, 'New Jersey', False),
    (16297, 16339, 'North Carolina', False), (16340, 16398, 'Tennessee', False),
    (16399, 16548, 'Louisiana', True), (16698, 16836, 'Alabama', True), (16837, 16994, 'New Jersey', True),
    (16995, 17207, 'Tennessee', True),
]

MAX_DISTRICT_SIZE = 10

PALETTE = ['#002D62', '#8B0000', '#00573F', '#4B0082', '#C8102E', '#FF6600', '#003087', '#6F263D',
           '#000000', '#1C3F94', '#006747', '#7C2529', '#00205B', '#BA0C2F', '#4F2683', '#00843D']
SECONDARY = ['#FFFFFF', '#FFD700', '#C0C0C0', '#B3A369', '#FFC72C', '#000000']


def offense_scheme(label: str) -> str:
    first = label.split('/')[0].strip().lower()
    if 'air raid' in first or 'up-tempo' in first:
        return 'AIR_RAID'
    if any(k in first for k in ('option', 'wing', 'veer', 'fly')):
        return 'TRIPLE_OPTION'
    if any(k in first for k in ('power', 'pro', 'hammer', 'ground', 't-form')):
        return 'POWER_I'
    return 'SPREAD'


def defense_scheme(label: str) -> str:
    if '4-4' in label:
        return 'FOUR_FOUR'
    if '4-2-5' in label or '3-3-5' in label:
        return 'THREE_THREE_FIVE'
    if 'drop' in label.lower() or '3-2-6' in label:
        return 'DROP_EIGHT'
    return 'FOUR_THREE'


def colors(name: str) -> tuple:
    h = int(hashlib.md5(name.encode()).hexdigest(), 16)
    return PALETTE[h % len(PALETTE)], SECONDARY[(h // 7) % len(SECONDARY)]


def slug(text: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')


def parse(lines):
    states = {}  # state -> {'full': bool, 'districts': {name: [schools]}}
    for first, last, state, full in SECTIONS:
        entry = states.setdefault(state, {'full': False, 'districts': {}})
        if entry['full'] and not full:
            continue
        if full and not entry['full']:
            entry.update(full=True, districts={})  # full database replaces the summary
        heading = None
        box_columns = None  # column positions for the current box-drawing table
        for line in lines[first - 1:last]:
            row = None
            if line.startswith('#'):
                heading = re.sub(r'^#+\s*', '', line).replace('*', '').strip()
                heading = re.sub(r'^\d+\.\s*', '', heading)
            elif line.startswith('| **'):
                cells = [c.strip() for c in line.strip().strip('|').split('|')]
                if len(cells) >= 6:
                    row = {'name': cells[0], 'mascot': cells[2], 'ppi': cells[3], 'offense': cells[4], 'defense': cells[5]}
            elif line.startswith('│'):
                cells = [c.strip() for c in line.strip().strip('│').split('│')]
                lowered = [c.lower() for c in cells]
                if any('school' in c for c in lowered):
                    find = lambda *keys: next((i for i, c in enumerate(lowered) if any(k in c for k in keys)), None)
                    box_columns = {'name': find('school'), 'mascot': find('mascot'), 'ppi': find('ppi'),
                                   'offense': find('offense', 'scheme'), 'defense': find('defense', 'front')}
                elif box_columns and box_columns['name'] is not None and len(cells) > max(v for v in box_columns.values() if v is not None):
                    row = {k: (cells[i] if i is not None else '') for k, i in box_columns.items()}
            if row and heading:
                name = row['name'].replace('*', '').strip()
                name = re.sub(r'\s*\((National|Private)\)$', '', name)
                mascot = re.sub(r'\s*\(.*\)$', '', row['mascot']).strip()
                try:
                    prestige = int(re.sub(r'[^0-9]', '', row['ppi']))
                except ValueError:
                    prestige = 70
                primary, secondary = colors(name)
                school = {
                    'name': name, 'mascot': mascot, 'primaryColor': primary, 'secondaryColor': secondary,
                    'prestige': max(40, min(99, prestige)),
                    'offenseScheme': offense_scheme(row['offense']), 'defenseScheme': defense_scheme(row['defense'])
                }
                district = entry['districts'].setdefault(heading, [])
                if name and all(s['name'] != name for s in district):
                    district.append(school)
    return states


def main():
    source = Path(sys.argv[1])
    out = Path(__file__).resolve().parent.parent / 'public' / 'leagues'
    lines = source.read_text(encoding='utf-8').split('\n')
    index = []
    for state, entry in sorted(parse(lines).items()):
        districts = []
        groups = []
        for name, schools in entry['districts'].items():
            if len(schools) > MAX_DISTRICT_SIZE:
                # Statewide ranking lists are split into district-sized groups in listed order
                count = -(-len(schools) // 8)
                size = -(-len(schools) // count)
                groups += [(f'{name} (Group {g + 1})', schools[g * size:(g + 1) * size]) for g in range(count)]
            else:
                groups.append((name, schools))
        for name, schools in groups:
            if len(schools) < 4:
                continue  # the importer needs at least 4 schools
            file = f'{slug(state)}/{slug(name)}.json'
            payload = {'state': state, 'classification': '6A', 'districtId': f'{slug(state)}_{slug(name)}',
                       'districtName': name, 'schools': schools}
            (out / slug(state)).mkdir(parents=True, exist_ok=True)
            (out / file).write_text(json.dumps(payload, indent=2) + '\n', encoding='utf-8')
            districts.append({'name': name, 'file': file, 'schools': len(schools)})
        if districts:
            index.append({'state': state, 'districts': districts})
    (out / 'index.json').write_text(json.dumps(index, indent=2) + '\n', encoding='utf-8')
    print(f"{sum(len(s['districts']) for s in index)} districts across {len(index)} states")
    for s in index:
        print(f"  {s['state']}: {len(s['districts'])} districts, {sum(d['schools'] for d in s['districts'])} schools")


TEXAS_FULL_DATABASE = (15294, 15701)


def build_texas_world(lines, out_file: Path):
    """Texas 6A as one structure (4 regions, 32 districts, every program) for the default game world."""
    regions = []
    first, last = TEXAS_FULL_DATABASE
    district = None
    for line in lines[first - 1:last]:
        region_match = re.match(r'^# (Region \d+) \((.*)\)', line)
        district_match = re.match(r'^### District (\d+)-6A \((.*)\)', line)
        if region_match:
            regions.append({'name': region_match.group(1), 'area': region_match.group(2), 'districts': []})
        elif district_match and regions:
            district = {'number': int(district_match.group(1)), 'name': f'District {district_match.group(1)}-6A',
                        'area': district_match.group(2), 'schools': []}
            regions[-1]['districts'].append(district)
        elif line.startswith('| **') and district is not None:
            cells = [c.strip() for c in line.strip().strip('|').split('|')]
            if len(cells) < 6:
                continue
            name = cells[0].replace('*', '').strip()
            if any(s['name'] == name for s in district['schools']):
                continue
            primary, secondary = colors(name)
            district['schools'].append({
                'name': name, 'city': cells[1], 'mascot': re.sub(r'\s*\(.*\)$', '', cells[2]).strip(),
                'prestige': max(40, min(99, int(re.sub(r'[^0-9]', '', cells[3]) or 70))),
                'primaryColor': primary, 'secondaryColor': secondary,
                'offenseScheme': offense_scheme(cells[4]), 'defenseScheme': defense_scheme(cells[5])
            })
    out_file.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps({'state': 'Texas', 'classification': '6A', 'regions': regions}, indent=1) + '\n', encoding='utf-8')
    districts = [d for r in regions for d in r['districts']]
    print(f"Texas world: {len(regions)} regions, {len(districts)} districts, {sum(len(d['schools']) for d in districts)} schools")


if __name__ == '__main__':
    main()
    build_texas_world(Path(sys.argv[1]).read_text(encoding='utf-8').split('\n'),
                      Path(__file__).resolve().parent.parent / 'src' / 'data' / 'texas-6a.json')
