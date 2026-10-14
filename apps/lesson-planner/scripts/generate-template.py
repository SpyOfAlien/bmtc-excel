"""Convert a maintained Excel template to repository JSON. Standard library only."""
from catalog_ids import assign_ids
import base64
import datetime
import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path, PurePosixPath

S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
P = 'http://schemas.openxmlformats.org/package/2006/relationships'
ET.register_namespace('', S)
ET.register_namespace('r', R)

def normalize(value):
    return re.sub(r'\s', '', unicodedata.normalize('NFC', str(value)).lower())

def target_path(source, target):
    path = target if target.startswith('/') else str(PurePosixPath(source).parent / target)
    result = []
    for segment in path.split('/'):
        if segment == '..':
            result.pop()
        elif segment and segment != '.':
            result.append(segment)
    return '/'.join(result)

def point(coord):
    match = re.fullmatch(r'([A-Z]+)(\d+)', coord)
    if not match:
        raise ValueError(f'Invalid cell {coord}')
    col = 0
    for char in match[1]:
        col = col * 26 + ord(char) - 64
    return col, int(match[2])

source = Path(sys.argv[1])
with zipfile.ZipFile(source) as archive:
    parts = {name: archive.read(name) for name in archive.namelist()}
xml = lambda path: ET.fromstring(parts[path])
workbook = xml('xl/workbook.xml')
relations = xml('xl/_rels/workbook.xml.rels')
targets = {relation.get('Id'): target_path('xl/workbook.xml', relation.get('Target')) for relation in relations}
sheets = {normalize(sheet.get('name')): targets[sheet.get(f'{{{R}}}id')] for sheet in workbook.findall(f'.//{{{S}}}sheet')}
plan_path, reference_path = sheets['khgdcn'], sheets['kodcxoa']
plan, reference = xml(plan_path), xml(reference_path)
strings = [''.join(node.itertext()) for node in xml('xl/sharedStrings.xml').findall(f'{{{S}}}si')] if 'xl/sharedStrings.xml' in parts else []
styles = xml('xl/styles.xml')
formats = {int(fmt.get('numFmtId')): fmt.get('formatCode', '') for fmt in styles.findall(f'.//{{{S}}}numFmt')}
date_styles = set()
for index, style in enumerate(styles.find(f'{{{S}}}cellXfs')):
    number = int(style.get('numFmtId', '0'))
    code = re.sub(r'"[^"]*"|\[[^\]]*\]|\\.', '', formats.get(number, ''))
    if 14 <= number <= 22 or 45 <= number <= 47 or re.search('[yd]', code, re.I):
        date_styles.add(index)
properties = workbook.find(f'{{{S}}}workbookPr')
epoch = datetime.datetime(1904, 1, 1) if properties is not None and properties.get('date1904') == '1' else datetime.datetime(1899, 12, 30)

def read_cells(document):
    result = {}
    for cell in document.iter(f'{{{S}}}c'):
        kind = cell.get('t')
        raw = cell.findtext(f'{{{S}}}v', '')
        value = ''
        if kind == 'inlineStr':
            value = ''.join(node.text or '' for node in cell.iter(f'{{{S}}}t'))
        elif raw and kind != 'e':
            if kind == 's': value = strings[int(raw)]
            elif kind in ['str', 'd']: value = raw
            elif kind == 'b': value = raw == '1'
            else:
                number = float(raw)
                value = (epoch + datetime.timedelta(days=number)).date().isoformat() if int(cell.get('s', '0')) in date_styles else int(number) if number.is_integer() else number
        result[cell.get('r')] = value
    return result

def merged_ranges(document):
    for merge in document.iter(f'{{{S}}}mergeCell'):
        first, last = merge.get('ref').split(':')
        yield first, point(first), point(last)

raw = read_cells(reference)
expanded = dict(raw)
for first, (start_col, start_row), (end_col, end_row) in merged_ranges(reference):
    for row in range(start_row, end_row + 1):
        for col in range(start_col, min(6, end_col) + 1):
            expanded[f'{chr(64 + col)}{row}'] = raw.get(first, '')
