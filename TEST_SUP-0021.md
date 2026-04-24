# Test manuel - SUP-0021 : Bug d'affichage sur la liste de MOC

## Objectif du test
Vérifier que le filtre "Mes MOC (chef de projet)" est correctement intégré dans le système de visual search avec tokens de filtre.

## Prérequis
- L'application doit être déployée et accessible
- Un compte utilisateur avec des MOC attribués comme chef de projet
- Navigateur web moderne (Chrome, Firefox, Safari, Edge)

## Étapes de test

### Test 1 : Vérifier la présence du filtre dans la visual search

1. Se connecter à l'application avec le compte de test : `admin@opsflux.io`
2. Naviguer vers le module MOC (`/moc`)
3. Cliquer sur l'onglet "Liste"
4. Cliquer sur la barre de recherche / filtre (visual search bar)
5. **Vérifier** : Une liste de filtres disponibles doit s'afficher
6. **Vérifier** : Le filtre "Mes MOC (chef de projet)" doit apparaître dans la liste

**Résultat attendu** : ✅ Le filtre est visible dans la liste des filtres disponibles

### Test 2 : Ajouter le filtre comme token

1. Dans la liste des filtres, cliquer sur "Mes MOC (chef de projet)"
2. **Vérifier** : Une option avec le même label doit apparaître
3. Cliquer sur l'option "Mes MOC (chef de projet)"
4. **Vérifier** : Un token de filtre doit apparaître dans la barre de recherche
5. **Vérifier** : Le token doit afficher : `Mes MOC (chef de projet) | est | Mes MOC (chef de projet)`
6. **Vérifier** : La liste des MOC est filtrée pour n'afficher que ceux où l'utilisateur est chef de projet

**Résultat attendu** : ✅ Le filtre est ajouté comme token et la liste est correctement filtrée

### Test 3 : Retirer le filtre

1. Cliquer sur le bouton "×" (fermer) sur le token "Mes MOC (chef de projet)"
2. **Vérifier** : Le token disparaît de la barre de recherche
3. **Vérifier** : La liste des MOC affiche à nouveau tous les MOC (sans filtre)

**Résultat attendu** : ✅ Le filtre est retiré et la liste complète est affichée

### Test 4 : Combinaison avec d'autres filtres

1. Ajouter le filtre "Mes MOC (chef de projet)" (comme dans Test 2)
2. Ajouter un autre filtre (ex: "Statut" = "En cours")
3. **Vérifier** : Les deux tokens de filtre apparaissent dans la barre
4. **Vérifier** : Les filtres sont combinés avec la logique "ET" (opérateur affiché entre les tokens)
5. **Vérifier** : La liste affiche uniquement les MOC qui correspondent aux deux critères

**Résultat attendu** : ✅ Les filtres se combinent correctement

### Test 5 : Persistance après rafraîchissement

1. Ajouter le filtre "Mes MOC (chef de projet)"
2. Rafraîchir la page (F5)
3. **Vérifier** : Le filtre est conservé après le rafraîchissement (si le système le supporte)

**Résultat attendu** : ℹ️ Comportement dépendant de l'implémentation de la persistance des filtres

### Test 6 : Vérifier l'absence de l'ancienne checkbox

1. Sur l'onglet "Liste" des MOC
2. **Vérifier** : Il ne doit PLUS y avoir de checkbox "Mes MOC (chef de projet)" dans le toolbar
3. **Vérifier** : Seul le dropdown "Tous / Uniquement promus / Non encore promus" doit être présent dans le toolbar gauche

**Résultat attendu** : ✅ L'ancienne checkbox a été supprimée

## Critères de réussite
- ✅ Tous les tests passent avec succès
- ✅ Aucune régression sur les autres filtres (Statut, Site, Priorité, etc.)
- ✅ Aucune erreur console JavaScript
- ✅ Le comportement est cohérent avec les autres filtres du système

## Notes de test
- Date du test : _____________
- Testeur : _____________
- Environnement : _____________
- Résultat global : ⬜ PASS / ⬜ FAIL
- Commentaires : _____________________________________________
