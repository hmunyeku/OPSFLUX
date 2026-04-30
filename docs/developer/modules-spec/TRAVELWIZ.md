# TravelWiz

## Rôle

Exécuter la logistique de mouvement des PAX et du cargo.

## Fonctions

- vecteurs
- voyages
- manifestes PAX
- manifestes cargo
- portail terrain / signage opérationnel
- deck planning
- back cargo

## Sources de vérité

- mouvements effectifs
- statuts de manifestes
- présence embarquée / non embarquée
- cargo en transit et livré

## Dépendances

- PaxLog pour les AdS approuvées
- Planner pour les impacts de replanification
- Tiers et Projets pour le cargo
- Core pour notifications, audit, settings

## Maturité

- `partial`, avec socle API visible sur PAX et cargo

## Priorités

- sécuriser le lien AdS -> manifeste
- terminer le nominal cargo
- fiabiliser la clôture retour PAX

## Portail terrain cible

Le portail terrain ne doit pas être conçu comme une sous-application complète avec navigation complexe.

Sa cible est:

- affichage immédiat
- consultation rapide
- actions basiques à très faible friction

Exemples d'usage:

- voir le manifeste courant
- confirmer une information terrain simple
- remonter un événement de mouvement
- voir les alertes critiques

Règles:

- pas d'onglets profonds
- pas de recherche labyrinthique
- pas de configuration
- un nombre très limité d'actions par écran

Le bon modèle est plus proche d'un signage opérationnel ou d'un mini-SCADA métier que d'un back-office web classique.
