# Analyse Fonctionnelle Complète — Module PaxLog

## 1. Vue d'ensemble

PaxLog gère le cycle complet de **mobilisation du personnel sur site industriel**. Chaque personne qui monte sur un site Perenco doit avoir une demande approuvée dans PaxLog.

**Deux périmètres :**
- **Phase 1 — Avis de Séjour (AdS)** : mobilisation vers le point d'entrée d'un site
- **Phase 2 — Programme de Séjour** : déplacements intra-champ une fois sur site

**Acteurs clés :**
- **Demandeur interne** : employé Perenco qui soumet pour lui-même ou son équipe
- **Superviseur externe** : représentant d'une entreprise sous-traitante (accès via portail sécurisé)
- **Validateur N1/N2** : responsables qui approuvent les demandes
- **Arbitre (DO)** : tranche les dépassements de capacité
- **Admin PaxLog** : configure les workflows, matrices, limites
- **HSE Admin** : définit les prérequis santé-sécurité

---

## 2. Gestion des profils PAX

### 2.1 Concept de profil PAX

Un profil PAX est la **fiche d'identité** d'une personne susceptible de monter sur site. Il est distinct du compte utilisateur OpsFlux :
- Un employé Perenco avec un compte OpsFlux a un profil PAX lié à son compte (`user_id`)
- Un sous-traitant externe sans compte OpsFlux a un profil PAX sans `user_id`
- Un profil PAX peut exister sans jamais avoir de compte

**Données d'un profil PAX :**
- Identité : nom, prénom, date de naissance, nationalité
- Entreprise et groupe d'appartenance
- Badge, photo
- Statut : `active` (normal), `incomplete` (données manquantes), `suspended` (interdit temporairement), `archived`
- Score de complétude (0-100%) calculé automatiquement selon les champs renseignés
- Origine : synchronisé intranet (`synced_from_intranet=true`) ou créé manuellement

### 2.2 Synchronisation intranet

Pour les employés Perenco, les données sont synchronisées depuis le système intranet de l'entreprise (via API, LDAP ou import CSV selon la configuration de l'entité).

**Champs synchronisés :** nom, prénom, matricule (`intranet_id`), département, poste, photo.

