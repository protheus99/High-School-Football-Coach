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

# Full top classifications from official alignments, for states the spec only summarizes
CURATED_SOURCE = Path(__file__).resolve().parent / 'state-sources' / 'top-classes.json'
OFFENSE_MIX = ['SPREAD', 'SPREAD', 'SPREAD', 'POWER_I', 'POWER_I', 'AIR_RAID', 'TRIPLE_OPTION']
DEFENSE_MIX = ['FOUR_THREE', 'FOUR_THREE', 'THREE_THREE_FIVE', 'FOUR_FOUR', 'DROP_EIGHT']


def norm(name: str) -> str:
    return re.sub(r'[^a-z0-9]', '', name.lower())


def spec_alias(rated, name):
    """The spec sometimes names a school differently (Miami Christopher Columbus / Columbus, Chambers (Vance) / Chambers)."""
    key = norm(name)
    matches = [sc for k, sc in rated.items() if min(len(k), len(key)) >= 6 and (key in k or k in key)]
    return matches[0] if len(matches) == 1 else None


def curated_states(parsed):
    """States with a full curated list replace the spec's summary; the spec's ratings and schemes win when it has the school."""
    if not CURATED_SOURCE.exists():
        return {}
    data = json.loads(CURATED_SOURCE.read_text(encoding='utf-8'))
    result = {}
    for state, info in data.items():
        if state.startswith('_'):
            continue
        rated = {norm(sc['name']): sc for d in parsed.get(state, {'districts': {}})['districts'].values() for sc in d}
        districts = {}
        for district in info['districts']:
            schools = []
            for name, city, mascot, prestige in district['schools']:
                spec = rated.get(norm(name)) or spec_alias(rated, name)
                h = int(hashlib.md5(name.encode()).hexdigest(), 16)
                primary, secondary = colors(name)
                schools.append({
                    'name': name, 'city': city, 'mascot': mascot, 'primaryColor': primary, 'secondaryColor': secondary,
                    'prestige': spec['prestige'] if spec else prestige,
                    'offenseScheme': spec['offenseScheme'] if spec else OFFENSE_MIX[h % len(OFFENSE_MIX)],
                    'defenseScheme': spec['defenseScheme'] if spec else DEFENSE_MIX[(h // 11) % len(DEFENSE_MIX)]
                })
            districts[district['name']] = schools
        result[state] = {'classification': info['classification'], 'districts': districts}
    return result

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
                # Clean markdown escapes (State College Area\*) and names cut off at a table column (Memphis University (MUS)
                name = row['name'].replace('*', '').replace(chr(92), '').strip()
                if name.count('(') > name.count(')'):
                    name += ')'
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
    parsed = parse(lines)
    curated = curated_states(parsed)
    for state, info in curated.items():
        parsed[state] = {'full': True, 'districts': info['districts'], 'classification': info['classification']}
        for old in (out / slug(state)).glob('*.json'):
            old.unlink()  # the summary files are replaced by the full list
    for state, entry in sorted(parsed.items()):
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
            payload = {'state': state, 'classification': entry.get('classification', '6A'), 'districtId': f'{slug(state)}_{slug(name)}',
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


# Curated states that get a bundled statewide world (like Texas) in src/data: state -> output file
STATE_WORLD_FILES = {'Georgia': 'georgia-7a.json', 'Florida': 'florida-6a.json', 'Maryland': 'maryland-4a.json',
                     'North Carolina': 'north-carolina-8a.json', 'Alabama': 'alabama-6a.json'}


def build_curated_worlds(out_dir: Path):
    """A playable state's whole top class as one structure: one league region holding every district."""
    parsed = parse(Path(sys.argv[1]).read_text(encoding='utf-8').split('\n'))
    curated = curated_states(parsed)
    for state, file in STATE_WORLD_FILES.items():
        info = curated[state]
        districts = []
        for number, (name, schools) in enumerate(info['districts'].items(), start=1):
            match = re.match(r'^(.*?)\s*\((.*)\)$', name)
            districts.append({'number': number, 'name': match.group(1) if match else name, 'area': match.group(2) if match else state,
                              'schools': schools})
        world = {'state': state, 'classification': info['classification'],
                 'regions': [{'name': f"Class {info['classification']}", 'area': state, 'districts': districts}]}
        (out_dir / file).write_text(json.dumps(world, indent=1) + '\n', encoding='utf-8')
        print(f"{state} world: {len(districts)} districts, {sum(len(d['schools']) for d in districts)} schools")


def build_spec_worlds(leagues_dir: Path, out_dir: Path):
    """Statewide worlds for states whose spec database is their whole top class (Tennessee 6A, Ohio Division I),
    built from the district files written above."""
    index = json.loads((leagues_dir / 'index.json').read_text(encoding='utf-8'))
    files = {e['state']: [json.loads((leagues_dir / d['file']).read_text(encoding='utf-8')) for d in e['districts']] for e in index}

    # Tennessee 6A: the eight regions (the Division II-AAA private groups play their own playoffs)
    districts = []
    for d in files['Tennessee']:
        match = re.match(r'^Region (\d+)-6A \((.*)\)$', d['districtName'])
        if match:
            districts.append({'number': int(match.group(1)), 'name': f"Region {match.group(1)}-6A", 'area': match.group(2), 'schools': d['schools']})
    districts.sort(key=lambda d: d['number'])
    write_world(out_dir / 'tennessee-6a.json', 'Tennessee', '6A', districts)

    # Ohio Division I: four playoff regions. The spec splits each region into prestige tiers, so each region's
    # schools are dealt (snake order by prestige) into three balanced leagues instead.
    regions = {}
    for d in files['Ohio']:
        match = re.match(r'^Region (\d+) \((.*?)\)', d['districtName'])
        regions.setdefault(int(match.group(1)), {'area': match.group(2), 'schools': []})['schools'].extend(d['schools'])
    districts = []
    for number in sorted(regions):
        for j, league_schools in enumerate(deal(regions[number]['schools'], 3)):
            districts.append({'number': len(districts) + 1, 'name': f"Region {number} League {'ABC'[j]}", 'area': regions[number]['area'], 'schools': league_schools})
    write_world(out_dir / 'ohio-d1.json', 'Ohio', 'Division I', districts)

    # Pennsylvania 6A: PIAA districts in the spec's order; District 1, 3 and 11 come split into prestige tiers, so
    # each is dealt into balanced leagues (same number of leagues as tiers)
    groups = {}
    for d in files['Pennsylvania']:
        parent = re.match(r'^(District [\d &]+?)\s*(?:/|—|$)', d['districtName']).group(1).strip()
        area = re.search(r'— (.*?)(?: \(Group \d+\))?$', d['districtName'])
        area_name = (area.group(1) if area else 'Pennsylvania').replace('Class 6A (', 'WPIAL (')
        entry = groups.setdefault(parent, {'area': area_name, 'tiers': 0, 'schools': []})
        entry['tiers'] += 1
        entry['schools'].extend(d['schools'])
    districts = []
    for parent, entry in groups.items():
        leagues = deal(entry['schools'], entry['tiers'])
        for j, league_schools in enumerate(leagues):
            name = parent if len(leagues) == 1 else f"{parent} League {'ABC'[j]}"
            districts.append({'number': len(districts) + 1, 'name': name, 'area': entry['area'], 'schools': league_schools})
    write_world(out_dir / 'pennsylvania-6a.json', 'Pennsylvania', '6A', districts)

    # New Jersey: Non-Public A and Public Group 5 (North and South super sections), each dealt into leagues;
    # the South's 24 schools become two leagues of 12 (Central and South) so each playoff region has a full field
    def nj(prefix: str) -> list:
        return [s for d in files['New Jersey'] if d['districtName'].startswith(prefix) for s in d['schools']]
    districts = []
    for name, schools, count in [('Non-Public A', nj('NJSIAA Non-Public Group A'), 2), ('Group 5 North', nj('Public Group 5 — North'), 3)]:
        for j, league_schools in enumerate(deal(schools, count)):
            districts.append({'number': len(districts) + 1, 'name': f"{name} League {'ABC'[j]}", 'area': name, 'schools': league_schools})
    for j, league_schools in enumerate(deal(nj('Public Group 5 — South'), 2)):
        name = ['Group 5 Central', 'Group 5 South'][j]
        districts.append({'number': len(districts) + 1, 'name': name, 'area': name, 'schools': league_schools})
    write_world(out_dir / 'new-jersey-g5.json', 'New Jersey', 'Group 5', districts)

    # Louisiana: the ten 5A districts as they are
    districts = []
    for d in files['Louisiana']:
        match = re.match(r'^District (\d+)-5A \((.*)\)$', d['districtName'])
        districts.append({'number': int(match.group(1)), 'name': f"District {match.group(1)}-5A", 'area': match.group(2), 'schools': d['schools']})
    districts.sort(key=lambda d: d['number'])
    write_world(out_dir / 'louisiana-5a.json', 'Louisiana', '5A', districts)

    # California: the top tier of CIF's biggest sections (Southern Section leagues, San Diego, the Bay Area and the
    # Central Valley). San Diego comes as two prestige tiers, dealt into two balanced leagues after the Southern
    # Section, so the playoff regions are leagues 1-5, 6-7, 8-9 and 10-11
    leagues, san_diego = [], []
    for d in files['California']:
        section, rest = d['districtName'].split(' — ', 1)
        if '(Group' in rest:
            san_diego.extend(d['schools'])
            continue
        match = re.match(r'^(.*?) \(([^()]*)\)$', rest)
        leagues.append({'name': match.group(1) if match else rest, 'area': f"{section} ({match.group(2)})" if match else section, 'schools': d['schools']})
    san_diego_leagues = [{'name': f"San Diego League {'AB'[j]}", 'area': 'San Diego Section', 'schools': s} for j, s in enumerate(deal(san_diego, 2))]
    districts = [{'number': i + 1, **league} for i, league in enumerate(leagues[:5] + san_diego_leagues + leagues[5:])]
    write_world(out_dir / 'california-open.json', 'California', 'Open Division', districts)


def deal(schools: list, count: int) -> list:
    """Splits schools into `count` balanced leagues: snake order by prestige (1-2-3, 3-2-1, ...)."""
    leagues = [[] for _ in range(count)]
    for i, school in enumerate(sorted(schools, key=lambda s: -s['prestige'])):
        row, col = divmod(i, count)
        leagues[col if row % 2 == 0 else count - 1 - col].append(school)
    return leagues


# Schools that share a name within a state (team ids come from names): renamed the way they are told apart locally
SCHOOL_RENAMES = {'California': {('Liberty', 'Lions'): 'Brentwood Liberty', ('Liberty', 'Patriots'): 'Bakersfield Liberty'}}


def write_world(path: Path, state: str, classification: str, districts: list):
    renames = SCHOOL_RENAMES.get(state, {})
    for d in districts:
        d['schools'] = [{**s, 'name': renames.get((s['name'], s['mascot']), s['name'])} for s in d['schools']]
    names = [s['name'] for d in districts for s in d['schools']]
    duplicates = sorted({n for n in names if names.count(n) > 1})
    if duplicates:
        raise SystemExit(f"{state}: duplicate school names {duplicates}; add them to SCHOOL_RENAMES")
    label = f"Class {classification}" if re.match(r'^[0-9]+A$', classification) else classification
    world = {'state': state, 'classification': classification, 'regions': [{'name': label, 'area': state, 'districts': districts}]}
    path.write_text(json.dumps(world, indent=1) + '\n', encoding='utf-8')
    print(f"{state} world: {len(districts)} districts, {sum(len(d['schools']) for d in districts)} schools")


if __name__ == '__main__':
    main()
    build_curated_worlds(Path(__file__).resolve().parent.parent / 'src' / 'data')
    build_spec_worlds(Path(__file__).resolve().parent.parent / 'public' / 'leagues', Path(__file__).resolve().parent.parent / 'src' / 'data')
    build_texas_world(Path(sys.argv[1]).read_text(encoding='utf-8').split('\n'),
                      Path(__file__).resolve().parent.parent / 'src' / 'data' / 'texas-6a.json')
