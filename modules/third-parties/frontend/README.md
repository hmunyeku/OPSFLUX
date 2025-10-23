# Frontend Third Parties Module

## À implémenter

Le frontend du module Third Parties exploitera les composants et hooks du CORE.

### Pages à créer

#### Entreprises
- `pages/Companies/List.tsx` : Liste des entreprises (DataTable)
- `pages/Companies/Create.tsx` : Formulaire création entreprise
- `pages/Companies/Details.tsx` : Détails entreprise + liste contacts
- `pages/Companies/Edit.tsx` : Édition entreprise

#### Contacts
- `pages/Contacts/List.tsx` : Liste des contacts (DataTable)
- `pages/Contacts/Create.tsx` : Formulaire création contact
- `pages/Contacts/Details.tsx` : Détails + édition contact
- `pages/Contacts/Invite.tsx` : Dialog invitation sécurisée

#### Invitations
- `pages/Invitations/List.tsx` : Gestion des invitations
- `pages/AcceptInvitation.tsx` : Page publique d'acceptation (hors dashboard)

### Composants CORE exploités

- `Button`, `Card`, `Input`, `Select`, `Textarea` (shadcn/ui)
- `DataTable` : Listes paginées avec tri et filtres
- `Badge` : Statuts et types
- `Dialog` : Création/édition/invitations
- `AlertDialog` : Confirmations suppression
- `Tabs` : Navigation entreprise (détails, contacts, historique)
- `Form`, `FormField` : Formulaires avec validation

### Hooks CORE exploités

- `useToast()` : Notifications succès/erreur
- `useTranslation('third_parties')` : Traductions multilingues
- `useAuth()` : Authentification et permissions
- `useRouter()` : Navigation Next.js

### Composants spécifiques du module

```tsx
// components/CompanyCard.tsx
interface CompanyCardProps {
  company: Company
  onEdit?: () => void
  onDelete?: () => void
}

// components/ContactCard.tsx
interface ContactCardProps {
  contact: Contact
  showCompany?: boolean
}

// components/InvitationDialog.tsx
interface InvitationDialogProps {
  contactId: string
  onSuccess: () => void
}

// components/CompanySelector.tsx
interface CompanySelectorProps {
  value?: string
  onChange: (companyId: string) => void
}
```

### Exemple: Liste des entreprises

```tsx
// pages/Companies/List.tsx
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useToast } from '@/hooks/use-toast'
import { DataTable } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default function CompaniesList() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [companies, setCompanies] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const response = await fetch('/api/v1/third-parties/companies', {
          headers: { Authorization: `Bearer ${user.token}` }
        })
        const data = await response.json()
        setCompanies(data.data)
      } catch (error) {
        toast({
          title: "Erreur",
          description: "Impossible de charger les entreprises",
          variant: "destructive"
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchCompanies()
  }, [])

  const columns = [
    { accessorKey: 'name', header: 'Nom' },
    {
      accessorKey: 'company_type',
      header: 'Type',
      cell: ({ row }) => <Badge>{row.original.company_type}</Badge>
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      cell: ({ row }) => <Badge variant={
        row.original.status === 'active' ? 'default' : 'secondary'
      }>{row.original.status}</Badge>
    },
    {
      accessorKey: 'contact_count',
      header: 'Contacts'
    }
  ]

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1>Entreprises</h1>
        <Button onClick={() => router.push('/third-parties/companies/new')}>
          Nouvelle entreprise
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={companies}
        isLoading={isLoading}
      />
    </div>
  )
}
```

### Exemple: Formulaire création entreprise

```tsx
// pages/Companies/Create.tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Form, FormField, FormItem, FormLabel, FormControl } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

const formSchema = z.object({
  name: z.string().min(1, "Le nom est requis"),
  legal_name: z.string().optional(),
  registration_number: z.string().optional(),
  company_type: z.enum(['client', 'supplier', 'partner', 'contractor', 'other']),
  status: z.enum(['active', 'inactive', 'prospect', 'archived']),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  website: z.string().url().optional(),
  // ... autres champs
})

export default function CreateCompany() {
  const router = useRouter()
  const { toast } = useToast()
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      company_type: 'client',
      status: 'prospect'
    }
  })

  const onSubmit = async (data) => {
    try {
      const response = await fetch('/api/v1/third-parties/companies', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify(data)
      })

      if (!response.ok) throw new Error()

      toast({
        title: "Entreprise créée",
        description: `L'entreprise "${data.name}" a été créée avec succès`
      })

      router.push('/third-parties/companies')
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de créer l'entreprise",
        variant: "destructive"
      })
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nom de l'entreprise *</FormLabel>
              <FormControl>
                <Input placeholder="Acme Corp" {...field} />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="company_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="supplier">Fournisseur</SelectItem>
                  <SelectItem value="partner">Partenaire</SelectItem>
                  <SelectItem value="contractor">Sous-traitant</SelectItem>
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />

        {/* ... autres champs */}

        <div className="flex gap-2">
          <Button type="submit">Créer l'entreprise</Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Annuler
          </Button>
        </div>
      </form>
    </Form>
  )
}
```

### Exemple: Dialog d'invitation

```tsx
// components/InvitationDialog.tsx
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'

