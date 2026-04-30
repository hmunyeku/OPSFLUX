# 09 Role View Permission Matrix

Date: 2026-04-03

## 1. Objet

Ce document fixe la règle de composition entre:

- rôles forts métier
- permissions fines techniques
- vues affichées
- actions autorisées

But:

- éviter qu'une permission brute dicte seule l'expérience
- éviter les écrans trop larges pour les utilisateurs standards
- garantir que l'UX, le frontend et le backend appliquent la même logique

## 2. Principe directeur

Le système doit fonctionner ainsi:

- les permissions fines autorisent techniquement les opérations
- les rôles forts déterminent les parcours visibles et l'entrée utilisateur

Donc:

- une permission ne suffit pas à décider de la page d'accueil d'un module
- une vue n'est affichée que si elle correspond au rôle fort ET aux permissions requises
- toute action backend reste protégée par permission explicite, même si la vue est masquée côté frontend

## 3. Niveaux de décision

### Niveau 1: permission

La permission répond à:

- "peut-il techniquement lire / créer / valider / supprimer / administrer ?"

### Niveau 2: rôle fort

Le rôle fort répond à:

- "quel est son métier principal ?"
- "quel flux doit-il voir en premier ?"
- "de quelles alertes a-t-il besoin ?"

### Niveau 3: contexte

Le contexte répond à:

- entité active
- module courant
- dossier courant
- statut courant
- ownership éventuel

## 4. Rôles forts cibles

Les noms précis pourront évoluer, mais la logique cible doit au minimum couvrir:

- `demandeur`
- `valideur_conformite`
- `chef_projet`
- `superviseur_mouvement`
- `log_base`
- `ops_terrain`
- `admin_module`
- `platform_admin`

## 5. Matrice transversale

| Rôle fort | Entrée privilégiée | Type de vue dominante | Ce qu'il ne doit pas voir en premier |
|---|---|---|---|
| `demandeur` | Mes demandes, Nouvelle AdS, Nouvel avis de mission | transactionnelle | configuration, matrices, administration |
| `valideur_conformite` | file de vérification, blocages, expirations | pilotage | création mission standard |
| `chef_projet` | activités, impacts Planner, besoins projet | pilotage | administration technique |
| `superviseur_mouvement` | séjours en cours, départs/arrivées, exceptions | pilotage | formulaires de base non liés à l'exploitation |
| `log_base` | manifestes, cargo, mouvements terrain | pilotage | référentiels complets |
| `ops_terrain` | signage terrain, action primaire, alertes | ultra simplifiée | tables complexes, onglets profonds |
| `admin_module` | configuration, règles, référentiels, contrôle global | référentiel + pilotage admin | expérience demandeur |
| `platform_admin` | sécurité, RBAC, settings, supervision globale | administration | écrans métier orientés simple demande |

## 6. PaxLog

## 6.1 Entrées par rôle

### Demandeur

Homepage PaxLog:

- bouton `Nouvelle AdS`
- bouton `Nouvel avis de mission`
- section `Mes brouillons`
- section `Mes dossiers en attente`
- section `Mes dossiers retournés pour correction`

Vues visibles:

- création AdS
- création avis de mission
- liste de ses dossiers
- détail de ses dossiers
- re-soumission

Actions typiques:

- créer
- modifier brouillon
- soumettre
- re-soumettre
- suivre le statut

Permissions minimales indicatives:

- `paxlog.ads.read`
- `paxlog.ads.create`
- `paxlog.ads.update` limité ownership
- `paxlog.avm.read`
- `paxlog.avm.create`
- `paxlog.avm.update` limité ownership

### Valideur conformité

Homepage PaxLog:

- dossiers à vérifier
- dossiers bloqués pour conformité
- pièces expirées / pending

Vues visibles:

- file de vérification
- détail conformité
- historique de décision

Actions typiques:

- vérifier
- approuver
- rejeter
- demander correction

Permissions minimales indicatives:

- `conformite.record.read`
- `conformite.record.update`
- `conformite.check`
- `paxlog.ads.read`
- `paxlog.ads.update`

### Superviseur mouvement

Homepage PaxLog:

- séjours en cours
- entrées/sorties du jour
- exceptions
- dossiers nécessitant révision

Vues visibles:

- opérations séjour
- rotations
- dossiers impactés par Planner / TravelWiz

Actions typiques:

- forcer révision
- coordonner prolongation
- suivre retour

Permissions minimales indicatives:

