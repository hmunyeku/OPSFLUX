# OpsFlux — Cahier des Charges Fonctionnel
# Module ASSISTANT IA — Intelligence artificielle et automatisation

---

## 1. Vision générale

L'assistant IA d'OpsFlux est un compagnon de travail intégré directement
dans l'interface. Il comprend le contexte de l'utilisateur, peut répondre
à des questions sur le corpus documentaire de l'organisation, et peut
effectuer des actions dans OpsFlux à la demande.

L'IA n'a jamais plus de droits que l'utilisateur qui la sollicite.
Toutes ses actions sont tracées dans l'audit log comme des actions humaines
(avec mention "Via assistant IA").

---

## 2. Accès à l'assistant

### 2.1 Panneau IA

L'assistant est accessible via le bouton "IA" dans la topbar (ou ⌘.).
Il s'ouvre dans un panneau vertical à droite de l'interface,
superposé au contenu sans le déplacer.

### 2.2 Persistance

Le panneau reste ouvert ou fermé selon la préférence de l'utilisateur,
mémorisée entre les sessions.

---

## 3. Briefing journalier

### 3.1 Contenu du briefing

À l'ouverture du panneau IA, avant même de poser une question,
l'utilisateur voit son briefing personnalisé pour la journée :

**Section URGENT :** Actions qui requièrent une attention immédiate.
Maximum 3 éléments. Ne peut pas être ignoré.
- Validations en attente depuis plus de 3 jours
- Deadlines dépassées
- Alertes provenant des connecteurs

**Section AUJOURD'HUI :** Points importants pour la journée.
- Validations attendues dans les prochaines 48h
- Documents créés hier par son équipe

**Section SUGGESTIONS :** Recommandations proactives.
- "Vous créez habituellement votre rapport journalier avant 8h"
- "3 documents similaires à votre brouillon en cours existent déjà"
- Propositions basées sur les habitudes détectées

### 3.2 Actions depuis le briefing

Chaque élément du briefing a un bouton d'action rapide :
"Valider", "Voir", "Créer", "Reporter".

Reporter = notification différée de 4 heures.
Les éléments URGENT ne peuvent pas être reportés.

---

## 4. Questions et recherche documentaire (RAG)

### 4.1 Principe

L'utilisateur peut poser une question en langage naturel sur le corpus
documentaire de son organisation. L'IA recherche dans tous les documents
publiés et approuvés accessibles par cet utilisateur.

### 4.2 Exemples de questions

- "Quelle était la pression du séparateur V-101 sur BIPAGA en janvier ?"
- "Quelles sont les procédures de démarrage du compresseur C-201 ?"
- "Y a-t-il eu des arrêts de production en mars liés à la pompe P-101A ?"
- "Montre-moi les rapports de production de BIPAGA du mois dernier"

### 4.3 Format de la réponse

L'IA répond en français (ou dans la langue de l'utilisateur).
La réponse cite les sources utilisées avec le numéro de document.
Cliquer sur une source ouvre le document correspondant.

Si l'information n'est pas dans le corpus, l'IA le dit clairement :
"Je n'ai pas trouvé cette information dans les documents disponibles."
Elle ne fabrique jamais de données.

### 4.4 Filtrage du corpus

L'utilisateur peut affiner la recherche :
- Par projet : "uniquement sur le projet BIPAGA"
- Par type de document : "uniquement dans les rapports de production"
- Par période : "documents des 6 derniers mois"

### 4.5 Limites de la recherche