interface InvitationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contactId: string
  contactEmail: string
  onSuccess: () => void
}

export function InvitationDialog({
  open,
  onOpenChange,
  contactId,
  contactEmail,
  onSuccess
}: InvitationDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const handleSend = async (data) => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/v1/third-parties/invitations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`
        },
        body: JSON.stringify({
          contact_id: contactId,
          message: data.message,
          expires_in_days: data.expires_in_days || 7,
          can_be_admin: data.can_be_admin,
          initial_permissions: data.initial_permissions || []
        })
      })

      if (!response.ok) throw new Error()

      toast({
        title: "Invitation envoyée",
        description: `Un email a été envoyé à ${contactEmail}`
      })

      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible d'envoyer l'invitation",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inviter {contactEmail}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            placeholder="Message personnalisé (optionnel)"
            name="message"
          />

          <Input
            type="number"
            placeholder="Expire dans X jours"
            defaultValue={7}
            name="expires_in_days"
          />

          <Checkbox label="Peut devenir administrateur" name="can_be_admin" />

          <Button onClick={handleSend} disabled={isLoading}>
            {isLoading ? "Envoi..." : "Envoyer l'invitation"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

### Exemple: Page d'acceptation d'invitation (publique)

```tsx
// pages/AcceptInvitation.tsx
// Route publique: /accept-invitation/[token]

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TwoFactorVerificationModal } from '@/components/two-factor-verification-modal'

export default function AcceptInvitationPage() {
  const params = useParams()
  const token = params.token as string
  const [password, setPassword] = useState('')
  const [twoFactorMethod, setTwoFactorMethod] = useState('email')
  const [showTwoFactor, setShowTwoFactor] = useState(false)

  const handleAccept = async () => {
    try {
      const response = await fetch(
        `/api/v1/third-parties/invitations/${token}/accept`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            password,
            two_factor_method: twoFactorMethod
          })
        }
      )

      if (!response.ok) throw new Error()

      // Afficher le modal 2FA
      setShowTwoFactor(true)
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible d'accepter l'invitation",
        variant: "destructive"
      })
    }
  }

  const handleVerify2FA = async (code: string) => {
    try {
      const response = await fetch(
        `/api/v1/third-parties/invitations/${token}/verify-2fa`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, code })
        }
      )

      if (!response.ok) throw new Error()

      const { access_token } = await response.json()

      // Stocker le token et rediriger
      localStorage.setItem('token', access_token)
      window.location.href = '/dashboard'
    } catch (error) {
      throw error // Re-throw pour le modal
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-md p-6">
        <h1 className="text-2xl font-bold mb-4">Compléter votre profil</h1>

        <div className="space-y-4">
          <Input
            type="password"
            placeholder="Créer un mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <Select value={twoFactorMethod} onValueChange={setTwoFactorMethod}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="app">Application</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={handleAccept} className="w-full">
            Accepter l'invitation
          </Button>
        </div>
      </Card>

      {showTwoFactor && (
        <TwoFactorVerificationModal
          open={showTwoFactor}
          onVerify={handleVerify2FA}
          onCancel={() => setShowTwoFactor(false)}
        />
      )}
    </div>
  )
}
```

## Routes du module

Routes à enregistrer dans le router CORE via le manifest:

```tsx
{
  path: '/third-parties',
  children: [
    { path: 'companies', element: <CompaniesList /> },
    { path: 'companies/new', element: <CreateCompany /> },
    { path: 'companies/:id', element: <CompanyDetails /> },
    { path: 'companies/:id/edit', element: <EditCompany /> },
    { path: 'contacts', element: <ContactsList /> },
    { path: 'contacts/new', element: <CreateContact /> },
    { path: 'contacts/:id', element: <ContactDetails /> },
    { path: 'invitations', element: <InvitationsList /> }
  ]
}
```

Route publique (hors dashboard):
```tsx
{ path: '/accept-invitation/:token', element: <AcceptInvitation /> }
```

## Implémentation prioritaire

1. **Liste des entreprises** (avec filtres et recherche)
2. **Formulaire création entreprise**
3. **Détails entreprise** (avec liste contacts)
4. **Liste des contacts**
5. **Formulaire création contact**
6. **Dialog d'invitation** (composant réutilisable)
7. **Page d'acceptation d'invitation** (avec 2FA)
8. **Gestion des invitations**

## Permissions

Toutes les pages doivent vérifier les permissions avec `PermissionGuard`:

```tsx
<PermissionGuard permission="companies.read">
  <CompaniesList />
</PermissionGuard>
```

Permissions disponibles:
- `companies.read`, `companies.create`, `companies.update`, `companies.delete`
- `contacts.read`, `contacts.create`, `contacts.update`, `contacts.delete`
- `contacts.invite`, `contacts.manage_invitations`, `contacts.grant_admin`
