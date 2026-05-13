"""Verifie la coherence i18n : toutes les cles t() appelees dans le code
doivent etre definies dans locales/fr/common.json ET locales/en/common.json.

Run en CI pour bloquer un PR qui introduit une cle t() sans la definir.

Usage:
    python scripts/i18n_check.py            # exit 1 si trous detectes
    python scripts/i18n_check.py --report   # rapport detaille sans exit
"""
import io
import json
import os
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC = REPO_ROOT / 'apps' / 'main' / 'src'
FR_PATH = REPO_ROOT / 'apps' / 'main' / 'src' / 'locales' / 'fr' / 'common.json'
EN_PATH = REPO_ROOT / 'apps' / 'main' / 'src' / 'locales' / 'en' / 'common.json'

T_CALL_RE = re.compile(
    r"""\bt\(\s*['"]([a-z][a-z0-9_.]+(?:\.[a-z][a-z0-9_]+)+)['"]""",
    re.IGNORECASE,
)


def collect_t_calls() -> set[str]:
    keys: set[str] = set()
    for dirpath, _, files in os.walk(SRC):
        if 'node_modules' in dirpath or 'locales' in dirpath:
            continue
        for f in files:
            if not (f.endswith('.tsx') or f.endswith('.ts')):
                continue
            p = Path(dirpath) / f
            try:
                src = p.read_text(encoding='utf-8')
            except Exception:
                continue
            for m in T_CALL_RE.finditer(src):
                keys.add(m.group(1))
    return keys


def collect_json_keys(path: Path) -> set[str]:
    data = json.load(io.open(path, encoding='utf-8'))
    keys: set[str] = set()

    def walk(node, prefix=''):
        if isinstance(node, dict):
            for k, v in node.items():
                full = f'{prefix}.{k}' if prefix else k
                walk(v, full)
        elif isinstance(node, str):
            keys.add(prefix)

    walk(data)
    return keys


def main() -> int:
    report = '--report' in sys.argv

    called = collect_t_calls()
    fr = collect_json_keys(FR_PATH)
    en = collect_json_keys(EN_PATH)

    missing_fr = called - fr
    missing_en = called - en
    fr_only = fr - en
    en_only = en - fr

    print('# i18n coherence check\n')
    print(f'- t() calls uniques     : {len(called)}')
    print(f'- FR keys               : {len(fr)}')
    print(f'- EN keys               : {len(en)}')
    print(f'- t() missing in FR     : {len(missing_fr)}')
    print(f'- t() missing in EN     : {len(missing_en)}')
    print(f'- FR keys without EN    : {len(fr_only)}')
    print(f'- EN keys without FR    : {len(en_only)}')

    if report or missing_fr:
        if missing_fr:
            print(f'\n## Missing in FR (top 30 / {len(missing_fr)}) :')
            for k in sorted(missing_fr)[:30]:
                print(f'  - {k}')
    if report or missing_en:
        if missing_en:
            print(f'\n## Missing in EN (top 30 / {len(missing_en)}) :')
            for k in sorted(missing_en)[:30]:
                print(f'  - {k}')
    if report or fr_only:
        if fr_only:
            print(f'\n## FR keys without EN (top 20 / {len(fr_only)}) :')
            for k in sorted(fr_only)[:20]:
                print(f'  - {k}')

    # Strict mode : echec si t() call sans definition dans FR ou EN
    if missing_fr or missing_en or fr_only or en_only:
        if not report:
            print('\n[FAIL] i18n coherence broken. See report above.')
            return 1
    else:
        print('\n[OK] i18n is fully coherent.')

    return 0


if __name__ == '__main__':
    sys.exit(main())
