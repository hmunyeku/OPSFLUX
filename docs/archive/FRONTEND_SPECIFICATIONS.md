# 🎨 OPSFLUX - SPÉCIFICATIONS FRONTEND COMPLÈTES

**Version :** 2.0
**Date :** 08 Octobre 2025
**Objectif :** Cahier des charges complet pour génération frontend par IA

---

## 📐 **PRINCIPES DE DESIGN**

### Stack Technique
- **Framework** : React 18+ avec hooks
- **UI Components** : shadcn/ui (composants copiés dans le projet) + KiboUI (ganttn calendar, etc), 
- **Headless Components** : Radix UI (accessible, non-stylé)
- **Styling** : Tailwind CSS v3+ (utility-first)
- **Build Tool** : Vite 5
- **Routing** : React Router v6
- **State Management** : Zustand (global) + TanStack Query (React Query v5 - server state)
- **Forms** : React Hook Form + Zod validation
- **HTTP Client** : Axios
- **Icons** : Lucide React (modern, consistant)
- **Animations** : Framer Motion (optionnel pour animations complexes)

### Principes ergonomiques
- **Simplicité** : Maximum 3 clics pour action courante
- **Cohérence** : Même pattern partout (boutons, formulaires, tables)
- **Feedback visuel** : Loading states, toasts confirmations
- **Prévention erreurs** : Validation inline, confirmations actions critiques
- **Accessibilité** : WCAG 2.1 AA (lecteurs écran, navigation clavier, contrastes)
- **Performance** : Lazy loading, code splitting, optimistic updates

