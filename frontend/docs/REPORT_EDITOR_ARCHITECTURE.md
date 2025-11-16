# Architecture du Système de Rédaction de Rapports

## 🎯 Vue d'ensemble

Système complet de rédaction de rapports professionnels avec EditorJS, collaboration temps réel, mode offline, et fonctionnalités IA.

## 📊 Architecture Technique

### Stack Technologique

#### Frontend
- **Framework**: Next.js 16.0.0 (App Router)
- **Éditeur**: EditorJS 2.x avec plugins personnalisés
- **Collaboration**: Yjs + y-websocket (CRDT)
- **État local**: Zustand / React Context
- **Offline**: IndexedDB via Dexie.js
- **UI**: shadcn/ui + Tailwind CSS
- **Édition images**: Tui Image Editor ou Fabric.js
- **IA**: OpenAI API / Anthropic Claude

#### Backend
- **Framework**: FastAPI (Python) - déjà en place
- **Base de données**: PostgreSQL
- **WebSocket**: Socket.IO ou native WebSocket
- **Cache**: Redis pour sessions collaboratives
- **Queue**: Celery pour exports et IA
- **Storage**: S3/MinIO pour images et fichiers

### Architecture en Couches

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                       │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Editor UI  │  │ Collaboration│  │  Offline Mgr │    │
│  │  (EditorJS)  │  │   (Yjs)      │  │ (IndexedDB)  │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Templates  │  │    Export    │  │   AI Helper  │    │
│  │   Manager    │  │   Generator  │  │   (Client)   │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
├─────────────────────────────────────────────────────────────┤
│                     API LAYER (REST)                        │
├─────────────────────────────────────────────────────────────┤
│                   BACKEND (FastAPI)                         │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Reports    │  │  Templates   │  │  Custom      │    │
│  │   Service    │  │   Service    │  │  Blocks Svc  │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Collab     │  │    Export    │  │   AI         │    │
│  │   Manager    │  │   Service    │  │   Service    │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
├─────────────────────────────────────────────────────────────┤
│              DATA LAYER (PostgreSQL + Redis)                │
└─────────────────────────────────────────────────────────────┘
```

## 🗄️ Modèle de Données

### Tables Principales

#### 1. Reports (Rapports)
```sql
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    type VARCHAR(100) NOT NULL, -- 'activity', 'technical', 'meeting', etc.
    content JSONB NOT NULL, -- EditorJS blocks
    status VARCHAR(50) DEFAULT 'draft', -- draft, review, published, archived
    template_id UUID REFERENCES report_templates(id),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    published_at TIMESTAMP,
    metadata JSONB, -- custom fields, tags, etc.
    version INTEGER DEFAULT 1,
    is_deleted BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_reports_created_by ON reports(created_by);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_type ON reports(type);
CREATE INDEX idx_reports_template ON reports(template_id);
```

#### 2. Report Templates (Gabarits)
```sql
CREATE TABLE report_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(100) NOT NULL,
    structure JSONB NOT NULL, -- EditorJS template structure
    custom_blocks JSONB, -- Configuration des blocs personnalisés
    settings JSONB, -- Layout, styles, etc.
    is_default BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);