- `paxlog.ads.read`
- `paxlog.ads.update`
- `paxlog.rotation.read`
- permissions TravelWiz de lecture

### Admin module

Homepage PaxLog:

- supervision globale
- configuration
- matrices
- référentiels

Vues visibles:

- toutes les vues PaxLog

## 6.2 Règles d'affichage

1. Un utilisateur standard n'atterrit jamais sur la matrice conformité comme entrée du module.
2. Les onglets avancés ne s'affichent que si le rôle fort et les permissions le justifient.
3. Les formulaires AdS et avis de mission doivent être prioritaires en navigation haute pour le rôle `demandeur`.
4. La re-soumission est un état normal du flux, pas un cas caché.

## 7. TravelWiz

## 7.1 Rôles

### Log base / superviseur mouvement

Homepage TravelWiz:

- départs à venir
- embarquements en cours
- alertes cargo
- météo / impact

Vues visibles:

- voyages
- manifestes
- cargo
- vecteurs
- carte flotte

### Ops terrain

Homepage TravelWiz:

- portail terrain ultra simple
- prochain mouvement
- manifeste courant
- alerte active
- action primaire

Actions typiques:

- confirmer état
- signaler événement
- consulter liste opérationnelle

Règle:

- aucune navigation profonde
- aucun écran dense de paramétrage

### Admin module

Vues visibles:

- paramétrage vecteurs
- règles cargo
- supervision complète

## 8. Planner

### Chef projet

Entrée:

- activités de son périmètre
- impacts
- arbitrages requis

### Superviseur / DO

Entrée:

- conflits ouverts
- capacité saturée
- arbitrages critiques

### Utilisateur standard

Le Planner ne doit généralement pas être son point d'entrée principal.
Il y accède surtout via drill-down depuis projet, PaxLog ou dashboard.

## 9. Dashboard

Le Dashboard est un module à part entière.

Il doit résoudre deux questions:

- quel dashboard a le droit d'ouvrir cet utilisateur
- quel dashboard a du sens pour lui

Règle:

- la homepage dashboard est résolue par combinaison `rôle fort + permissions + scope`

### Demandeur

Widgets prioritaires:

- mes demandes
- mes validations attendues
- mes corrections demandées
- alertes personnelles

### Valideur conformité

Widgets prioritaires:

- pending verifications
- expirations
- dossiers bloqués

### Superviseur mouvement / log base

Widgets prioritaires:

- départs du jour
- retours du jour
- manifestes à risque
- alertes cargo / météo

### Admin module / platform admin

Widgets prioritaires:

- incidents système
- sécurité
- échecs d'intégration
- backlog de validation

## 10. Portails externes

Les portails externes suivent la même logique, mais avec profils limités:

- `external_contributor`
- `terrain_operator_display`

### External contributor

Vues:

- une seule vue dossier
- sections guidées
- correction / soumission / re-soumission

Interdit:

- explorer le système
- voir d'autres dossiers
- navigation latérale complète

### Terrain operator display

Vues:

- écran opérationnel unique
- état courant
- action primaire

Interdit:

- recherches longues
- configuration
- vues multi-onglets

## 11. Contrat frontend

Le frontend doit résoudre l'affichage des vues selon:

1. rôle fort
2. permissions
3. contexte

Il faut donc définir dans le Core UI:

- `module_home_resolver`
- `visible_views_resolver`
- `primary_actions_resolver`

Le frontend ne doit pas coder cela en dur page par page sans source commune.

## 12. Contrat backend

Le backend doit garantir:

1. permission explicite sur chaque endpoint
2. scoping entity/tenant/ownership
3. distinction lecture / action / validation / administration
4. contrôle final même si l'écran n'est pas visible côté frontend

## 13. Règle de cohérence

Une vue visible doit toujours satisfaire ces trois conditions:

1. elle correspond au rôle fort
2. l'utilisateur a les permissions fines requises
3. le contexte métier justifie son exposition

Si une seule de ces trois conditions manque:

- la vue ne doit pas être l'entrée par défaut
- elle peut être absente ou reléguée à un parcours secondaire

## 14. Étapes suivantes

Pour rendre cette matrice exécutable, il faut maintenant produire:

1. une matrice `rôle fort -> permissions fines`
2. une matrice `module -> vues -> permissions requises`
3. une matrice `statut dossier -> actions autorisées`
4. une matrice `ownership -> droits additionnels`

Sans ces quatre matrices, le principe restera correct mais encore partiellement implicite.