### Exemple
- npx shadcn@latest add sidebar-16
- npx shadcn@latest add sidebar-13 (le dialog pour configurer le profil user par exemple)
- npx shadcn@latest add sidebar-10 (seulement le popover)
- npx shadcn@latest add sidebar-05 (juste pour la partie aide à l'utilisateur
- npx shadcn@latest add login-03 (portail de connexion avec desactivation des sso si pas configuré)
- npx shadcn@latest add login-05 (pour la connexion via token envoyer par email.
- npx shadcn@latest add signup-01 Pour la creation d'un compte qui est ensuite soumis à validationd'un manager
- npx shadcn@latest add otp-01 (pour le système otp permettant de certifier le compte ou le 2FA
- npx shadcn@latest add dashboard-01 (pour exemple de Dashboard
- npx shadcn@latest add sidebar-09 (pour le système de redaction de rapport)
- npx shadcn add @kibo-ui/gantt (for gantt)
- npx shadcn add @kibo-ui/kanban (for kanban)
- npx shadcn add @kibo-ui/list (for movable list)
- npx shadcn add @kibo-ui/contribution-graph (for heat map contribution)
- npx shadcn@latest add @ss-blocks/dashboard-shell-01 (juste le bouton et le modal pour le parametre utilisateur.
- npx shadcn add dashboard-shell-03 (pour exemple de tableau de bord)
- npx shadcn add dashboard-shell-06 (pour exempale de tableau de bord grand format)

### Responsive breakpoints (Tailwind)
```javascript
// tailwind.config.js
module.exports = {
  theme: {
    screens: {
      'sm': '640px',   // Mobile landscape / Tablet portrait
      'md': '768px',   // Tablet landscape
      'lg': '1024px',  // Desktop small
      'xl': '1280px',  // Desktop standard
      '2xl': '1536px', // Desktop large / 4K
    },
  },
}
```

---

## 🎨 **THÈME & DESIGN TOKENS (TAILWIND)**

### Configuration Tailwind

**tailwind.config.js**
```javascript
module.exports = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: 0 },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: 0 },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
```

### CSS Variables (app/globals.css)

**Mode clair (défaut)**
```css
@layer base {
  :root {
    /* Backgrounds */
    --background: 0 0% 100%;           /* #FFFFFF */
    --foreground: 222.2 84% 4.9%;      /* #020817 */

    /* Cards */
    --card: 0 0% 100%;                 /* #FFFFFF */
    --card-foreground: 222.2 84% 4.9%; /* #020817 */

    /* Popover */
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;

    /* Primary (Brand Blue) */
    --primary: 221.2 83.2% 53.3%;      /* #3B82F6 - Blue 500 */
    --primary-foreground: 210 40% 98%; /* #F8FAFC */

    /* Secondary */
    --secondary: 210 40% 96.1%;        /* #F1F5F9 - Slate 100 */
    --secondary-foreground: 222.2 47.4% 11.2%; /* #1E293B */

    /* Muted */
    --muted: 210 40% 96.1%;            /* #F1F5F9 */
    --muted-foreground: 215.4 16.3% 46.9%; /* #64748B - Slate 500 */

    /* Accent */
    --accent: 210 40% 96.1%;           /* #F1F5F9 */
    --accent-foreground: 222.2 47.4% 11.2%; /* #1E293B */

    /* Destructive (Error) */
    --destructive: 0 84.2% 60.2%;      /* #EF4444 - Red 500 */
    --destructive-foreground: 210 40% 98%; /* #F8FAFC */

    /* Border */
    --border: 214.3 31.8% 91.4%;       /* #E2E8F0 - Slate 200 */
    --input: 214.3 31.8% 91.4%;        /* #E2E8F0 */
    --ring: 221.2 83.2% 53.3%;         /* #3B82F6 - focus ring */

    /* Border radius */
    --radius: 0.5rem;                  /* 8px */
  }
}
```

**Mode sombre**
```css
@layer base {
  .dark {
    /* Backgrounds */
    --background: 222.2 84% 4.9%;      /* #020817 - Slate 950 */
    --foreground: 210 40% 98%;         /* #F8FAFC */

    /* Cards */
    --card: 222.2 84% 4.9%;            /* #020817 */
    --card-foreground: 210 40% 98%;    /* #F8FAFC */

    /* Popover */
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;

    /* Primary */
    --primary: 217.2 91.2% 59.8%;      /* #60A5FA - Blue 400 */
    --primary-foreground: 222.2 47.4% 11.2%; /* #1E293B */

    /* Secondary */
    --secondary: 217.2 32.6% 17.5%;    /* #1E293B - Slate 800 */
    --secondary-foreground: 210 40% 98%; /* #F8FAFC */

    /* Muted */
    --muted: 217.2 32.6% 17.5%;        /* #1E293B */
    --muted-foreground: 215 20.2% 65.1%; /* #94A3B8 - Slate 400 */

    /* Accent */
    --accent: 217.2 32.6% 17.5%;       /* #1E293B */
    --accent-foreground: 210 40% 98%;  /* #F8FAFC */

    /* Destructive */
    --destructive: 0 62.8% 30.6%;      /* #991B1B - Red 800 */
    --destructive-foreground: 210 40% 98%; /* #F8FAFC */

    /* Border */
    --border: 217.2 32.6% 17.5%;       /* #1E293B */
    --input: 217.2 32.6% 17.5%;        /* #1E293B */
    --ring: 224.3 76.3% 48%;           /* #2563EB - Blue 600 */
  }
}
```

### Couleurs sémantiques additionnelles

```css
:root {
  /* Success */
  --success: 142.1 76.2% 36.3%;      /* #22C55E - Green 500 */
  --success-foreground: 0 0% 100%;

  /* Warning */
  --warning: 38 92% 50%;             /* #F59E0B - Amber 500 */
  --warning-foreground: 0 0% 100%;

  /* Info */
  --info: 199 89% 48%;               /* #0EA5E9 - Sky 500 */
  --info-foreground: 0 0% 100%;
}

.dark {
  --success: 142.1 70.6% 45.3%;      /* #4ADE80 - Green 400 */
  --warning: 48 96% 53%;             /* #FBBF24 - Amber 400 */
  --info: 199 89% 48%;               /* #38BDF8 - Sky 400 */
}
```

### Typographie (Tailwind defaults + extensions)

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],      // 12px
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],  // 14px
        'base': ['1rem', { lineHeight: '1.5rem' }],     // 16px
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],  // 18px
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],   // 20px
        '2xl': ['1.5rem', { lineHeight: '2rem' }],      // 24px
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }], // 30px
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],   // 36px
        '5xl': ['3rem', { lineHeight: '1' }],           // 48px
      },
    },
  },
}
```

---

## 🏗️ **LAYOUT GÉNÉRAL**

### Structure de base

```
┌─────────────────────────────────────────────────────┐
│ TopBar (h-16 / 64px fixed top)                     │
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│          │  Main Content Area                       │
│ Sidebar  │  (scrollable, p-6)                       │
│ (w-60)   │                                          │
│ fixed    │                                          │
│ left     │                                          │
│          │                                          │
└──────────┴──────────────────────────────────────────┘
```

### TopBar (AppBar)

**Composant : Header.tsx**

```tsx
import { Search, Bell, User, Settings, Moon, Sun, Languages } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center">
        {/* Logo */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-5 w-5" />
          </Button>
          <a href="/" className="flex items-center gap-2">
            <img src="/logo.svg" alt="OpsFlux" className="h-8 w-8" />
            <span className="hidden font-bold sm:inline-block">OpsFlux</span>
          </a>
        </div>

        {/* Search */}
        <div className="flex-1 px-8">
          <div className="relative max-w-md">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher... (Cmd+K)"
              className="pl-8"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground">
              3
            </span>
          </Button>

          <ThemeToggle />
          <LanguageSelector />
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
```

**Hauteur** : `h-16` (64px)
**Background** : `bg-background/95 backdrop-blur`
**Border** : `border-b`
**Position** : `sticky top-0 z-50`

---

### Sidebar (Navigation)

**Composant : Sidebar.tsx**

```tsx
import { Home, Users, Shield, Bell, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const navigation = [
  { name: 'Dashboard', href: '/', icon: Home },
  { name: 'Utilisateurs', href: '/users', icon: Users, badge: 12 },
  { name: 'Rôles & Permissions', href: '/roles', icon: Shield },
  { name: 'Notifications', href: '/notifications', icon: Bell },
  { name: 'Configuration', href: '/settings', icon: Settings },
]

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-16 z-30 h-[calc(100vh-4rem)] w-60 border-r bg-background">
      <nav className="flex flex-col gap-1 p-4">
        {navigation.map((item) => (
          <a
            key={item.name}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              "hover:bg-accent hover:text-accent-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
          >
            <item.icon className="h-5 w-5" />
            <span className="flex-1">{item.name}</span>
            {item.badge && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                {item.badge}
              </span>
            )}
          </a>
        ))}
      </nav>
    </aside>
  )
}
```

**Classes Tailwind :**
- Width : `w-60` (240px)
- Position : `fixed left-0 top-16`
- Height : `h-[calc(100vh-4rem)]`
- Background : `bg-background`
- Border : `border-r`

**Navigation Item (active state) :**
```tsx
className={cn(
  "flex items-center gap-3 rounded-lg px-3 py-2",
  isActive
    ? "bg-primary/10 text-primary font-semibold"
    : "text-muted-foreground hover:bg-accent"
)}
```

**Responsive :**
- **Mobile (<768px)** : Sidebar devient un Sheet (drawer) overlay
- **Desktop (>=768px)** : Sidebar fixe

```tsx
// Mobile: Sheet component (shadcn/ui)
import { Sheet, SheetContent } from '@/components/ui/sheet'

<Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
  <SheetContent side="left" className="w-60">
    <nav>...</nav>
  </SheetContent>
</Sheet>
```

---

### Main Content Area

```tsx
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 ml-60 p-6">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
```

**Classes Tailwind :**
- Container : `ml-60` (margin-left = sidebar width)
- Padding : `p-6` (24px)
- Max width : `max-w-7xl` (1280px)
- Responsive : `md:ml-60 ml-0` (pas de margin mobile)

---

## 📄 **PATTERNS DE PAGES**

### 1. Dashboard (Page d'accueil)

**Composant : Dashboard.tsx**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, FileText, AlertCircle, CheckCircle } from 'lucide-react'

export function Dashboard() {
  const stats = [
    { name: 'Total Utilisateurs', value: 142, change: '+12', icon: Users, color: 'text-blue-500' },
    { name: 'Rapports actifs', value: 89, change: '+5', icon: FileText, color: 'text-green-500' },
    { name: 'Incidents ouverts', value: 7, change: '-3', icon: AlertCircle, color: 'text-orange-500' },
    { name: 'Tâches terminées', value: 234, change: '+42', icon: CheckCircle, color: 'text-purple-500' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Bonjour, John Doe! 👋</h1>
        <p className="text-muted-foreground">
          Voici un résumé de votre activité
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.name}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.name}
              </CardTitle>
              <stat.icon className={cn("h-4 w-4", stat.color)} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                <span className="text-green-500">{stat.change}</span> ce mois
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Activity + Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Activité récente</CardTitle>
          </CardHeader>
          <CardContent>
            <RecentActivityTable />
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Actions rapides</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button className="w-full justify-start" variant="outline">
              + Nouvel incident
            </Button>
            <Button className="w-full justify-start" variant="outline">
              + Nouveau rapport
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

**Grid responsive :**
- Mobile : 1 colonne (`grid-cols-1`)
- Tablet : 2 colonnes (`md:grid-cols-2`)
- Desktop : 4 colonnes (`lg:grid-cols-4`)

---

### 2. Liste (Index page)

**Composant : UsersPage.tsx**

```tsx
import { DataTable } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Filter } from 'lucide-react'