```

#### 3. Custom Blocks (Blocs Personnalisés)
```sql
CREATE TABLE custom_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(50), -- lucide icon name
    block_type VARCHAR(100) NOT NULL, -- 'data-fetch', 'calculation', 'chart', etc.
    config JSONB NOT NULL, -- Configuration du bloc (API endpoint, fields, etc.)
    render_code TEXT, -- Code React pour le rendu (si custom)
    validation_rules JSONB, -- Règles de validation
    permissions JSONB, -- Permissions d'utilisation
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);
```

#### 4. Report Versions (Historique)
```sql
CREATE TABLE report_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    content JSONB NOT NULL,
    changes JSONB, -- Diff with previous version
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    comment TEXT,
    UNIQUE(report_id, version_number)
);
```

#### 5. Report Collaborators (Collaborateurs)
```sql
CREATE TABLE report_collaborators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    role VARCHAR(50) NOT NULL, -- 'owner', 'editor', 'commenter', 'viewer'
    added_by UUID REFERENCES users(id),
    added_at TIMESTAMP DEFAULT NOW(),
    last_seen TIMESTAMP,
    UNIQUE(report_id, user_id)
);
```

#### 6. Report Comments (Commentaires)
```sql
CREATE TABLE report_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    content TEXT NOT NULL,
    block_id VARCHAR(255), -- EditorJS block ID
    parent_id UUID REFERENCES report_comments(id), -- Pour les réponses
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    is_resolved BOOLEAN DEFAULT FALSE
);
```

#### 7. Report Audit Log (Journal)
```sql
CREATE TABLE report_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL, -- 'created', 'updated', 'published', etc.
    changes JSONB, -- Détails des modifications
    metadata JSONB, -- User agent, IP, etc.
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_report ON report_audit_log(report_id);
CREATE INDEX idx_audit_user ON report_audit_log(user_id);
CREATE INDEX idx_audit_created ON report_audit_log(created_at);
```

#### 8. Report Exports (Exports)
```sql
CREATE TABLE report_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
    format VARCHAR(50) NOT NULL, -- 'pdf', 'docx', 'xlsx', etc.
    status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
    file_path TEXT,
    file_size INTEGER,
    requested_by UUID REFERENCES users(id),
    requested_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    error_message TEXT,
    settings JSONB -- Export options
);
```

#### 9. AI Suggestions (Suggestions IA)
```sql
CREATE TABLE ai_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
    block_id VARCHAR(255),
    suggestion_type VARCHAR(100) NOT NULL, -- 'completion', 'correction', 'translation', etc.
    original_text TEXT,
    suggested_text TEXT,
    confidence FLOAT, -- 0-1
    accepted BOOLEAN,
    user_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);
```

## 🔐 Gestion des Rôles et Permissions

### Rôles Système

```typescript
enum UserRole {
  SYSTEM_ADMIN = 'system_admin',        // Gestion système complète
  CONTENT_ADMIN = 'content_admin',      // Gestion templates, blocs custom
  MODERATOR = 'moderator',              // Modération contenus, templates
  EDITOR = 'editor',                     // Rédaction rapports
  READER = 'reader'                      // Lecture seule
}

interface RolePermissions {
  // Reports
  createReport: boolean
  editOwnReport: boolean
  editAnyReport: boolean
  deleteOwnReport: boolean
  deleteAnyReport: boolean
  publishReport: boolean

  // Templates
  viewTemplates: boolean
  createTemplate: boolean
  editTemplate: boolean
  deleteTemplate: boolean

  // Custom Blocks
  viewCustomBlocks: boolean
  createCustomBlock: boolean
  editCustomBlock: boolean
  deleteCustomBlock: boolean

  // Collaboration
  inviteCollaborators: boolean
  manageCollaborators: boolean

  // Exports
  exportReport: boolean

  // AI
  useAISuggestions: boolean
  trainAIModel: boolean
}

