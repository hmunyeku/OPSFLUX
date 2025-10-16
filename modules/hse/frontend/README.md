# Frontend HSE Module

## À implémenter

Le frontend du module HSE exploitera les composants et hooks du CORE :

### Pages à créer
- `pages/Dashboard.tsx` : Dashboard HSE avec statistiques
- `pages/Incidents/List.tsx` : Liste des incidents (DataTable)
- `pages/Incidents/Create.tsx` : Formulaire création incident
- `pages/Incidents/Details.tsx` : Détails + édition incident

### Composants CORE exploités
- `Button`, `Card`, `Input`, `Select`, `Textarea` (shadcn/ui)
- `DataTable` : Liste paginée avec tri et filtres
- `FileUpload` : Upload photos incidents
- `DatePicker` : Sélection date incident

### Hooks CORE exploités
- `useNotification()` : Afficher notifications succès/erreur
- `useTranslation('hse')` : Traductions multilingues
- `useQuery()` : Fetch incidents (TanStack Query)
- `useMutation()` : Create/Update/Delete incidents

### Exemple de composant

```tsx
// pages/Incidents/Create.tsx
import { useNotification } from '@/core/hooks/useNotification'
import { useTranslation } from '@/core/hooks/useTranslation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FileUpload } from '@/core/components/FileUpload'

export default function CreateIncident() {
  const { t } = useTranslation('hse')
  const { showSuccess, showError } = useNotification()

  const handleSubmit = async (data) => {
    try {
      await api.post('/api/v1/hse/incidents', data)
      showSuccess(t('hse.notification.created'))
    } catch (error) {
      showError(t('common.error'))
    }
  }

  return (
    <div>
      <h1>{t('hse.incident.new')}</h1>
      <form onSubmit={handleSubmit}>
        <Input label={t('hse.incident.title')} />
        <FileUpload accept="image/*" />
        <Button type="submit">{t('common.save')}</Button>
      </form>
    </div>
  )
}
```

## Routes

Routes à enregistrer dans le router CORE :

```tsx
{
  path: '/hse',
  children: [
    { path: '', element: <Dashboard /> },
    { path: 'incidents', element: <IncidentsList /> },
    { path: 'incidents/new', element: <CreateIncident /> },
    { path: 'incidents/:id', element: <IncidentDetails /> }
  ]
}
```

## Implémentation prioritaire

1. Liste des incidents (avec DataTable CORE)
2. Formulaire création incident
3. Dashboard avec statistiques
4. Détails + édition incident