export function UsersPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Utilisateurs</h1>
          <p className="text-muted-foreground">
            Gérer tous les utilisateurs de la plateforme
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Nouvel utilisateur
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, email..."
            className="pl-8"
          />
        </div>
        <Button variant="outline">
          <Filter className="mr-2 h-4 w-4" />
          Filtres
        </Button>
      </div>

      {/* Table */}
      <DataTable columns={columns} data={users} />
    </div>
  )
}
```

**DataTable (shadcn/ui + TanStack Table)**

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { DropdownMenu } from '@/components/ui/dropdown-menu'
import { MoreHorizontal } from 'lucide-react'

export const columns = [
  {
    accessorKey: 'name',
    header: 'Nom',
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={row.original.avatar} />
          <AvatarFallback>{row.original.initials}</AvatarFallback>
        </Avatar>
        <span className="font-medium">{row.getValue('name')}</span>
      </div>
    ),
  },
  {
    accessorKey: 'email',
    header: 'Email',
  },
  {
    accessorKey: 'role',
    header: 'Rôle',
    cell: ({ row }) => (
      <Badge variant="secondary">{row.getValue('role')}</Badge>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Statut',
    cell: ({ row }) => {
      const status = row.getValue('status')
      return (
        <Badge
          variant={status === 'active' ? 'default' : 'secondary'}
          className={status === 'active' ? 'bg-green-500' : ''}
        >
          {status === 'active' ? 'Actif' : 'Inactif'}
        </Badge>
      )
    },
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>Modifier</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive">
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
]
```

**Responsive Mobile : Cards**

```tsx
export function UserCard({ user }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <Avatar className="h-12 w-12">
          <AvatarImage src={user.avatar} />
          <AvatarFallback>{user.initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <p className="font-medium">{user.name}</p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <Badge>{user.role}</Badge>
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="outline" size="sm" className="flex-1">
          Modifier
        </Button>
        <Button variant="outline" size="sm" className="flex-1">
          Supprimer
        </Button>
      </div>
    </Card>
  )
}

// Usage avec responsive
<div className="space-y-4">
  {/* Desktop: Table */}
  <div className="hidden md:block">
    <DataTable columns={columns} data={users} />
  </div>

  {/* Mobile: Cards */}
  <div className="md:hidden space-y-3">
    {users.map(user => <UserCard key={user.id} user={user} />)}
  </div>
</div>
```

---

### 3. Formulaire (Create/Edit)

**Composant : UserForm.tsx**