text = lambda value: str(value) if value is not None else ''
get_text = lambda values, coord: text(values.get(coord, ''))
groups, reference_rows = [], []
current = None
for row in range(3, max(point(coord)[1] for coord in raw) + 1):
    get = lambda col: get_text(expanded, f'{col}{row}').strip()
    code = get_text(raw, f'A{row}').strip()
    if normalize(code) in ['số', 'bàisố', 'stt']:
        current = None
        continue
    if code:
        current = dict(code=code, name=get('B'), objective=get('C'), instruction=get('F'), criteria=get('E'), row=row, scores=[])
        groups.append(current)
    score_source = get('D')
    if any(get(col) for col in 'ABCDEF'):
        reference_rows.append(dict(row=row, code=get('A') or (current['code'] if current else ''), name=get('B') or (current['name'] if current else ''), objective=get('C') or (current['objective'] if current else ''), score=score_source, criteria=get('E'), instruction=get('F') or (current['instruction'] if current else '')))
    if current and not current['criteria']: current['criteria'] = get('E')
    if not current or not score_source or any(normalize(score['source']) == normalize(score_source) for score in current['scores']): continue
    value = expanded.get(f'D{row}', '')
    prefix = normalize(current['code']) + '.'
    suffix = normalize(score_source)[len(prefix):] if normalize(score_source).startswith(prefix) else ''
    if re.fullmatch(r'\d+(?:\.\d+)?', suffix):
        value = float(suffix)
        if value.is_integer(): value = int(value)
    elif not isinstance(value, (int, float)):
        value = score_source
    current['scores'].append(dict(id=str(row), label=text(value), source=score_source, value=value, criteria=get('E'), row=row, dateLike=bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}', score_source))))
lessons, duplicates = {}, 0
for lesson in groups:
    key = normalize(lesson['code'])
    if key in lessons: duplicates += 1
    else: lessons[key] = lesson
values = read_cells(plan)
blocked = set()
for first, (start_col, start_row), (end_col, end_row) in merged_ranges(plan):
    if start_col > 6: continue
    blocked.update(row for row in range(max(9, start_row), end_row + 1) if row != start_row or end_col > start_col)
slots = [row for row in range(9, max(point(coord)[1] for coord in values) + 1) if row not in blocked]
warnings = []
if duplicates: warnings.append(f'{duplicates} mã bài lặp trong tham khảo. Dùng nhóm đầu tiên như VLOOKUP của mẫu. Bảng tham khảo vẫn hiển thị mọi hàng.')
dates = sum(score['dateLike'] for lesson in lessons.values() for score in lesson['scores'])
unscored = sum(not lesson['scores'] for lesson in lessons.values())
if dates: warnings.append(f'{dates} thang điểm được Excel lưu thành ngày. Giữ nguyên ngày gốc, không tự suy đoán thành khoảng điểm.')
if unscored: warnings.append(f'{unscored} bài chưa có thang điểm. Có thể nhập điểm và các nội dung còn thiếu trực tiếp.')
if blocked: warnings.append(f"Giữ nguyên ô gộp; bỏ qua hàng {', '.join(map(str, sorted(blocked)))} khi ghi bài học.")
assets = {}
visited = set()
def visit(path):
    if path in visited: return
    visited.add(path)
    rel_path = str(PurePosixPath(path).parent / '_rels' / (PurePosixPath(path).name + '.rels'))
    if rel_path not in parts: return
    for relation in xml(rel_path):
        if relation.get('TargetMode') == 'External' or relation.get('Type', '').split('/')[-1] not in ['drawing', 'image']:
            raise ValueError('Unsupported template asset')
        target = target_path(path, relation.get('Target'))
        assets[target] = base64.b64encode(parts[target]).decode()
        visit(target)
    assets[rel_path] = base64.b64encode(parts[rel_path]).decode()
visit(plan_path)
header_values = {coord: value for coord, value in values.items() if point(coord)[1] < 9}
header_values.update(C6='', F6='', C7='Cô Hoà', G6='Tháng / Tuần')
for row in plan.iter(f'{{{S}}}row'):
    for cell in list(row):
        if cell.tag == f'{{{S}}}c':
            col, number = point(cell.get('r'))
            if number >= 9 and col > 7:
                row.remove(cell)
for cell in plan.iter(f'{{{S}}}c'):
    coord = cell.get('r')
    for node in list(cell): cell.remove(node)
    cell.attrib.pop('t', None)
    value = header_values.get(coord, '')
    if value != '':
        cell.set('t', 'inlineStr')
        ET.SubElement(ET.SubElement(cell, f'{{{S}}}is'), f'{{{S}}}t').text = text(value)
data = dict(version=1, name='Kế hoạch Hương Nắng', center=get_text(values, 'A1'), defaults=dict(teacher='Cô Hoà', manager=get_text(values, 'F7')), lessons=list(lessons.values()), reference=reference_rows, slots=slots, warnings=warnings, values=header_values, sheetPath=plan_path, sheetXml=ET.tostring(plan, encoding='unicode'), parts={path: parts[path].decode() for path in ['xl/styles.xml', 'xl/theme/theme1.xml', '[Content_Types].xml'] if path in parts}, assets=assets)
index = assign_ids(data)
Path('src/data/catalog-ids.json').write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n')
output = Path('src/data/lesson-template.json')
output.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(dict(lessons=len(lessons), referenceRows=len(reference_rows), slots=len(slots), unscored=unscored, dateScores=dates, bytes=output.stat().st_size)))
