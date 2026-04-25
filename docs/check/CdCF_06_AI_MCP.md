# OpsFlux — Cahier des Charges Fonctionnel
# MODULE ASSISTANT IA ET AUTOMATISATION
# Version 1.0 — Usage interne Perenco

---

## OBJET DU DOCUMENT

Ce document décrit les fonctionnalités de l'assistant IA intégré à OpsFlux. Il couvre le briefing journalier, le chat en langage naturel, les suggestions automatiques, la génération de documents et l'automatisation des tâches.

---

## 1. VISION GÉNÉRALE

### 1.1 Finalité

L'assistant IA d'OpsFlux est un assistant opérationnel contextuel. Il aide les équipes Perenco à trouver rapidement l'information dans la base documentaire, à automatiser les tâches répétitives et à anticiper les actions à mener.

L'assistant n'invente pas de données et n'agit jamais sans confirmation de l'utilisateur pour les actions importantes.

### 1.2 Accès

L'assistant est accessible depuis le panneau latéral droit de l'interface (icône IA dans la barre supérieure). Il reste disponible sur toutes les pages de l'application.

### 1.3 Principe de fonctionnement

L'assistant fonctionne en deux modes complémentaires :
- **Mode question** : interroger le corpus documentaire d'OpsFlux en langage naturel
- **Mode action** : déclencher des opérations dans OpsFlux sans naviguer dans les menus

---

## 2. BRIEFING JOURNALIER

### 2.1 Affichage

À l'ouverture du panneau IA, un briefing personnalisé s'affiche pour l'utilisateur. Il est actualisé chaque matin.

### 2.2 Contenu du briefing

Le briefing est divisé en trois niveaux de priorité :

**Urgent (indicateur rouge)** — Actions critiques qui requièrent une attention immédiate :
- Validations de documents en retard (non traitées depuis plus de 3 jours)
- Documents en attente de traitement depuis plus de 48 heures
- Certifications offshore expirées (si module Tiers actif)

**Aujourd'hui (indicateur orange)** — Actions importantes à traiter dans la journée :
- Documents en attente de validation normaux
- Deadlines de validation approchant dans les 24 heures
- Tâches planifiées pour le jour même

**Suggestions (indicateur bleu)** — Recommandations contextuelles :
- "Vous créez habituellement votre rapport journalier BIPAGA le matin — voulez-vous le créer maintenant ?"
- "3 brouillons inactifs depuis plus de 7 jours"
- "Le document RPT-0041 a été mis à jour depuis votre dernière consultation"

### 2.3 Actions rapides

Chaque élément du briefing dispose d'un bouton d'action directe qui navigue vers l'élément concerné ou déclenche l'action appropriée sans quitter le panneau IA.

### 2.4 Gestion des éléments

Pour chaque élément du briefing, l'utilisateur peut :
- **"Plus tard"** : masquer l'élément pendant 4 heures
- **"Ignorer"** : masquer définitivement l'élément
- **"Traiter"** : naviguer directement vers l'action correspondante

---

## 3. CHAT EN LANGAGE NATUREL

### 3.1 Questions sur le corpus documentaire

L'assistant peut répondre à des questions en langage naturel sur l'ensemble des documents publiés dans OpsFlux. Il utilise le contenu des documents pour construire sa réponse.

**Exemples de questions** :
- "Quelle était la production journalière de BIPAGA la semaine dernière ?"
- "Y a-t-il une procédure de démarrage pour le compresseur K-201 ?"
- "Quel est le dernier rapport d'inspection de la plateforme BIPAGA ?"
- "Quand a eu lieu le dernier arrêt de maintenance préventive ?"

### 3.2 Format des réponses

Les réponses de l'assistant incluent :
- La réponse en langage naturel, concise et factuelle
- Les sources utilisées (numéro de document et date)
- Un lien cliquable vers chaque document source

Si l'information n'est pas trouvée dans le corpus, l'assistant l'indique clairement et suggère des alternatives (documents à consulter, personnes à contacter).

