# Test manuel : SUP-0063 - Dropdown ProjectPicker dans panel de création

## Contexte
Le dropdown du ProjectPicker pour "Macro-projet (parent)" n'était pas visible dans le formulaire de création de projet car masqué derrière le panel (z-index insuffisant).

## Fix appliqué
Changement du z-index du dropdown de `z-50` à `z-[9999]` dans `ProjectPicker.tsx`.

## Procédure de test manuel

### Prérequis
- Application OpsFlux déployée
- Compte avec permissions de création de projet
- Navigateur moderne (Chrome, Firefox, Safari)

### Étapes

1. **Se connecter à l'application**
   - URL: https://app.opsflux.io
   - Identifiants: admin@opsflux.io / RldgAHGJqlrq6TRjsZq3is

2. **Ouvrir le formulaire de création de projet**
   - Naviguer vers le module "Projets"
   - Cliquer sur "Nouveau projet" ou équivalent
   - Le panel de création devrait s'afficher

3. **Tester le dropdown "Macro-projet (parent)"**
   - Localiser le champ "Macro-projet (parent)"
   - Cliquer sur le champ
   - **VÉRIFICATION** : Le dropdown devrait s'afficher AU-DESSUS du panel
   - **VÉRIFICATION** : La liste des projets devrait être visible
   - **VÉRIFICATION** : Le champ de recherche devrait être accessible
   - **VÉRIFICATION** : On devrait pouvoir sélectionner un projet

4. **Tester en mode panel détaché (optionnel)**
   - Détacher le panel de création (si l'option est disponible)
   - Re-tester le dropdown
   - **VÉRIFICATION** : Le dropdown doit toujours être visible

### Résultats attendus
✅ Le dropdown s'affiche complètement au-dessus du panel
✅ Tous les éléments du dropdown sont cliquables
✅ La sélection fonctionne normalement
✅ Aucun élément n'est coupé ou masqué

### Régression possible
❌ Le dropdown ne s'affiche pas du tout
❌ Le dropdown est partiellement masqué
❌ Le dropdown apparaît derrière le panel

### Cas d'usage supplémentaires
- Tester avec plusieurs projets existants (liste longue)
- Tester la recherche dans le dropdown
- Tester avec différentes tailles de fenêtre (responsive)
- Tester avec d'autres thèmes (dark mode, etc.)

## Code modifié
Fichier: `apps/main/src/components/shared/ProjectPicker.tsx`
Ligne: 216
Avant: `className="absolute z-50 ..."`
Après: `className="absolute z-[9999] ..."`

## Validation technique
```bash
# Vérifier que le changement est présent
grep -n "z-\[9999\]" apps/main/src/components/shared/ProjectPicker.tsx

# Build TypeScript doit passer
cd apps/main && npx tsc --noEmit
```