**Règles de synchronisation :**
- Si le profil existe déjà (même `intranet_id`) → mise à jour des données synchronisées
- Si le profil n'existe pas → création automatique avec `synced_from_intranet=true`
- Les données synchronisées ne peuvent pas être modifiées manuellement dans OpsFlux — elles sont overridées à la prochaine synchro
- Les données non synchronisées (certifications, date de naissance si absente de l'intranet) peuvent être complétées manuellement

**Désynchro :** Quand l'intranet notifie qu'un employé est désactivé → `pax_profile.status = suspended`, toutes ses AdS actives passent en `requires_review`.

### 2.3 Déduplication des profils externes

**Problème :** Les sous-traitants sont saisis manuellement. Sans contrôle, on se retrouve avec "Jean DUPONT", "DUPONT Jean", "Jean Dupont" et "jean dupont" comme 4 profils différents pour la même personne.

**Algorithme de déduplication :**

Étape 1 — Normalisation :
```python
s = text.lower()
s = unicodedata.normalize('NFD', s)  # décompose les accents
s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')  # supprime les diacritiques
s = re.sub(r'[-\']', ' ', s)  # tirets et apostrophes → espace
s = re.sub(r'\s+', ' ', s).strip()  # espaces multiples
```

Étape 2 — Calcul du score de similarité :
```
score = 0.5 × similarity(last_name_normalized, last_name_normalized_ref)
      + 0.3 × similarity(first_name_normalized, first_name_normalized_ref)
      + 0.2 × (1.0 si birth_date correspond, 0 sinon)
```
La fonction `similarity()` utilise `rapidfuzz.fuzz.token_sort_ratio` (résistant aux inversions prénom/nom).

Étape 3 — Décision :
- Score < 0.75 : pas de doublon probable, création normale
- 0.75 ≤ score < 0.95 : affichage d'un panneau de sélection avec les profils proches ("Ces profils semblent similaires. Voulez-vous utiliser un profil existant ?")
- Score ≥ 0.95 et même entreprise : quasi-certitude de doublon, fusion automatique proposée
- Score ≥ 0.95 et entreprise différente : flag `cross_company_flag=true` → signalement au validateur

**Périmètre de recherche :** Configurable — par défaut on cherche dans toute la base (toutes les entreprises). Peut être restreint à la même entreprise si l'administrateur le configure.

**Gestion des doublons détectés a posteriori :** L'administrateur `PAX_ADMIN` peut fusionner deux profils. Les AdS du profil supprimé sont réaffectées au profil conservé.

### 2.4 Profils incomplets

Un profil peut être `incomplete` si des données obligatoires manquent. Le score de complétude est calculé selon une pondération configurable :
- Nom + prénom : 30%
- Date de naissance : 15%
- Entreprise : 15%
- Photo : 10%
- Au moins une certification valide : 30%

Un profil `incomplete` peut être utilisé dans une AdS, mais les certifications manquantes seront détectées lors de la vérification HSE et bloqueront l'approbation.

---

## 3. Certifications et formations

### 3.1 Référentiel des types de certifications

Géré par `HSE_ADMIN`. Chaque type de certification définit :
- **Code** (ex: `H2S_AWARENESS`, `BOSIET`, `MEDIC_FIT`, `OPITO_STCW`)
- **Catégorie** : safety, medical, technical, administrative
- **Validité** : avec ou sans expiration, durée en mois si applicable
- **Preuve requise** : oui/non — si oui, un document doit être joint
- **Service booking** : quel département contacter pour organiser/renouveler

**Exemples de certifications courantes sur des sites pétroliers :**
- `H2S_AWARENESS` : Formation H2S (gaz sulfureux) — valide 2 ans
- `BOSIET` : Basic Offshore Safety Induction & Emergency Training — valide 4 ans
- `FOET` : Further Offshore Emergency Training — renouvellement BOSIET
- `MEDIC_FIT` : Aptitude médicale — valide 2 ans (données sensibles, accès limité)
- `HUET` : Helicopter Underwater Escape Training — valide 4 ans

### 3.2 Enregistrement d'une certification pour un PAX

**Qui peut enregistrer ?**
- Le PAX lui-même (si droit accordé par l'admin)
- Son superviseur d'entreprise
- Un administrateur PaxLog/HSE

**Processus :**
1. Sélection du type de certification.
2. Saisie de la date d'obtention et de la date d'expiration (calculée automatiquement si durée connue, mais modifiable).
3. Upload du document justificatif (PDF, image).
4. La certification est créée en statut `pending_validation`.
5. Un `HSE_ADMIN` ou `PAX_ADMIN` valide la preuve → statut passe à `valid`.
6. Si la preuve est rejetée (document illisible, non conforme) → statut `rejected` avec motif.

**Cas de certification sans expiration :** Certaines habilitations (ex: permis de conduire engins) n'expirent pas. `has_expiry=false`, pas de `expiry_date`.

**Alerte d'expiration :** Le module AI détecte automatiquement les certifications qui expirent dans les `PAX_MEDICAL_WARN_DAYS` jours pour les PAX ayant des AdS actives. Une anomalie est créée et notifiée.

**Alertes d'expiration à 2 paliers :**

Deux paliers d'alerte explicites sont définis pour les certifications :
- **J-30** : notification au PAX + responsable HSE de l'entreprise → "Votre BOSIET expire dans 30 jours"
- **J-7** : rappel urgent au PAX + responsable HSE + CDS du site habituel → "URGENT : BOSIET expire dans 7 jours"

Les seuils (30 et 7 jours) sont les valeurs par défaut, configurables par type de certification dans les settings du module. Chaque type de certification peut avoir ses propres seuils d'alerte adaptés à la durée de renouvellement typique de la formation concernée.

### 3.3 Matrice de prérequis HSE

**Concept :** Pour chaque asset (à n'importe quel niveau de la hiérarchie), l'`HSE_ADMIN` (niveau central) ou le `SITE_MGR` (niveau local) définit les certifications obligatoires.

**Deux niveaux de définition :**
1. **HSE central** (`defined_by = 'hse_central'`) : exigences minimales applicables à tous les sites. Tout asset hérite de ces exigences. Ne peut être configuré que par `HSE_ADMIN`.
2. **Site** (`defined_by = 'site'`) : exigences supplémentaires spécifiques à un asset particulier. Configuré par `SITE_MGR` pour son site. Ne peut pas être moins restrictif que le minimum HSE central.

**Héritage dans la hiérarchie :**
Un PAX souhaitant aller sur ESF1 (enfant de Munja) doit satisfaire :
- Les exigences HSE centrales (applicables partout)
- Les exigences définies au niveau du Champ EBOME
- Les exigences définies au niveau du Site Munja
- Les exigences définies au niveau de la Plateforme ESF1

**Scope d'une exigence :**
- `all_visitors` : s'applique à tout le monde
- `contractors_only` : uniquement les PAX externes
- `permanent_staff_only` : uniquement les employés Perenco permanents

---

## 4. Avis de Séjour (AdS) — Phase 1

### 4.1 Concept et règle fondamentale

Un Avis de Séjour est une demande formelle d'accès à un site. **Sans AdS approuvée, personne ne monte sur site.** C'est la règle absolue.

L'AdS permet de :
- Identifier qui va sur quel site et pour quelle durée
- Vérifier que les prérequis HSE sont satisfaits
- Contrôler que la capacité du site n'est pas dépassée
- Générer automatiquement le manifeste de transport dans TravelWiz

### 4.2 Types d'AdS

**AdS individuelle :** Un seul PAX. La plus courante pour les employés Perenco.

**AdS d'équipe :** Plusieurs PAX groupés dans une seule demande. Typique pour les sous-traitants qui envoient une équipe. Chaque PAX de l'équipe est évalué individuellement pour la compliance HSE.

### 4.3 Distinction cruciale : Site d'entrée vs Destination réelle

**Site d'entrée (`site_entry_asset_id`) :** Le point d'arrivée logistique. Exemple : "Wouri Jetty" ou "Munja". C'est ce qui détermine quel vecteur de transport sera utilisé.

**Destinations intra-champ :** Une fois sur le site d'entrée, le PAX peut se déplacer vers plusieurs plateformes (ESF1, KLF3, BTF1...). Ces déplacements sont gérés dans le Programme de Séjour (Phase 2) et s'appuient sur le surfeur de TravelWiz.

**Implication :** Une AdS pour Munja peut concerner un PAX qui va en réalité travailler sur ESF1. La vérification HSE porte sur le site d'entrée ET sur la destination finale réelle déclarée dans le Programme de Séjour.

### 4.4 Création d'une AdS

**Informations requises :**
1. Identité du ou des PAX (recherche fuzzy avec déduplication pour les externes)
2. Site d'entrée (sélection dans la hiérarchie Asset Registry)
3. Objet de la visite (texte libre)
4. Catégorie de visite : `project_work`, `maintenance`, `inspection`, `visit`, `permanent_ops`, `other`
5. Période (dates d'arrivée et de départ prévues)
6. Activité Planner associée (obligatoire si la catégorie le requiert selon la configuration)
7. Imputations projet/centre de coût
8. Besoins de transport (optionnel)

**Vérification en temps réel lors de la saisie :**
À chaque ajout d'un PAX, le système affiche immédiatement :
- ✓ Formations valides pour le site cible
- ⚠ Formations expirées (avec dates d'expiration)
- ✗ Formations manquantes
- Disponibilité de capacité sur le site pour la période

**Règle sur l'activité Planner :**
La configuration par type de visite définit si une activité Planner est obligatoire :
- `project_work` : obligatoire si activité projet approuvée dans Planner
- `maintenance` : obligatoire pour les maintenances planifiées
- `visit` : non obligatoire (visite de courte durée, hors programme)
- `permanent_ops` : non obligatoire (PAX permanents)

Si obligatoire et aucune activité sélectionnée → erreur bloquante à la soumission avec lien vers Planner.

### 4.5 Imputation multi-projet

Un PAX peut venir pour plusieurs projets en même temps ou être présent pour un projet mais imputé sur un autre centre de coût.

**Règles d'imputation :**
- La somme des pourcentages par AdS doit être exactement 100%
- Chaque ligne d'imputation référence un projet ET un centre de coût
- Un PAX peut être associé à un projet X mais imputé sur le CC du projet Y (`cross_imputation = true`)
- Ce cas est signalé visuellement dans l'interface (badge "imputation croisée")

**Exemple :**
- 60% → Projet GCM, CC DRILLING-OPS
- 40% → Projet Entretien Pipeline, CC MAINTENANCE

### 4.6 Soumission de l'AdS

**Avant la soumission, le système vérifie :**
1. Profil PAX complet (données obligatoires)
2. Certifications valides pour le site cible
3. Pas de chevauchement d'AdS interdit (si `allow_overlap = false` sur le site)
4. Imputation à 100%
5. Activité Planner renseignée si requise
6. Quota Planner non dépassé (calcul en temps réel)

**Si tout est OK :** L'AdS passe en `submitted` → `pending_validation`.

**Si certifications manquantes/expirées :** L'AdS peut quand même être soumise avec les PAX bloqués en statut `blocked`. L'adS passe en `pending_compliance`. Les PAX bloqués ne seront transmis à TravelWiz qu'une fois leur compliance rétablie.

**Si quota Planner dépassé :** L'AdS passe en `pending_arbitration` → notification au DO.

### 4.7 Vérification de compliance HSE (détail de l'algorithme)

```python
def check_compliance(pax_id, asset_id, check_date):
    # 1. Remonter la hiérarchie de l'asset via ltree
    asset_path = get_asset_ltree_path(asset_id)
    all_ancestor_ids = get_all_ancestors(asset_path)
    
    # 2. Récupérer toutes les exigences applicables
    requirements = compliance_matrix.filter(
        asset_id IN [asset_id] + all_ancestor_ids,
        mandatory = True,
        scope IN ['all_visitors', scope_for_pax_type]
    )
    
    # 3. Pour chaque exigence
    for req in requirements:
        credential = pax_credentials.get(
            pax_id = pax_id,
            credential_type_id = req.credential_type_id
        )
        
        if not credential:
            result = 'missing'
        elif credential.status != 'valid':
            result = 'not_validated'
        elif credential.expiry_date and credential.expiry_date < check_date:
            result = 'expired'
        else:
            result = 'valid'
        
        compliance_summary.append({
            'credential_type': req.credential_type,
            'status': result,
            'expiry_date': credential.expiry_date if credential else None
        })
    
    is_compliant = all(r['status'] == 'valid' for r in compliance_summary)
    return is_compliant, compliance_summary
```

**Résultat affiché au validateur :**
```
Jean DUPONT — COMPLIANT ✓
  ✓ H2S Awareness — valide jusqu'au 15/03/2027
  ✓ BOSIET — valide jusqu'au 10/07/2026
  ✓ Aptitude médicale — valide jusqu'au 01/01/2027

Amadou NZIE — BLOCKED ✗
  ✓ H2S Awareness — valide jusqu'au 20/06/2026
  ✗ BOSIET — EXPIRÉ le 15/11/2024
  ✗ Aptitude médicale — MANQUANTE
```

### 4.8 Assistance booking formations

Pour chaque certification manquante ou expirée, l'interface propose un bouton "Demander un booking". Cette action :
1. Envoie un email ou crée un ticket au service responsable (défini dans `CredentialType.booking_service_id`)
2. Pré-remplit la demande avec : nom du PAX, type de certification, date d'arrivée prévue sur site
3. Marque `AdSPax.booking_request_sent = true` pour éviter les doublons
4. N'a aucun effet sur le statut de l'AdS — elle reste bloquée jusqu'à preuve validée

---

## 5. Workflow de validation

### 5.1 Statuts complets

```
draft
  ↓ (soumission par le demandeur)
submitted
  ↓ (si compliance à vérifier)
pending_compliance
  ↓ (une fois tous les PAX compliant)
pending_validation
  ↓ (si quota Planner dépassé)
pending_arbitration ← → DO résout
  ↓ (validation N1)
pending_validation (N2 si configuré)
  ↓ (validation N2)
approved
  ↓ (PAX arrive sur site)
in_progress
  ↓ (PAX quitte le site)
completed

À tout moment → cancelled (par le demandeur)
À tout moment → rejected (par un validateur)
approved/in_progress → requires_review (si activité Planner modifiée)
```

### 5.2 Vue du validateur — Dashboard de validation

**3 sections principales :**

**Section 1 — En attente de validation**
Liste des AdS à traiter, triées par ancienneté (plus anciennes en premier). Pour chaque AdS :
- Icône urgence si délai SLA proche
- Badge rouge si incidents actifs concernant cette AdS
- Badge orange si quota Planner proche du dépassement
- Résumé : demandeur, site, période, nombre PAX, statut compliance

**Section 2 — Bloquées par le système**
AdS rejetées automatiquement (prérequis non satisfaits, erreurs de données). Pour information au validateur — il peut aider le demandeur à corriger.

**Section 3 — En arbitrage DO**
AdS en attente de décision du DO sur un dépassement de capacité.

### 5.3 Actions du validateur sur une AdS d'équipe

**Valider tout :** Approuver tous les PAX conformes de la demande en une action.

**Valider sélectivement :** Cocher individuellement les PAX à approuver. Les autres restent en attente ou sont rejetés.

**Valider avec exception :** Approuver un PAX bloqué sous conditions (ex: "La certification est en cours de renouvellement, autorisé exceptionnellement"). Le validateur documente la raison — tracé dans l'audit log.

**Rejeter tout :** Rejet avec motif obligatoire. Tous les PAX passent en `rejected`. Notification automatique au demandeur.

**Rejeter sélectivement :** Rejeter certains PAX, approuver les autres.

**Demander des informations :** Renvoyer au demandeur avec un commentaire. L'AdS passe en `submitted` avec message. Le demandeur doit compléter et resoumettre.

**Escalader en arbitrage :** Envoyer au DO pour décision (ex: le validateur n'a pas l'autorité pour décider seul d'un dépassement).

### 5.4 Délais de relance pour `requires_review`

Si une AdS reste en statut `requires_review` sans action du CDS :
- **J+14** : rappel automatique envoyé au CDS avec le motif de la mise en révision
- **J+28** : le CDS peut forcer l'annulation de l'AdS (bouton "Annulation forcée" disponible dans l'interface de validation)
- Ces délais sont configurables dans les settings du module :
  - `paxlog.requires_review_reminder_days` = 14 (défaut)
  - `paxlog.requires_review_force_cancel_days` = 28 (défaut)

### 5.5 Gestion des incidents lors de la validation

**Règle :** Si un incident actif (`PaxIncident` non résolu) existe pour un PAX de la demande, son entreprise, ou le site cible → le validateur voit un bandeau d'alerte et doit explicitement acquitter l'information avant de pouvoir valider.

**Comportement selon la sévérité :**
- `info` : bandeau bleu, peut valider directement
- `warning` : bandeau orange, doit acquitter pour pouvoir valider
- `temp_ban` : bandeau rouge, validation bloquée si la période de ban chevauche les dates de l'AdS
- `permanent_ban` : validation bloquée, impossible d'approuver ce PAX

**Acquittement :** Le validateur clique "J'ai pris connaissance de cet incident" avec commentaire optionnel. Cet acquittement est tracé dans l'audit log.

### 5.6 Cross-company flag

Si un profil externe a des données très similaires à un profil d'une autre entreprise → `cross_company_flag = true` sur l'AdS.

**Ce que le validateur voit :**
- Bandeau jaune : "Attention — profil similaire détecté dans une autre entreprise"
- Affichage côte à côte des deux profils : Jean DUPONT (DIXSTONE) vs Jean DUPONT (SCHLUMBERGER)
- Le validateur doit choisir : confirmer que c'est bien deux personnes différentes, ou signaler un doublon pour fusion

**Cas d'usage réel :** Un technicien change de prestataire et son profil existe dans les deux entreprises. Le système détecte la similarité et alerte.

---

## 6. Portail externe sous-traitant

### 6.1 Concept

Les entreprises sous-traitantes n'ont pas de compte OpsFlux. Pour qu'elles puissent saisir les données de leurs PAX et soumettre des AdS, un "portail externe" léger est disponible via un lien unique sécurisé.

### 6.2 Génération du lien

Un utilisateur interne Perenco (REQUESTER ou supérieur) génère le lien depuis l'interface :
1. Il crée une AdS pré-configurée (site, dates, projet déjà renseignés).
2. Il génère un lien externe pour cette AdS.
3. Il peut pré-configurer des données : site, dates, objet de visite, instructions particulières.
4. Il renseigne l'email/SMS où envoyer l'OTP à l'utilisateur externe.
5. Il définit la durée de validité du lien et le nombre max d'utilisations.

### 6.3 Accès via le lien

1. L'utilisateur externe reçoit le lien : `https://ext.app.opsflux.io/{token}`
2. À l'accès, si `otp_required = true` : l'OTP est envoyé à `otp_sent_to` (email ou SMS)
3. L'utilisateur saisit l'OTP (valide 10 minutes, 3 tentatives max avant blocage)
4. Accès accordé à la seule AdS ciblée, pré-remplie avec les données configurées

**Ce que l'utilisateur externe peut faire sur le portail :**
- Voir l'AdS et ses données pré-remplies
- Ajouter les PAX de son entreprise (avec déduplication fuzzy)
- Compléter les certifications manquantes et uploader les justificatifs
- Soumettre l'AdS pour validation

**Ce que l'utilisateur externe ne peut pas faire :**
- Accéder à d'autres AdS
- Voir les profils PAX d'autres entreprises
- Modifier les données pré-configurées (site, dates, projet)
- Modifier le workflow ou les prérequis

### 6.4 Tracking de sécurité

Chaque accès est loggé dans `access_log` de l'`ExternalAccessLink` :
- Adresse IP
- Géolocalisation (via IP, approximative)
- User-agent du navigateur
- Horodatage
- Action effectuée (consultation, saisie, soumission, OTP validé)

Ce log est visible par l'utilisateur interne qui a créé le lien. Il peut révoquer le lien à tout moment.

**Expiration automatique :** Le lien expire à la date `expires_at` ou après `max_uses` utilisations. Une fois expiré, il retourne une page "Lien expiré" avec un message de contact.

**Rate limiting :** 10 requêtes par minute par IP sur le portail externe.

---

## 7. Cycles de rotation PAX

### 7.1 Concept

Certains PAX (opérateurs, techniciens permanents) travaillent en rotation : 28 jours sur site / 28 jours de repos, ou 14/14, etc. OpsFlux gère ces cycles et crée automatiquement les AdS périodiques.

### 7.2 Configuration d'un cycle

```
pax_rotation_cycles:
- PAX : Amadou NZIE
- Site d'entrée : Munja
- Rotation : 28 jours ON / 28 jours OFF
- Début du cycle : 2026-01-01
- AdS automatiques : OUI (lead time = 7 jours avant chaque période)
- Projet par défaut : Exploitation permanente ESF1
- Centre de coût par défaut : CC-OPS-EBOME
```

### 7.3 Calcul de la prochaine période

```python
def compute_next_on_period(cycle):
    cycle_length = cycle.rotation_days_on + cycle.rotation_days_off
    days_since_start = (today - cycle.cycle_start_date).days
    position_in_cycle = days_since_start % cycle_length
    
    if position_in_cycle < cycle.rotation_days_on:
        # Actuellement en période ON
        on_start = today - timedelta(days=position_in_cycle)
        on_end = on_start + timedelta(days=cycle.rotation_days_on - 1)
    else:
        # Actuellement en période OFF → calculer la prochaine période ON
        days_until_next_on = cycle_length - position_in_cycle
        on_start = today + timedelta(days=days_until_next_on)
        on_end = on_start + timedelta(days=cycle.rotation_days_on - 1)
    
    return on_start, on_end
```

### 7.4 Batch quotidien (6h00)

Chaque matin à 6h00, le batch `rotation_cron.py` :
1. Identifie tous les cycles actifs avec `auto_create_ads = true`
2. Calcule la prochaine période ON pour chaque cycle
3. Si la période ON démarre dans ≤ `ads_lead_days` jours et qu'aucune AdS n'existe pour cette période → crée automatiquement une AdS en statut `draft`
4. Notifie le PAX et son responsable : "Votre prochaine rotation est prévue du X au Y. Veuillez soumettre votre AdS."
5. L'AdS créée est un `draft` — elle doit être confirmée et soumise

**Particularité :** Le batch n'approuve pas automatiquement — il crée juste le draft. La validation reste humaine.

---

## 8. Incidents et litiges PAX

### 8.1 Types d'incidents

**`info` :** Information neutre (ex: "ce PAX a une allergie documentée"). Visible lors de la validation mais non bloquant.

**`warning` :** Avertissement (ex: "comportement signalé lors d'une précédente visite"). Le validateur doit acquitter.

**`temp_ban` :** Interdiction temporaire. Le PAX ne peut pas être approuvé pendant la période `ban_start_date` → `ban_end_date`. Si `ban_end_date = null`, l'interdiction dure jusqu'à levée manuelle.

**`permanent_ban` :** Interdiction définitive. Nécessite une décision au niveau DO pour être levée.

### 8.2 Portée d'un incident

Un incident peut être lié à :
- Un PAX spécifique
- Une entreprise entière (tous les PAX de cette entreprise sont concernés)
- Un site spécifique (l'incident ne s'applique que sur ce site)
- Une combinaison (PAX X interdit sur le site Y)

**Exemple :** L'entreprise DIXSTONE a eu un incident de sécurité grave sur ESF1 → incident `temp_ban` pour la société sur cet asset pendant 6 mois.

### 8.3 Création d'un incident

**Qui peut créer ?** `SITE_MGR`, `HSE_ADMIN`, `DO`.

**Processus :**
1. Sélection du type et de la sévérité.
2. Description obligatoire de l'incident (texte libre).
3. Date de l'incident.
4. Si `temp_ban` ou `permanent_ban` : dates de début et fin d'interdiction.
5. Après création, le système vérifie si des AdS actives sont concernées → notification aux validateurs.

### 8.4 Résolution d'un incident

Quand la situation est résolue :
1. L'utilisateur habilité (`SITE_MGR`, `HSE_ADMIN`, `DO`) clique "Résoudre".
2. Il saisit les notes de résolution.
3. L'incident passe en `resolved_at = now()`.
4. Les AdS précédemment bloquées par cet incident sont notifiées que le blocage est levé.

**Note :** Un incident résolu reste visible dans l'historique du PAX/entreprise. Il n'est jamais supprimé.

---

## 9. Programme de Séjour — Phase 2

### 9.1 Concept

Une fois qu'un PAX a une AdS approuvée et est arrivé sur site (Munja par exemple), il peut se déplacer vers plusieurs plateformes du même champ. Ces déplacements intra-champ constituent le "Programme de Séjour".

### 9.2 Création d'un Programme de Séjour

1. Le PAX (ou son responsable sur site) crée un Programme de Séjour lié à son AdS approuvée.
2. Il déclare les mouvements prévus :
   - Mouvement 1 : Munja → ESF1, le 12/05, pour "Inspection puits KLF-3"
   - Mouvement 2 : ESF1 → KLF3, le 13/05, pour "Réunion technique"
   - Mouvement 3 : KLF3 → Munja, le 15/05, retour
3. Le système vérifie les prérequis HSE pour chaque destination intra-champ.
4. Le programme est soumis au logisticien sur site.

### 9.3 Workflow allégé

1. PAX/responsable soumet le programme (statut `draft` → `submitted`)
2. Vérification automatique des prérequis HSE pour chaque destination
3. Validation par le logisticien sur site (1 seul niveau de validation)
4. Statut `approved`
5. Le programme approuvé émet `stay_program.approved` → TravelWiz génère les trips surfeur

**Différence avec le workflow AdS :** Pas de multiple niveaux, pas d'arbitrage DO, pas de vérification de quota Planner (déplacements intra-champ).

---

## 10. Tâches préparatoires AVM

### 10.1 Workflow visa dans l'AVM

Tâche préparatoire "visa" dans l'AVM avec cycle de statuts FSM :
- `to_initiate` → `submitted` → `under_review` → `obtained` | `refused`
- Chaque transition de statut notifie le responsable AVM
- Si `refused` : alerte critique générée, l'AVM ne peut pas passer en statut `ready`
- Champs associés :
  - Numéro de demande
  - Date de soumission
  - Date d'obtention
  - Date d'expiration
  - Scan du visa (document uploadé via le service Storage)

### 10.2 Workflow indemnités dans l'AVM

Tâche préparatoire "indemnité grand déplacement" avec cycle de statuts :
- `draft` → `submitted` → `approved` → `paid`
- Champs associés :
  - Montant calculé : nombre de jours × taux journalier
  - Référence de paiement : saisie manuelle par le comptable après paiement
- Le taux journalier est configurable dans les settings du module (`paxlog.daily_allowance_rate`)

---

## 11. Données médicales (politique MEDIC_POLICY)

**Situation actuelle :** En attente de validation avec DRH/médical Perenco.

**Comportement par défaut implémenté :**
- OpsFlux stocke uniquement : date d'aptitude, date d'expiration, statut (apte/non apte/en attente)
- Aucun diagnostic, résultat d'examen ou information médicale n'est stocké
- Accès restreint : le rôle `MEDICAL` et le PAX lui-même voient la date exacte
- Les validateurs voient uniquement : ✓ Apte / ✗ Non apte — sans la date d'expiration précise

**Marqueur code :**
```python
# TODO: MEDICAL_POLICY — Valider avec DRH Perenco avant mise en production
# Comportement actuel : date aptitude uniquement, accès MEDICAL + PAX_SELF
```

---

## 12. RBAC détaillé PaxLog

| Action | DO | HSE_ADMIN | PAX_ADMIN | SITE_MGR | VAL_N1 | VAL_N2 | REQUESTER | EXT_SUPV | MEDICAL |
|---|---|---|---|---|---|---|---|---|---|
| Créer/modifier profil PAX interne | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Créer profil PAX externe | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ (son groupe) | ✗ |
| Valider une certification | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ (medical seulement) |
| Créer une AdS individuelle | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (son groupe) | ✗ |
| Valider une AdS (N1) | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Valider une AdS (N2) | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ |
| Arbitrer un conflit | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Enregistrer un incident | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Configurer matrice HSE (central) | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Configurer matrice HSE (site) | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Gérer cycles de rotation | ✓ | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Générer lien portail externe | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Voir données médicales (date précise) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |

---

## 13. Signalements

### 13.1 Concept et distinction avec les incidents

Le Signalement remplace et enrichit le concept d'incident. C'est un **dossier formel** avec workflow de validation, effets automatiques sur les AdS, et historique des décisions.

**Différences clés :**
- Un incident (ancienne notion) était enregistré directement — le Signalement passe par un workflow de validation avant d'avoir des effets
- La décision peut être modifiée pendant la phase de revue
- Les effets sont automatiques et immédiats à la validation
- L'historique des décisions est tracé

### 13.2 Cibles d'un signalement

**Personne (`target_type = 'pax')` :** Un ou plusieurs PAX nommément identifiés. Cas le plus courant : comportement d'un individu.

**Équipe (`target_type = 'team'`):** Groupe de personnes qui ont participé collectivement à un événement. Peuvent appartenir à des entreprises différentes.

**Entreprise (`target_type = 'company'`):** Toute l'entreprise est ciblée. S'applique automatiquement à TOUS les PAX de cette entreprise dans le périmètre défini. Cas : entreprise dont les pratiques de sécurité sont systématiquement défaillantes.

### 13.3 Périmètre géographique

Un signalement peut être **global** (s'applique partout) ou **scopé à un asset** (et ses enfants dans la hiérarchie).

**Exemples :**
- Signalement global : "PAX interdit sur tout le périmètre Perenco Cameroun"
- Signalement scopé : "PAX exclu du site Munja et de toutes ses plateformes" → n'affecte pas ses AdS pour le site RDRW

### 13.4 Types de décisions et leurs effets

**`avertissement` :**
- Badge triangle orange ⚠ permanent à côté du nom dans toutes les interfaces
- Au moment de la validation d'une AdS : le validateur VOIT l'avertissement, DOIT acquitter (clic + commentaire optionnel), puis PEUT valider
- Aucun blocage automatique
- Reste visible même expiré (badge bleu informatif)

**`exclusion_site` :**
- Blocantion uniquement pour le site scopé (et ses enfants)
- Les AdS approuvées pour ce site passent en `requires_review`
- Les nouvelles AdS pour ce site : PAX en `blocked_by_signalement`
- Sur d'autres sites : aucun effet (badge ⚠ de vigilance seulement)

**`blacklist_temporaire` :**
- Toutes les AdS approuvées/soumises → rejetées automatiquement à la validation
- Nouvelles AdS : PAX en `blocked_by_signalement` dès la soumission
- Validation groupée impossible si ce PAX est inclus
- Expiration automatique → badge bleu historique

**`blacklist_permanent` :**
- Mêmes effets que blacklist_temporaire mais sans date d'expiration
- Seul le DO peut lever ce type de signalement

### 13.5 Acquittement lors de la validation d'une AdS

Quand un PAX a un signalement actif de type `avertissement`, le validateur doit explicitement acquitter :

```
┌─────────────────────────────────────────────────────────────────────┐
│ ⚠ SIGNALEMENT ACTIF — Amadou NZIE                                  │
│                                                                     │
│ Référence : SIG-2026-00038                                          │
│ Type : Avertissement                                                │
│ Date événement : 15/03/2026                                         │
│ Raison : Violation règle HSE (travail sans EPI)                    │
│ Décision validée par : Antoine KOUASSI (CDS Munja) le 16/03/2026  │
│                                                                     │
│ [ ] J'ai pris connaissance de cet avertissement                    │
│     Commentaire : _______________________________ (optionnel)      │
│                                                                     │
│ [Acquitter et continuer]          [Annuler]                        │
└─────────────────────────────────────────────────────────────────────┘
```

L'acquittement est tracé dans `audit_log` avec : validateur, horodatage, commentaire.

### 13.6 Batch d'expiration automatique

Un batch horaire vérifie les signalements à durée limitée :
```python
# Batch toutes les heures
async def expire_signalements(db: AsyncSession):
    expired = await db.query(Signalement).filter(
        Signalement.status == 'validated',
        Signalement.decision_end_date < date.today(),
        Signalement.decision.in_(['blacklist_temporaire', 'exclusion_site'])
    ).all()
    for sig in expired:
        sig.status = 'expired'
    # Rafraîchir la vue matérialisée
    await db.execute(text("REFRESH MATERIALIZED VIEW CONCURRENTLY active_signalements_by_pax"))
    await db.commit()
```

### 13.7 Photos — Impact sur le workflow

**Règle :** Photo obligatoire pour qu'un PAX soit approuvé dans une AdS.

**Contrôle à la soumission de l'AdS :**
- Photo présente et validée → ✓
- Photo absente → PAX en statut `blocked` avec raison `photo_missing`
- Le demandeur peut uploader la photo depuis le formulaire de demande
- La photo uploadée n'a pas besoin de validation séparée (contrairement aux certifications)

**Sur le portail externe :** L'EXT_SUPV est invité à uploader les photos de ses PAX lors de la saisie. Un bandeau d'alerte apparaît si des photos manquent à la soumission.


---

## 14. Portail externe — deux types de liens

### 14.1 Lien AdS (mobilisation ponctuelle)

Généré par tout utilisateur interne habilité depuis une AdS existante. Permet au superviseur externe de compléter les profils de son équipe **pour cette demande précise**.

**Flux complet :**
1. L'utilisateur interne crée une AdS avec les infos de base (site, dates, projet)
2. Il clique "Générer un lien externe" → choisit l'email/SMS du destinataire, la durée, les instructions
3. Le lien est généré : `https://ext.app.opsflux.io/ads/{token}`
4. Le superviseur externe reçoit l'email/SMS avec le lien
5. Il clique → saisit son OTP → accède à l'AdS pré-remplie
6. Il ajoute ses PAX, uploade les justificatifs, soumet
7. L'AdS entre dans le workflow de validation côté Perenco

**Données pré-remplies (non modifiables par l'externe) :** site, dates, projet, objet de visite, instructions

**Ce que l'externe peut faire :** ajouter/modifier ses PAX, uploader photos et certifications, soumettre

**Ce que l'externe ne peut PAS faire :** modifier les données de cadrage, accéder à d'autres AdS, voir les profils d'autres entreprises

### 14.2 Lien gestion d'équipe (depuis le module Tiers)

Généré depuis la fiche d'une entreprise dans le module Tiers. Lien longue durée pour maintenance continue de l'équipe, **indépendant de toute AdS**.

**Cas d'usage :** Perenco crée un lien pour DIXSTONE. Le responsable DIXSTONE maintient à jour les profils et certifications de ses techniciens tout au long de l'année. Quand une AdS est créée pour une intervention, les profils sont déjà conformes.

**URL :** `https://ext.app.opsflux.io/team/{token}`

**Ce que l'externe peut faire (permissions configurables) :**
- Voir la liste de ses PAX avec leur statut de compliance
- Mettre à jour les informations identitaires
- Uploader/renouveler des certifications
- Ajouter de nouveaux membres à son équipe
- Voir les signalements actifs qui les concernent (avertissements seulement — pas le détail confidentiel)

**Permissions granulaires configurées par Perenco :**
- `can_add_pax` : peut ajouter de nouveaux profils
- `can_update_profiles` : peut modifier les données identitaires
- `can_update_certifications` : peut uploader des justificatifs
- `can_view_compliance` : peut voir le statut HSE par site cible

**Durée de vie :** 7 à 30 jours (configurable). Max_uses = null (utilisable autant de fois que nécessaire pendant la période).

**Révocation :** L'administrateur peut révoquer à tout moment avec motif. Toutes les sessions actives sont invalidées.

### 14.3 Sécurité des deux portails

**OTP :**
- Envoyé par email ou SMS (configurable à la génération)
- Valide 10 minutes, 3 tentatives max avant blocage
- Nouvel OTP peut être demandé après 2 minutes

**Tracking de chaque accès :**
```json
{
  "ip": "41.202.219.45",
  "geolocation": {"country": "CM", "city": "Douala"},
  "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0...)",
  "timestamp": "2026-05-08T10:23:45Z",
  "action": "pax_added",
  "otp_validated": true
}
```

**Rate limiting :** 10 requêtes/minute par IP, 100 requêtes/heure par token.

**Ce qui est loggé dans `audit_log` :** création du lien, chaque accès, chaque modification de profil/certification faite via le portail, soumission de l'AdS, révocation.

---

## 15. Tracking exhaustif — No-shows, rejets, events AdS

### 15.1 Table `ads_events` (log immuable)

Chaque événement dans le cycle de vie d'une AdS est enregistré dans `ads_events` (append-only). Cette table ne peut pas être modifiée, même par `SYS_ADMIN`.

**Types d'événements tracés :**

| event_type | Déclencheur | Payload clé |
|---|---|---|
| `created` | Création de l'AdS | `{requester_id, via_portal: bool}` |
| `submitted` | Soumission | `{pax_count, has_blocked_pax: bool}` |
| `compliance_checked` | Vérification HSE | `{pax_id, results: [{type, status}]}` |
| `blocked` | PAX bloqué | `{pax_id, reason, credential_types_missing}` |
| `unblocked` | PAX débloqué | `{pax_id, credential_type_validated}` |
| `validated_n1` | Validation N1 | `{validator_id, pax_approved: [], pax_rejected: []}` |
| `validated_n2` | Validation N2 | `{validator_id}` |
| `rejected` | Rejet | `{actor_id, reason, pax_ids_rejected}` |
| `cancelled` | Annulation | `{actor_id, reason}` |
| `approved` | Approbation finale | `{approved_pax_ids}` |
| `arbitration_requested` | Dépassement quota | `{quota_requested, quota_available}` |
| `arbitration_resolved` | Décision DO | `{do_id, decision, quota_granted}` |
| `requires_review` | Planner modifié | `{trigger_event, activity_id, old_dates, new_dates}` |
| `no_show` | Manifeste clôturé | `{trip_id, manifest_id, no_show_reason}` |
| `boarded` | Pointage embarquement | `{trip_id, manifest_id, boarded_by}` |
| `completed` | Fin de séjour | `{actual_start, actual_end}` |
| `hidden` | Masquage | `{hidden_by, reason}` — SYS_ADMIN uniquement |
| `signalement_blocked` | Signalement actif | `{signalement_id, decision}` |
| `signalement_cleared` | Signalement levé | `{signalement_id}` |

### 15.2 Dashboard analytique

**Vue "No-shows"** — accessible par LOG_BASE, CDS, DPROD, DO :
- Classement des PAX par nombre de no-shows (12 derniers mois)
- Classement des entreprises par taux de no-show
- Tendance mensuelle
- Filtre par site, route, période

**Vue "Rejets"** — accessible par CHSE, CDS, DO :
- Répartition des causes : compliance HSE, signalement, rejet manuel, quota dépassé
- Entreprises avec le plus de rejets
- Certifications les plus souvent manquantes
- Évolution sur 6/12 mois

**Vue "Compliance"** — accessible par CHSE, DQHSE, CDS :
- Prévision des expirations (dans les 30/60/90 jours)
- Entreprises avec le plus de PAX non conformes
- Types de certifications les plus souvent expirées
- Taux de compliance par site

**Alertes automatiques (module AI) :**
- PAX avec 3+ no-shows en 12 mois → anomalie créée
- Entreprise avec taux de rejet > 30% → anomalie créée
- Certification avec 10+ expirations imminentes (même type) → alerte CHSE
- Site à > 90% de capacité sur 3 jours consécutifs → alerte DO + DPROD

### 15.3 Politique de suppression — règles concrètes

**Ce qu'un utilisateur standard peut faire :**
- Supprimer physiquement une AdS en `draft` jamais soumise (son propre brouillon)
- Archiver (`archived = true`) une AdS `submitted` ou `rejected` (retrait de vue sans perte)

**Ce que SYS_ADMIN peut faire :**
- Passer `hidden = true` sur tout enregistrement (sauf les `completed`/`closed` — immuables)
- Voir tous les enregistrements avec `?include_hidden=true`
- Voir les logs d'accès des portails externes
- Exporter les données pour audit légal

**Ce que personne ne peut faire :**
- Modifier ou supprimer un enregistrement `completed` / `closed` / `validated` dans `ads_events`
- Modifier l'`audit_log`
- Supprimer un manifeste `closed`
- Supprimer une AdS `approved` ou au-delà

**Cas RGPD / demande de suppression d'un PAX externe :**
1. SYS_ADMIN passe `pax_profiles.hidden = true`
2. `pax_credentials.hidden = true` sur toutes ses certifications
3. Les AdS passées restent avec `[Profil masqué]` à la place du nom dans les vues utilisateur
4. L'`ads_events` garde les événements mais sans le nom (juste `pax_id` qui pointe vers le profil masqué)
5. Un événement `hidden` est ajouté à `ads_events` avec le motif
6. Le profil n'apparaît plus dans aucune recherche, aucun rapport — sauf pour SYS_ADMIN