const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  [UserRole.SYSTEM_ADMIN]: { /* all true */ },
  [UserRole.CONTENT_ADMIN]: {
    createReport: true,
    editOwnReport: true,
    editAnyReport: true,
    deleteOwnReport: true,
    deleteAnyReport: false,
    publishReport: true,
    viewTemplates: true,
    createTemplate: true,
    editTemplate: true,
    deleteTemplate: true,
    viewCustomBlocks: true,
    createCustomBlock: true,
    editCustomBlock: true,
    deleteCustomBlock: true,
    inviteCollaborators: true,
    manageCollaborators: true,
    exportReport: true,
    useAISuggestions: true,
    trainAIModel: true
  },
  [UserRole.MODERATOR]: {
    createReport: true,
    editOwnReport: true,
    editAnyReport: true,
    deleteOwnReport: true,
    deleteAnyReport: false,
    publishReport: true,
    viewTemplates: true,
    createTemplate: false,
    editTemplate: true,
    deleteTemplate: false,
    viewCustomBlocks: true,
    createCustomBlock: false,
    editCustomBlock: false,
    deleteCustomBlock: false,
    inviteCollaborators: true,
    manageCollaborators: true,
    exportReport: true,
    useAISuggestions: true,
    trainAIModel: false
  },
  [UserRole.EDITOR]: {
    createReport: true,
    editOwnReport: true,
    editAnyReport: false,
    deleteOwnReport: true,
    deleteAnyReport: false,
    publishReport: false,
    viewTemplates: true,
    createTemplate: false,
    editTemplate: false,
    deleteTemplate: false,
    viewCustomBlocks: true,
    createCustomBlock: false,
    editCustomBlock: false,
    deleteCustomBlock: false,
    inviteCollaborators: true,
    manageCollaborators: false,
    exportReport: true,
    useAISuggestions: true,
    trainAIModel: false
  },
  [UserRole.READER]: {
    createReport: false,
    editOwnReport: false,
    editAnyReport: false,
    deleteOwnReport: false,
    deleteAnyReport: false,
    publishReport: false,
    viewTemplates: true,
    createTemplate: false,
    editTemplate: false,
    deleteTemplate: false,
    viewCustomBlocks: true,
    createCustomBlock: false,
    editCustomBlock: false,
    deleteCustomBlock: false,
    inviteCollaborators: false,
    manageCollaborators: false,
    exportReport: true,
    useAISuggestions: false,
    trainAIModel: false
  }
}
```

## 🔄 Flux de Collaboration Temps Réel

### Architecture Yjs

```typescript
// Structure du document collaboratif
interface CollaborativeReport {
  yDoc: Y.Doc                    // Document CRDT
  yBlocks: Y.Array<any>          // Blocs EditorJS
  yMetadata: Y.Map<any>          // Métadonnées
  yComments: Y.Array<any>        // Commentaires
  provider: WebsocketProvider     // Connexion WebSocket
  awareness: Awareness            // État des utilisateurs
}

// Synchronisation
const setupCollaboration = (reportId: string, userId: string) => {
  const doc = new Y.Doc()
  const provider = new WebsocketProvider(
    `wss://api.opsflux.io/collab/${reportId}`,
    reportId,
    doc,
    {
      params: { token: authToken, userId }
    }
  )

  // Awareness pour les curseurs
  const awareness = provider.awareness
  awareness.setLocalStateField('user', {
    id: userId,
    name: userName,
    color: userColor
  })

  return { doc, provider, awareness }
}
```

### Gestion des Conflits

```typescript
// Résolution automatique avec Yjs CRDT
// Les conflits sont résolus au niveau caractère
// Priorité : dernière modification gagne (LWW - Last Write Wins)

// Indicateurs visuels
interface SyncStatus {
  status: 'online' | 'offline' | 'syncing' | 'conflict'
  lastSync: Date
  pendingChanges: number
  activeUsers: number
}
```

## 💾 Mode Offline et Synchronisation

### Architecture Offline-First

```typescript
// IndexedDB Schema via Dexie.js
class ReportDatabase extends Dexie {
  reports!: Table<Report>
  drafts!: Table<ReportDraft>
  templates!: Table<ReportTemplate>
  syncQueue!: Table<SyncOperation>
  assets!: Table<Asset>

  constructor() {
    super('ReportsDB')
    this.version(1).stores({
      reports: 'id, createdBy, status, type, updatedAt',
      drafts: 'id, reportId, timestamp',
      templates: 'id, type, isActive',
      syncQueue: '++id, timestamp, priority, status',
      assets: 'id, reportId, type, size'
    })
  }
}

// Stratégie de synchronisation
class SyncManager {
  async syncUp() {
    // 1. Récupérer les opérations en attente
    const operations = await db.syncQueue
      .where('status').equals('pending')
      .sortBy('priority')

    // 2. Envoyer au serveur
    for (const op of operations) {
      try {
        await this.executeOperation(op)
        await db.syncQueue.update(op.id, { status: 'completed' })
      } catch (error) {
        await db.syncQueue.update(op.id, {
          status: 'failed',
          error: error.message
        })
      }
    }
  }

  async syncDown() {
    // 1. Récupérer les mises à jour du serveur
    const lastSync = await getLastSyncTimestamp()
    const updates = await api.getUpdates(lastSync)

    // 2. Appliquer localement
    for (const update of updates) {
      await this.applyUpdate(update)
    }

    await setLastSyncTimestamp(Date.now())
  }