```tsx
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const formSchema = z.object({
  firstName: z.string().min(2, 'Prénom requis (min 2 caractères)'),
  lastName: z.string().min(2, 'Nom requis'),
  email: z.string().email('Email invalide'),
  role: z.string(),
  status: z.enum(['active', 'inactive']),
})

export function UserForm() {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      status: 'active',
    },
  })

  function onSubmit(values: z.infer<typeof formSchema>) {
    console.log(values)
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <a href="/users" className="hover:text-foreground">Utilisateurs</a>
        <span>/</span>
        <span className="text-foreground">Créer un utilisateur</span>
      </div>

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Créer un utilisateur</h1>
        <p className="text-muted-foreground">
          Ajoutez un nouvel utilisateur à la plateforme
        </p>
      </div>

      {/* Form with Tabs */}
      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">Informations générales</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="settings">Paramètres</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              {/* Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Informations personnelles</h3>

                {/* 2 columns on desktop */}
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prénom *</FormLabel>
                        <FormControl>
                          <Input placeholder="John" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nom *</FormLabel>
                        <FormControl>
                          <Input placeholder="Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Full width */}
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="john.doe@example.com" {...field} />
                      </FormControl>
                      <FormDescription>
                        L'utilisateur recevra un email d'invitation
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Section 2 */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Accès</h3>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rôle *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Sélectionnez un rôle" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="admin">Administrator</SelectItem>
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="manager">Manager</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Statut</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="active">Actif</SelectItem>
                            <SelectItem value="inactive">Inactif</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between border-t pt-6">
                <Button type="button" variant="outline">
                  Annuler
                </Button>
                <Button type="submit">
                  Enregistrer
                </Button>
              </div>
            </form>
          </Form>
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

**Responsive Form :**
- Desktop : `grid-cols-2` (2 colonnes)
- Mobile : `grid-cols-1` (automatique, pas besoin de préciser)

---

## 🧩 **COMPOSANTS SHADCN/UI**

### Installation shadcn/ui

```bash
npx shadcn-ui@latest init

# Installer composants nécessaires
npx shadcn-ui@latest add button
npx shadcn-ui@latest add input
npx shadcn-ui@latest add card
npx shadcn-ui@latest add table
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add dropdown-menu
npx shadcn-ui@latest add select
npx shadcn-ui@latest add badge
npx shadcn-ui@latest add avatar
npx shadcn-ui@latest add tabs
npx shadcn-ui@latest add toast
npx shadcn-ui@latest add form
npx shadcn-ui@latest add sheet
npx shadcn-ui@latest add accordion
npx shadcn-ui@latest add alert
npx shadcn-ui@latest add skeleton
```

### Composants essentiels

#### Button

```tsx
import { Button } from '@/components/ui/button'

// Variants
<Button>Default</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="destructive">Destructive</Button>

// Sizes
<Button size="sm">Small</Button>
<Button size="default">Default</Button>
<Button size="lg">Large</Button>
<Button size="icon"><Plus /></Button>

// Loading
<Button disabled>
  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
  Chargement...
</Button>
```

#### Card

```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

<Card>
  <CardHeader>
    <CardTitle>Card Title</CardTitle>
    <CardDescription>Card description</CardDescription>
  </CardHeader>
  <CardContent>
    Content goes here
  </CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

#### Badge

```tsx
import { Badge } from '@/components/ui/badge'

<Badge>Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="outline">Outline</Badge>
<Badge variant="destructive">Destructive</Badge>

// Status badges (custom)
<Badge className="bg-green-500">Active</Badge>
<Badge className="bg-orange-500">Pending</Badge>
<Badge className="bg-red-500">Inactive</Badge>
```

#### Dialog

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

<Dialog>
  <DialogTrigger asChild>
    <Button>Ouvrir</Button>
  </DialogTrigger>
  <DialogContent className="sm:max-w-[425px]">
    <DialogHeader>
      <DialogTitle>Titre</DialogTitle>
      <DialogDescription>Description</DialogDescription>
    </DialogHeader>
    <div className="grid gap-4 py-4">
      Content...
    </div>
    <DialogFooter>
      <Button type="submit">Confirmer</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

#### Toast