L'IA ne retrouve que les documents publiés ou approuvés.
Les brouillons ne sont pas indexés.
Un document indexé il y a plus de 24h peut ne pas refléter
les dernières modifications (délai d'indexation).

---

## 5. Actions automatisées (commandes)

### 5.1 Principe

L'utilisateur peut demander à l'IA d'effectuer des actions dans OpsFlux.
L'IA détecte l'intention dans le message naturel et propose l'action correspondante.

Pour toute action ayant des effets irréversibles ou impactants,
l'IA demande toujours une confirmation explicite avant d'agir.

### 5.2 Catalogue des actions disponibles

**Gestion documentaire :**
- "Génère le rapport journalier BIPAGA pour hier"
  → Crée un brouillon depuis le template, pré-remplit avec le contexte
- "Montre-moi mes validations en attente"
  → Affiche la liste avec ancienneté et niveau d'urgence
- "Soumet le document RPT-0043 pour validation"
  → Lance le workflow (demande confirmation)
- "Délègue mes validations à Marie jusqu'à vendredi"
  → Crée la délégation (demande confirmation)

**Gestion des tags :**
- "Suggère un nom pour un transmetteur de pression sur V-101 en zone BIP"
  → Retourne 2-3 propositions conformes aux règles de nommage

**Pilotage :**
- "Quelle est la production d'aujourd'hui sur BIPAGA ?"
  → Interroge le connecteur DCS et retourne la valeur
- "Compare la production de cette semaine avec la semaine dernière"
  → Retourne un tableau comparatif

### 5.3 Confirmation des actions

Pour les actions irréversibles ou significatives, l'IA affiche un message
de confirmation avant d'agir :
"Je vais créer un rapport journalier pour BIPAGA daté du 13/03/2025
depuis le template 'Rapport Journalier Production'. Confirmer ?"

Boutons : [Confirmer] [Annuler]

### 5.4 Ce que l'IA ne peut pas faire

L'IA ne peut pas effectuer d'actions pour lesquelles l'utilisateur
n'a pas les droits. Si un lecteur demande de créer un document,
l'IA répond : "Je ne peux pas créer de document car vous n'avez pas
les droits de création de document."

---

## 6. Auto-complétion dans l'éditeur

### 6.1 Principe

Quand l'utilisateur écrit dans une section de texte libre d'un document,
l'IA propose une complétion contextuelle après une seconde de pause.

### 6.2 Comportement

La suggestion s'affiche en gris à la suite du curseur.
- Appuyer sur Tab ou → pour accepter la suggestion
- Continuer à taper pour ignorer la suggestion
- La suggestion disparaît si elle n'est pas acceptée après quelques secondes

### 6.3 Contexte utilisé

L'IA prend en compte pour la complétion :
- Les 200 derniers mots du document en cours d'écriture
- Les valeurs des champs formulaire du document (date, plateforme, valeurs de production)
- Aucun autre document (pas d'accès au corpus global pour la complétion)

### 6.4 Désactivation

L'utilisateur peut désactiver l'auto-complétion dans ses préférences.
Elle se désactive aussi automatiquement sur les sections verrouillées.

---

## 7. Extraction de données depuis des documents legacy

### 7.1 Cas d'usage

L'organisation dispose de rapports existants en Word ou PDF
(créés avant OpsFlux) qu'elle souhaite migrer dans le nouveau système.

### 7.2 Fonctionnement

Depuis un document OpsFlux en brouillon → "Importer depuis un document legacy" :

1. Uploader un fichier Word ou PDF
2. L'IA extrait automatiquement les données et les associe aux champs du formulaire
3. Un aperçu des données extraites est présenté :
   - Champ "Date du rapport" : 2018-07-14 ✅
   - Champ "Production huile" : 11 250 bbl/j ✅
   - Champ "Pression séparateur" : non trouvé ⚠
4. L'utilisateur valide, corrige ou complète
5. Les données sont injectées dans le formulaire du document

### 7.3 Qualité de l'extraction

L'IA indique un score de confiance pour chaque valeur extraite.
Les valeurs avec faible confiance sont signalées pour vérification manuelle.
L'IA ne fabricque jamais de valeur — elle laisse le champ vide plutôt que d'inventer.

---

## 8. Configuration des providers IA

### 8.1 Principe

L'IA d'OpsFlux est agnostique au fournisseur : elle peut utiliser
un modèle local installé sur les serveurs de l'organisation (Ollama)
ou un service cloud (Anthropic Claude, OpenAI GPT).

### 8.2 Configuration par tenant

L'admin tenant configure les providers depuis Settings > IA :
- Ajouter un provider (local ou cloud)
- Configurer l'URL et les credentials
- Choisir quel modèle utiliser pour quelle fonction
  (génération de texte, embeddings, suggestions...)
- Activer/désactiver un provider

### 8.3 Fonctions configurables

| Fonction | Description |
|---|---|
| **Génération** | Réponses aux questions, rédaction assistée |
| **Embeddings** | Indexation des documents pour la recherche sémantique |
| **Suggestions** | Auto-complétion dans l'éditeur |

Chaque fonction peut utiliser un provider différent.

### 8.4 Offline IA

Si aucun provider n'est configuré ou si le provider est inaccessible,
les fonctions IA se dégradent gracieusement :
- La recherche documentaire utilise uniquement la recherche par mots-clés (full-text)
- L'auto-complétion est désactivée
- Les suggestions de tags utilisent uniquement les règles de nommage (sans LLM)
- L'assistant répond "L'IA n'est pas disponible actuellement."

---

## 9. Sécurité et confidentialité

### 9.1 Isolation des données

Chaque tenant a son propre corpus d'indexation.
Il est impossible pour l'IA de mélanger les données de deux tenants.

### 9.2 Données envoyées aux providers cloud

Si un provider cloud (Anthropic, OpenAI) est configuré, les données
de l'organisation sont envoyées à ce fournisseur pour le traitement.
L'admin doit s'assurer que cette pratique est conforme à la politique
de confidentialité de l'organisation avant d'activer un provider cloud.

Les providers locaux (Ollama) ne transmettent aucune donnée en dehors
du réseau de l'organisation.

### 9.3 Limites d'utilisation

Pour protéger les performances de la plateforme, chaque utilisateur
est limité à 50 requêtes IA par minute. Si la limite est dépassée,
l'IA répond "Vous avez atteint la limite de requêtes. Réessayez dans un instant."

### 9.4 Traçabilité des actions IA

Toutes les actions effectuées par l'IA pour le compte d'un utilisateur
sont tracées dans l'audit log avec la mention "Via assistant IA pour [Nom]".
Cette traçabilité est indépendante du provider utilisé.

---

## 10. Indexation du corpus documentaire

### 10.1 Ce qui est indexé

Tous les documents au statut "Publié" ou "Approuvé" sont automatiquement
indexés pour la recherche sémantique. Les brouillons et documents en révision
ne sont pas indexés.

### 10.2 Déclenchement de l'indexation

L'indexation se déclenche automatiquement :
- Quand un document passe au statut "Approuvé" ou "Publié"
- Quand un document approuvé est modifié (nouvelle révision approuvée)

L'indexation n'est pas instantanée : un délai de quelques dizaines de secondes
à quelques minutes est possible selon la taille du document et la charge système.

### 10.3 Re-indexation complète

L'admin peut déclencher une re-indexation complète du corpus depuis Settings > IA.
Utile après un changement de provider IA (modèle d'embeddings différent).

### 10.4 Ce qui est indexé dans un document

- Le texte de toutes les sections (titres, paragraphes, listes)
- Les valeurs des champs formulaire
- Les données des tableaux de saisie

Les images ne sont pas indexées (texte uniquement).

