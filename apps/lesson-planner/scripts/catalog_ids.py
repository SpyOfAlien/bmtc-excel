"""Stable UUIDs shared by repository lessons, scores, and reference records."""
import json
import uuid
from pathlib import Path

NAMESPACE = uuid.UUID('87f06225-c13b-4b99-8a91-a2ebf2699d6c')

def assign_ids(data):
    index = {}
    for lesson in data['lessons']:
        key = ''.join(lesson['code'].lower().split())
        lesson['id'] = str(uuid.uuid5(NAMESPACE, 'lesson:' + key))
        score_ids = {}
        for score in lesson['scores']:
            source = ''.join(score['source'].lower().split())
            score['id'] = str(uuid.uuid5(uuid.UUID(lesson['id']), 'score:' + source))
            score_ids[source] = score['id']
        index[key] = {'id': lesson['id'], 'scores': score_ids}
    for row in data['reference']:
        row['id'] = str(uuid.uuid5(NAMESPACE, 'reference:' + str(row['row'])))
        row['lessonId'] = index.get(''.join(row['code'].lower().split()), {}).get('id')
    data['version'] = 2
    return index

if __name__ == '__main__':
    path = Path('src/data/lesson-template.json')
    data = json.loads(path.read_text())
    index = assign_ids(data)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    Path('src/data/catalog-ids.json').write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n')
