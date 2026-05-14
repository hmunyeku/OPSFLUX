"""Trouve les cles appelees par t() dans le code mais absentes du locales/fr/common.json.
Ces cles affichent leur path brut dans l'UI (UX dégradée).

Strategie de fix : pour chaque cle manquante, generer une valeur FR
deduite de la derniere partie du path (ex: 'common.information' -> 'Informations').
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

T_CALL_RE = re.compile(r"""\bt\(\s*['"]([a-z][a-z0-9_.]+(?:\.[a-z][a-z0-9_]+)+)['"]""", re.IGNORECASE)


def collect_t_calls():
    keys = set()
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


def has_key(d, path):
    parts = path.split('.')
    cur = d
    for p in parts:
        if isinstance(cur, dict) and p in cur:
            cur = cur[p]
        else:
            return False
    return True


def setp(d, path, value):
    parts = path.split('.')
    cur = d
    for p in parts[:-1]:
        if p not in cur or not isinstance(cur[p], dict):
            cur[p] = {}
        cur = cur[p]
    cur[parts[-1]] = value


# Dico FR "smart defaults" pour les common.* les plus frequents
DEFAULTS_FR = {
    'common.information': 'Informations',
    'common.code_field': 'Code',
    'common.loading_ellipsis': 'Chargement…',
    'common.name_field': 'Nom',
    'common.title_field': 'Titre',
    'common.longitude': 'Longitude',
    'common.type_field': 'Type',
    'common.latitude': 'Latitude',
    'common.priority_field': 'Priorité',
    'common.reference': 'Référence',
    'common.failed': 'Échec',
    'common.requester': 'Demandeur',
    'common.planning': 'Planification',
    'common.vector': 'Vecteur',
    'common.data_source': 'Source de données',
    'common.language': 'Langue',
    'common.value_placeholder': 'Valeur',
    'common.clear': 'Effacer',
    'common.country': 'Pays',
    'common.dimensions': 'Dimensions',
    'common.reason': 'Motif',
    'common.destination': 'Destination',
    'common.imputation': 'Imputation',
    'common.company_contact': 'Contact entreprise',
    'common.recipient': 'Destinataire',
    'common.scheduling': 'Ordonnancement',
    'common.departure_base': 'Base de départ',
    'common.mode': 'Mode',
    'common.created_by': 'Créé par',
    'common.created_at_label': 'Créé le',
    'common.updated_at_label': 'Modifié le',
    'common.updated_by': 'Modifié par',
}


EN_WORD_TO_FR = {
    'select': 'sélectionner', 'choose': 'choisir', 'pick': 'choisir',
    'save': 'enregistrer', 'cancel': 'annuler', 'delete': 'supprimer',
    'edit': 'modifier', 'add': 'ajouter', 'remove': 'retirer',
    'confirm': 'confirmer', 'apply': 'appliquer', 'reset': 'réinitialiser',
    'create': 'créer', 'update': 'mettre à jour', 'refresh': 'rafraîchir',
    'export': 'exporter', 'import': 'importer', 'download': 'télécharger',
    'upload': 'téléverser', 'browse': 'parcourir', 'search': 'rechercher',
    'filter': 'filtrer', 'sort': 'trier', 'view': 'voir',
    'open': 'ouvrir', 'close': 'fermer', 'print': 'imprimer',
    'preview': 'aperçu', 'copy': 'copier', 'paste': 'coller',
    'submit': 'soumettre', 'publish': 'publier', 'archive': 'archiver',
    'restore': 'restaurer', 'duplicate': 'dupliquer',
    'enable': 'activer', 'disable': 'désactiver',
    'lock': 'verrouiller', 'unlock': 'déverrouiller',
    'approve': 'approuver', 'reject': 'rejeter', 'validate': 'valider',
    'continue': 'continuer', 'back': 'retour', 'next': 'suivant',
    'previous': 'précédent', 'first': 'premier', 'last': 'dernier',
    'field': 'champ', 'fields': 'champs',
    'site': 'site', 'sites': 'sites',
    'installation': 'installation', 'installations': 'installations',
    'pipeline': 'pipeline', 'equipment': 'équipement',
    'project': 'projet', 'projects': 'projets',
    'task': 'tâche', 'tasks': 'tâches',
    'activity': 'activité', 'activities': 'activités',
    'document': 'document', 'documents': 'documents',
    'file': 'fichier', 'files': 'fichiers',
    'team': 'équipe', 'teams': 'équipes',
    'user': 'utilisateur', 'users': 'utilisateurs',
    'contact': 'contact', 'contacts': 'contacts',
    'company': 'entreprise', 'companies': 'entreprises',
    'group': 'groupe', 'groups': 'groupes',
    'role': 'rôle', 'roles': 'rôles',
    'permission': 'permission', 'permissions': 'permissions',
    'tag': 'étiquette', 'tags': 'étiquettes',
    'note': 'note', 'notes': 'notes',
    'comment': 'commentaire', 'comments': 'commentaires',
    'attachment': 'pièce jointe', 'attachments': 'pièces jointes',
    'cargo': 'cargaison', 'package': 'colis', 'packages': 'colis',
    'voyage': 'voyage', 'voyages': 'voyages',
    'vector': 'vecteur', 'vectors': 'vecteurs',
    'manifest': 'manifeste', 'manifests': 'manifestes',
    'passenger': 'passager', 'passengers': 'passagers',
    'rotation': 'rotation', 'rotations': 'rotations',
    'mission': 'mission', 'missions': 'missions',
    'workflow': 'workflow', 'workflows': 'workflows',
    'step': 'étape', 'steps': 'étapes',
    'state': 'état', 'status': 'statut',
    'transition': 'transition', 'transitions': 'transitions',
    'validation': 'validation', 'validations': 'validations',
    'approval': 'approbation', 'approvals': 'approbations',
    'announcement': 'annonce', 'announcements': 'annonces',
    'notification': 'notification', 'notifications': 'notifications',
    'alert': 'alerte', 'alerts': 'alertes',
    'error': 'erreur', 'errors': 'erreurs',
    'warning': 'avertissement', 'warnings': 'avertissements',
    'information': 'informations',
    'success': 'succès',
    'failed': 'échec', 'failure': 'échec',
    'completed': 'terminé', 'ready': 'prêt',
    'pending': 'en attente', 'rejected': 'rejeté',
    'approved': 'approuvé', 'cancelled': 'annulé',
    'draft': 'brouillon', 'submitted': 'soumis',
    'active': 'actif', 'inactive': 'inactif',
    'archived': 'archivé', 'planned': 'planifié',
    'history': 'historique', 'preview_ready': 'aperçu prêt',
    'description': 'description', 'title': 'titre',
    'name': 'nom', 'code': 'code', 'type': 'type',
    'date': 'date', 'time': 'heure',
    'start': 'début', 'end': 'fin',
    'priority': 'priorité', 'category': 'catégorie',
    'value': 'valeur', 'unit': 'unité',
    'reason': 'motif', 'comment': 'commentaire',
    'address': 'adresse', 'phone': 'téléphone',
    'email': 'email', 'website': 'site web',
    'country': 'pays', 'city': 'ville',
    'language': 'langue', 'currency': 'devise',
    'button': 'bouton', 'icon': 'icône',
    'image': 'image', 'photo': 'photo',
    'logo': 'logo', 'avatar': 'avatar',
    'option': 'option', 'options': 'options',
    'setting': 'paramètre', 'settings': 'paramètres',
    'preferences': 'préférences',
    'configuration': 'configuration',
    'profile': 'profil', 'profiles': 'profils',
    'account': 'compte', 'accounts': 'comptes',
    'dashboard': 'tableau de bord',
    'overview': "vue d'ensemble",
    'detail': 'détail', 'details': 'détails',
    'list': 'liste', 'lists': 'listes',
    'table': 'tableau', 'card': 'carte',
    'placeholder': 'espace réservé',
    'hint': 'indice', 'tooltip': 'info-bulle',
    'modal': 'fenêtre', 'dialog': 'dialogue',
    'menu': 'menu', 'item': 'élément', 'items': 'éléments',
    'commit': 'valider', 'rollback': 'restaurer',
    'report': 'rapport', 'reports': 'rapports',
    'created': 'créé', 'modified': 'modifié',
    'deleted': 'supprimé', 'restored': 'restauré',
    'matched': 'apparié', 'skipped': 'ignoré',
    'changed': 'modifié', 'updated': 'mis à jour',
    'parse': 'analyse', 'parsed': 'analysé',
    'kmz': 'KMZ', 'csv': 'CSV', 'pdf': 'PDF',
    'xlsx': 'XLSX', 'json': 'JSON',
    'dropzone': 'zone de dépôt', 'drop': 'déposer',
    'no': 'aucun', 'any': 'tout', 'all': 'tous',
    'is': 'est', 'are': 'sont', 'of': 'de',
    'or': 'ou', 'and': 'et', 'with': 'avec',
    'on': 'sur', 'for': 'pour', 'to': 'vers',
}


def fr_word(en_word: str) -> str:
    lw = en_word.lower()
    return EN_WORD_TO_FR.get(lw, en_word)


def generate_label(key: str) -> str:
    """Genere un label FR a partir du path. Fallback heuristique."""
    if key in DEFAULTS_FR:
        return DEFAULTS_FR[key]
    last = key.rsplit('.', 1)[-1]
    # Snake_case -> mots FR
    words = last.replace('_', ' ').strip().split()
    if not words:
        return last
    fr_words = [fr_word(w) for w in words]
    result = ' '.join(fr_words)
    return result[0].upper() + result[1:] if result else last


def main():
    dry_run = '--dry-run' in sys.argv

    fr = json.load(io.open(FR_PATH, encoding='utf-8'))
    called_keys = collect_t_calls()
    print(f'Total t() calls uniques : {len(called_keys)}')

    missing = sorted(k for k in called_keys if not has_key(fr, k))
    print(f'Cles appelees mais MANQUANTES en FR : {len(missing)}')

    if not missing:
        return

    # Top 30 a titre informatif
    print(f'\nTop 30 manquantes :')
    for k in missing[:30]:
        print(f'  {k} -> "{generate_label(k)}"')

    if dry_run:
        print('\n[dry-run] no write.')
        return

    added = 0
    for k in missing:
        label = generate_label(k)
        setp(fr, k, label)
        added += 1

    with io.open(FR_PATH, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(fr, f, ensure_ascii=False, indent=2)
        f.write('\n')

    print(f'\n[written] {FR_PATH} ({added} cles ajoutees)')


if __name__ == '__main__':
    main()