  async resolveConflicts() {
    // Stratégie : Server wins pour les modifications publiées
    // Client wins pour les brouillons
  }
}
```

## 🎨 Blocs Personnalisés EditorJS

### Types de Blocs Custom

```typescript
// 1. Data Fetch Block - Récupération de données
interface DataFetchBlock {
  type: 'dataFetch'
  data: {
    source: 'api' | 'database' | 'file'
    endpoint: string
    query: string
    fields: string[]
    refresh: number // minutes
    cache: boolean
  }
}

// 2. Chart Block - Graphiques
interface ChartBlock {
  type: 'chart'
  data: {
    chartType: 'line' | 'bar' | 'pie' | 'area'
    dataSource: string
    config: any
  }
}

// 3. Formula Block - Calculs
interface FormulaBlock {
  type: 'formula'
  data: {
    formula: string
    variables: Record<string, any>
    format: 'number' | 'currency' | 'percentage'
  }
}

// 4. Reference Block - Références
interface ReferenceBlock {
  type: 'reference'
  data: {
    referenceType: 'report' | 'document' | 'section'
    referenceId: string
    displayAs: 'link' | 'embed' | 'preview'
  }
}

// 5. Signature Block - Signatures
interface SignatureBlock {
  type: 'signature'
  data: {
    signatory: string
    role: string
    date: string
    signature?: string // Base64 image
    required: boolean
  }
}
```

### Configuration Admin des Blocs

```typescript
interface CustomBlockConfig {
  id: string
  name: string
  displayName: string
  description: string
  icon: string
  category: 'data' | 'media' | 'layout' | 'interactive'

  // Configuration
  settings: {
    isEnabled: boolean
    allowedRoles: UserRole[]
    maxInstances?: number
  }

  // Schema de données
  schema: {
    type: 'object'
    properties: Record<string, any>
    required: string[]
  }

  // Code de rendu
  renderComponent: string // Nom du composant React

  // Validation
  validateData: (data: any) => ValidationResult
}
```

## 📤 Système d'Export

### Architecture Export

```typescript
// Service d'export (Backend)
class ExportService {
  async exportToPDF(reportId: string, options: PDFOptions) {
    // Puppeteer pour rendu HTML -> PDF
    const report = await getReport(reportId)
    const html = await this.renderHTML(report, options)
    const pdf = await puppeteer.generatePDF(html)
    return pdf
  }

  async exportToWord(reportId: string, options: WordOptions) {
    // docx library pour génération DOCX
    const report = await getReport(reportId)
    const doc = await this.generateWordDoc(report, options)
    return doc
  }

  async exportToExcel(reportId: string, options: ExcelOptions) {
    // exceljs pour génération XLSX
    const report = await getReport(reportId)
    const workbook = await this.generateExcel(report, options)
    return workbook
  }
}

// Templates d'export configurables
interface ExportTemplate {
  id: string
  name: string
  format: 'pdf' | 'docx' | 'xlsx'
  settings: {
    pageSize?: 'A4' | 'Letter'
    orientation?: 'portrait' | 'landscape'
    margins?: { top: number, right: number, bottom: number, left: number }
    header?: string
    footer?: string
    styles?: any
  }
}
```

## 🤖 Fonctionnalités IA

### Architecture IA

```typescript
class AIService {
  // 1. Auto-complétion
  async getCompletions(context: string, cursor: number): Promise<string[]> {
    const prompt = this.buildCompletionPrompt(context, cursor)
    const response = await openai.complete(prompt)
    return response.choices
  }

  // 2. Correction
  async correctText(text: string, language: string): Promise<Correction[]> {
    const response = await openai.correct(text, language)
    return response.corrections
  }

  // 3. Traduction
  async translate(text: string, from: string, to: string): Promise<string> {
    const response = await openai.translate(text, from, to)
    return response.translation
  }

