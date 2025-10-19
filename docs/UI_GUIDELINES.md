# Guidelines UI/UX - OpsFlux

Guide de style et bonnes pratiques pour le développement de l'interface OpsFlux.

---

## 🎨 Composants Shadcn/UI

### Quand utiliser Dialog vs Sheet

#### Dialog
Utiliser pour:
- ✅ Confirmations (supprimer, annuler)
- ✅ Alertes importantes
- ✅ Actions rapides (1-3 champs max)
- ✅ Messages informatifs

```typescript
<Dialog>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>Confirmer la suppression</DialogTitle>
      <DialogDescription>
        Cette action est irréversible
      </DialogDescription>
    </DialogHeader>
    {/* Contenu court */}
    <DialogFooter>
      <Button variant="outline">Annuler</Button>
      <Button variant="destructive">Supprimer</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

#### Sheet
Utiliser pour:
- ✅ Formulaires longs (4+ champs)
- ✅ Édition de données complexes
- ✅ Création d'entités
- ✅ Panels de filtres

```typescript
<Sheet>
  <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
    <SheetHeader>
      <SheetTitle>Ajouter une adresse</SheetTitle>
      <SheetDescription>
        Remplissez les informations
      </SheetDescription>
    </SheetHeader>
    {/* Formulaire long */}
    <SheetFooter>
      <SheetClose asChild>
        <Button variant="outline">Annuler</Button>
      </SheetClose>
      <Button>Enregistrer</Button>
    </SheetFooter>
  </SheetContent>
</Sheet>
```

---

## 📝 Formulaires

### Structure Standard

```typescript
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"

// 1. Définir le schéma de validation
const formSchema = z.object({
  name: z.string().min(3, "Minimum 3 caractères"),
  email: z.string().email("Email invalide"),
})

function MyForm() {
  // 2. Initialiser le formulaire
  const form = useForm({
    resolver: zodResolver(formSchema),
    mode: "onChange", // Validation en temps réel
    defaultValues: {
      name: "",
      email: "",
    },
  })

  // 3. Handler de soumission
  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      await saveData(values)
      toast({
        title: "Succès",
        description: "Données enregistrées",
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error.message,
      })
    }
  }

  // 4. Render
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nom *</FormLabel>
              <FormControl>
                <Input placeholder="Votre nom" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </form>
    </Form>
  )
}
```

---

## 🎯 États de l'Application

### Loading States

```typescript
// ❌ À éviter
{loading && <p>Chargement...</p>}

// ✅ Recommandé
{loading ? (
  <div className="space-y-3">
    <Skeleton className="h-12 w-full" />
    <Skeleton className="h-12 w-full" />
    <Skeleton className="h-12 w-full" />
  </div>
) : (
  <DataDisplay />
)}
```

### Empty States

```typescript
// Composant réutilisable
interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="h-16 w-16 text-muted-foreground mb-4 opacity-40" />
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground mb-4 max-w-md">
          {description}
        </p>
      )}
      {action}
    </div>
  )
}

// Utilisation
<EmptyState
  icon={IconDatabase}
  title="Aucune sauvegarde"
  description="Créez votre première sauvegarde pour protéger vos données"
  action={
    <Button onClick={handleCreate}>
      <IconPlus className="mr-2 h-4 w-4" />
      Créer une sauvegarde
    </Button>
  }
/>
```

### Error States

```typescript
interface ErrorStateProps {
  title?: string
  message: string
  retry?: () => void
}

export function ErrorState({
  title = "Une erreur est survenue",
  message,
  retry
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <IconAlertCircle className="h-12 w-12 text-destructive mb-4" />
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-md text-center">
        {message}
      </p>
      {retry && (
        <Button onClick={retry} variant="outline">
          <IconRefresh className="mr-2 h-4 w-4" />
          Réessayer
        </Button>
      )}
    </div>
  )
}
```

---

## 💬 Notifications Toast

### Patterns Standard

```typescript
// Succès
toast({
  title: "Opération réussie",
  description: "Les modifications ont été enregistrées",
})

// Erreur
toast({
  variant: "destructive",
  title: "Erreur",
  description: error instanceof Error ? error.message : "Une erreur est survenue",
})

// Avec action
toast({
  title: "Fichier supprimé",
  description: "Le fichier a été déplacé dans la corbeille",
  action: (
    <ToastAction altText="Annuler" onClick={handleUndo}>
      Annuler
    </ToastAction>
  ),
})

