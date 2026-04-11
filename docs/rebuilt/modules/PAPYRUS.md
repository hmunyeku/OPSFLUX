# PAPYRUS

## Objet du module

`Papyrus` est le moteur documentaire structuré d'OpsFlux.

Il ne doit pas etre compris comme un simple editeur de texte. Son role est de permettre a l'entreprise de:

- definir des modeles de rapports et de documents
- collecter des donnees via des formulaires internes ou externes
- transformer ces donnees en documents revus, versionnes et exportables
- publier ou partager des sorties officielles, notamment en PDF

En pratique, `Papyrus` doit couvrir a la fois:

- le `rapport interne`
- le `rapport externe`
- la `revue / validation`
- la `publication`

---

## Vocabulaire simple

### 1. Modele

Le `modele` est ce que l'administrateur ou le metier prepare une fois.

Un modele Papyrus contient:

- un `doc type`
- un `template`
- un `formulaire`
- eventuellement des regles de diffusion ou de workflow

Exemple:

- `Field supervision report`

### 2. Rapport interne

Le `rapport interne` est un document Papyrus ouvert dans OpsFlux par un utilisateur connecte.

Il sert a:

- creer un rapport
- modifier un rapport
- consolider plusieurs informations
- reviser, publier, exporter

### 3. Rapport externe

Le `rapport externe` est un formulaire diffuse par lien a une personne qui n'est pas forcement dans l'UI interne d'OpsFlux.

Il sert a:

- faire remplir un rapport a un superviseur
- collecter des observations terrain
- joindre des photos / preuves
- soumettre une reponse exploitable ensuite

### 4. Soumission

La `soumission` est la reponse recue via un formulaire externe.

Elle doit pouvoir ensuite etre:

- relue
- validee
- refusee
- transformee en document Papyrus officiel si necessaire

### 5. Document officiel

Le `document officiel` est la version interne exploitable et diffusable.

Il doit pouvoir:

- etre versionne
- etre relu / approuve
- etre exporte en PDF
- etre partage

---

## Architecture cible du module

Le module doit etre compris comme un pipeline.

### A. Bibliotheque de modeles

L'entreprise prepare ses types de rapports:

- rapport de supervision terrain
- inspection
- incident
- rapport journalier
- compte rendu d'intervention

Chaque modele doit definir:

- la structure documentaire
- la structure du formulaire
- le rendu
- les regles minimales

### B. Saisie interne

Un utilisateur interne cree ou ouvre un document a partir d'un modele.

Il remplit le rapport dans OpsFlux.

Cas d'usage:

- rapport prepare au bureau
- revue et correction
- consolidation
- publication finale

### C. Saisie externe

Un utilisateur interne publie un lien de formulaire.

Le superviseur ou repondant externe:

- ouvre le lien
- remplit le formulaire
- joint les preuves
- soumet

Cas d'usage:

- rapport terrain quotidien
- collecte mobile
- reponse fournisseur / sous-traitant

### D. Revue

Les reponses externes doivent arriver dans une boite de reception claire.

L'utilisateur interne doit pouvoir:

- lire la soumission
- verifier la completude
- accepter / rejeter
- convertir la soumission en document

### E. Publication

Une fois le rapport valide:

- export PDF
- partage
- workflow
- historique des revisions

---

## Flux cible a retenir

Le flux cible le plus clair est le suivant:

1. Je cree un `modele de rapport`
2. Je choisis si je lance:
- un `document interne`
- ou une `collecte externe`
3. Le rapport est rempli
4. Le contenu est relu / valide
5. Le rapport devient un document officiel exportable

Pour le besoin `Field supervision report`, le flux metier attendu est:

1. l'administrateur prepare le modele
2. un responsable diffuse le formulaire aux superviseurs
3. les superviseurs remplissent le formulaire terrain
4. les soumissions remontent dans OpsFlux
5. un responsable transforme ou consolide en rapport officiel
6. le document final est exporte / publie

---

## Ce qui etait confus jusqu'ici

Le point de confusion principal etait le suivant:

- le `document interne`
- le `lien de partage du document`
- et le `lien externe de formulaire`

ne sont pas la meme chose.

### Ce qu'il faut retenir

- le `document Papyrus` interne sert a l'edition, la revue, le versioning, la publication
- le `lien externe de formulaire` sert a la collecte terrain
- le `lien de partage du document` sert a partager un document deja constitue

