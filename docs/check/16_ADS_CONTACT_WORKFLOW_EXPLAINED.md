# Workflow AdS pour un contact externe

Date: 2026-04-03

## Objet

Cette note enregistre le workflow métier d'une **AdS** quand le PAX concerné
n'est pas un utilisateur interne mais un **contact externe** (`tier_contact`).

Point de vocabulaire important:

- le **demandeur** de l'AdS est un **utilisateur interne**
- le **PAX** peut être soit un `user`, soit un `contact`
- dans le modèle, cela passe par `AdsPax.user_id` ou `AdsPax.contact_id`, jamais les deux

Références:

- [app/models/paxlog.py](C:/Users/ajha0/Desktop/OPSFLUX/app/models/paxlog.py)
- [app/api/routes/modules/paxlog.py](C:/Users/ajha0/Desktop/OPSFLUX/app/api/routes/modules/paxlog.py)
- [docs/modules/v1/PAXLOG.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/modules/v1/PAXLOG.md)
- [docs/modules/v1/FUNC_PLANNER.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/modules/v1/FUNC_PLANNER.md)
- [docs/modules/v1/FUNC_TRAVELWIZ.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/modules/v1/FUNC_TRAVELWIZ.md)
- [docs/modules/v1/TRAVELWIZ.md](C:/Users/ajha0/Desktop/OPSFLUX/docs/modules/v1/TRAVELWIZ.md)

## 1. Création de la demande

1. Un utilisateur interne crée une AdS en `draft`.
2. Il renseigne le site, les dates, le contexte métier, le transport aller/retour éventuel, et ajoute le PAX externe via `contact_id`.
3. Chaque entrée PAX créée dans `AdsPax` démarre en `pending_check`.

Ce point est confirmé par le code:

- `create_ads()` crée l'AdS en `draft`
- `requester_id = current_user.id`
- les lignes `AdsPax` sont créées avec `status="pending_check"`

## 2. Validation initiale

Le workflow documentaire cible de l'AdS est le suivant:

1. `draft`
2. `pending_initiator_review` si la demande a été préparée pour validation par le véritable initiateur
3. `pending_project_review` si une validation projet est requise
4. `pending_compliance`
5. `pending_validation`
6. `approved`

Pour un contact externe, la phase compliance couvre typiquement:

- documents requis
- badge/habilitations
- photo / identité
- blacklist éventuelle
- quotas tiers / quotas site
- conformité d'accès au site

## 3. Lien avec Planner

Si l'AdS est liée à une activité Planner ou à un projet:

1. la cohérence métier de la présence sur site est d'abord validée
2. ensuite l'AdS suit ses validations de conformité et d'accès

Quand l'activité Planner est modifiée ou réarbitrée:

1. l'impact sur les AdS liées doit être recalculé
2. les AdS concernées peuvent passer en `requires_review`
3. les manifestes TravelWiz liés peuvent eux aussi passer en `requires_review`
4. un nouvel arbitrage peut imposer report, réduction des PAX, prolongation ou retour anticipé

## 4. Départ vers le site

Quand l'AdS passe en `approved`:

1. TravelWiz peut consommer l'événement d'approbation
2. un voyage/manifeste aller est recherché ou créé
3. le contact externe est affecté sur le manifeste correspondant

À la clôture du manifeste aller:

1. si le PAX est effectivement embarqué, l'AdS passe en `in_progress`
2. si le PAX est `no_show`, le séjour ne démarre pas réellement et la demande doit être revue

## 5. Pendant le séjour sur site

Une fois le contact sur site, l'AdS est considérée `in_progress`.

Pendant cette phase, plusieurs cas existent:

### 5.1 Changement de date de fin

Si le séjour est prolongé sans changer de cadre métier:

1. la date de fin est prolongée
2. la conformité est recontrôlée
3. la capacité site est recontrôlée
4. si un seuil est dépassé, un arbitrage DO peut être requis

Si le changement est plus structurel:

1. changement d'activité
2. changement de périmètre
3. changement de logique de prise en charge

alors une **nouvelle AdS d'extension** peut être plus correcte qu'une simple mise à jour.

### 5.2 Retour déjà planifié

Si un retour était déjà planifié dans TravelWiz et que le séjour est prolongé:

1. le PAX doit être retiré du manifeste retour obsolète
2. un nouveau retour devra être replanifié sur les nouvelles dates

### 5.3 Certification ou document qui expire pendant le séjour

La logique documentaire n'est pas un arrêt mécanique immédiat.
Le responsable opérationnel décide en pratique:

1. soit de laisser finir la mission
2. soit d'imposer un retour anticipé

## 6. Réarbitrage des tâches via Planner

Si Planner replanifie les tâches pendant que le contact est déjà sur site:

1. le besoin de présence peut être confirmé
2. la présence peut être réduite
3. la mission peut être prolongée
4. la mission peut être écourtée
5. le contact peut devoir changer de fenêtre retour

Le point clé est que Planner reste la source de vérité sur la charge planifiée,
et PaxLog / TravelWiz doivent se réaligner.

## 7. Fin de mission et descente à terre

Quand la mission se termine:

1. TravelWiz prépare le retour selon le mode prévu et les disponibilités
2. le contact est inscrit sur un manifeste retour
3. à la clôture du manifeste retour:
4. s'il embarque réellement, le séjour est terminé
5. s'il est `no_show retour`, l'AdS ne doit pas être considérée terminée car le PAX est encore sur site

La clôture métier correcte est donc:

1. travail terminé
2. retour effectivement exécuté
3. descente à terre confirmée
4. AdS finalement `completed`

## 8. Résumé simple

Chaîne nominale:

`user interne -> création AdS pour contact externe -> validations -> approved -> manifeste aller -> in_progress sur site -> éventuelle prolongation / réarbitrage Planner -> manifeste retour -> retour effectif -> completed`

## 9. Niveau de confiance

Cette note mélange:

- des points **confirmés par le code** sur la structure des objets AdS / AdsPax
- des points **décrits par les docs métier** sur les scénarios de prolongation, arbitrage et clôture opérationnelle

Autrement dit, le flux métier est bien spécifié, mais certains cas avancés sont davantage documentés que complètement visibles dans le runtime actuel.