```tsx
import { useToast } from '@/components/ui/use-toast'

function Component() {
  const { toast } = useToast()

  return (
    <Button
      onClick={() => {
        toast({
          title: 'Succès',
          description: 'Utilisateur créé avec succès',
        })
      }}
    >
      Afficher toast
    </Button>
  )
}

// Variants
toast({
  title: 'Succès',
  description: 'Opération réussie',
})

toast({
  variant: 'destructive',
  title: 'Erreur',
  description: 'Une erreur est survenue',
})
```

#### Dropdown Menu

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline">Ouvrir</Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuLabel>Mon compte</DropdownMenuLabel>
    <DropdownMenuSeparator />
    <DropdownMenuItem>Profil</DropdownMenuItem>
    <DropdownMenuItem>Paramètres</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem className="text-destructive">
      Déconnexion
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

---

## 🔔 **NOTIFICATION CENTER**

**Composant : NotificationPanel.tsx**

```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

export function NotificationPanel({ open, onOpenChange }) {
  const notifications = [
    {
      id: 1,
      title: 'John a commenté',
      description: 'Rapport incident #142',
      time: 'Il y a 5 minutes',
      unread: true,
    },
    // ...
  ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle>Notifications</SheetTitle>
            <Button variant="ghost" size="sm">
              Tout marquer lu
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-8rem)] mt-6">
          <div className="space-y-4">
            {/* Group by date */}
            <div>
              <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                Aujourd'hui
              </h4>
              <div className="space-y-2">
                {notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={cn(
                      "flex gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent",
                      notif.unread && "bg-primary/5 border-primary/20"
                    )}
                  >
                    {notif.unread && (
                      <div className="mt-2 h-2 w-2 rounded-full bg-primary" />
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium">{notif.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {notif.description}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {notif.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
```

---

## 📱 **RESPONSIVE - MOBILE**

### Mobile Navigation (Bottom Nav)

```tsx
import { Home, BarChart3, Bell, User, Menu } from 'lucide-react'

export function MobileNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background md:hidden">
      <div className="flex items-center justify-around">
        <Button
          variant="ghost"
          size="sm"
          className="flex-col h-16 gap-1 rounded-none flex-1"
        >
          <Home className="h-5 w-5" />
          <span className="text-xs">Accueil</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="flex-col h-16 gap-1 rounded-none flex-1"
        >
          <BarChart3 className="h-5 w-5" />
          <span className="text-xs">Rapports</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="flex-col h-16 gap-1 rounded-none flex-1 relative"
        >
          <Bell className="h-5 w-5" />
          <span className="text-xs">Notifications</span>
          <span className="absolute top-2 right-1/3 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
            3
          </span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="flex-col h-16 gap-1 rounded-none flex-1"
        >
          <User className="h-5 w-5" />
          <span className="text-xs">Profil</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="flex-col h-16 gap-1 rounded-none flex-1"
        >
          <Menu className="h-5 w-5" />
          <span className="text-xs">Plus</span>
        </Button>
      </div>
    </nav>
  )
}
```

---

## ♿ **ACCESSIBILITÉ**

### Keyboard Navigation

```tsx
// Focus visible (déjà dans shadcn/ui)
className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"

// Skip to main content
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-background focus:border"
>
  Aller au contenu principal
</a>

<main id="main-content">
  {children}
</main>
```

### ARIA Labels

```tsx
// Icon buttons
<Button variant="ghost" size="icon" aria-label="Ouvrir menu">
  <Menu className="h-5 w-5" />
</Button>

// Form fields (automatique avec shadcn Form)
<FormField
  control={form.control}
  name="email"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Email</FormLabel>
      <FormControl>
        <Input {...field} aria-describedby="email-description" />
      </FormControl>
      <FormDescription id="email-description">
        Nous ne partagerons jamais votre email
      </FormDescription>
    </FormItem>
  )}
/>
```

---

## 🚀 **PERFORMANCE**

### Code Splitting

```tsx
import { lazy, Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

const UsersPage = lazy(() => import('@/pages/users'))

function App() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <UsersPage />
    </Suspense>
  )
}
```

### Image Optimization

