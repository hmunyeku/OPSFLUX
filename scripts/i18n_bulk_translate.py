"""Bulk-translate trivial FR labels to EN. Run once."""
import json
import io

FR_PATH = 'C:/Users/matth/Desktop/OPSFLUX/apps/main/src/locales/fr/common.json'
EN_PATH = 'C:/Users/matth/Desktop/OPSFLUX/apps/main/src/locales/en/common.json'

RAW_MAP = {
    "resultats": "results", "resultat": "result",
    "entrees": "entries", "entree": "entry",
    "elements": "items", "element": "item",
    "lignes": "rows", "ligne": "row",
    "colonnes": "columns", "colonne": "column",
    "lignes par page": "rows per page",
    "par page": "per page",
    "Plus": "More", "Moins": "Less",
    "Precedent": "Previous", "Suivant": "Next",
    "Premier": "First", "Dernier": "Last",
    "Hier": "Yesterday", "Demain": "Tomorrow",
    "Cette semaine": "This week",
    "Ce mois": "This month",
    "Taux": "Rate", "Total": "Total", "Moyenne": "Average",
    "Min": "Min", "Max": "Max", "Somme": "Sum",
    "Capacite": "Capacity",
    "Charge": "Load", "Pob": "POB",
    "Notification": "Notification", "Notifications": "Notifications",
    "Alerte": "Alert", "Alertes": "Alerts",
    "Erreur de chargement": "Loading error",
    "Erreur de sauvegarde": "Save error",
    "Erreur de suppression": "Delete error",
    "Succes": "Success",
    "Echec": "Failure",
    "Confirmation requise": "Confirmation required",
    "Operation en cours": "Operation in progress",
    "Operation terminee": "Operation completed",
    "Aucune donnee a afficher": "No data to display",
    "Quota": "Quota", "Quotas": "Quotas",
    "Score": "Score", "Notes": "Notes",
    "Audit": "Audit", "Audits": "Audits",
    "Trace": "Trace", "Traces": "Traces",
    "Journal": "Log", "Journaux": "Logs",
    "Historique": "History",
    "Evenement": "Event",
    "Statut": "Status",
    "Categorie": "Category", "Categories": "Categories",
    "Marque": "Brand", "Modele": "Model",
    "Numero de serie": "Serial number",
    "Numero": "Number",
    "Quantite": "Quantity",
    "Unite": "Unit", "Unites": "Units",
    "Poids": "Weight", "Volume": "Volume",
    "Longueur": "Length", "Largeur": "Width", "Hauteur": "Height",
    "Profondeur": "Depth",
    "Pression": "Pressure", "Temperature": "Temperature",
    "Debit": "Flow rate",
    "Origine": "Origin", "Provenance": "Source",
    "Notes operationnelles": "Operational notes",
    "Notes techniques": "Technical notes",
    "Workflow": "Workflow", "Workflows": "Workflows",
    "Etape": "Step", "Etapes": "Steps",
    "Transition": "Transition", "Transitions": "Transitions",
    "Action requise": "Action required",
    "Approbation": "Approval", "Approbations": "Approvals",
    "Validation": "Validation", "Validations": "Validations",
    "Validateur": "Validator", "Validateurs": "Validators",
    "Approuver et continuer": "Approve and continue",
    "Renvoyer pour correction": "Send back for correction",
    "Renvoyer en correction": "Send back for correction",
    "Fichier": "File", "Fichiers": "Files",
    "Pieces jointes": "Attachments",
    "Piece jointe": "Attachment",
    "Telecharger": "Download",
    "Televerser": "Upload",
    "Glisser-deposer": "Drag and drop",
    "Taille": "Size", "Format": "Format",
    "Champ requis": "Required field", "Champ obligatoire": "Required field",
    "Optionnel": "Optional",
    "Recommande": "Recommended",
    "Lecture seule": "Read-only",
    "Lecture-seule": "Read-only",
    "En cours de chargement": "Loading",
    "Charge": "Loaded",
    "Pas encore": "Not yet",
    "Bientot": "Soon",
    "Maintenant": "Now",
    "Futur": "Future",
    "Passe": "Past",
    "Present": "Present",
    "Oui": "Yes", "Non": "No",
    "Vrai": "True", "Faux": "False",
    "OK": "OK",
    "Demande": "Request", "Demandes": "Requests",
    "Approuver": "Approve", "Rejeter": "Reject",
    "En conformite": "Compliant",
    "Non conforme": "Non-compliant",
    "Conformite": "Compliance",
    "Habilitation": "Authorization", "Habilitations": "Authorizations",
    "Formation": "Training", "Formations": "Trainings",
    "Certification": "Certification", "Certifications": "Certifications",
    "Aptitude": "Fitness", "Aptitudes": "Fitness",
    "Aptitude medicale": "Medical fitness",
    "kg": "kg", "tonne": "ton", "tonnes": "tons",
    "metre": "meter", "metres": "meters",
    "metre carre": "square meter",
    "metre cube": "cubic meter",
    "secondes": "seconds", "seconde": "second",
    "minutes": "minutes", "minute": "minute",
    "heures": "hours", "heure": "hour",
    "jours": "days", "jour": "day",
    "semaines": "weeks", "semaine": "week",
    "mois": "month",
    "annees": "years",
    "annee": "year",
    "Continuer": "Continue", "Recommencer": "Restart",
    "Reprendre": "Resume", "Mettre en pause": "Pause",
    "Lancer": "Run", "Executer": "Execute",
    "Tester": "Test", "Configurer": "Configure",
    "Personnaliser": "Customize",
    "Synchroniser": "Sync", "Sync": "Sync",
    "Generer": "Generate",
    "Calculer": "Calculate", "Recalculer": "Recalculate",
    "Total estime": "Estimated total",
    "Total reel": "Actual total",
    "Total prevu": "Planned total",
    "Total brut": "Gross total", "Total net": "Net total",
    "Prix unitaire": "Unit price", "Prix total": "Total price",
    "Devise": "Currency",
    "TVA": "VAT", "Taxe": "Tax", "Taxes": "Taxes",
    "Sans frais": "Free", "Gratuit": "Free", "Payant": "Paid",
    # Add accented variants
    "Résultats": "Results", "Résultat": "Result",
    "Entrées": "Entries", "Entrée": "Entry",
    "Éléments": "Items", "Élément": "Item",
    "Catégorie": "Category", "Catégories": "Categories",
    "Quantité": "Quantity",
    "Unité": "Unit", "Unités": "Units",
    "Mètre": "Meter", "Mètres": "Meters",
    "Pression": "Pressure", "Température": "Temperature",
    "Débit": "Flow rate",
    "Modèle": "Model",
    "Numéro de série": "Serial number",
    "Numéro": "Number",
    "Notes opérationnelles": "Operational notes",
    "Capacité": "Capacity",
    "Conformité": "Compliance",
    "En conformité": "Compliant",
    "Aptitude médicale": "Medical fitness",
    "Année": "Year", "Années": "Years",
    "Recommandé": "Recommended",
    "Chargé": "Loaded",
    "Chargées": "Loaded",
    "Opération en cours": "Operation in progress",
    "Opération terminée": "Operation completed",
    "Opérationnel": "Operational",
    "Étape": "Step", "Étapes": "Steps",
    "Exécuter": "Execute",
    "Générer": "Generate",
    "Télécharger": "Download",
    "Téléverser": "Upload",
    "Erreur de création": "Create error",
    "Erreur de mise à jour": "Update error",
    "Aucune donnée à afficher": "No data to display",
    "Pièces jointes": "Attachments",
    "Pièce jointe": "Attachment",
    "Cette année": "This year",
    "Bientôt": "Soon",
    "Échec": "Failure",
    "Passé": "Past",
    "À venir": "Upcoming",
    "Évènement": "Event",
}