Donc, pour faire remplir un rapport par un superviseur, le bon objet n'est pas d'abord le document interne:

- le bon objet est le `formulaire externe`

Le document interne vient ensuite, pour revue ou publication.

---

## Ce qui a deja ete implemente

Les briques suivantes ont deja ete mises en place dans le code.

### Socle Papyrus

- `doc types`
- `templates`
- `documents`
- `revisions`
- `versioning Papyrus`
- `workflow events`
- `dispatch runs`

### Formulaires Papyrus

- `PapyrusForm` natif
- support d'un formulaire scope `document`
- support d'un formulaire scope `doc type`
- `PapyrusFormRunner` generique
- `PapyrusFormBuilder` enrichi

### Formulaire structure -> rendu document

- `revision.form_data` est maintenant reinjecte dans le document canonique
- les templates HTML peuvent lire `document.form_data`
- le rendu PDF/document peut exploiter ces donnees

### Presets

Un registre de `presets` existe maintenant.

Le premier preset metier est:

- `field_supervision_report`

Ce preset prepare:

- un `doc type`
- un `template`
- un `form blueprint`
- un `starter document`

### Support du rapport de supervision terrain

Le preset `Field supervision report` couvre deja:

- contexte chantier
- projet
- site
- superviseur
- entreprise
- observations
- realisations
- blocages
- previsions
- HSE
- incidents / ecarts
- personnel
- equipements
- actions
- besoins pour la suite
- pieces jointes attendues

### Pieces jointes

Le runner Papyrus supporte `input_file`, en reutilisant le systeme d'attachements existant.

Il n'y a pas de stockage parallele invente pour Papyrus.

### Liens externes et soumissions

Le module dispose deja de:

- `external links`
- `external submissions`
- route de collecte externe
- consultation des soumissions

### Compatibilites et correctifs deja faits

Plusieurs corrections runtime ont deja ete apportees pour rendre `Papyrus` exploitable sur le schema de base reel deploye:

- fallback legacy sur `entities` quand `tenants` n'existe pas
- gel des scalaires ORM pour eviter `MissingGreenlet`
- exigence explicite de `project_id` pour le preset `Field supervision report`
- compatibilite `owner_type=document` pour les attachements
- compatibilite avec `papyrus_external_submissions` sans `created_at`
- correction de la route `share`
- correction Workbox pour les exports PDF/DOCX et les downloads binaires longs

---

## Ce qui manque encore

Le moteur existe, mais le module n'est pas encore assez clair au niveau produit.

### 1. Clarification UX

Il manque une presentation explicite du module autour de 3 entrees simples:

- `Modeles`
- `Collectes externes`
- `Documents internes`

Aujourd'hui, les briques existent, mais l'UX ne rend pas encore ce flux evident.

### 2. Boite de reception des soumissions

Les soumissions externes existent, mais il manque une vraie experience de:

- reception
- revue
- validation / rejet
- conversion en document officiel

### 3. Experience mobile externe

Le vrai mode superviseur externe doit etre plus lisible et plus direct:

- formulaire mobile propre
- photos
- piece jointe terrain
- soumission simple

### 4. Clarification du partage

Il faut separer tres clairement dans l'UI:

- `Partager un document`
- `Publier un formulaire externe`

Ce ne sont pas les memes usages.

### 5. PDF final metier

Le PDF fonctionne, mais doit encore etre renforce pour les vrais rapports metier:

- meilleure mise en page
- insertion plus riche des photos
- rendu terrain plus exploitable

---

## Positionnement correct du preset Field supervision report

`Field supervision report` ne doit pas etre vu comme un hack specifique.

Il doit etre considere comme:

- le premier `modele metier serieux`
- le premier `test d'architecture`
- le premier cas qui revele les limites reelles de Papyrus

Autrement dit:

- on ne developpe pas `Papyrus` pour `FieldLog`
- on utilise `FieldLog` pour verifier que `Papyrus` peut vraiment supporter une famille de rapports structurés

---

## Fonctionnement cible simple a expliquer aux utilisateurs

### Cas 1. Je veux preparer un modele de rapport

Je vais dans `Papyrus > Modeles`.

Je definis:

- le formulaire
- le rendu
- les champs attendus

### Cas 2. Je veux faire remplir un rapport par mes superviseurs

