# 05 PaxLog Weekend Plan

## 1. Objectif

Rendre PaxLog **opérationnel ce week-end** sur son chemin nominal.

Cela ne veut pas dire livrer tout le scope documentaire.
Cela veut dire livrer un noyau fiable, testable et utilisable.

## 2. Définition minimale de "fonctionnel"

PaxLog est considéré fonctionnel si les scénarios suivants passent de bout en bout:

1. créer un profil PAX interne
2. créer un profil PAX externe
3. attacher les pièces / credentials minimales
4. vérifier la conformité minimale pour un site
5. créer une AdS avec plusieurs PAX
6. soumettre l'AdS
7. approuver / rejeter l'AdS
8. émettre l'événement vers TravelWiz
9. voir l'impact sur le manifeste ou au moins la notification de disponibilité
10. clôturer le séjour à partir du retour effectif

## 3. Scope week-end

### Must have

- profils PAX
- AdS
- AdsPax user/contact
- compliance minimale
- transitions d'état AdS
- PDF AdS si déjà branché
- événement `ads.approved`
- lecture lisible des listes et détails

### Should have

- AVM simple
- incidents / signalements basiques
- ajout / retrait PAX sur AdS
- stats compliance

### Won't have pour ce cut si ça ralentit le nominal

- tous les cas avancés AVM
- toutes les règles documentaires de prolongation
- automatisation fine de tous les retours
- perfection UI secondaire

## 4. Blocages prioritaires à lever

1. clarifier et verrouiller les permissions PaxLog
2. vérifier les routes réellement branchées dans UI + service + backend
3. sécuriser les états AdS réellement utilisés
4. valider le dual mode PAX interne / contact externe
5. vérifier la cohérence avec TravelWiz

## 5. Scénarios de test à exécuter avant ce week-end

### Scénario A

- créer contact externe
- créer AdS pour ce contact
- soumettre
- approuver
- vérifier la publication de l'événement

### Scénario B

- créer user interne / profil PAX
- ajouter credential
- vérifier compliance
- créer AdS
- rejeter si non conforme

### Scénario C

- modifier une activité Planner liée
- vérifier le passage en `requires_review`

## 6. Ordre de travail recommandé

1. routes et services PaxLog réellement utilisées en UI
2. écrans liste + détail AdS
3. création / édition profils PAX
4. compliance minimale
5. émission événements TravelWiz
6. AVM seulement après stabilisation du nominal AdS

## 7. Définition de done week-end

Le lot est terminé si:

1. les trois scénarios passent
2. les permissions ne sont pas ouvertes par défaut
3. les statuts affichés correspondent aux statuts backend
4. les docs `PAXLOG.md` et `03_CROSS_MODULE_WORKFLOWS.md` restent alignées
