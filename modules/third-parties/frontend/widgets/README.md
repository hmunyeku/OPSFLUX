# Third Parties Module - Widgets

Ce dossier contient les composants widgets du module Third Parties Management.

## Widgets Disponibles

### 1. Stats Overview (`third_parties_stats_overview`)
**Fichier:** `stats-overview.tsx`

Widget affichant les statistiques globales des entreprises et contacts.

**Configuration:**
```json
{
  "showCompanies": true,
  "showContacts": true,
  "showInvitations": true,
  "refreshInterval": 300000
}
```

**Données affichées:**
- Nombre total d'entreprises (avec taux de croissance)
- Nombre total de contacts (avec taux de croissance)
- Nombre d'invitations en attente

---

### 2. Recent Companies (`third_parties_recent_companies`)
**Fichier:** `recent-companies.tsx`

Liste des entreprises ajoutées récemment.

**Configuration:**
```json
{
  "limit": 5,
  "showType": true,
  "showStatus": true,
  "showDate": true
}
```

**Données affichées:**
- Nom de l'entreprise
- Type (client, fournisseur, partenaire...)
- Statut (actif, inactif, prospect...)
- Date d'ajout (relative)

---

### Widgets à implémenter

Les widgets suivants sont définis dans le manifest mais leurs composants React doivent encore être créés :

#### 3. Companies by Type (`third_parties_companies_by_type`)
Graphique en camembert de la répartition des entreprises par type.

#### 4. Companies by Status (`third_parties_companies_by_status`)
Graphique donut de la répartition des entreprises par statut.

#### 5. Recent Contacts (`third_parties_recent_contacts`)
Liste des contacts ajoutés récemment.

#### 6. Pending Invitations (`third_parties_pending_invitations`)
Liste des invitations en attente avec alertes pour celles qui expirent bientôt.

#### 7. Contacts Evolution (`third_parties_contacts_evolution`)
Graphique linéaire montrant l'évolution du nombre de contacts dans le temps.

#### 8. Top Companies (`third_parties_top_companies`)
Classement des entreprises avec le plus de contacts.

## Utilisation

### Enregistrement dans le widget registry

Les widgets doivent être enregistrés dans `frontend/src/widgets/registry.ts` :

```typescript
import {
  ThirdPartiesStatsOverview,
  ThirdPartiesRecentCompanies,
} from "@/modules/third-parties/frontend/widgets"

const widgetRegistry = {
  // ... autres widgets
  third_parties_stats_overview: ThirdPartiesStatsOverview,
  third_parties_recent_companies: ThirdPartiesRecentCompanies,
}
```

### Ajout à un dashboard

Les widgets sont automatiquement disponibles dans l'éditeur de dashboard après leur enregistrement dans le système via le manifest.json.

## Structure d'un widget

Chaque widget doit suivre cette structure :

```typescript
"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useSession } from "next-auth/react"

interface MyWidgetConfig {
  // Configuration options
  myOption?: boolean
}

interface MyWidgetProps {
  config?: MyWidgetConfig
}

export default function MyWidget({ config }: MyWidgetProps) {
  const { data: session } = useSession()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  // Destructure config avec valeurs par défaut
  const { myOption = true } = config || {}

  useEffect(() => {
    // Fetch data
    const fetchData = async () => {
      if (!session?.user?.access_token) return

      try {
        setLoading(true)
        // API call
        setData(result)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [session])

  if (loading) return <LoadingState />
  if (error) return <ErrorState />

  return (
    <Card className="w-full h-full">
      <CardHeader>
        <CardTitle>Mon Widget</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Widget content */}
      </CardContent>
    </Card>
  )
}
```

## API Endpoints requis

Les widgets utilisent les endpoints suivants :

- `GET /api/v1/third-parties/companies/stats/summary` - Statistiques globales
- `GET /api/v1/third-parties/companies` - Liste des entreprises
- `GET /api/v1/third-parties/contacts` - Liste des contacts
- `GET /api/v1/third-parties/invitations` - Liste des invitations

Tous les endpoints requièrent un token d'authentification Bearer.

## Bonnes pratiques

1. **Always use `"use client"`** - Les widgets sont des composants client React
2. **Handle loading states** - Toujours afficher un skeleton/loader pendant le chargement
3. **Handle errors gracefully** - Afficher un message d'erreur clair
4. **Respect permissions** - Utiliser `required_permission` dans le manifest
5. **Responsive design** - Les widgets doivent s'adapter à différentes tailles
6. **Auto-refresh** - Utiliser `refreshInterval` pour les données temps réel
7. **Use TypeScript** - Typer toutes les props et données
