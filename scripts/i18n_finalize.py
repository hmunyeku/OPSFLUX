"""Finalise les traductions FR -> EN en exploitant les paires existantes.

Strategie :
1. Construit un dictionnaire FR_val -> EN_val a partir des cles existantes
   qui ont les deux versions (training set ~4500 paires)
2. Pour chaque cle FR sans EN, applique :
   - Match exact dans le dictionnaire training (cas frequent : labels reutilises)
   - Sinon dictionnaire metier hardcoded (mots techniques, etats, actions)
   - Sinon decompose en mots et tente une traduction word-by-word pour
     les phrases tres courtes (1-3 mots)
3. Rapport sur stdout : ajoutees / non-trouvees

Run :
    python scripts/i18n_finalize.py [--dry-run]

Modifie en place : apps/main/src/locales/en/common.json
"""
import io
import json
import re
import sys

FR_PATH = 'C:/Users/matth/Desktop/OPSFLUX/apps/main/src/locales/fr/common.json'
EN_PATH = 'C:/Users/matth/Desktop/OPSFLUX/apps/main/src/locales/en/common.json'


# Dictionnaire metier hardcoded (etend des batches precedents)
# Sensible a la casse pour preserver la capitalisation
METIER_MAP = {
    # Actions UI
    "Modifier": "Edit", "Supprimer": "Delete", "Ajouter": "Add",
    "Enregistrer": "Save", "Annuler": "Cancel", "Confirmer": "Confirm",
    "Valider": "Validate", "Rejeter": "Reject", "Approuver": "Approve",
    "Soumettre": "Submit", "Publier": "Publish", "Archiver": "Archive",
    "Restaurer": "Restore", "Dupliquer": "Duplicate",
    "Exporter": "Export", "Importer": "Import",
    "Télécharger": "Download", "Téléverser": "Upload",
    "Rafraîchir": "Refresh", "Rechercher": "Search",
    "Filtrer": "Filter", "Trier": "Sort", "Voir": "View",
    "Ouvrir": "Open", "Fermer": "Close", "Imprimer": "Print",
    "Aperçu": "Preview", "Copier": "Copy", "Coller": "Paste",
    "Couper": "Cut", "Réinitialiser": "Reset",
    "Retour": "Back", "Suivant": "Next", "Précédent": "Previous",
    "Continuer": "Continue", "Recommencer": "Restart",
    "Reprendre": "Resume", "Lancer": "Run", "Exécuter": "Execute",
    "Tester": "Test", "Configurer": "Configure",
    "Personnaliser": "Customize", "Synchroniser": "Sync",
    "Générer": "Generate", "Calculer": "Calculate",
    "Sélectionner": "Select", "Choisir": "Choose",
    "Définir": "Define", "Effacer": "Clear",
    "Cocher": "Check", "Décocher": "Uncheck",
    "Activer": "Enable", "Désactiver": "Disable",
    "Verrouiller": "Lock", "Déverrouiller": "Unlock",
    "Approuver et continuer": "Approve and continue",
    "Renvoyer pour correction": "Send back for correction",
    "Renvoyer en correction": "Send back for correction",
    # Etats
    "Actif": "Active", "Inactif": "Inactive",
    "Archivé": "Archived", "Archive": "Archive",
    "Planifié": "Planned", "En cours": "In progress",
    "Terminé": "Completed", "Annulé": "Cancelled",
    "Brouillon": "Draft", "Soumis": "Submitted",
    "Approuvé": "Approved", "Rejeté": "Rejected",
    "Validé": "Validated", "En attente": "Pending",
    "En conformité": "Compliant", "Non conforme": "Non-compliant",
    "Bloqué": "Blocked", "Verrouillé": "Locked",
    "Expiré": "Expired", "Disponible": "Available",
    "Indisponible": "Unavailable", "Suspendu": "Suspended",
    "En revue": "In review", "Prêt": "Ready",
    "Embarqué": "Boarded", "Débarqué": "Disembarked",
    "Confirmé": "Confirmed", "Préparé": "Prepared",
    # Niveaux
    "Critique": "Critical", "Haute": "High", "Moyenne": "Medium",
    "Basse": "Low", "Normal": "Normal", "Urgent": "Urgent",
    "Faible": "Low",
    # Champs UI generic
    "Description": "Description", "Référence": "Reference",
    "Priorité": "Priority", "Échéance": "Due date",
    "Catégorie": "Category", "Département": "Department",
    "Poste": "Position", "Fonction": "Role",
    "Responsable": "Manager", "Auteur": "Author",
    "Demandeur": "Requester", "Destinataire": "Recipient",
    "Adresse": "Address", "Téléphone": "Phone",
    "Email": "Email", "Site web": "Website",
    "Pays": "Country", "Ville": "City",
    "Code postal": "Postcode", "Région": "Region",
    "Date": "Date", "Heure": "Time",
    "Début": "Start", "Fin": "End",
    "Type": "Type", "Statut": "Status",
    "Nom": "Name", "Prénom": "First name",
    "Civilité": "Title", "Genre": "Gender",
    "Nationalité": "Nationality",
    "Date de naissance": "Date of birth",
    "Lieu de naissance": "Place of birth",
    "Tag": "Tag", "Tags": "Tags",
    "Code": "Code", "Codes": "Codes",
    "Numéro": "Number", "Quantité": "Quantity",
    "Unité": "Unit", "Unités": "Units",
    "Poids": "Weight", "Volume": "Volume",
    "Longueur": "Length", "Largeur": "Width", "Hauteur": "Height",
    "Profondeur": "Depth", "Diamètre": "Diameter",
    "Pression": "Pressure", "Température": "Temperature",
    "Débit": "Flow rate", "Capacité": "Capacity",
    "Origine": "Origin", "Destination": "Destination",
    "Source": "Source", "Cible": "Target",
    "Valeur": "Value", "Valeur cible": "Target value",
    "Mode": "Mode", "Méthode": "Method",
    "Format": "Format", "Taille": "Size",
    "Couleur": "Color", "Icône": "Icon",
    "Image": "Image", "Photo": "Photo",
    # Termes OpsFlux specifiques
    "Projet": "Project", "Projets": "Projects",
    "Activité": "Activity", "Activités": "Activities",
    "Tâche": "Task", "Tâches": "Tasks",
    "Sous-tâche": "Subtask", "Sous-tâches": "Subtasks",
    "Voyage": "Voyage", "Voyages": "Voyages",
    "Cargo": "Cargo", "Colis": "Package",
    "Passager": "Passenger", "Passagers": "Passengers",
    "Site": "Site", "Sites": "Sites",
    "Vecteur": "Vector", "Vecteurs": "Vectors",
    "Équipement": "Equipment", "Équipements": "Equipment",
    "Équipe": "Team", "Équipes": "Teams",
    "Membre": "Member", "Membres": "Members",
    "Utilisateur": "User", "Utilisateurs": "Users",
    "Contact": "Contact", "Contacts": "Contacts",
    "Entreprise": "Company", "Entreprises": "Companies",
    "Document": "Document", "Documents": "Documents",
    "Fichier": "File", "Fichiers": "Files",
    "Demande": "Request", "Demandes": "Requests",
    "Mission": "Mission", "Missions": "Missions",
    "Rotation": "Rotation", "Rotations": "Rotations",
    "Manifeste": "Manifest", "Manifestes": "Manifests",
    "Embarquement": "Boarding", "Débarquement": "Disembarkation",
    "Départ": "Departure", "Arrivée": "Arrival",
    "Escale": "Stopover",
    "Habilitation": "Authorization", "Habilitations": "Authorizations",
    "Formation": "Training", "Formations": "Trainings",
    "Certification": "Certification", "Certifications": "Certifications",
    "Vérification": "Verification", "Vérifications": "Verifications",
    "Exemption": "Exemption", "Exemptions": "Exemptions",
    "Incident": "Incident", "Incidents": "Incidents",
    "Conflit": "Conflict", "Conflits": "Conflicts",
    "Scénario": "Scenario", "Scénarios": "Scenarios",
    "Workflow": "Workflow", "Workflows": "Workflows",
    "Étape": "Step", "Étapes": "Steps",
    "Transition": "Transition", "Transitions": "Transitions",
    "Validation": "Validation", "Validations": "Validations",
    "Approbation": "Approval", "Approbations": "Approvals",
    "Annonce": "Announcement", "Annonces": "Announcements",
    "Notification": "Notification", "Notifications": "Notifications",
    "Alerte": "Alert", "Alertes": "Alerts",
    "Erreur": "Error", "Avertissement": "Warning",
    "Information": "Information", "Succès": "Success",
    "Confidentialité": "Privacy", "Sécurité": "Security",
    "Confidentiel": "Confidential", "Public": "Public", "Privé": "Private",
    "Imputation": "Imputation",
    "Référentiel": "Reference data", "Référentiels": "Reference data",
    "Catalogue": "Catalog",
    "Tableau de bord": "Dashboard",
    "Vue d'ensemble": "Overview",
    "Liste": "List", "Tableau": "Table",
    "Carte": "Card", "Cartes": "Cards",
    "Filtre": "Filter", "Filtres": "Filters",
    "Recherche": "Search",
    "Réglages": "Settings", "Paramètres": "Settings",
    "Préférences": "Preferences",
    "Compte": "Account", "Comptes": "Accounts",
    "Profil": "Profile", "Profils": "Profiles",
    "Rôle": "Role", "Rôles": "Roles",
    "Permission": "Permission", "Permissions": "Permissions",
    "Groupe": "Group", "Groupes": "Groups",
    "Plateforme": "Platform", "Plateformes": "Platforms",
    "Installation": "Installation", "Installations": "Installations",
    "Pipeline": "Pipeline", "Pipelines": "Pipelines",
    "Pompe": "Pump", "Pompes": "Pumps",
    "Vanne": "Valve", "Vannes": "Valves",
    "Séparateur": "Separator", "Séparateurs": "Separators",
    "Colonne": "Column", "Colonnes": "Columns",
    "Grue": "Crane", "Grues": "Cranes",
    "Réservoir": "Tank", "Réservoirs": "Tanks",
    "Capteur": "Sensor", "Capteurs": "Sensors",
    "Compresseur": "Compressor", "Compresseurs": "Compressors",
    "Échangeur": "Exchanger", "Échangeurs": "Exchangers",
    "Champ": "Field", "Champs": "Fields",
    "Puits": "Well", "Forage": "Drilling",
    "Maintenance": "Maintenance", "Inspection": "Inspection",
    "Audit": "Audit", "Audits": "Audits",
    "Historique": "History", "Évènement": "Event", "Évènements": "Events",
    "Calendrier": "Calendar", "Agenda": "Calendar",
    "Planning": "Planning", "Plan": "Plan",
    "Conformité": "Compliance", "Non-conformité": "Non-compliance",
    "Onglet": "Tab", "Onglets": "Tabs",
    "Vue": "View", "Vues": "Views",
    "Mode édition": "Edit mode", "Mode visualisation": "View mode",
    "Mode plein écran": "Full screen mode",
    # Cellules de table communes
    "Aucun": "None", "Aucune": "None",
    "Tout": "All", "Tous": "All", "Toutes": "All",
    "Oui": "Yes", "Non": "No",
    "Vrai": "True", "Faux": "False",
    "Inconnu": "Unknown", "Indéterminé": "Undetermined",
    "Manquant": "Missing", "Présent": "Present",
    "Optionnel": "Optional", "Requis": "Required",
    "Recommandé": "Recommended", "Obligatoire": "Mandatory",
    "Conseillé": "Advised",
    "Lecture seule": "Read-only", "Lecture-seule": "Read-only",
    "Modifiable": "Editable",
    # Pluriels frequents
    "résultats": "results", "résultat": "result",
    "entrées": "entries", "entrée": "entry",
    "éléments": "items", "élément": "item",
    "lignes": "rows", "ligne": "row",
    "objets": "objects", "objet": "object",
    "personnes": "persons", "personne": "person",
    "demandes": "requests",
    "ouverts": "open", "fermés": "closed",
    # Phrases courantes
    "Aucune donnée": "No data",
    "Aucune donnée à afficher": "No data to display",
    "Aucun résultat": "No results",
    "Tout est calme": "All quiet",
    "Aucune entrée": "No entries",
    "Voir détails": "View details",
    "Voir plus": "View more",
    "Voir moins": "View less",
    "En savoir plus": "Learn more",
    "Ajouter un élément": "Add an item",
    "Aucun élément": "No item",
    "Champ requis": "Required field",
    "Champ obligatoire": "Required field",
    # Time
    "Aujourd'hui": "Today", "Hier": "Yesterday", "Demain": "Tomorrow",
    "Cette semaine": "This week", "Ce mois": "This month",
    "Cette année": "This year",
    "Maintenant": "Now", "Plus tard": "Later",
    "Bientôt": "Soon", "Jamais": "Never",
    "À venir": "Upcoming", "Passé": "Past", "Présent": "Present",
    # Units & abbr
    "PJ": "Attachment", "Pièce jointe": "Attachment",
    "Pièces jointes": "Attachments",
    # Verbs au passe
    "Créé": "Created", "Modifié": "Modified",
    "Supprimé": "Deleted", "Approuvé par": "Approved by",
    "Modifié par": "Modified by", "Créé par": "Created by",
    "Validé par": "Validated by", "Par": "By",
    # Misc OpsFlux
    "DN (in)": "DN (in)",  # garde tel quel
    "ID Pipeline": "Pipeline ID",
    "Applicabilité": "Applicability",
    "Émetteur": "Issuer",
    "Propriétaire": "Owner",
    "Cible": "Target",
    "Code Type": "Type code",
    "Nom Type": "Type name",
    "Validité": "Validity",
    "Date de prise d'effet": "Effective date",
    "Depuis": "From", "Jusqu'à": "Until",
    "De": "From", "Vers": "To",
    "Employé": "Employee", "Employés": "Employees",
    "Intitulé": "Title",
    "Compétence": "Skill", "Compétences": "Skills",
    "Spécialité": "Specialty", "Spécialités": "Specialties",
    "Métier": "Trade", "Métiers": "Trades",
    "Expérience": "Experience",
    "Notes": "Notes", "Commentaire": "Comment", "Commentaires": "Comments",

    # ─── Phrases d'erreur metier (courantes) ─────────────────────────
    "Accès refusé.": "Access denied.",
    "Accès non autorisé.": "Access not authorized.",
    "Accès administrateur requis.": "Administrator access required.",
    "Authentification requise.": "Authentication required.",
    "Permission denied": "Permission denied",
    "Permission refusée": "Permission denied",
    "Permission insuffisante": "Insufficient permission",
    "Non autorisé": "Not authorized",
    "Champ requis": "Required field",
    "Champ obligatoire": "Required field",
    "Champ vide": "Empty field",
    "Format invalide": "Invalid format",
    "Valeur invalide": "Invalid value",
    "Date invalide": "Invalid date",
    "Email invalide": "Invalid email",
    "URL invalide": "Invalid URL",
    "UUID invalide": "Invalid UUID",
    "Token invalide": "Invalid token",
    "Token expiré": "Token expired",
    "Session expirée": "Session expired",
    "Identifiants invalides": "Invalid credentials",
    "Mot de passe incorrect": "Incorrect password",
    "Mot de passe trop court": "Password too short",
    "Mot de passe trop faible": "Password too weak",
    "Compte verrouillé": "Account locked",
    "Compte désactivé": "Account disabled",
    "Compte introuvable": "Account not found",
    "Utilisateur introuvable": "User not found",
    "Contact introuvable": "Contact not found",
    "Tier introuvable": "Tier not found",
    "Projet introuvable": "Project not found",
    "Tâche introuvable": "Task not found",
    "Activité introuvable": "Activity not found",
    "Activité introuvable.": "Activity not found.",
    "ADS introuvable": "ADS not found",
    "AdS introuvable": "AdS not found",
    "MOC introuvable": "MOC not found",
    "Voyage introuvable": "Voyage not found",
    "Cargo introuvable": "Cargo not found",
    "Document introuvable": "Document not found",
    "Site introuvable": "Site not found",
    "Installation introuvable": "Installation not found",
    "Équipement introuvable": "Equipment not found",
    "Équipe introuvable": "Team not found",
    "Groupe introuvable": "Group not found",
    "Rôle introuvable": "Role not found",
    "Entité introuvable": "Entity not found",
    "Workflow introuvable": "Workflow not found",
    "Annonce introuvable": "Announcement not found",
    "Ressource introuvable": "Resource not found",
    "Page introuvable": "Page not found",
    "Élément introuvable": "Item not found",
    # Impossible de X cette Y patterns
    "Impossible de soumettre cette activité dans son statut actuel.":
        "Cannot submit this activity in its current status.",
    "Impossible de valider cette activité dans son statut actuel.":
        "Cannot validate this activity in its current status.",
    "Impossible de rejeter cette activité dans son statut actuel.":
        "Cannot reject this activity in its current status.",
    "Impossible d'annuler cette activité dans son statut actuel.":
        "Cannot cancel this activity in its current status.",
    "Impossible de terminer cet ADS dans son statut actuel.":
        "Cannot complete this AdS in its current status.",
    "Impossible de clôturer ce voyage dans son statut actuel.":
        "Cannot close this voyage in its current status.",
    "Impossible de modifier un scénario promu en référence.":
        "Cannot modify a scenario promoted to reference.",
    "Impossible de promouvoir un scénario archivé.":
        "Cannot promote an archived scenario.",
    "Impossible de supprimer un nœud racine.":
        "Cannot delete a root node.",
    "Impossible de supprimer le rôle Super Admin.":
        "Cannot delete the Super Admin role.",
    "Impossible d'approuver cette exemption dans son statut actuel.":
        "Cannot approve this exemption in its current status.",
    "Impossible d'ajouter des passagers à un manifeste qui n'est pas en brouillon.":
        "Cannot add passengers to a non-draft manifest.",
    # Vous n'avez pas la permission de X
    "Vous n'avez pas la permission de modifier cette activité.":
        "You don't have permission to modify this activity.",
    "Vous n'avez pas la permission de modifier ce projet.":
        "You don't have permission to modify this project.",
    "Vous n'avez pas la permission de modifier cet ADS.":
        "You don't have permission to modify this AdS.",
    "Vous n'avez pas la permission de supprimer cet élément.":
        "You don't have permission to delete this item.",
    # Conflits / dependances
    "Une activité ne peut pas dépendre d'elle-même.":
        "An activity cannot depend on itself.",
    "L'activité doit être prédécesseur ou successeur, pas les deux.":
        "Activity must be predecessor or successor, not both.",
    "Le quota PAX doit être supérieur à 0 pour pouvoir soumettre une activité terminale (sans sous-activités).":
        "PAX quota must be greater than 0 to submit a terminal activity (without sub-activities).",
    # Archivage / sites actifs
    "Impossible d'archiver le champ : des sites actifs y sont rattachés.":
        "Cannot archive field: active sites are attached.",
    "Impossible d'archiver l'installation : des équipements actifs y sont rattachés.":
        "Cannot archive installation: active equipment is attached.",
    "Impossible d'archiver le site : des installations actives y sont rattachées.":
        "Cannot archive site: active installations are attached.",
    # Toast generic
    "Erreur": "Error",
    "Succès": "Success",
    "Information": "Information",
    "Avertissement": "Warning",
    "Erreur de chargement": "Loading error",
    "Erreur de sauvegarde": "Save error",
    "Erreur de mise à jour": "Update error",
    "Erreur de suppression": "Delete error",
    "Erreur de création": "Create error",
    "Confirmation requise": "Confirmation required",
    "Opération en cours": "Operation in progress",
    "Opération terminée": "Operation completed",
    "Opération réussie": "Operation succeeded",
    "Opération échouée": "Operation failed",
    "Modifications enregistrées": "Changes saved",
    "Modifications annulées": "Changes cancelled",
    "Aucune modification": "No changes",
    "Modification enregistrée": "Change saved",
    "Élément créé": "Item created",
    "Élément modifié": "Item modified",
    "Élément supprimé": "Item deleted",
    "Élément archivé": "Item archived",
    "Élément restauré": "Item restored",
    # 2-word frequent French
    "Date de": "Date of",
    "Nom de": "Name of",
    "Type de": "Type of",
    "Code de": "Code of",
    "Liste de": "List of",
    "Liste des": "List of",
    "Numéro de": "Number of",
    "Statut de": "Status of",
    "Statut du": "Status of",
    "Détails de": "Details of",
    "Détails du": "Details of",
    "Nombre de": "Number of",
    "Total de": "Total of",
    "Total des": "Total of",
    "Etat de": "State of",
    "État de": "State of",
}


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