def setp(d, path, value):
    parts = path.split('.')
    cur = d
    for p in parts[:-1]:
        if p not in cur or not isinstance(cur[p], dict):
            cur[p] = {}
        cur = cur[p]
    cur[parts[-1]] = value


def getp(d, path):
    parts = path.split('.')
    cur = d
    for p in parts:
        if isinstance(cur, dict) and p in cur:
            cur = cur[p]
        else:
            return None
    return cur


def walk(node, prefix=''):
    if isinstance(node, dict):
        for k, v in node.items():
            full = f'{prefix}.{k}' if prefix else k
            yield from walk(v, full)
    else:
        yield prefix, node


def main():
    fr = json.load(io.open(FR_PATH, encoding='utf-8'))
    en = json.load(io.open(EN_PATH, encoding='utf-8'))

    added = 0
    for path, fr_val in walk(fr):
        if not isinstance(fr_val, str):
            continue
        if getp(en, path) is not None:
            continue
        if fr_val in RAW_MAP:
            setp(en, path, RAW_MAP[fr_val])
            added += 1
        else:
            normalised = fr_val.strip()
            if normalised in RAW_MAP:
                setp(en, path, RAW_MAP[normalised])
                added += 1

    print(f'EN keys added in this pass: {added}')

    with io.open(EN_PATH, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(en, f, ensure_ascii=False, indent=2)
        f.write('\n')

    remaining = 0
    for path, fr_val in walk(fr):
        if not isinstance(fr_val, str):
            continue
        if getp(en, path) is None:
            remaining += 1
    print(f'EN keys still missing: {remaining}')


if __name__ == '__main__':
    main()