  // 4. Suggestions de contenu
  async suggestContent(reportType: string, context: any): Promise<Suggestion[]> {
    const prompt = this.buildSuggestionPrompt(reportType, context)
    const response = await openai.generate(prompt)
    return response.suggestions
  }

  // 5. Analyse de données
  async analyzeData(blocks: Block[]): Promise<Analysis> {
    const data = this.extractData(blocks)
    const prompt = this.buildAnalysisPrompt(data)
    const response = await openai.analyze(prompt)
    return response.analysis
  }

  // 6. Génération de résumé
  async generateSummary(content: string, length: 'short' | 'medium' | 'long'): Promise<string> {
    const prompt = this.buildSummaryPrompt(content, length)
    const response = await openai.summarize(prompt)
    return response.summary
  }

  // 7. Détection d'anomalies
  async detectAnomalies(report: Report): Promise<Anomaly[]> {
    const analysis = await this.analyzeReport(report)
    const anomalies = this.findAnomalies(analysis)
    return anomalies
  }

  // 8. Apprentissage des habitudes
  async learnUserHabits(userId: string) {
    const userReports = await getUserReports(userId)
    const patterns = this.analyzePatterns(userReports)
    await this.saveUserProfile(userId, patterns)
  }
}
```

## 📱 Mobile-Friendly Design

### Approche Responsive

```typescript
// Breakpoints
const breakpoints = {
  mobile: '640px',
  tablet: '768px',
  laptop: '1024px',
  desktop: '1280px'
}

// Layout adaptatif
interface ResponsiveLayout {
  mobile: {
    // Éditeur plein écran
    // Menu hamburger
    // Toolbar simplifié
    // Gestes tactiles
  }
  tablet: {
    // Split view optionnel
    // Toolbar complet
    // Sidebar rétractable
  }
  desktop: {
    // Layout complet
    // Sidebars multiples
    // Raccourcis clavier
  }
}
```

## 🔔 Système de Notifications

### Architecture Notifications

```typescript
interface Notification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  category: 'report' | 'collaboration' | 'export' | 'ai' | 'system'
  title: string
  message: string
  data?: any
  userId: string
  read: boolean
  createdAt: Date
}

// Canaux de notification
enum NotificationChannel {
  IN_APP = 'in_app',        // Dans l'application
  EMAIL = 'email',          // Email
  PUSH = 'push',            // Push notification
  WEBSOCKET = 'websocket'   // Temps réel
}

// Service de notifications
class NotificationService {
  async send(notification: Notification, channels: NotificationChannel[]) {
    for (const channel of channels) {
      switch (channel) {
        case NotificationChannel.IN_APP:
          await this.sendInApp(notification)
          break
        case NotificationChannel.EMAIL:
          await this.sendEmail(notification)
          break
        case NotificationChannel.PUSH:
          await this.sendPush(notification)
          break
        case NotificationChannel.WEBSOCKET:
          await this.sendWebSocket(notification)
          break
      }
    }
  }
}
```

## 🚀 Plan de Déploiement

### Phase 1: MVP (4-6 semaines)
- ✅ CRUD rapports basique
- ✅ Éditeur EditorJS avec blocs standard
- ✅ Templates simples
- ✅ Export PDF basique
- ✅ Gestion des rôles

### Phase 2: Collaboration (3-4 semaines)
- ✅ Yjs + WebSocket
- ✅ Édition multi-utilisateur
- ✅ Commentaires
- ✅ Notifications temps réel

### Phase 3: Offline & Advanced (3-4 semaines)
- ✅ IndexedDB + Sync
- ✅ Blocs personnalisés
- ✅ Édition d'images
- ✅ Export multi-formats

### Phase 4: IA (2-3 semaines)
- ✅ Auto-complétion
- ✅ Correction/Traduction
- ✅ Analyse de données
- ✅ Apprentissage utilisateur

## 📝 Documentation Complète

- `REPORT_EDITOR_TECHNICAL_SPECS.md` - Spécifications techniques détaillées
- `REPORT_EDITOR_API.md` - Documentation API
- `REPORT_EDITOR_DEVELOPMENT_PLAN.md` - Plan de développement détaillé
- `REPORT_EDITOR_USER_GUIDE.md` - Guide utilisateur
