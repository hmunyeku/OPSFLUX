# Design Tokens & Classes Utilitaires - OpsFlux

**Date**: 19 Octobre 2025
**Version**: 1.0
**Fichier source**: `frontend/src/app/globals.css`

---

## 📋 Table des Matières

1. [Design Tokens - Espacements](#design-tokens---espacements)
2. [Typographie Standardisée](#typographie-standardisée)
3. [Layouts Standardisés](#layouts-standardisés)
4. [Exemples d'Utilisation](#exemples-dutilisation)
5. [Migration Guide](#migration-guide)

---

## 🎨 Design Tokens - Espacements

### Sections Principales

| Classe | Espacement | Usage |
|--------|------------|-------|
| `.spacing-section` | `gap-6` (1.5rem) | Espacement standard entre sections |
| `.spacing-section-sm` | `gap-4` (1rem) | Espacement réduit |
| `.spacing-section-lg` | `gap-8` (2rem) | Espacement augmenté |

### Cartes (Cards)

| Classe | Espacement | Usage |
|--------|------------|-------|
| `.spacing-card` | `gap-4 p-4` | Card standard (padding + gap) |
| `.spacing-card-sm` | `gap-3 p-3` | Card compact |
| `.spacing-card-lg` | `gap-6 p-6` | Card spacieuse |

### Formulaires

| Classe | Espacement | Usage |
|--------|------------|-------|
| `.spacing-form-field` | `gap-2` | Entre label et input |
| `.spacing-form-group` | `gap-4` | Entre groupes de champs |
| `.spacing-form-section` | `gap-6` | Entre sections de formulaire |

### Conteneurs

| Classe | Espacement | Usage |
|--------|------------|-------|
| `.container-padding` | `px-4 md:px-6 lg:px-8` | Padding horizontal responsive |
| `.container-padding-y` | `py-4 md:py-6 lg:py-8` | Padding vertical responsive |

### Listes

| Classe | Espacement | Usage |
|--------|------------|-------|
| `.list-spacing` | `space-y-3` | Entre items de liste |
| `.list-spacing-sm` | `space-y-2` | Liste compacte |
| `.list-spacing-lg` | `space-y-4` | Liste aérée |

---

## ✍️ Typographie Standardisée

### Titres (Headings)

| Classe | Taille | Poids | Usage |
|--------|--------|-------|-------|
| `.heading-page` | `2xl` → `3xl` (md+) | Bold | Titre principal de page |
| `.heading-section` | `xl` → `2xl` (md+) | Semibold | Titre de section |
| `.heading-card` | `lg` | Medium | Titre de card/bloc |
| `.heading-subsection` | `base` | Medium | Titre de sous-section |

**Exemple**:
```tsx
<h1 className="heading-page">Gestion des Utilisateurs</h1>
<h2 className="heading-section">Utilisateurs Actifs</h2>
<h3 className="heading-card">Détails du Profil</h3>
```

### Texte Body

| Classe | Taille | Couleur | Usage |
|--------|--------|---------|-------|
| `.text-body` | `base` | `foreground` | Texte corps standard |
| `.text-body-sm` | `sm` | `foreground` | Texte corps réduit |
| `.text-body-lg` | `lg` | `foreground` | Texte corps agrandi |

### Texte Muted (Secondaire)

| Classe | Taille | Couleur | Usage |
|--------|--------|---------|-------|
| `.text-muted` | `sm` | `muted-foreground` | Descriptions, hints |
| `.text-muted-xs` | `xs` | `muted-foreground` | Métadonnées, timestamps |

### Texte Spécialisé

| Classe | Style | Usage |
|--------|-------|-------|
| `.text-code` | `font-mono text-sm` | Code inline, identifiants |
| `.label-form` | `text-sm font-medium` | Labels de formulaire |
| `.text-error` | `text-sm font-medium text-destructive` | Messages d'erreur |
| `.text-success` | `text-sm font-medium text-green` | Messages de succès |

---

## 📐 Layouts Standardisés

### Page Layout

| Classe | Description | Composition |
|--------|-------------|-------------|
| `.page-layout` | Layout principal de page | `flex flex-col` + `spacing-section` + paddings |
| `.page-header` | Header de page | `flex flex-col gap-2` |
| `.page-header-with-actions` | Header avec actions | Responsive: col mobile, row desktop |

**Exemple**:
```tsx
<div className="page-layout">
  <div className="page-header-with-actions">
    <div>
      <h1 className="heading-page">Backups</h1>
      <p className="text-muted">Gérez vos sauvegardes</p>
    </div>
    <Button>Créer une sauvegarde</Button>
  </div>

  {/* Contenu page */}
</div>
```

### Grids Responsive

| Classe | Breakpoints | Usage |
|--------|-------------|-------|
| `.grid-responsive` | 1 → 2 (md+) → 3 (lg+) | Grid standard 3 colonnes |
| `.grid-responsive-2` | 1 → 2 (lg+) | Grid 2 colonnes |
| `.grid-responsive-4` | 1 → 2 (sm+) → 4 (lg+) | Grid 4 colonnes (stats, cards) |

**Exemple**:
```tsx
<div className="grid-responsive-4">
  <StatsCard title="Users" value="1,234" />
  <StatsCard title="Active" value="856" />
  <StatsCard title="Pending" value="123" />
  <StatsCard title="Inactive" value="255" />
</div>
```

### Formulaires

| Classe | Description | Usage |
|--------|-------------|-------|
| `.form-container` | Conteneur formulaire | `max-w-2xl` + spacing |
| `.form-group` | Groupe de champs | `spacing-form-group` |
| `.form-field` | Champ individuel | `spacing-form-field` |

**Exemple**:
```tsx
<form className="form-container">
  <div className="form-group">
    <div className="form-field">
      <label className="label-form">Nom</label>
      <Input />
    </div>
    <div className="form-field">
      <label className="label-form">Email</label>
      <Input type="email" />
    </div>
  </div>

  <div className="form-group">
    <Button type="submit">Enregistrer</Button>
  </div>
</form>
```

### Stacks (Vertical)

| Classe | Espacement | Usage |
|--------|------------|-------|
| `.stack` | `spacing-section` | Stack vertical standard |
| `.stack-sm` | `spacing-section-sm` | Stack compact |
| `.stack-lg` | `spacing-section-lg` | Stack aéré |

---

## 💡 Exemples d'Utilisation

### Page Complète avec Design Tokens

```tsx
export default function UsersPage() {
  return (
    <div className="page-layout">
      {/* Header avec titre et actions */}
      <div className="page-header-with-actions">
        <div className="page-header">
          <h1 className="heading-page">Utilisateurs</h1>
          <p className="text-muted">
            Gérez les utilisateurs de votre organisation
          </p>
        </div>
        <Button>
          <IconPlus className="mr-2 h-4 w-4" />
          Ajouter un utilisateur
        </Button>
      </div>

      {/* Stats en grid */}
      <div className="grid-responsive-4">
        <Card className="spacing-card">
          <h3 className="heading-card">Total</h3>
          <p className="text-4xl font-bold">1,234</p>
          <p className="text-muted">Utilisateurs enregistrés</p>
        </Card>
        {/* ... autres cards */}
      </div>

      {/* Liste avec espacement */}
      <div className="list-spacing">
        <Card className="spacing-card">
          <h3 className="heading-card">John Doe</h3>
          <p className="text-muted">john@example.com</p>
        </Card>
        {/* ... autres items */}
      </div>
    </div>
  )
}
```

### Formulaire avec Design Tokens

```tsx
export function UserForm() {
  return (
    <form className="form-container">
      {/* Section informations personnelles */}
      <div className="stack">
        <h2 className="heading-section">Informations personnelles</h2>

        <div className="form-group">
          <div className="form-field">
            <label className="label-form">Prénom *</label>
            <Input />
          </div>

          <div className="form-field">
            <label className="label-form">Nom *</label>
            <Input />
          </div>
        </div>
      </div>

      {/* Section contact */}
      <div className="stack">
        <h2 className="heading-section">Contact</h2>

        <div className="form-group">
          <div className="form-field">
            <label className="label-form">Email *</label>
            <Input type="email" />
            <p className="text-muted-xs">
              Utilisé pour la connexion
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <Button variant="outline">Annuler</Button>
        <Button type="submit">Enregistrer</Button>
      </div>
    </form>
  )
}
```

### Card avec Design Tokens

```tsx
export function BackupCard({ backup }: { backup: Backup }) {
  return (
    <Card className="spacing-card">
      <div className="flex items-start justify-between">
        <h3 className="heading-card">{backup.name}</h3>
        <Badge>{backup.status}</Badge>
      </div>

      <p className="text-muted">{backup.description}</p>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-muted-xs">Date</p>
          <p className="font-medium">
            {format(backup.created_at, 'PPP', { locale: fr })}
          </p>
        </div>
        <div>
          <p className="text-muted-xs">Taille</p>
          <p className="font-medium">{formatBytes(backup.size)}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline">
          <IconDownload className="h-4 w-4 mr-2" />
          Télécharger
        </Button>
        <Button size="sm" variant="outline">
          <IconRestore className="h-4 w-4 mr-2" />
          Restaurer
        </Button>
      </div>
    </Card>
  )
}
```

---

## 🔄 Migration Guide

### Avant / Après

#### ❌ Avant (classes arbitraires)
```tsx
<div className="flex flex-col gap-5 px-4 py-6">
  <h1 className="text-2xl font-bold">Titre</h1>
  <p className="text-sm text-gray-500">Description</p>
</div>
```

#### ✅ Après (design tokens)
```tsx
<div className="page-layout">
  <div className="page-header">
    <h1 className="heading-page">Titre</h1>
    <p className="text-muted">Description</p>
  </div>
</div>
```

### Checklist Migration

- [ ] Remplacer titres par `.heading-*`
- [ ] Remplacer descriptions par `.text-muted`
- [ ] Utiliser `.spacing-*` pour espacements cohérents
- [ ] Appliquer `.grid-responsive-*` pour grids
- [ ] Utiliser `.form-container` et `.form-field` pour formulaires
- [ ] Appliquer `.page-layout` aux pages principales

---

## 📊 Avantages des Design Tokens

### Cohérence
- ✅ Espacements uniformes sur toute l'application
- ✅ Typographie cohérente (tailles, poids, couleurs)
- ✅ Layouts prédictibles et réutilisables

### Maintenabilité
- ✅ Modification centralisée (1 seul fichier CSS)
- ✅ Moins de classes CSS custom
- ✅ Évite la duplication de code

### Performance
- ✅ Classes réutilisables = CSS optimisé
- ✅ Pas de styles inline
- ✅ Meilleure compression CSS

### Developer Experience
- ✅ Autocomplete dans l'IDE
- ✅ Nommage sémantique et intuitif
- ✅ Documentation claire (ce fichier)

---

## 🎯 Prochaines Étapes

### Phase 3.2 - Accessibilité (À venir)
- Améliorer labels ARIA
- Tests navigation clavier
- Audit WCAG 2.1 AA

### Phase 3.3 - Thèmes (Futur)
- Support thèmes personnalisés
- Mode haute densité
- Mode compact

---

**Maintenu par**: Équipe Dev
**Dernière mise à jour**: 19 Octobre 2025
**Version**: 1.0