Je cree une `collecte externe` a partir d'un modele.

Je diffuse un lien.

Les superviseurs:

- ouvrent le formulaire
- remplissent
- envoient

### Cas 3. Je veux finaliser et publier un rapport

Je relis les soumissions.

Je les valide.

Je transforme le resultat en document interne si necessaire.

Puis:

- export PDF
- partage
- workflow

---

## Resume executif

`Papyrus` doit etre compris comme un moteur unifie de:

- modeles de rapports
- collecte de donnees
- consolidation documentaire
- publication

Le module doit supporter sans ambiguite:

- `rapport interne`
- `rapport externe`

Le travail deja fait a construit le socle technique.

Le travail restant consiste surtout a rendre ce socle lisible et operable dans l'UI produit, avec une vraie separation entre:

- la conception du modele
- la collecte terrain
- la revue
- la publication

---

## Cartographie technique actuelle

### Backend principal

Routes principales:

- [papyrus_core.py](/C:/Users/ajha0/Desktop/OPSFLUX/app/api/routes/modules/papyrus_core.py)

Services principaux:

- [papyrus_document_service.py](/C:/Users/ajha0/Desktop/OPSFLUX/app/services/modules/papyrus_document_service.py)
- [papyrus_forms_service.py](/C:/Users/ajha0/Desktop/OPSFLUX/app/services/modules/papyrus_forms_service.py)
- [papyrus_presets_service.py](/C:/Users/ajha0/Desktop/OPSFLUX/app/services/modules/papyrus_presets_service.py)
- [papyrus_runtime_service.py](/C:/Users/ajha0/Desktop/OPSFLUX/app/services/modules/papyrus_runtime_service.py)
- [papyrus_versioning_service.py](/C:/Users/ajha0/Desktop/OPSFLUX/app/services/modules/papyrus_versioning_service.py)
- [papyrus_dispatch_service.py](/C:/Users/ajha0/Desktop/OPSFLUX/app/services/modules/papyrus_dispatch_service.py)

Modeles ORM:

- [papyrus.py](/C:/Users/ajha0/Desktop/OPSFLUX/app/models/papyrus.py)
- [papyrus_document.py](/C:/Users/ajha0/Desktop/OPSFLUX/app/models/papyrus_document.py)

Schemas API:

- [papyrus.py](/C:/Users/ajha0/Desktop/OPSFLUX/app/schemas/papyrus.py)
- [papyrus_document.py](/C:/Users/ajha0/Desktop/OPSFLUX/app/schemas/papyrus_document.py)

### Frontend principal

Page principale:

- [PapyrusCorePage.tsx](/C:/Users/ajha0/Desktop/OPSFLUX/apps/main/src/pages/papyrus/PapyrusCorePage.tsx)

Composants principaux:

- [DocumentEditor.tsx](/C:/Users/ajha0/Desktop/OPSFLUX/apps/main/src/components/papyrus/DocumentEditor.tsx)
- [DocumentEditorCore.tsx](/C:/Users/ajha0/Desktop/OPSFLUX/apps/main/src/components/papyrus/DocumentEditorCore.tsx)
- [PapyrusFormRunner.tsx](/C:/Users/ajha0/Desktop/OPSFLUX/apps/main/src/components/papyrus/PapyrusFormRunner.tsx)
- [PapyrusFormBuilder.tsx](/C:/Users/ajha0/Desktop/OPSFLUX/apps/main/src/components/papyrus/PapyrusFormBuilder.tsx)

Hooks / services frontend:

- [usePapyrusCore.ts](/C:/Users/ajha0/Desktop/OPSFLUX/apps/main/src/hooks/usePapyrusCore.ts)
- [papyrusServiceCore.ts](/C:/Users/ajha0/Desktop/OPSFLUX/apps/main/src/services/papyrusServiceCore.ts)
- [papyrusService.ts](/C:/Users/ajha0/Desktop/OPSFLUX/apps/main/src/services/papyrusService.ts)

---

## Routes deja exposees

### Presets

- `GET /api/v1/documents/papyrus/presets`
- `POST /api/v1/documents/papyrus/presets/{preset_key}/instantiate`

### Formulaires Papyrus

