"""Polish des libelles FR auto-generes (#7 Bastien).

Cible les patterns evidents de seed initial non traduit :
- "X espace reserve"      -> "Saisir X..."
- "Y Body measurements"   -> "Mesures corporelles" (etc.)
- Mots anglais isoles dans des valeurs FR
- Patterns hybrides "Mot anglais + suffixe FR"

Conservateur : ne touche que les cas surs. Les autres restent en l'etat.

Usage :
    python scripts/i18n_polish_fr.py [--dry-run]
"""
import io
import json
import re
import sys

FR_PATH = r'C:\Users\matth\Desktop\OPSFLUX\apps\main\src\locales\fr\common.json'


def walk(node, prefix=''):
    if isinstance(node, dict):
        for k, v in node.items():
            full = f'{prefix}.{k}' if prefix else k
            yield from walk(v, full)
    else:
        yield prefix, node


def setp(d, path, value):
    parts = path.split('.')
    cur = d
    for p in parts[:-1]:
        cur = cur[p]
    cur[parts[-1]] = value


# Corrections explicites cle-par-cle (les cas a haut risque).
# Format : path complet -> nouvelle valeur FR
EXPLICIT_FIXES = {
    # Placeholders mal traduits
    'common.email_body_placeholder': 'Saisir le corps du message…',
    'common.recipients_placeholder': 'Saisir les destinataires…',
    'common.subject_placeholder': 'Saisir le sujet…',
    'common.subject': 'Sujet',
    'common.add_at_least_one_recipient': 'Ajoutez au moins un destinataire',
    'common.body_measurements': 'Mensurations',
    'common.add_cc': 'Ajouter en copie',
    'common.addresses': 'Adresses',
    'common.appearance': 'Apparence',
    'common.application': 'Application',
    'common.archived_count': '{count} archivé(s)',
    'common.associations': 'Associations',
    'common.active_female': 'Active',
    'common.active_until': "Actif jusqu'au",
    'common.actual_end': 'Fin réelle',
    'assets.kmz.commit_field_placeholder': 'Saisir la valeur du champ…',
    'projets.task_title_placeholder': 'Saisir le titre de la tâche…',
    # Anglais brut courant
    'nav.home': 'Accueil',
    'common.send': 'Envoyer',
    'common.send_email': 'Envoyer par email',
    'common.filters': 'Filtres',
    'common.created_at_female': 'Créée le',
    'common.deleted_female': 'Supprimée',
    'common.modified_female': 'Modifiée',
    'common.new_female': 'Nouvelle',
    'common.no_history_available': 'Aucun historique disponible',
    'common.no_permission_available': 'Aucune permission disponible',
    'common.max_recipients_reached': 'Nombre maximum de destinataires atteint',
    'common.commissioning_date': 'Date de mise en service',
    'common.contact_info': 'Coordonnées',
    'common.contact_phone': 'Téléphone de contact',
    'common.expected_return_date': 'Date de retour prévue',
    'common.home_base': "Base d'origine",
    'common.email_attachments_intro': 'Pièces jointes du message :',
    'common.package_count': '{count} colis',
    'common.start_date': 'Date de début',
    'common.due_date': "Date d'échéance",
    'common.end_date': 'Date de fin',
    'common.email': 'Adresse email',
}

# Patterns regex de remplacement (s'applique sur la valeur)
PATTERN_FIXES = [
    # "X espace réservé" -> "Saisir X..."
    (
        re.compile(r'^(.+?)\s+espace réservé\.?$', re.IGNORECASE),
        lambda m: f"Saisir {m.group(1).lower().strip()}…",
    ),
    # "espace réservé X" -> "Saisir X..."
    (
        re.compile(r'^espace réservé\s+(.+?)\.?$', re.IGNORECASE),
        lambda m: f"Saisir {m.group(1).lower().strip()}…",
    ),
]


def apply_fixes(fr: dict) -> tuple[int, list[tuple[str, str, str]]]:
    """Applique les corrections.

    Returns (n_fixed, list of (path, old_val, new_val)).
    """
    changes = []

    # 1. Fixes explicites par cle
    for path, new_val in EXPLICIT_FIXES.items():
        parts = path.split('.')
        cur = fr
        ok = True
        for p in parts:
            if isinstance(cur, dict) and p in cur:
                cur = cur[p]
            else:
                ok = False
                break
        if ok and isinstance(cur, str) and cur != new_val:
            setp(fr, path, new_val)
            changes.append((path, cur, new_val))

    # 2. Fixes pattern (placeholder "X espace réservé")
    for path, val in list(walk(fr)):
        if not isinstance(val, str):
            continue
        for pat, repl in PATTERN_FIXES:
            m = pat.match(val.strip())
            if m:
                new_val = repl(m)
                if new_val != val:
                    setp(fr, path, new_val)
                    changes.append((path, val, new_val))
                break  # Un seul fix par valeur

    return len(changes), changes


def main():
    dry_run = '--dry-run' in sys.argv

    fr = json.load(io.open(FR_PATH, encoding='utf-8'))
    n, changes = apply_fixes(fr)

    print(f'Polish FR : {n} correction(s)\n')
    for path, old, new in changes[:30]:
        print(f'  {path}')
        print(f'    - {old!r}')
        print(f'    + {new!r}')

    if n > 30:
        print(f'\n  ... et {n - 30} autres')

    if dry_run:
        print('\n[dry-run] aucune ecriture')
        return

    if n > 0:
        with io.open(FR_PATH, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(fr, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print(f'\n[written] {FR_PATH}')


if __name__ == '__main__':
    main()