### 3.3 Périmètre de recherche

Par défaut, l'assistant cherche dans tous les documents publiés auxquels l'utilisateur a accès. L'utilisateur peut restreindre la recherche à un projet, un type de document ou une période.

### 3.4 Mémorisation du contexte

L'assistant mémorise le contexte de la conversation en cours. Il comprend les questions de suivi ("Et le mois d'avant ?", "Sur quelle plateforme ?") sans que l'utilisateur ait à tout reformuler.

---

## 4. ACTIONS EN LANGAGE NATUREL

### 4.1 Principe

Au-delà des questions, l'assistant peut exécuter des actions dans OpsFlux à la demande de l'utilisateur. Ces actions correspondent aux actions habituelles de l'interface, accessibles plus rapidement par la parole.

### 4.2 Confirmation obligatoire

Pour toute action qui crée, modifie ou soumet des données, l'assistant affiche un résumé de l'action prévue et demande confirmation avant d'exécuter. L'utilisateur peut toujours annuler.

Exception : les actions de simple consultation ne demandent pas de confirmation.

### 4.3 Actions disponibles

**Documents** :
- "Crée un rapport journalier pour BIPAGA pour aujourd'hui" → génère un brouillon pré-rempli
- "Montre-moi mes documents en attente de validation" → affiche la liste
- "Cherche les procédures de démarrage du compresseur K-201" → affiche les résultats
- "Soumets le document RPT-0043 pour validation" → soumet après confirmation

**Validation** :
- "Montre-moi mes validations en attente" → liste les documents à valider
- "Délègue mes validations à Marie jusqu'à vendredi" → crée une délégation après confirmation

**Informations** :
- "Quel est le statut du PID-0101 ?" → affiche le statut actuel
- "Qui est le validateur du circuit de validation des rapports de production ?" → répond
- "Cherche l'équipement V-201" → affiche la fiche de l'équipement

### 4.4 Droits respectés

L'assistant ne peut effectuer que les actions autorisées par le rôle de l'utilisateur. Si l'utilisateur demande une action qu'il n'est pas autorisé à effectuer, l'assistant l'indique clairement.

### 4.5 Traçabilité

Toutes les actions effectuées via l'assistant sont tracées dans l'historique avec la mention "Action via l'assistant IA pour [nom utilisateur]".

---

## 5. GÉNÉRATION DE DOCUMENTS

### 5.1 Principe

L'assistant peut générer un premier brouillon de document à partir d'un template, enrichi avec les données contextuelles disponibles.

### 5.2 Processus

1. L'utilisateur demande : "Génère-moi le rapport hebdomadaire de production BIPAGA"
2. L'assistant identifie le template correspondant et les données disponibles
3. Il affiche : "Je vais créer le rapport RPT-PCM-BIPAGA avec les données de production de la semaine. Confirmer ?"
4. L'utilisateur confirme
5. L'assistant crée un brouillon avec :
   - Le cartouche complété automatiquement
   - Les champs formulaire pré-remplis avec les données disponibles
   - Une ébauche de commentaire dans les sections texte libre
6. L'utilisateur est redirigé vers l'éditeur pour vérifier et compléter
7. Le document généré est clairement indiqué comme "Généré par l'IA — à vérifier"

### 5.3 Import de documents legacy

L'assistant peut analyser un document Word ou PDF existant et en extraire les données pour créer un document OpsFlux structuré. L'utilisateur vérifie les données extraites avant de confirmer.

---

## 6. AUTO-COMPLÉTION DANS L'ÉDITEUR

### 6.1 Principe

Dans les sections texte libre de l'éditeur de documents, l'assistant propose automatiquement des suggestions de complétion basées sur le contexte du document.

### 6.2 Déclenchement

La suggestion apparaît automatiquement après une seconde d'inactivité en cours de frappe. Elle s'affiche en texte grisé à droite du curseur.

