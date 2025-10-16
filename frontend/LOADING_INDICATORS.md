# Guide des Indicateurs de Chargement

Ce guide explique comment utiliser les indicateurs de chargement dans l'application pour améliorer l'UX.

## 📊 Composants Disponibles

### 1. **LoadingBar** (Barre de progression globale)

Une barre de progression fine en haut de l'écran qui s'affiche automatiquement lors de la navigation.

**Déjà configuré** : Pas besoin de configuration supplémentaire, elle est active globalement.

### 2. **LoadingButton** (Bouton avec spinner intégré)

Un bouton qui affiche automatiquement un spinner pendant le chargement.

#### Import
```tsx
import { LoadingButton } from "@/components/ui/loading-button"
```

#### Utilisation Basique
```tsx
const [isLoading, setIsLoading] = useState(false)

<LoadingButton
  loading={isLoading}
  onClick={handleSubmit}
>
  Enregistrer
</LoadingButton>
```

#### Avec texte personnalisé pendant le chargement
```tsx
<LoadingButton
  loading={isSubmitting}
  loadingText="Enregistrement en cours..."
>
  Enregistrer
</LoadingButton>
```

#### Exemples Complets

**Formulaire de soumission**
```tsx
function MyForm() {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await saveData()
      toast({ title: "Succès" })
    } catch (error) {
      toast({ title: "Erreur", variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* ... fields ... */}
      <LoadingButton
        type="submit"
        loading={isSubmitting}
        loadingText="Enregistrement..."
      >
        Enregistrer
      </LoadingButton>
    </form>
  )
}
```

**Action de suppression**
```tsx
<LoadingButton
  variant="destructive"
  loading={isDeleting}
  loadingText="Suppression..."
  onClick={handleDelete}
>
  Supprimer
</LoadingButton>
```

## 🎨 Props du LoadingButton

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `loading` | boolean | false | Active l'état de chargement |
| `loadingText` | string | children | Texte affiché pendant le chargement |
| `disabled` | boolean | false | Désactive le bouton (indépendant du loading) |
| `...props` | ButtonProps | - | Toutes les props standard du Button |

## 💡 Bonnes Pratiques

### ✅ À Faire

1. **Toujours gérer l'état de chargement**
   ```tsx
   const [isLoading, setIsLoading] = useState(false)

   const handleAction = async () => {
     setIsLoading(true)
     try {
       await apiCall()
     } finally {
       setIsLoading(false) // ✅ Dans finally pour garantir l'exécution
     }
   }
   ```

2. **Utiliser des textes descriptifs**
   ```tsx
   <LoadingButton loadingText="Création du compte...">
     Créer un compte
   </LoadingButton>
   ```

3. **Combiner avec des toasts pour le feedback**
   ```tsx
   try {
     await action()
     toast({ title: "✅ Action réussie" })
   } catch (error) {
     toast({ title: "❌ Erreur", variant: "destructive" })
   }
   ```

### ❌ À Éviter

1. **Ne pas oublier le finally**
   ```tsx
   // ❌ BAD
   try {
     await action()
     setIsLoading(false)
   } catch (error) {
     // setIsLoading reste à true en cas d'erreur!
   }

   // ✅ GOOD
   try {
     await action()
   } finally {
     setIsLoading(false)
   }
   ```

2. **Ne pas utiliser disabled ET loading ensemble**
   ```tsx
   // ❌ BAD - redondant
   <LoadingButton loading={isLoading} disabled={isLoading}>

   // ✅ GOOD - loading gère déjà le disabled
   <LoadingButton loading={isLoading}>
   ```

## 📋 Checklist d'Implémentation

Lors de l'ajout d'une nouvelle action asynchrone :

- [ ] Créer un state `isLoading` ou `isSubmitting`
- [ ] Remplacer `<Button>` par `<LoadingButton>`
- [ ] Ajouter la prop `loading={isLoading}`
- [ ] Ajouter `loadingText` si nécessaire
- [ ] Gérer le state dans un try/finally
- [ ] Ajouter un toast pour le feedback utilisateur

## 🔧 Personnalisation Avancée

### Spinner personnalisé

Si vous avez besoin d'un spinner différent, vous pouvez créer votre propre variante :

```tsx
import { Loader2, RefreshCw } from "lucide-react"

<LoadingButton loading={isLoading}>
  {isLoading && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
  Rafraîchir
</LoadingButton>
```

### Couleurs et variants

LoadingButton supporte tous les variants du Button :

```tsx
<LoadingButton variant="default" loading={isLoading}>Default</LoadingButton>
<LoadingButton variant="destructive" loading={isLoading}>Destructive</LoadingButton>
<LoadingButton variant="outline" loading={isLoading}>Outline</LoadingButton>
<LoadingButton variant="ghost" loading={isLoading}>Ghost</LoadingButton>
```

## 🚀 Prochaines Étapes

Pour améliorer encore plus l'UX :

1. **DataTable avec skeleton loaders** - Afficher des loaders pendant le chargement des tableaux
2. **Optimistic Updates** - Mettre à jour l'UI avant la réponse serveur
3. **Progress indicators** - Pour les uploads de fichiers
4. **Suspense boundaries** - Pour le chargement de composants

## 📞 Support

Pour toute question ou suggestion, contactez l'équipe de développement.