def build_training_map(fr: dict, en: dict) -> dict[str, str]:
    """A partir des cles avec FR ET EN, construit un mapping fr_val -> en_val.
    Si plusieurs FR identiques mappent vers des EN differents, on prend le
    EN le plus frequent (vote)."""
    from collections import Counter
    pair_votes: dict[str, Counter] = {}
    for path, fr_val in walk(fr):
        if not isinstance(fr_val, str):
            continue
        en_val = getp(en, path)
        if not isinstance(en_val, str):
            continue
        if not fr_val.strip() or not en_val.strip():
            continue
        # Skip valeurs identiques FR == EN (probable code/identifier)
        if fr_val == en_val:
            continue
        pair_votes.setdefault(fr_val, Counter())[en_val] += 1
    result = {}
    for fr_v, c in pair_votes.items():
        most = c.most_common(1)[0][0]
        result[fr_v] = most
    return result


def translate(fr_val: str, training: dict[str, str]) -> str | None:
    """Tente de traduire une valeur FR -> EN."""
    if not isinstance(fr_val, str) or not fr_val.strip():
        return None

    def lookup(key: str) -> str | None:
        if key in training:
            return training[key]
        if key in METIER_MAP:
            return METIER_MAP[key]
        return None

    # 1. Match exact
    res = lookup(fr_val)
    if res is not None:
        return res

    # 2. Strip whitespace
    stripped = fr_val.strip()
    if stripped != fr_val:
        res = lookup(stripped)
        if res is not None:
            return res

    # 3. Trailing punctuation (point, point-virgule)
    # Si la valeur se termine par .;: : essaie sans
    trailing_punct = ''
    cleaned = stripped
    while cleaned and cleaned[-1] in '.;:':
        trailing_punct = cleaned[-1] + trailing_punct
        cleaned = cleaned[:-1].rstrip()
    if cleaned != stripped:
        res = lookup(cleaned)
        if res is not None:
            return res + trailing_punct

    # 4. Si commence par majuscule, tente la version minuscule
    if stripped and stripped[0].isupper():
        lower = stripped[0].lower() + stripped[1:]
        res = lookup(lower)
        if res is not None:
            return res[0].upper() + res[1:] if res else res
        # Avec ponctuation finale
        if cleaned and cleaned[0].isupper():
            lower_c = cleaned[0].lower() + cleaned[1:]
            res = lookup(lower_c)
            if res is not None:
                upper_res = res[0].upper() + res[1:] if res else res
                return upper_res + trailing_punct

    # 5. Patterns courants type "X introuvable", "X requis", "X invalide"
    # On extrait le X, le traduit, et reconstitue avec le pattern EN
    patterns = [
        # FR pattern -> EN pattern (where {} is the variable part)
        (re.compile(r"^(.+?)\s+introuvable\.?\s*$", re.IGNORECASE),
         "{0} not found."),
        (re.compile(r"^(.+?)\s+requis\.?\s*$", re.IGNORECASE),
         "{0} required."),
        (re.compile(r"^(.+?)\s+obligatoire\.?\s*$", re.IGNORECASE),
         "{0} mandatory."),
        (re.compile(r"^(.+?)\s+invalide\.?\s*$", re.IGNORECASE),
         "{0} invalid."),
        (re.compile(r"^(.+?)\s+expir[ée]\.?\s*$", re.IGNORECASE),
         "{0} expired."),
        (re.compile(r"^(.+?)\s+manquant\.?\s*$", re.IGNORECASE),
         "{0} missing."),
        (re.compile(r"^Aucun[e]?\s+(.+?)\s+trouv[ée][s]?\.?\s*$", re.IGNORECASE),
         "No {0} found."),
        (re.compile(r"^Aucun[e]?\s+(.+?)\.?\s*$", re.IGNORECASE),
         "No {0}."),
        (re.compile(r"^Impossible\s+de\s+(.+?)\.?\s*$", re.IGNORECASE),
         "Cannot {0}."),
        (re.compile(r"^Erreur\s+de\s+(.+?)\.?\s*$", re.IGNORECASE),
         "{0} error."),
    ]
    for fr_pat, en_template in patterns:
        m = fr_pat.match(stripped)
        if not m:
            continue
        var_fr = m.group(1).strip()
        var_en = lookup(var_fr) or lookup(var_fr.lower()) or lookup(
            var_fr[0].lower() + var_fr[1:] if var_fr else ""
        )
        if var_en is None:
            continue
        # Premiere lettre majuscule
        result = en_template.format(var_en)
        if result and not result[0].isupper():
            result = result[0].upper() + result[1:]
        return result

    return None


def main():
    dry_run = '--dry-run' in sys.argv

    fr = json.load(io.open(FR_PATH, encoding='utf-8'))
    en = json.load(io.open(EN_PATH, encoding='utf-8'))

    training = build_training_map(fr, en)
    print(f'Training pairs : {len(training)}')

    added = 0
    not_found = []
    for path, fr_val in walk(fr):
        if not isinstance(fr_val, str):
            continue
        if getp(en, path) is not None:
            continue
        en_val = translate(fr_val, training)
        if en_val is not None:
            setp(en, path, en_val)
            added += 1
        else:
            not_found.append((path, fr_val))

    print(f'EN ajoutees : {added}')
    print(f'Non traduites : {len(not_found)}')
    print(f'\nEchantillon non traduites (10) :')
    for p, v in not_found[:10]:
        print(f'  {p} = {v!r}'[:140])

    if not dry_run and added > 0:
        with io.open(EN_PATH, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(en, f, ensure_ascii=False, indent=2)
            f.write('\n')
        print(f'\n[written] {EN_PATH}')
    elif dry_run:
        print('\n[dry-run] no write.')


if __name__ == '__main__':
    main()