```tsx
import Image from 'next/image' // Si Next.js

<Image
  src="/avatar.jpg"
  alt="Avatar"
  width={40}
  height={40}
  className="rounded-full"
/>

// Ou avec loading="lazy" natif
<img
  src="/avatar.jpg"
  alt="Avatar"
  loading="lazy"
  className="h-10 w-10 rounded-full"
/>
```

---

## 🎯 **EXEMPLES PAGES CLÉS**

### Login Page

```tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'

export function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex justify-center mb-4">
            <img src="/logo.svg" alt="OpsFlux" className="h-12 w-12" />
          </div>
          <CardTitle className="text-2xl text-center">Connexion</CardTitle>
          <CardDescription className="text-center">
            Entrez vos identifiants pour accéder à votre compte
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="john.doe@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" type="password" />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Checkbox id="remember" />
                <Label htmlFor="remember" className="text-sm font-normal">
                  Se souvenir de moi
                </Label>
              </div>
              <a
                href="/forgot-password"
                className="text-sm text-primary hover:underline"
              >
                Mot de passe oublié ?
              </a>
            </div>
            <Button type="submit" className="w-full">
              Se connecter
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
```

---

## ✅ **CHECKLIST DÉVELOPPEMENT**

### Setup initial
- [ ] Initialiser Vite + React + TypeScript
- [ ] Installer Tailwind CSS
- [ ] Initialiser shadcn/ui (`npx shadcn-ui@latest init`)
- [ ] Configurer design tokens (CSS variables)
- [ ] Installer Lucide React (icons)
- [ ] Setup React Router
- [ ] Setup Zustand + TanStack Query
- [ ] Setup React Hook Form + Zod

### Composants shadcn/ui
- [ ] button, input, label, textarea
- [ ] card, badge, avatar
- [ ] dialog, sheet, dropdown-menu, popover
- [ ] table, form, select, checkbox, switch
- [ ] tabs, accordion, alert
- [ ] toast, skeleton, scroll-area

### Layout
- [ ] Header (TopBar)
- [ ] Sidebar (Desktop) / Sheet (Mobile)
- [ ] Main layout wrapper
- [ ] Mobile Bottom Navigation
- [ ] Breadcrumbs

### Pages
- [ ] Login
- [ ] Dashboard
- [ ] Liste template (DataTable)
- [ ] Formulaire template (Form)
- [ ] Détail template
- [ ] Profile
- [ ] Settings
- [ ] 404 / Error pages

### Features
- [ ] Theme toggle (light/dark)
- [ ] i18n (multi-langue)
- [ ] Notification panel
- [ ] Search modal (Cmd+K)
- [ ] Auth (login, logout, protected routes)

### Responsive
- [ ] Mobile navigation
- [ ] Table → Cards mobile
- [ ] Forms responsive grid
- [ ] Touch targets 48px min

### Accessibilité
- [ ] Keyboard navigation
- [ ] Focus visible
- [ ] ARIA labels
- [ ] Skip to content link
- [ ] Test screen reader

### Performance
- [ ] Code splitting (lazy)
- [ ] Image lazy loading
- [ ] TanStack Query caching
- [ ] Bundle size <500kb
- [ ] Lighthouse score >90

---

## 📚 **RESSOURCES**

### Documentation
- shadcn/ui : https://ui.shadcn.com/
- Radix UI : https://www.radix-ui.com/
- Tailwind CSS : https://tailwindcss.com/
- Lucide Icons : https://lucide.dev/
- TanStack Table : https://tanstack.com/table
- TanStack Query : https://tanstack.com/query
- React Hook Form : https://react-hook-form.com/
- Zod : https://zod.dev/

### Inspiration
- shadcn/ui examples : https://ui.shadcn.com/examples
- v0.dev (Vercel AI) : https://v0.dev/
- Taxonomy (Next.js template) : https://tx.shadcn.com/
- Linear App
- GitHub UI
- Vercel Dashboard

### Tools
- v0.dev (AI code generation)
- Figma to Code
- Tailwind CSS IntelliSense (VS Code)
- React DevTools
- Lighthouse / PageSpeed

---

**FIN DU DOCUMENT**
