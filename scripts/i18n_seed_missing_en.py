"""Pour les cles FR existantes sans equivalent EN, genere une valeur EN
depuis la derniere partie du path snake_case.

Run apres i18n_find_missing_fr.py qui a peuple les manquantes FR avec
des labels FR. Maintenant on comble les EN avec le snake_case original.
"""
import io
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
FR_PATH = REPO_ROOT / 'apps' / 'main' / 'src' / 'locales' / 'fr' / 'common.json'
EN_PATH = REPO_ROOT / 'apps' / 'main' / 'src' / 'locales' / 'en' / 'common.json'


def walk(node, prefix=''):
    if isinstance(node, dict):
        for k, v in node.items():
            full = f'{prefix}.{k}' if prefix else k
            yield from walk(v, full)
    else:
        yield prefix, node


def getp(d, path):
    parts = path.split('.')
    cur = d
    for p in parts:
        if isinstance(cur, dict) and p in cur:
            cur = cur[p]
        else:
            return None
    return cur


def setp(d, path, value):
    parts = path.split('.')
    cur = d
    for p in parts[:-1]:
        if p not in cur or not isinstance(cur[p], dict):
            cur[p] = {}
        cur = cur[p]
    cur[parts[-1]] = value


def generate_en_label(key: str) -> str:
    """Genere un label EN depuis le path snake_case."""
    last = key.rsplit('.', 1)[-1]
    words = last.replace('_', ' ').strip()
    if not words:
        return last
    # Capitalize first letter
    return words[0].upper() + words[1:]


def main():
    dry_run = '--dry-run' in sys.argv

    fr = json.load(io.open(FR_PATH, encoding='utf-8'))
    en = json.load(io.open(EN_PATH, encoding='utf-8'))

    added = 0
    for path, fr_val in walk(fr):
        if not isinstance(fr_val, str):
            continue
        if getp(en, path) is not None:
            continue
        label = generate_en_label(path)
        setp(en, path, label)
        added += 1

    print(f'EN ajoutees (snake_case fallback) : {added}')

    if not dry_run:
        with io.open(EN_PATH, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(en, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print(f'[written] {EN_PATH}')


if __name__ == '__main__':
    main()