### 6.3 Acceptation ou rejet

- Appuyer sur la touche Tabulation accepte la suggestion
- Continuer à taper ou appuyer sur Échap rejette la suggestion

L'utilisateur peut désactiver cette fonctionnalité depuis ses préférences.

---

## 7. ASSISTANT DANS LES SUGGESTIONS DE TAGS

Lors de la création d'un nouveau tag DCS dans le TagRegistry, l'assistant analyse le contexte (zone, type d'instrument, équipement parent, tags existants) et propose des noms conformes aux règles de nommage. L'utilisateur choisit parmi les suggestions ou saisit son propre nom.

---

## 8. RECOMMANDATIONS INTELLIGENTES

### 8.1 Apprentissage des habitudes

L'assistant observe les comportements récurrents de chaque utilisateur :
- Les documents créés à intervalles réguliers (rapports quotidiens, hebdomadaires)
- Les workflows habituels
- Les documents fréquemment consultés

### 8.2 Suggestions proactives

Sur la base de cet apprentissage, l'assistant anticipe les besoins :
- "Vous créez habituellement votre rapport journalier le matin. En créer un pour aujourd'hui ?"
- "Le document RPT-BIPAGA-0042 que vous consultez régulièrement vient d'être mis à jour"
- "Vous avez un rapport hebdomadaire à créer demain (selon votre historique)"

---

## 9. CONFIDENTIALITÉ ET SÉCURITÉ

### 9.1 Isolation des données

L'assistant ne partage aucune donnée entre les différents tenants. Les réponses ne peuvent utiliser que les documents du tenant de l'utilisateur courant.

### 9.2 Respect des droits

L'assistant n'accède qu'aux documents et données auxquels l'utilisateur courant a normalement accès. Un lecteur ne peut pas obtenir via l'IA des informations sur des brouillons qu'il ne peut pas consulter directement.

### 9.3 Hébergement des modèles IA

Les modèles IA peuvent être hébergés localement sur les serveurs Perenco (données jamais envoyées à l'extérieur) ou sur des services cloud (avec accord de Perenco). La configuration est gérée par l'administrateur tenant.

---

## 10. CAS D'UTILISATION COMPLETS

### Cas 1 : Matinée d'un responsable de production

1. Le responsable ouvre OpsFlux → panneau IA s'ouvre automatiquement
2. Briefing : "2 validations en attente dont 1 en retard (4j) — PID-0101 en attente depuis 4j"
3. Il demande : "Résume-moi les points clés du rapport de production d'hier"
4. L'IA répond avec un résumé et le lien vers le rapport
5. Il demande : "Crée le rapport d'aujourd'hui avec les données DCS de cette nuit"
6. L'IA génère le brouillon avec les données de production pré-remplies
7. Il complète les commentaires opérationnels et soumet le rapport
8. Durée totale : 8 minutes au lieu de 20

### Cas 2 : Recherche documentaire pour un incident

1. Un opérateur signale une vibration anormale sur le compresseur K-201
2. L'ingénieur de maintenance demande à l'IA : "Y a-t-il des incidents similaires sur le K-201 dans nos archives ?"
3. L'IA trouve 3 rapports d'incident de 2022 et 2023 mentionnant des vibrations sur K-201
4. Elle résume les causes identifiées et les actions correctives appliquées
5. Elle fournit les liens vers les 3 rapports sources
6. L'ingénieur consulte les rapports et planifie son intervention en conséquence

### Cas 3 : Délégation avant congés

1. La réviseure part en congés demain
2. Elle demande à l'IA : "Délègue mes validations à Jean Dupont jusqu'au 5 avril"
3. L'IA affiche : "Je vais déléguer vos responsabilités de validation à Jean Dupont du 30 mars au 5 avril. Jean sera notifié. Confirmer ?"
4. Elle confirme → délégation créée, Jean notifié par email
5. Pendant son absence, Jean voit les documents à valider dans sa liste de travail