- `GET /api/v1/documents/papyrus/forms`
- `POST /api/v1/documents/papyrus/forms`
- `GET /api/v1/documents/papyrus/forms/{form_id}`
- `PATCH /api/v1/documents/papyrus/forms/{form_id}`
- `GET /api/v1/documents/papyrus/forms/{form_id}/submissions`
- `POST /api/v1/documents/papyrus/forms/{form_id}/external-links`
- `DELETE /api/v1/documents/papyrus/forms/{form_id}/external-links/{token_id}`

### Formulaires externes

- `GET /api/v1/documents/papyrus/ext/forms/{form_id}?token=...`
- `POST /api/v1/documents/papyrus/ext/forms/{form_id}/submit?token=...`

### Documents

- CRUD document interne
- revisions
- workflow
- export PDF / DOCX
- partage de document

Important:

- le `partage de document`
- et le `lien externe de formulaire`

restent deux mecanismes differents, et c'est normal.

---

## Ce qui fonctionne deja reellement aujourd'hui

### 1. Je peux definir un preset ou un kit de depart

Oui.

Le preset `field_supervision_report` cree ou reutilise:

- un `doc type`
- un `template`
- un `formulaire`
- un `document` initial

### 2. Je peux saisir un rapport en interne

Oui.

Dans la fiche du document Papyrus, le `PapyrusFormRunner` affiche une zone de saisie structuree alimentee par le formulaire associe.

### 3. Je peux rendre le document en document/PDF

Oui.

Le moteur de rendu Papyrus sait maintenant:

- reutiliser `revision.form_data`
- injecter ces donnees dans le contexte de rendu
- produire un document/PDF

### 4. Je peux publier un formulaire externe

Oui, au niveau backend.

Les routes et les modeles `external links` et `external submissions` existent deja.

### 5. Je peux collecter des soumissions externes

Oui, au niveau backend.

Le module sait deja:

- emettre un lien
- consommer le lien
- recevoir la soumission
- stocker la soumission

---

## Ce qui n'est pas encore assez abouti

### 1. Experience produit du mode externe

Le mode externe existe en briques backend, mais il n'est pas encore expose comme une experience superviseur nette et lisible.

Il manque notamment:

- un point d'entree UI clair `Collectes externes`
- un ecran mobile formule comme un vrai formulaire terrain
- une boite de reception des soumissions orientee metier

### 2. Separation claire dans l'UI

Aujourd'hui, `PapyrusCorePage` reste encore trop orientee:

- documents
- templates
- types de document

Alors que le besoin metier se comprend mieux en:

- modeles
- collectes externes
- documents internes

### 3. Conversion soumission -> document

Le besoin metier final est que les reponses terrain deviennent exploitables comme rapport officiel.

Cette etape n'est pas encore exposee proprement comme un flux de validation explicite.

### 4. Partage vs collecte

Le partage de document a ete corrige techniquement.

Mais conceptuellement, l'UI doit encore expliquer clairement:

- `Partager un document`
- `Faire remplir un formulaire`

---

## UX cible recommandee

### Entree 1. Modeles

Objectif:

- creer et maintenir les modeles de rapports

Contenu attendu:

- liste des modeles
- preset kits
- doc types
- templates
- formulaires

### Entree 2. Collectes externes

Objectif:

- lancer une campagne de remplissage

Contenu attendu:

- choix du modele
- parametrage du contexte
- generation du lien externe
- suivi du nombre de soumissions
- revele des soumissions recues

### Entree 3. Documents internes

Objectif:

- revoir, corriger, consolider, publier

Contenu attendu:

- liste des documents
- detail document
- revisions
- workflow
- export PDF / DOCX
- partage documentaire

---

## Backlog court recommande

### Priorite 1

- rendre `Papyrus` lisible en 3 entrees:
  - `Modeles`
  - `Collectes externes`
  - `Documents`

### Priorite 2

- creer une vraie vue `Soumissions recues`
- permettre `valider / rejeter / convertir en document`

### Priorite 3

- creer un ecran externe mobile propre pour les superviseurs

### Priorite 4

- completer l'usage des pieces jointes structurees dans le rendu final

### Priorite 5

- rendre les PDF terrain plus metier encore

---

## Regle produit a retenir

Si le besoin est:

- `je veux que mes superviseurs remplissent un rapport`

alors le point d'entree principal doit etre:

- un `modele`
- puis une `collecte externe`

Si le besoin est:

- `je veux relire, corriger, versionner et publier`

alors le point d'entree principal doit etre:

- le `document interne`