// Info
toast({
  title: "Information",
  description: "La sauvegarde est en cours, cela peut prendre quelques minutes",
  duration: 5000,
})
```

---

## 📐 Espacements & Layout

### Système de Spacing

```typescript
// Gap entre sections principales
className="space-y-6"

// Gap entre éléments d'une section
className="space-y-4"

// Gap entre champs de formulaire
className="space-y-3"

// Gap entre labels et inputs
className="space-y-2"

// Padding card
className="p-6"

// Padding dialog/sheet
className="p-4 sm:p-6"
```

### Grid System

```typescript
// 2 colonnes responsive
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">

// 3 colonnes responsive
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

// Auto-fit avec min-max
<div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
```

---

## 🎨 Variants de Boutons

```typescript
// Actions principales
<Button>Action Principale</Button>

// Actions secondaires
<Button variant="outline">Action Secondaire</Button>

// Actions destructives
<Button variant="destructive">Supprimer</Button>

// Actions discrètes
<Button variant="ghost">Plus d'options</Button>

// Liens
<Button variant="link">En savoir plus</Button>

// Tailles
<Button size="sm">Petit</Button>
<Button size="default">Normal</Button>
<Button size="lg">Grand</Button>
<Button size="icon">
  <IconPlus />
</Button>
```

---

## 📱 Responsive Design

### Breakpoints Tailwind

```typescript
// Mobile first approach
sm: 640px   // Téléphone large / tablette
md: 768px   // Tablette
lg: 1024px  // Desktop small
xl: 1280px  // Desktop
2xl: 1536px // Large desktop
```

### Patterns Responsive

```typescript
// Navigation mobile/desktop
<div className="block md:hidden">
  {/* Mobile menu */}
  <MobileNav />
</div>
<div className="hidden md:block">
  {/* Desktop nav */}
  <DesktopNav />
</div>

// Grille responsive
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

// Texte responsive
<h1 className="text-xl md:text-2xl lg:text-3xl font-bold">

// Padding responsive
<div className="p-4 md:p-6 lg:p-8">
```

---

## ♿ Accessibilité

### Checklist

- ✅ Tous les boutons ont un label ou aria-label
- ✅ Les formulaires ont des labels associés
- ✅ Les images ont un alt text
- ✅ La navigation au clavier fonctionne
- ✅ Le contraste des couleurs est suffisant (WCAG AA minimum)
- ✅ Les états focus sont visibles
- ✅ Les composants interactifs ont des rôles ARIA appropriés

### Exemples

```typescript
// Bouton icône avec label
<Button size="icon" aria-label="Supprimer l'élément">
  <IconTrash />
</Button>

// Dialog accessible
<Dialog>
  <DialogContent aria-describedby="dialog-description">
    <DialogHeader>
      <DialogTitle>Titre du dialog</DialogTitle>
      <DialogDescription id="dialog-description">
        Description pour les lecteurs d'écran
      </DialogDescription>
    </DialogHeader>
  </DialogContent>
</Dialog>

// Formulaire accessible
<FormField
  control={form.control}
  name="email"
  render={({ field }) => (
    <FormItem>
      <FormLabel htmlFor="email">Email *</FormLabel>
      <FormControl>
        <Input id="email" type="email" {...field} />
      </FormControl>
      <FormDescription>
        Nous ne partagerons jamais votre email
      </FormDescription>
      <FormMessage />
    </FormItem>
  )}
/>
```

---

## 🎭 États Interactifs

### Hover, Focus, Active

```typescript
// Bouton avec états
<Button className="hover:scale-105 transition-transform">
  Hover moi
</Button>

// Card interactive
<Card className="cursor-pointer hover:shadow-lg transition-shadow focus-within:ring-2 focus-within:ring-primary">

// Link avec underline on hover
<a className="hover:underline focus:underline">
```

---

## 🔄 Performance

### Optimisations React

```typescript
// Mémoization des callbacks
const handleClick = useCallback(() => {
  doSomething(id)
}, [id])

// Mémoization des composants
const MemoizedCard = memo(Card)

// Lazy loading
const HeavyChart = lazy(() => import('@/components/heavy-chart'))

// Dans le JSX
<Suspense fallback={<Skeleton className="h-64" />}>
  <HeavyChart data={data} />
</Suspense>
```

---

## 📚 Ressources

- [Shadcn/UI](https://ui.shadcn.com)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [React Hook Form](https://react-hook-form.com)
- [Zod](https://zod.dev)
- [Radix UI](https://www.radix-ui.com)

---

**Version**: 1.0
**Dernière mise à jour**: 2025-10-19
