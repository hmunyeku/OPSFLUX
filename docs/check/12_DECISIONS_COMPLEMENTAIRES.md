# OpsFlux — 12_DECISIONS_COMPLEMENTAIRES.md
# Clarifications et décisions prises après rédaction des specs initiales

> Ce fichier complète les 10 fichiers de spec principaux.
> Claude Code le lit APRÈS les specs de base, AVANT de coder la fonctionnalité concernée.
> Chaque décision est définitive et non révisable sans consensus explicite.

---

## 1. Library Builder → draw.io : intégration native

**Décision :** Les objets créés dans le Library Builder sont exportés au **format XML draw.io de bibliothèque personnalisée** et enregistrés nativement dans draw.io. Ils apparaissent dans le panneau de bibliothèques gauche de draw.io, exactement comme les bibliothèques standard (shapes.net, AWS, etc.).

**Ce que ça implique techniquement :**

```python
# Quand un objet est publié depuis le Library Builder :
# 1. Générer le XML de bibliothèque draw.io pour le tenant
async def generate_drawio_library_xml(tenant_id: str) -> str:
    """
    Génère le fichier XML de bibliothèque custom au format draw.io.
    Format : <mxlibrary>[{"xml":"<mxCell.../>","w":100,"h":100,"aspect":"fixed","title":"Pompe centrifuge"}]</mxlibrary>
    """
    items = await get_active_library_items(tenant_id)
    library_items = []
    for item in items:
        library_items.append({
            "xml": item.svg_template,
            "w": item.default_width,
            "h": item.default_height,
            "aspect": "fixed",
            "title": item.name,
            "category": item.category,
        })
    return f"<mxlibrary>{json.dumps(library_items)}</mxlibrary>"

# 2. Exposer via un endpoint public (accessible depuis l'iframe draw.io)
# GET /api/v1/pid/library/drawio.xml?tenant_id={id}&token={signed_token}
# → draw.io charge cette URL via le paramètre customLibraries

# 3. URL passée à l'iframe draw.io au moment de l'ouverture
drawio_url = f"/drawio/index.html?embed=1&libraries=1&customLibraries={library_url}"
```

**Ce qui N'est PAS à faire :**
- Pas de panel React custom pour naviguer dans la bibliothèque
- Pas de drag depuis OpsFlux vers draw.io
- Pas de sidebar OpsFlux supplémentaire

**Mise à jour du fichier `03_MODULE_PID_PFD.md`** : Remplacer toute mention d'un "panel bibliothèque OpsFlux" par "bibliothèque native draw.io chargée via customLibraries URL".

---

## 2. Workflow : Reviewer en mode révision

**Décision :** Quand un document est "En révision", le reviewer voit :
1. Le document en **lecture seule** (contenu non éditable)
2. La possibilité d'**ajouter des commentaires inline** dans le texte (comme Google Docs)
3. Un **panneau Révision** dédié à droite avec : Approuver / Rejeter + zone de commentaire général

**Ce que ça implique :**

```tsx
// src/components/modules/report/ReviewPanel.tsx
// Panneau droit visible uniquement si :
// - workflow_instance.status === "in_progress"
// - current node assignee === current_user

const ReviewPanel = ({ documentId, instanceId }: ReviewPanelProps) => {
    const [generalComment, setGeneralComment] = useState("")
    const [rejectReason, setRejectReason] = useState("")
    const { data: inlineComments } = useInlineComments(documentId)

    return (
        <aside className="w-[280px] border-l border-border flex flex-col">
            <div className="p-3 border-b">
                <h3 className="text-sm font-semibold">Révision</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                    {inlineComments?.length || 0} commentaire(s) inline
                </p>
            </div>

            {/* Commentaires inline listés */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {inlineComments?.map(c => (
                    <InlineCommentSummary key={c.id} comment={c} />
                ))}
            </div>

            {/* Zone commentaire général */}
            <div className="p-3 border-t space-y-3">
                <Textarea
                    placeholder="Commentaire général (optionnel)..."
                    value={generalComment}
                    onChange={e => setGeneralComment(e.target.value)}
                    rows={3}
                    className="text-sm"
                />

                {/* Actions */}
                <div className="flex gap-2">
                    {/* Rejeter : ouvre une zone de motif obligatoire */}
                    <RejectWithReasonButton
                        instanceId={instanceId}
                        generalComment={generalComment}
                    />
                    <Button
                        className="flex-1"
                        onClick={() => approveDocument(instanceId, generalComment)}
                    >
                        <Check className="h-3.5 w-3.5 mr-1.5" />
                        Approuver
                    </Button>
                </div>
            </div>
        </aside>
    )
}
```

**Commentaires inline BlockNote :**

```typescript
// Extension BlockNote pour les commentaires inline (comme Google Docs)
// Sélectionner du texte → bouton 💬 apparaît → ajouter un commentaire
// Les commentaires sont surlignés en jaune dans le texte
// Stockés dans object_comments (Core) avec champ `inline_position: {from, to}`

// Visible en mode lecture ET en mode révision
// Résolution d'un commentaire : reviewer ou auteur peuvent marquer "Résolu"
// Résolu → surlignage disparaît mais commentaire reste dans l'historique
```

---

## 3. Connector Manager — Niveau Advanced

**Décision :** Le Connector Manager est au niveau **Advanced** : formulaire UI par type de source + mapping visuel des colonnes + **éditeur de transformation** (renommer, calculer, filtrer avant stockage).

### Types de sources supportés (Phase 6)

| Type | Description | Config |
|---|---|---|
| `excel_csv` | Upload fichier Excel/CSV | Upload + mapping colonnes + sheet selector |
| `api_rest` | API REST externe | URL + méthode + headers + auth + JSONPath |
| `csv_dcs` | Export CSV automate DCS | Schedule poll + séparateur + encoding |
| `database` | Base de données externe | Driver + host + port + db + requête SQL |

### Éditeur de transformation (pipeline)

```typescript
// Chaque connecteur a un pipeline de transformations optionnelles
// appliquées aux données avant stockage dans le cache/bloc dynamique

interface ConnectorTransformStep {
    id: string
    type: "rename" | "filter" | "calculate" | "format" | "aggregate"
    config: {
        // rename
        from?: string         // nom de colonne original
        to?: string           // nouveau nom

        // filter
        column?: string
        operator?: "eq" | "neq" | "gt" | "lt" | "contains" | "not_null"
        value?: any

        // calculate
        output_column?: string
        expression?: string   // ex: "{col_a} * 1.15" ou "round({pressure}, 2)"

        // format
        date_format?: string  // ex: "DD/MM/YYYY"
        number_decimals?: number

        // aggregate
        group_by?: string[]
        agg_column?: string
        agg_function?: "sum" | "avg" | "min" | "max" | "count"
    }
}

// UI : pipeline visuel drag-and-drop des steps
// Preview des données après chaque step (top 5 lignes)
```

### Structure DB connecteurs

```sql
CREATE TABLE connectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    connector_type VARCHAR(30) NOT NULL,  -- excel_csv|api_rest|csv_dcs|database
    config JSONB NOT NULL DEFAULT '{}',   -- config chiffrée AES si credentials
    transform_pipeline JSONB NOT NULL DEFAULT '[]',  -- steps de transformation
    schedule_cron VARCHAR(100),           -- null = déclenché à la demande
    last_run_at TIMESTAMPTZ,
    last_run_status VARCHAR(20),          -- ok|error|partial
    last_run_rows INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE connector_data_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connector_id UUID NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
    data JSONB NOT NULL,                  -- données après transformation
    row_count INTEGER,
    snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);
```

---

## 4. Internationalisation (i18n) — Multi-langue configurable par tenant

**Décision :** Multi-langue configurable par tenant. Langues supportées : **FR, EN, AR** (et toute autre langue ajoutée ultérieurement).

### Scope exact

| Élément | Traduit ? | Qui traduit ? |
|---|---|---|
| Interface (labels, boutons, messages) | ✅ | Fichiers i18n dans le code |
| Emails de notification | ✅ | Templates traduits par langue |
| Labels Custom Fields | ✅ | Admin définit `{"fr": "...", "en": "..."}` |
| Noms de types d'assets | ✅ | Admin définit `{"fr": "...", "en": "..."}` |
| Contenus de documents | ❌ | Dans la langue choisie à la création |
| Noms de projets / BU | ❌ | Un seul nom (langue du tenant) |
| Tags DCS | ❌ | Toujours en anglais technique |

### Configuration

```python
# Settings tenant : langue par défaut + langues activées
{
    "default_language": "fr",
    "enabled_languages": ["fr", "en", "ar"],
    "rtl_languages": ["ar"]  # langues droite-à-gauche
}

# Préférence utilisateur (override de la langue tenant)
user_preferences["language"] = "en"  # ou "fr" ou "ar"
```

### Frontend i18n

```typescript
// src/lib/i18n.ts
// Utiliser react-i18next

// Résolution de la langue :
// 1. user_preferences["language"] si défini
// 2. tenant.settings.default_language
// 3. "fr" (fallback)

// Support RTL (arabe)
// Quand langue = "ar" → ajouter dir="rtl" sur <html>
// Les composants shadcn/ui supportent RTL nativement
// Le layout Pajamas s'inverse : Sidebar passe à droite, topbar s'inverse

// Fichiers de traduction :
// src/locales/fr.json
// src/locales/en.json
// src/locales/ar.json
```

---

## 5. PID — Collaboration : lock optimiste

**Décision :** Un PID = un seul éditeur actif à la fois. Lock optimiste.

### Comportement exact

```python
# app/services/modules/pid_service.py

async def acquire_pid_lock(pid_id: str, user_id: str, tenant_id: str) -> bool:
    """
    Acquiert le lock sur un PID pour édition.
    Retourne True si succès, False si déjà verrouillé par quelqu'un d'autre.
    Lock expire automatiquement après 30 minutes d'inactivité.
    """
    lock_key = f"pid_lock:{pid_id}"
    existing = await redis.get(lock_key)

    if existing:
        lock_data = json.loads(existing)
        if lock_data["user_id"] != user_id:
            return False  # Verrouillé par quelqu'un d'autre
        # Renouveler le lock si c'est le même utilisateur
        await redis.setex(lock_key, 1800, json.dumps({
            "user_id": user_id,
            "acquired_at": datetime.utcnow().isoformat(),
        }))
        return True

    # Lock libre → l'acquérir
    await redis.setex(lock_key, 1800, json.dumps({  # 30 min
        "user_id": user_id,
        "acquired_at": datetime.utcnow().isoformat(),
    }))
    return True

async def get_pid_lock_info(pid_id: str) -> dict | None:
    """Retourne les infos du lock actuel, ou None si libre."""
    lock_key = f"pid_lock:{pid_id}"
    data = await redis.get(lock_key)
    if not data:
        return None
    lock = json.loads(data)
    user = await get_user(lock["user_id"])
    return {
        "locked_by_id": lock["user_id"],
        "locked_by_name": user.full_name,
        "locked_at": lock["acquired_at"],
        "expires_in_minutes": await redis.ttl(lock_key) // 60,
    }

async def release_pid_lock(pid_id: str, user_id: str):
    """Libère le lock (appelé à la fermeture de l'éditeur)."""
    lock_key = f"pid_lock:{pid_id}"
    existing = await redis.get(lock_key)
    if existing:
        lock = json.loads(existing)
        if lock["user_id"] == user_id:
            await redis.delete(lock_key)
```

### UI côté 2ème utilisateur

```tsx
// Bannière affichée si le PID est verrouillé par quelqu'un d'autre
const PIDLockedBanner = ({ lockInfo }: { lockInfo: PIDLockInfo }) => (
    <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border-b border-amber-200">
        <Lock className="h-4 w-4 text-amber-600 flex-shrink-0" />
        <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
                PID verrouillé par {lockInfo.locked_by_name}
            </p>
            <p className="text-xs text-amber-600">
                En cours d'édition — lecture seule.
                Lock expire dans {lockInfo.expires_in_minutes} min.
            </p>
        </div>
        {/* Forcer la libération du lock (tenant_admin uniquement) */}
        {hasPermission("pid.admin") && (
            <InlineConfirmButton
                onConfirm={() => forceReleaseLock(pid.id)}
                confirmLabel="Forcer ?"
                variant="outline"
                className="text-amber-700 border-amber-300"
            >
                Reprendre le contrôle
            </InlineConfirmButton>
        )}
    </div>
)
```

**Heartbeat** : le navigateur envoie `PATCH /api/v1/pid/{id}/lock/heartbeat` toutes les 5 minutes pour renouveler le lock. Si le navigateur est fermé sans libérer → lock expire après 30 min.

---

## 6. Onboarding — Wizard guidé nouveau tenant

**Décision :** Un wizard multi-étapes guidé à la première connexion d'un tenant_admin.

### Étapes du wizard

```tsx
// /onboarding — Accessible uniquement si tenant.onboarding_completed = false

const ONBOARDING_STEPS = [
    {
        id: "welcome",
        title: "Bienvenue dans OpsFlux",
        description: "Configuration initiale de votre espace Perenco",
        optional: false,
    },
    {
        id: "business_units",
        title: "Créer vos Business Units",
        description: "Définissez la structure de votre organisation (ex: BIPAGA, EBOME, SIÈGE)",
        optional: false,
    },
    {
        id: "invite_users",
        title: "Inviter vos utilisateurs",
        description: "Ajoutez les membres de votre équipe et assignez leurs rôles",
        optional: false,
    },
    {
        id: "activate_modules",
        title: "Activer les modules",
        description: "Choisissez les modules dont votre équipe a besoin",
        optional: false,
    },
    {
        id: "configure_smtp",
        title: "Configurer les emails",
        description: "Paramétrez l'envoi des notifications par email",
        optional: true,  // "Configurer plus tard"
    },
    {
        id: "choose_home_page",
        title: "Choisir la page d'accueil",
        description: "Sélectionnez le dashboard par défaut pour vos équipes",
        optional: true,
    },
    {
        id: "done",
        title: "Votre espace est prêt !",
        description: "OpsFlux est configuré et prêt à être utilisé",
        optional: false,
    },
]
```

### Stockage de la progression

```sql
-- Dans tenants.settings JSONB
{
    "onboarding_completed": false,
    "onboarding_current_step": "business_units",
    "onboarding_steps_done": ["welcome"],
    "onboarding_started_at": "2025-03-14T10:00:00Z"
}
```

```tsx
// Si onboarding_completed = false ET l'admin visite n'importe quelle page
// → Redirect vers /onboarding (sauf /settings)
// Une fois le wizard terminé → onboarding_completed = true, redirect /
```

---

## 7. Pages d'erreur — Toast + reste en place

**Décision :** Pas de page d'erreur dédiée. Le système reste sur la page courante et affiche un toast.

### Comportement par code d'erreur

| Code | Toast type | Message | Durée |
|---|---|---|---|
| 401 | — | Redirect silencieux vers /login | — |
| 403 | Warning | "Vous n'avez pas accès à cette ressource." | 6s |
| 404 | Info | "Ressource introuvable." | 4s |
| 409 | Warning | "Conflit : {detail du backend}" | 6s |
| 422 | — | Géré inline par le formulaire | — |
| 429 | Warning | "Trop de requêtes. Patientez un instant." | 8s |
| 500+ | Error | "Erreur serveur. L'équipe est notifiée." | 8s |

```typescript
// Géré dans l'intercepteur Axios (src/lib/api.ts)
// Pour les 404 de navigation (URL tapée directement) :
// React Router → <Route path="*"> → composant NotFoundPanel
// Ce composant s'affiche dans le StaticPanel (pas de page dédiée)

const NotFoundPanel = () => (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <span className="text-6xl mb-4">404</span>
        <h2 className="text-lg font-semibold mb-2">Page introuvable</h2>
        <p className="text-sm text-muted-foreground mb-6">
            Cette page n'existe pas ou a été déplacée.
        </p>
        <Button onClick={() => navigate(-1)} variant="outline">
            <ArrowLeft className="h-3.5 w-3.5 mr-2" />
            Retour
        </Button>
    </div>
)
```

---

## 8. Email Templates — Modifiables via Settings

**Décision :** Les templates par défaut sont dans le code (Jinja2). Le tenant_admin peut **surcharger le body** via Settings > Emails. Les overrides sont stockés en DB.

### Structure

```sql
CREATE TABLE email_template_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    template_key VARCHAR(100) NOT NULL,
    -- ex: "workflow.validation_required"
    subject_override JSONB,
    -- {"fr": "...", "en": "...", "ar": "..."} — null = garder le défaut
    html_body_override JSONB,
    -- {"fr": "<html>...</html>", "en": "...", "ar": "..."}
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, template_key)
);
```

### UI Settings > Emails

```
Settings > Notifications > Templates d'emails

Liste des templates disponibles (par module activé) :
  ├── Workflow - Validation requise
  ├── Workflow - Document approuvé
  ├── Workflow - Document rejeté
  ├── Workflow - Relance deadline
  ├── Distribution - Document publié
  └── Système - Invitation utilisateur

Clic sur un template → éditeur :
  ┌─────────────────────────────────────────────────────┐
  │  Template : Validation requise                      │
  │  Module : Report Editor                             │
  │                                                     │
  │  [FR] [EN] [AR]  ← onglets langue                  │
  │                                                     │
  │  Objet :                                            │
  │  [Validation requise : {{document_title}}      ]   │
  │                                                     │
  │  Corps (HTML) :                                     │
  │  [éditeur HTML basique ou Monaco editor]            │
  │                                                     │
  │  Variables disponibles :                            │
  │  {{document_title}} {{document_number}}             │
  │  {{workflow_step}} {{deadline}} {{document_url}}    │
  │                                                     │
  │  [Aperçu] [Réinitialiser au défaut] [Enregistrer]  │
  └─────────────────────────────────────────────────────┘
```

---

## 9. Éditeurs sur mobile — Comportement exact

**Décision :**
- **Éditeur de documents (BlockNote)** : lecture seule sur mobile. Édition uniquement desktop (≥ 1024px).
- **Éditeur PID (draw.io)** : bloqué sur mobile ET tablette. Desktop uniquement (≥ 1024px).

### Implémentation

```tsx
// src/hooks/useEditorCapabilities.ts

export const useEditorCapabilities = () => {
    const screenWidth = useWindowWidth()

    return {
        canEditDocument: screenWidth >= 1024,   // tablet+ uniquement
        canEditPID: screenWidth >= 1024,         // desktop uniquement
        canViewDocument: true,                   // toujours possible
        canViewPID: true,                        // toujours possible
    }
}

// Dans l'éditeur BlockNote :
const DocumentEditorPage = ({ documentId }: { documentId: string }) => {
    const { canEditDocument } = useEditorCapabilities()

    return (
        <>
            {!canEditDocument && (
                <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200">
                    <Monitor className="h-3.5 w-3.5 text-amber-600" />
                    <span className="text-xs text-amber-700">
                        Mode lecture seule — L'édition est disponible sur desktop uniquement.
                    </span>
                </div>
            )}
            <BlockNoteEditor
                isReadOnly={!canEditDocument}
                ...
            />
        </>
    )
}

// Dans l'éditeur PID :
const PIDEditorPage = ({ pidId }: { pidId: string }) => {
    const { canEditPID } = useEditorCapabilities()

    if (!canEditPID) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <Monitor className="h-12 w-12 text-muted-foreground mb-4" />
                <h2 className="text-base font-semibold mb-2">Éditeur PID</h2>
                <p className="text-sm text-muted-foreground max-w-xs">
                    L'éditeur PID/PFD est disponible uniquement sur desktop.
                    Consultez ce PID en lecture depuis un ordinateur.
                </p>
                <Button variant="outline" className="mt-4" onClick={() => navigate("/pid")}>
                    Retour à la liste
                </Button>
            </div>
        )
    }

    return <PIDEditor pidId={pidId} />
}
```

---

## 10. Numérotation — Règles complètes

**Décision :** Entièrement configurable par le tenant_admin dans Settings > Modules > Rédacteur > Nomenclature. Le système recommande des patterns alphanumériques pour réduire la longueur.

### Règles de séquence

```python
# Comportement si SEQ:4 atteint 9999 :
# → La séquence déborde naturellement (10000, 10001...)
# → Un warning est envoyé à tenant_admin quand SEQ > 9000 :
#   "La séquence {doc_type} approche de la limite du pattern {SEQ:4}. 
#    Envisagez de modifier le pattern en {SEQ:5} ou d'utiliser un séparateur alphanumérique."

# Patterns recommandés (affichés dans le configurateur Settings) :
RECOMMENDED_PATTERNS = [
    {
        "pattern": "{PROJ}-{TYPE}-{SEQ:4}",
        "example": "BIPAGA-RPT-0042",
        "capacity": "9,999 documents",
        "recommended_for": "Projets de taille moyenne",
    },
    {
        "pattern": "{PROJ}-{TYPE}-{YEAR}-{SEQ:3}",
        "example": "BIPAGA-RPT-2025-042",
        "capacity": "999 documents / an",
        "recommended_for": "Documents annuels",
    },
    {
        "pattern": "{PROJ}-{TYPE}-{ALPHA_SEQ:2}",
        "example": "BIPAGA-RPT-A4",
        "capacity": "1,296 documents (base 36)",
        "recommended_for": "Codes courts",
    },
    {
        "pattern": "{TENANT}-{DISC}-{TYPE}-{SEQ:5}",
        "example": "PCM-PROC-RPT-00042",
        "capacity": "99,999 documents",
        "recommended_for": "Grands volumes",
    },
]

# Token spécial {ALPHA_SEQ:N} :
# Séquence alphanumériques base-36 (0-9, A-Z)
# N=2 → "00" à "ZZ" = 1296 valeurs
# N=3 → "000" à "ZZZ" = 46656 valeurs
```

### Numéro archivé

```python
# Un numéro archivé est définitivement consommé SAUF si :
# 1. L'admin supprime physiquement le document (DELETE, pas soft-delete)
# 2. La séquence n'a pas avancé depuis (aucun autre doc créé après)

# Dans ce cas : remettre la séquence à next-1 (seulement si c'était le dernier)
# Sinon : le numéro reste "trou" dans la séquence (acceptable)
```

---

## 11. Distribution — Module (Phase 5, post-validation)

**Décision :** Email PDF + notification in-app automatiquement quand un document passe en status "Publié".

### Fonctionnement

```python
# Déclenché par EventBus event "document.published"
# Handler dans report_editor/event_handlers.py

async def on_document_published(event: OpsFluxEvent):
    """
    Déclenche la distribution automatique d'un document publié.
    """
    doc = await get_document(event.object_id, event.tenant_id)
    distribution_lists = await get_distribution_lists(doc.doc_type_id, event.tenant_id)

    for dist_list in distribution_lists:
        if not dist_list.is_active:
            continue

        # Générer le PDF
        pdf_bytes = await export_service.generate_pdf(
            document_id=str(doc.id),
            revision_id=str(doc.current_revision_id),
            tenant_id=event.tenant_id,
        )

        # Envoyer à chaque destinataire de la liste
        for recipient in dist_list.recipients:
            # Email avec PDF en pièce jointe
            await email_service.queue(
                to=[recipient.email],
                template_key="distribution.document_published",
                context={
                    "document_number": doc.number,
                    "document_title": doc.title,
                    "published_by": event.actor_id,
                    "distribution_list_name": dist_list.name,
                },
                attachments=[{
                    "filename": f"{doc.number}.pdf",
                    "content": pdf_bytes,
                    "mime_type": "application/pdf",
                }],
                tenant_id=event.tenant_id,
            )

            # Notification in-app
            await notify(
                user_id=recipient.user_id,  # si c'est un user OpsFlux
                template_key="distribution.document_published",
                context={
                    "document_id": str(doc.id),
                    "document_number": doc.number,
                    "document_title": doc.title,
                },
                tenant_id=event.tenant_id,
            )
```

### Tables DB Distribution

```sql
CREATE TABLE distribution_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    doc_type_id UUID REFERENCES doc_types(id),
    -- null = s'applique à tous les types
    trigger_status VARCHAR(30) NOT NULL DEFAULT 'published',
    -- published | approved
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id)
);

CREATE TABLE distribution_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES distribution_lists(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),    -- user OpsFlux (notif in-app)
    email VARCHAR(255) NOT NULL,          -- peut être externe (pas de user_id)
    name VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE distribution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID REFERENCES distribution_lists(id),
    document_id UUID NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL,          -- sent | failed | pending
    error_message TEXT,
    sent_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Phase :** Intégré dans la Phase 5 (Workflow), déclenché par l'event `document.published`.

---

## 12. Tenants — Création par super admin uniquement

**Décision :** Super admin uniquement via `/admin` dédié. Pas de self-signup.

### Interface /admin

```
/admin (accessible uniquement si role = super_admin)
├── /admin/tenants          → liste des tenants, créer/désactiver
├── /admin/tenants/{id}     → fiche tenant, modules activés, users, quotas
├── /admin/users            → tous les users de tous les tenants
├── /admin/health           → infrastructure health dashboard (voir §13)
├── /admin/ai-usage         → consommation IA globale par tenant
└── /admin/audit            → audit log global cross-tenant
```

```python
# Création d'un tenant (super_admin uniquement)
@router.post("/admin/tenants", dependencies=[requires_permission("super_admin")])
async def create_tenant(body: TenantCreate, request: Request):
    tenant = Tenant(
        name=body.name,
        slug=body.slug,
        settings={
            "default_language": body.default_language or "fr",
            "enabled_languages": ["fr"],
            "modules_enabled": body.modules or ["report_editor"],
            "onboarding_completed": False,
        }
    )
    db.add(tenant)

    # Créer le super_admin local du tenant (tenant_admin)
    await assign_tenant_admin(body.admin_email, tenant.id)

    # Envoyer l'email d'invitation au tenant_admin
    await email_service.queue(
        to=[body.admin_email],
        template_key="system.tenant_created",
        context={"tenant_name": tenant.name, "onboarding_url": f"{FRONTEND_URL}/onboarding"},
        tenant_id=str(tenant.id),
    )

    await db.commit()
    return tenant
```

**Q14 — Super admin :** Toi (H.B.) uniquement + interface `/admin` dédiée différente de l'interface tenant normale.

---

## 13. Audit Log + Infrastructure Health Dashboard

**Décision :**
- Audit log : accessible tenant_admin (son tenant) + super_admin (tous)
- Rétention : **illimitée**
- Exportable CSV
- **Dashboard infrastructure health pour super_admin** — critique : OpsFlux ne doit jamais planter sans prévenir

### Infrastructure Health Dashboard (/admin/health)

```
┌─────────────────────────────────────────────────────────────────┐
│  🟢 Infrastructure OpsFlux — Santé globale                      │
│  Mis à jour : il y a 2 min                     [↻ Rafraîchir]  │
├──────────────────────────┬──────────────────────────────────────┤
│  BASE DE DONNÉES         │  STOCKAGE FICHIERS                   │
│  PostgreSQL 16           │  Backend : MinIO                     │
│  Taille totale : 12.4 GB │  Utilisé : 84.2 GB / 200 GB  🟡     │
│  Connexions : 18 / 100   │  ████████████░░░░░ 42%               │
│  Documents chunks : 2.1M │                                      │
│  Logs audit : 8.4M rows  │  REDIS                               │
│                          │  Mémoire : 1.2 GB / 4 GB             │
│  CROISSANCE              │  Queue ARQ : 3 jobs en attente        │
│  +245 MB / semaine       │  Keys actives : 12,847               │
│  Projection 200 GB :     │                                      │
│  dans ~18 mois    ✅     │  HOCUSPOCUS (Collab)                 │
│                          │  Connexions WS actives : 7           │
├──────────────────────────┴──────────────────────────────────────┤
│  TENANTS (3 actifs)                                             │
│  ┌──────────────┬──────────┬──────────┬──────────┬───────────┐ │
│  │ Tenant       │ DB Size  │ Files    │ Users    │ Docs      │ │
│  ├──────────────┼──────────┼──────────┼──────────┼───────────┤ │
│  │ PCM          │ 8.2 GB   │ 62 GB    │ 47       │ 12,847    │ │
│  │ PCG          │ 3.1 GB   │ 18 GB    │ 23       │ 4,201     │ │
│  │ TEST         │ 1.1 GB   │ 4 GB     │ 5        │ 892       │ │
│  └──────────────┴──────────┴──────────┴──────────┴───────────┘ │
│                                                                 │
│  ALERTES ACTIVES (1)                                            │
│  🟡 Stockage fichiers à 42% — projection saturation dans 8 mois│
└─────────────────────────────────────────────────────────────────┘
```

### Seuils d'alerte et notifications automatiques

```python
# app/workers/health_monitor.py
# Job ARQ quotidien à 8h00

ALERT_THRESHOLDS = {
    "storage_percent": {
        "warning": 60,    # Email avertissement
        "critical": 80,   # Email urgent + notification in-app super_admin
        "blocking": 95,   # Email URGENT + bloquer les nouveaux uploads
    },
    "db_size_gb": {
        "warning": 50,
        "critical": 80,
    },
    "db_connections_percent": {
        "warning": 70,
        "critical": 90,
    },
    "redis_memory_percent": {
        "warning": 70,
        "critical": 85,
    },
    "arq_queue_depth": {
        "warning": 50,
        "critical": 200,  # Jobs bloqués
    },
}

async def check_infrastructure_health():
    metrics = await collect_all_metrics()
    alerts = []

    for metric_key, thresholds in ALERT_THRESHOLDS.items():
        value = metrics.get(metric_key, 0)
        if value >= thresholds.get("blocking", 999):
            level = "blocking"
        elif value >= thresholds.get("critical", 999):
            level = "critical"
        elif value >= thresholds.get("warning", 999):
            level = "warning"
        else:
            continue

        alerts.append({"metric": metric_key, "value": value, "level": level})

        # Notifier le super_admin
        if level in ("critical", "blocking"):
            await email_service.queue(
                to=SUPER_ADMIN_EMAILS,
                template_key="system.infrastructure_alert",
                context={
                    "metric": metric_key,
                    "value": value,
                    "level": level,
                    "threshold": thresholds[level],
                    "health_url": f"{ADMIN_URL}/admin/health",
                },
                tenant_id="system",
                priority=1,  # Haute priorité
            )

    # Stocker les métriques pour le dashboard
    await store_health_snapshot(metrics, alerts)
    return alerts
```

### Audit log — Table et API

```python
# Déjà dans object_activity (Core) pour les actions sur les objets
# Table dédiée pour les actions système (login, switch tenant, etc.)

# API audit log
@router.get("/admin/audit", dependencies=[requires_permission("super_admin")])
async def get_global_audit_log(
    tenant_id: Optional[str] = None,  # filtrer par tenant
    actor_id: Optional[str] = None,
    action: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    page: int = 1,
    page_size: int = 100,
    export_csv: bool = False,
):
    ...

@router.get("/audit", dependencies=[requires_permission("tenant_admin")])
async def get_tenant_audit_log(request: Request, ...):
    # Identique mais filtré sur request.state.tenant_id automatiquement
    ...
```

---

## RÉSUMÉ — Décisions complémentaires (référence rapide)

| # | Sujet | Décision |
|---|---|---|
| 1 | Library Builder + draw.io | Bibliothèque XML native draw.io. Pas de panel custom. |
| 2 | Reviewer en révision | Lecture seule + commentaires inline + panneau Révision dédié |
| 3 | Connector Manager | Advanced : formulaire UI + mapping + pipeline transformation |
| 4 | i18n | Multi-langue configurable par tenant (FR, EN, AR...) |
| 5 | PID collaboration | Lock optimiste Redis 30min. "Verrouillé par X" pour le 2ème |
| 6 | Onboarding | Wizard guidé (BU → Users → Modules → SMTP → Home page) |
| 7 | Pages d'erreur | Toast + reste sur page courante. NotFoundPanel pour 404 URL |
| 8 | Email templates | Défaut code Jinja2, surcharge par tenant_admin via Settings |
| 9 | Éditeurs mobile | Docs = lecture seule mobile. PID = bloqué mobile + tablette |
| 10 | Numérotation débordement | Déborde naturellement. Warning email à 9000. Alphanumériques recommandés |
| 10b | Numéro archivé | Consommé définitivement sauf suppression physique par admin |
| 11 | Distribution | Email PDF + notif in-app au status "Publié". Activé Phase 5 |
| 12 | Création tenants | Super admin uniquement via /admin dédié |
| 13 | Audit + Health | Rétention illimitée. Dashboard infra santé obligatoire. Alertes email seuils |
| 14 | Super admin | H.B. uniquement. Interface /admin séparée de l'interface tenant |

---

## 15. Infrastructure & Domaines

### Domaines

```bash
# .env — configurables par environnement, jamais hardcodés

APP_URL=https://app.opsflux.io          # Application principale (users internes)
WEB_URL=https://web.opsflux.io          # Portail public (ShareLinks, formulaires, partenaires)
WWW_URL=https://www.opsflux.io          # Landing page marketing (site vitrine)
API_URL=https://api.opsflux.io          # API backend (ou même domaine que APP via /api)

# Dev local
APP_URL=http://localhost:5173
WEB_URL=http://localhost:5174
```

### SSL par environnement

| Env | Certificat |
|---|---|
| Dev local | HTTP (pas de SSL) |
| Staging | Let's Encrypt auto via Traefik |
| Production | Wildcard `*.opsflux.io` fourni par Perenco IT — monté dans Traefik via volume |

```yaml
# docker-compose.prod.yml — Traefik avec wildcard cert
traefik:
  volumes:
    - /etc/opsflux/certs/wildcard.crt:/certs/wildcard.crt:ro
    - /etc/opsflux/certs/wildcard.key:/certs/wildcard.key:ro
  command:
    - "--entrypoints.websecure.address=:443"
    - "--providers.file.filename=/etc/traefik/tls.yml"

# /etc/traefik/tls.yml
tls:
  certificates:
    - certFile: /certs/wildcard.crt
      keyFile: /certs/wildcard.key
  stores:
    default:
      defaultCertificate:
        certFile: /certs/wildcard.crt
        keyFile: /certs/wildcard.key
```

### Sécurité — masquage de la stack

```python
# main.py — ne jamais révéler la stack technique

# 1. Header Server personnalisé (Uvicorn révèle "uvicorn" par défaut)
@app.middleware("http")
async def hide_server_header(request, call_next):
    response = await call_next(request)
    response.headers["Server"] = "OpsFlux"
    response.headers.pop("X-Powered-By", None)
    return response

# 2. Swagger/ReDoc désactivés en staging et prod
app = FastAPI(
    docs_url="/docs" if settings.ENVIRONMENT == "development" else None,
    redoc_url=None,  # jamais
    openapi_url="/openapi.json" if settings.ENVIRONMENT == "development" else None,
)
```

```nginx
# www.opsflux.io — robots.txt
User-agent: *
Disallow: /api/
Disallow: /admin/

# web.opsflux.io — pas indexé (portail externe privé)
User-agent: *
Disallow: /
```

---

## 16. web.opsflux.io — Portail public externe

### Contenu

Le portail `web.opsflux.io` est une **application React distincte** (ou des routes séparées dans le même frontend), sans sidebar, sans topbar OpsFlux. Elle sert uniquement les accès externes.

```
web.opsflux.io/share/{token}      → ShareLink Core (lecture seule ou fill_form)
web.opsflux.io/form/{token}       → Formulaire externe (fill_form uniquement)
web.opsflux.io/partner/{token}    → Portail lecture partenaire (Tiers sans compte OpsFlux)
```

### Layout web.opsflux.io (minimaliste)

```
┌─────────────────────────────────────────────────────┐
│  [Logo OpsFlux]                    Propulsé par ... │  ← topbar minimaliste, sans navigation
├─────────────────────────────────────────────────────┤
│                                                     │
│  Contenu partagé (document, formulaire, rapport...) │
│                                                     │
├─────────────────────────────────────────────────────┤
│  © OpsFlux — Accès sécurisé — Expire le {date}     │  ← footer avec info du lien
└─────────────────────────────────────────────────────┘
```

```tsx
// frontend/src/apps/web-portal/
// Application React distincte (Vite entry point séparé)
// Pas de Zustand store de l'app principale
// Pas de sidebar, pas de topbar complète
// Routing : /share/:token | /form/:token | /partner/:token

const WebPortalRouter = () => (
  <Routes>
    <Route path="/share/:token" element={<SharedDocumentView />} />
    <Route path="/form/:token" element={<ExternalFormView />} />
    <Route path="/partner/:token" element={<PartnerPortalView />} />
    <Route path="*" element={<WebPortalNotFound />} />
  </Routes>
)
```

### Partenaire externe (Tiers sans compte)

```python
# Un tiers externe reçoit un lien web.opsflux.io/partner/{token}
# Ce lien lui donne accès en lecture à un périmètre défini :
# - Ses propres documents (ex: PO, contrats qui le concernent)
# - Les rapports publiés qui lui sont partagés
# Pas de compte OpsFlux requis — authentification par token signé uniquement

# Le token est valide 30 jours, renouvelable par le tenant_admin
# Accès loggé dans share_link_accesses (audit trail)
```

---

## 17. www.opsflux.io — Site vitrine

### Principe

Site statique ou Next.js léger. **Totalement déconnecté de l'application OpsFlux.**
- Ne mentionne pas Perenco
- Donne l'impression d'un SaaS acquérable par n'importe quelle entreprise
- Pas de lien vers `app.opsflux.io` visible publiquement
- Formulaire de contact → email configuré dans `WWW_CONTACT_EMAIL` dans les settings

```
www.opsflux.io/              → Home (fonctionnalités, bénéfices, screenshots génériques)
www.opsflux.io/features      → Détail des modules (sans mentionner Perenco)
www.opsflux.io/contact       → Formulaire de contact
www.opsflux.io/privacy       → Politique de confidentialité
```

### Formulaire de contact

```bash
# .env
WWW_CONTACT_EMAIL=contact@opsflux.io  # configurable — email qui reçoit les demandes
WWW_CONTACT_CC=                        # optionnel : CC
```

```python
# Endpoint API dédié, pas d'auth requise
# POST /api/public/contact
# Rate limited : 3 soumissions / heure / IP

@router.post("/public/contact", include_in_schema=False)
async def submit_contact_form(body: ContactFormBody, request: Request):
    # Vérifier honeypot (anti-bot)
    if body.website:  # champ caché — si rempli = bot
        return {"status": "ok"}  # fausse confirmation

    await email_service.send_direct(
        to=[settings.WWW_CONTACT_EMAIL],
        subject=f"[OpsFlux] Demande de contact : {body.subject}",
        body=f"Nom : {body.name}\nEmail : {body.email}\n\nMessage :\n{body.message}",
    )
    return {"status": "ok"}
```

---

## 18. Architecture Docker — Conteneurs

### Composition finale

```yaml
# docker-compose.yml (base commune tous envs)

services:

  # ── Application ────────────────────────────────────────
  backend:
    image: registry/opsflux-backend:${TAG}
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000
    env_file: .env
    depends_on: [postgres, redis]

  frontend:
    image: registry/opsflux-frontend:${TAG}
    # Sert le build Vite (nginx static)

  web-portal:
    image: registry/opsflux-web-portal:${TAG}
    # App web.opsflux.io (nginx static)

  # ── Workers ────────────────────────────────────────────
  arq-worker:
    image: registry/opsflux-backend:${TAG}  # même image que backend
    command: python -m arq app.workers.settings.WorkerSettings
    env_file: .env
    depends_on: [postgres, redis]
    # Conteneur séparé — peut scaler indépendamment

  # ── Collaboration ──────────────────────────────────────
  hocuspocus:
    image: registry/opsflux-hocuspocus:${TAG}
    # Node.js server Hocuspocus
    env_file: .env
    environment:
      HOCUSPOCUS_SECRET: ${HOCUSPOCUS_SECRET}
      JWT_SECRET: ${SECRET_KEY}     # même clé que FastAPI pour valider les JWT
      PORT: 1234
    depends_on: [redis]             # état partagé via Redis pour multi-instances futures

  # ── Infrastructure ────────────────────────────────────
  postgres:
    image: pgvector/pgvector:pg16
    volumes: [postgres_data:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine
    volumes: [redis_data:/data]

  traefik:
    image: traefik:v3
    ports: ["80:80", "443:443"]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - traefik_data:/data

  # ── Monitoring ─────────────────────────────────────────
  prometheus:
    image: prom/prometheus:latest
    profiles: ["monitoring"]        # activé seulement en staging/prod

  grafana:
    image: grafana/grafana:latest
    profiles: ["monitoring"]
    depends_on: [prometheus]
```

---

## 19. SSO — Azure Active Directory / Entra ID

### Configuration

```python
# app/core/config.py (additions)

# Azure AD / Entra ID
AZURE_TENANT_ID: str = ""           # ID du tenant Azure Perenco
AZURE_CLIENT_ID: str = ""           # App registration client ID
AZURE_CLIENT_SECRET: str = ""       # App registration secret
AZURE_AUTHORITY: str = ""           # https://login.microsoftonline.com/{tenant_id}

# Calculé automatiquement
@property
def OAUTH2_ISSUER_URL(self) -> str:
    return f"https://login.microsoftonline.com/{self.AZURE_TENANT_ID}/v2.0"

@property
def OAUTH2_JWKS_URI(self) -> str:
    return f"https://login.microsoftonline.com/{self.AZURE_TENANT_ID}/discovery/v2.0/keys"
```

### Validation JWT Azure AD

```python
# app/core/security.py

import httpx
from jose import jwt, JWTError
from functools import lru_cache

@lru_cache(maxsize=1)
def get_azure_jwks():
    """Cache des clés publiques Azure AD (renouvelé toutes les 24h)."""
    response = httpx.get(settings.OAUTH2_JWKS_URI)
    return response.json()

async def validate_azure_token(token: str) -> dict:
    """
    Valide un JWT émis par Azure AD / Entra ID.
    Extrait : sub (user ID Azure), email, name, tenant info.
    """
    try:
        # Récupérer les clés publiques Azure
        jwks = get_azure_jwks()

        # Décoder et valider
        payload = jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            audience=settings.AZURE_CLIENT_ID,
            issuer=settings.OAUTH2_ISSUER_URL,
            options={"verify_at_hash": False},
        )

        return {
            "sub": payload["sub"],              # ID unique Azure
            "email": payload.get("preferred_username") or payload.get("email"),
            "name": payload.get("name"),
            "azure_oid": payload.get("oid"),    # Object ID Azure (stable)
            "tenant_id": payload.get("tid"),    # Azure tenant ID
        }
    except JWTError as e:
        raise HTTPException(401, f"Token invalide : {e}")

# Callback OAuth2 PKCE
@router.get("/auth/callback")
async def oauth_callback(code: str, state: str, request: Request):
    """
    Échange le code Azure contre un token, puis crée/met à jour le user en DB.
    """
    # 1. Échanger le code contre les tokens Azure
    token_response = await exchange_code_for_tokens(code, state)
    azure_payload = await validate_azure_token(token_response["id_token"])

    # 2. Upsert user en DB (premier login = création)
    user = await upsert_user_from_azure(azure_payload)

    # 3. Générer notre propre JWT OpsFlux
    opsflux_token = create_opsflux_jwt(user)

    # 4. Redirect frontend avec le token
    return RedirectResponse(
        url=f"{settings.APP_URL}/auth/success?token={opsflux_token}"
    )
```

---

## 20. draw.io — CDN dev / Self-hosted prod

### Configuration

```bash
# .env
DRAWIO_URL=https://embed.diagrams.net          # dev et staging
# DRAWIO_URL=https://drawio.app.opsflux.io    # prod (self-hosted)
```

```tsx
// frontend : utilise toujours VITE_DRAWIO_URL
const drawioBaseUrl = import.meta.env.VITE_DRAWIO_URL || "https://embed.diagrams.net"
const drawioUrl = `${drawioBaseUrl}?embed=1&spin=1&proto=json&...`
```

### Self-hosted draw.io en prod

```yaml
# Dans docker-compose.prod.yml
drawio:
  image: jgraph/drawio:latest    # image officielle Docker draw.io
  restart: unless-stopped
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.drawio.rule=Host(`drawio.app.opsflux.io`)"
    - "traefik.http.services.drawio.loadbalancer.server.port=8080"
```

---

## 21. Hocuspocus — Auth avec JWT FastAPI

### Principe

Le client BlockNote envoie le **même JWT Bearer** que pour l'API FastAPI. Hocuspocus valide ce token lui-même (Node.js) en utilisant la même `SECRET_KEY` que le backend Python.

```typescript
// hocuspocus-server/src/index.ts

import { Server } from "@hocuspocus/server"
import { Logger } from "@hocuspocus/extension-logger"
import { Redis } from "@hocuspocus/extension-redis"
import jwt from "jsonwebtoken"

const server = Server.configure({
    port: parseInt(process.env.PORT || "1234"),

    extensions: [
        new Logger(),
        new Redis({
            host: process.env.REDIS_HOST || "redis",
            port: 6379,
        }),
    ],

    async onAuthenticate({ token, documentName }) {
        // Valider le JWT OpsFlux (signé avec SECRET_KEY Python)
        try {
            const payload = jwt.verify(token, process.env.JWT_SECRET!) as any

            // documentName = "doc-{document_id}"
            // Vérifier que l'user a accès à ce document via l'API FastAPI
            const response = await fetch(
                `${process.env.API_URL}/api/v1/documents/${documentName.replace("doc-", "")}/check-access`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            )

            if (!response.ok) {
                throw new Error("Accès refusé au document")
            }

            return {
                user: {
                    id: payload.sub,
                    name: payload.name,
                    color: getUserColor(payload.sub),
                }
            }
        } catch (e) {
            throw new Error(`Auth failed: ${e}`)
        }
    },

    async onLoadDocument({ documentName, document }) {
        // Charger l'état Yjs depuis la DB via l'API
        const docId = documentName.replace("doc-", "")
        const response = await fetch(
            `${process.env.API_URL}/api/v1/documents/${docId}/yjs-state`,
            { headers: { Authorization: `Bearer ${process.env.SERVICE_TOKEN}` } }
        )
        if (response.ok) {
            const { yjs_state } = await response.json()
            if (yjs_state) {
                const buffer = Buffer.from(yjs_state, "base64")
                Y.applyUpdate(document, buffer)
            }
        }
        return document
    },

    async onStoreDocument({ documentName, document }) {
        // Persister l'état Yjs en DB
        const docId = documentName.replace("doc-", "")
        const state = Y.encodeStateAsUpdate(document)
        await fetch(
            `${process.env.API_URL}/api/v1/documents/${docId}/yjs-state`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${process.env.SERVICE_TOKEN}`,
                },
                body: JSON.stringify({ yjs_state: Buffer.from(state).toString("base64") }),
            }
        )
    },
})

server.listen()
```

```bash
# Variables Hocuspocus dans .env
HOCUSPOCUS_PORT=1234
JWT_SECRET=${SECRET_KEY}            # même clé que FastAPI
API_URL=http://backend:8000         # appel interne Docker network
SERVICE_TOKEN=                      # token de service signé avec SECRET_KEY pour appels backend→backend
```

---

## 22. ModuleRegistry — Idempotent à chaque démarrage

### Comportement

```python
# app/core/module_registry.py

async def register(self, manifest: ModuleManifest):
    """
    Appelé à chaque démarrage de l'app.
    Toutes les opérations sont des UPSERTS — idempotent.
    Un module ne peut pas casser au redémarrage.
    """
    slug = manifest["slug"]

    # Upsert permissions
    for perm in manifest.get("permissions", []):
        await db.execute(
            insert(Permission)
            .values(key=perm, module_slug=slug, label=perm)
            .on_conflict_do_nothing(index_elements=["key"])  # UPSERT PostgreSQL
        )

    # Upsert settings definitions
    for i, setting in enumerate(manifest.get("settings", [])):
        await db.execute(
            insert(ModuleSettingsDefinition)
            .values(
                module_slug=slug,
                setting_key=setting["key"],
                label=setting.get("label", {"fr": setting["key"]}),
                field_type=setting.get("type", "text"),
                default_value=setting.get("default"),
                scope=setting.get("scope", "tenant"),
                display_order=i,
            )
            .on_conflict_do_update(
                index_elements=["module_slug", "setting_key"],
                set_={
                    "label": setting.get("label"),
                    "field_type": setting.get("type"),
                    "default_value": setting.get("default"),
                }
            )
        )

    # Upsert notification templates
    for tmpl in manifest.get("notification_templates", []):
        await db.execute(
            insert(NotificationTemplate)
            .values(template_key=tmpl["key"], module_slug=slug, **tmpl)
            .on_conflict_do_update(
                index_elements=["template_key"],
                set_={"title": tmpl["title"], "body": tmpl.get("body")},
            )
        )

    await db.commit()
    # Si le module a des event handlers → subscribe à l'EventBus
    await self._register_event_hooks(slug, manifest)
    print(f"✅ Module synced: {slug}")
```

---

## 23. Status 'Publié' — Manuel après approbation

### Flux exact

```
Workflow terminé → document status = "Approuvé"
  → Notification à l'auteur : "Votre document est approuvé. Vous pouvez le publier."
  → Bouton "Publier" visible dans la toolbar UNIQUEMENT pour l'auteur (ou tenant_admin)
  → Clic → InlineConfirmButton "Publier ?"
  → Confirmation → status = "Publié"
  → Event "document.published" → Distribution automatique déclenchée
```

```
STATUTS DOCUMENT (flux complet) :

draft → [soumettre] → in_review → [approuver] → approved → [publier] → published
         (auteur)     (validateurs)  (final node)  (auteur)             (event distribution)
                          ↓
                      [rejeter]
                          ↓
                        draft (avec motif)
```

```python
# Transition approved → published : action séparée du workflow
@router.post("/documents/{doc_id}/publish",
             dependencies=[requires_permission("document.edit")])
async def publish_document(doc_id: str, request: Request):
    doc = await get_document(doc_id, request.state.tenant_id)

    if doc.status != "approved":
        raise HTTPException(400, "Le document doit être approuvé avant d'être publié")

    # Seul l'auteur ou un tenant_admin peut publier
    if doc.created_by != UUID(request.state.user_id) and request.state.user_role != "tenant_admin":
        raise HTTPException(403, "Seul l'auteur peut publier ce document")

    doc.status = "published"
    await db.commit()

    # Déclencher la distribution via EventBus
    await publish(OpsFluxEvent(
        event_type="document.published",
        tenant_id=request.state.tenant_id,
        actor_id=request.state.user_id,
        object_type="document",
        object_id=doc_id,
    ))
    return doc
```

---

## 24. Health Dashboard — Grafana + page custom /admin/health

### Grafana (métriques techniques)
- Dashboards Prometheus : latence API, queue ARQ, connexions DB, usage Redis, tokens IA
- Accessible sur `monitoring.app.opsflux.io` (sous-domaine dédié, accès restreint super_admin)
- Configuré via provisioning (fichiers JSON dans le repo, pas de config manuelle)

### Page custom /admin/health (alertes métier)

```
/admin/health — visible uniquement super_admin
  ↳ Données issues d'un endpoint FastAPI qui agrège :
      GET /api/v1/admin/health → snapshot des métriques + alertes actives

  Sections :
  1. STATUT GLOBAL (feu vert/orange/rouge)
  2. PAR TENANT : taille DB, fichiers, users actifs, docs/semaine
  3. STACK SIZES : postgres total, redis, pgvector chunks, audit rows
  4. ALERTES ACTIVES : seuils dépassés avec niveau warning/critical/blocking
  5. PROJECTIONS : "à ce rythme, stockage saturé dans N mois"
  6. LIEN → Grafana (pour les métriques techniques détaillées)
```

```python
# Endpoint health agrégé
@router.get("/admin/health", dependencies=[requires_permission("super_admin")])
async def get_health_snapshot(db: AsyncSession = Depends(get_db)):
    return {
        "collected_at": datetime.utcnow().isoformat(),
        "global_status": await compute_global_status(),
        "tenants": await get_per_tenant_metrics(db),
        "stack": await get_stack_sizes(db),
        "alerts": await get_active_alerts(),
        "projections": await compute_storage_projections(db),
        "grafana_url": settings.GRAFANA_URL,
    }
```

---

## RÉSUMÉ — Décisions techniques finales (référence rapide)

| # | Sujet | Décision |
|---|---|---|
| 15 | Domaines | app/web/www.opsflux.io — configurable .env — wildcard cert en prod |
| 16 | web.opsflux.io | ShareLinks + formulaires externes + portail partenaires |
| 17 | www.opsflux.io | Landing marketing discret (pas Perenco) + contact form configurable |
| 18 | Docker architecture | 6 conteneurs : backend, frontend, web-portal, arq-worker, hocuspocus, infra |
| 19 | SSO | Azure AD / Entra ID — PKCE flow — JWT OpsFlux généré après validation |
| 20 | draw.io | CDN dev/staging, self-hosted Docker en prod |
| 21 | Hocuspocus auth | Même JWT que FastAPI — validé avec SECRET_KEY partagée |
| 22 | ModuleRegistry | Upsert idempotent à chaque démarrage — jamais de crash au restart |
| 23 | Status Publié | Manuel : bouton "Publier" après approbation — déclenche distribution |
| 24 | Health Dashboard | Grafana (technique) + /admin/health React (alertes métier) |
| Q7 | Quick Entry Document | Stepper 3 étapes dans modal (projet → type → titre) |

---

## 25. Décisions finales de clôture

### 25.1 Rôles OpsFlux au premier login Azure AD

**Décision :** Tous les nouveaux users arrivent sans rôle. Le tenant_admin les assigne manuellement.

```python
# app/core/security.py

async def upsert_user_from_azure(azure_payload: dict, tenant_id: str, db: AsyncSession) -> User:
    """
    Crée ou met à jour un user depuis le payload Azure AD.
    Aucun rôle assigné automatiquement — le tenant_admin le fait manuellement.
    """
    existing = await db.execute(
        select(User).where(User.oauth_sub == azure_payload["sub"])
    ).scalar_one_or_none()

    if existing:
        # Mettre à jour le nom/email si changé dans Azure
        existing.full_name = azure_payload.get("name", existing.full_name)
        existing.email = azure_payload.get("email", existing.email)
        existing.last_login_at = datetime.utcnow()
        await db.commit()
        return existing

    # Premier login → créer le user SANS rôle
    user = User(
        email=azure_payload["email"],
        full_name=azure_payload.get("name", azure_payload["email"]),
        oauth_sub=azure_payload["sub"],
        is_active=True,
        last_login_at=datetime.utcnow(),
    )
    db.add(user)
    await db.flush()

    # Créer l'entrée user_tenants SANS rôle → pending_role
    db.add(UserTenant(
        user_id=user.id,
        tenant_id=UUID(tenant_id),
        role="pending",           # ← pas de rôle réel
        is_active=False,          # ← bloqué jusqu'à assignation par l'admin
    ))
    await db.commit()

    # Notifier le tenant_admin qu'un nouvel utilisateur attend un rôle
    admins = await get_tenant_admins(tenant_id, db)
    for admin in admins:
        await notify(
            user_id=str(admin.id),
            template_key="system.new_user_pending_role",
            context={
                "user_name": user.full_name,
                "user_email": user.email,
                "assign_url": f"{settings.APP_URL}/settings/users",
            },
            tenant_id=tenant_id,
            priority="high",
        )

    return user
```

**Ce que voit le nouvel utilisateur avant assignation du rôle :**

```tsx
// Page affichée si user.role === "pending" ou is_active === false
const PendingRolePage = () => (
    <div className="flex flex-col items-center justify-center h-screen p-8 text-center">
        <Clock className="h-12 w-12 text-muted-foreground mb-4" />
        <h1 className="text-xl font-semibold mb-2">Accès en attente</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
            Votre compte a été créé. Un administrateur doit vous assigner un rôle
            avant que vous puissiez accéder à OpsFlux.
        </p>
        <p className="text-xs text-muted-foreground mt-4">
            Contactez votre administrateur si vous attendez depuis plus de 24h.
        </p>
    </div>
)
```

---

### 25.2 Backup PostgreSQL — pg_dump automatique

**Décision :** pg_dump quotidien via job ARQ, rétention 30 jours, stocké sur le VPS dans `/opt/opsflux/backups/`.

```python
# app/workers/backup_worker.py

import subprocess
import gzip
from pathlib import Path

BACKUP_DIR = Path("/opt/opsflux/backups/postgres")
RETENTION_DAYS = 30

async def run_postgres_backup(ctx: dict):
    """
    Job ARQ — exécuté tous les jours à 02h30.
    Dump compressé de la DB complète → /opt/opsflux/backups/postgres/YYYY-MM-DD.sql.gz
    Supprime les dumps de plus de 30 jours.
    Envoie une alerte si le dump échoue.
    """
    today = datetime.utcnow().strftime("%Y-%m-%d")
    backup_path = BACKUP_DIR / f"{today}.sql.gz"
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    try:
        # pg_dump via subprocess (disponible dans le conteneur backend)
        result = subprocess.run(
            ["pg_dump", "--no-owner", "--no-acl", settings.DATABASE_URL_SYNC],
            capture_output=True,
            timeout=600,  # 10 minutes max
        )

        if result.returncode != 0:
            raise RuntimeError(f"pg_dump failed: {result.stderr.decode()}")

        # Compresser le dump
        with gzip.open(backup_path, "wb") as f:
            f.write(result.stdout)

        size_mb = backup_path.stat().st_size / (1024 * 1024)

        # Loguer le succès dans les métriques health
        await store_backup_record(
            date=today,
            status="success",
            size_mb=round(size_mb, 2),
            path=str(backup_path),
        )

    except Exception as e:
        # Alerter immédiatement le super_admin
        await email_service.queue(
            to=settings.SUPER_ADMIN_EMAILS,
            template_key="system.backup_failed",
            context={"date": today, "error": str(e)},
            tenant_id="system",
            priority=1,
        )
        raise

    finally:
        # Nettoyage des anciens dumps (> 30 jours)
        cutoff = datetime.utcnow() - timedelta(days=RETENTION_DAYS)
        for old_backup in BACKUP_DIR.glob("*.sql.gz"):
            file_date_str = old_backup.stem.replace(".sql", "")
            try:
                file_date = datetime.strptime(file_date_str, "%Y-%m-%d")
                if file_date < cutoff:
                    old_backup.unlink()
            except ValueError:
                pass  # fichier au format inattendu, ignorer
```

```python
# Dans WorkerSettings — ajouter le cron backup
cron_jobs = [
    ...
    cron(run_postgres_backup, hour=2, minute=30),   # 02h30 chaque nuit
]
```

**Procédure de restore (documentée dans le README) :**

```bash
# 1. Identifier le backup à restaurer
ls /opt/opsflux/backups/postgres/

# 2. Décompresser
gunzip -c /opt/opsflux/backups/postgres/2025-03-14.sql.gz > /tmp/restore.sql

# 3. Restaurer (ATTENTION : écrase la DB courante)
docker exec -i opsflux_postgres psql \
  -U $POSTGRES_USER \
  -d $POSTGRES_DB \
  < /tmp/restore.sql

# 4. Redémarrer le backend
docker compose restart backend arq-worker

# 5. Vérifier l'intégrité
docker exec opsflux_postgres psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "SELECT COUNT(*) FROM tenants;"
```

**Volume Docker pour la persistance des backups :**

```yaml
# docker-compose.prod.yml
services:
  backend:
    volumes:
      - backup_data:/opt/opsflux/backups   # partagé avec arq-worker

  arq-worker:
    volumes:
      - backup_data:/opt/opsflux/backups

volumes:
  backup_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /opt/opsflux/backups    # dossier physique sur le VPS host
```

**Dashboard health — section backup :**

```
/admin/health → section "Sauvegardes"
  Dernier backup : 2025-03-14 02:31 ✅ — 245 MB
  Backups disponibles : 30 / 30
  Plus ancien : 2025-02-13
  Espace utilisé : 6.2 GB / ~200 GB disponibles
  [Déclencher un backup maintenant]   ← bouton pour backup manuel
```

---

### 25.3 www.opsflux.io — Même VPS, conteneur nginx statique

```yaml
# docker-compose.prod.yml
  www:
    image: registry/opsflux-www:${TAG}   # build Next.js static export ou HTML/CSS pur
    restart: unless-stopped
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.www.rule=Host(`www.opsflux.io`)"
      - "traefik.http.services.www.loadbalancer.server.port=80"
```

```
www.opsflux.io — Site vitrine (Next.js static export)
  → Pas de connexion à la DB ou à l'API OpsFlux
  → Contact form → POST /api/public/contact (endpoint FastAPI dédié, rate-limited)
  → robots.txt : allow tout (référencement souhaité)
  → Ne mentionne jamais "Perenco" ni "Oil & Gas"
  → Screenshots de l'interface avec données anonymisées
  → Tarification : "Sur demande" (pas de pricing public)
```

---

### 25.4 Service Token Hocuspocus — Généré au démarrage FastAPI

**Décision Option B :** FastAPI génère un JWT de service au démarrage, Dokploy l'injecte dans les variables d'env du conteneur Hocuspocus.

```python
# app/core/security.py

def generate_service_token(service_name: str, expires_days: int = 365) -> str:
    """
    Génère un JWT de service pour les appels backend-to-backend.
    Signé avec SECRET_KEY — aucun user_id, juste un sub "service:{name}".
    """
    payload = {
        "sub": f"service:{service_name}",
        "type": "service",
        "exp": datetime.utcnow() + timedelta(days=expires_days),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")
```

```python
# app/main.py — startup

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Générer et exposer le service token pour Hocuspocus
    hocuspocus_token = generate_service_token("hocuspocus")

    # L'écrire dans un fichier partagé via volume Docker
    # (Hocuspocus le lit au démarrage)
    token_file = Path("/run/secrets/hocuspocus_service_token")
    token_file.parent.mkdir(parents=True, exist_ok=True)
    token_file.write_text(hocuspocus_token)

    # OU : l'exposer via un endpoint interne (réseau Docker uniquement)
    app.state.hocuspocus_service_token = hocuspocus_token

    yield
```

```typescript
// hocuspocus-server/src/index.ts
// Lire le token depuis le fichier partagé ou l'env var injecté par Dokploy

const SERVICE_TOKEN = process.env.HOCUSPOCUS_SERVICE_TOKEN
    || fs.readFileSync("/run/secrets/hocuspocus_service_token", "utf8").trim()

// Utilisé dans onLoadDocument et onStoreDocument
const response = await fetch(`${API_URL}/api/v1/documents/${docId}/yjs-state`, {
    headers: { Authorization: `Bearer ${SERVICE_TOKEN}` },
})
```

```python
# FastAPI — valider les appels de service
async def validate_service_token(token: str, service_name: str):
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    if payload.get("sub") != f"service:{service_name}":
        raise HTTPException(403, "Token de service invalide")
    if payload.get("type") != "service":
        raise HTTPException(403, "Type de token invalide")
```

---

### 25.5 draw.io — Propriétés via panneau natif draw.io (Option B)

**Décision :** L'utilisateur édite les propriétés d'un objet directement dans le **panneau propriétés natif de draw.io** (Edit Style / Edit Data). OpsFlux parse le XML au save et lit les attributs des cellules.

**Ce que ça implique pour le Library Builder :**

```python
# Quand un objet est créé dans le Library Builder,
# son SVG template inclut les attributs OpsFlux comme propriétés draw.io natives :

# Format draw.io pour les propriétés custom :
# <mxCell id="..." value="V-101" style="..." vertex="1">
#   <UserData opsflux_type="vessel" opsflux_tag="V-101"
#             opsflux_design_pressure="" opsflux_design_temperature=""
#             opsflux_service="" opsflux_fluid="" />
# </mxCell>

# Ces champs apparaissent automatiquement dans le panneau "Edit Data" de draw.io
# (clic droit → Edit Data sur une cellule)
# L'ingénieur remplit les valeurs directement dans draw.io
```

**Parsing au save :**

```python
# app/services/modules/pid_service.py

def _parse_cell_properties(cell: ET.Element) -> dict:
    """
    Lit les propriétés OpsFlux depuis le XML draw.io.

    draw.io stocke les custom properties dans deux endroits selon la version :
    1. Attributs directs sur mxCell : opsflux_tag="V-101"
    2. Sous-élément <UserData> : <UserData opsflux_tag="V-101" />
    3. Dans value si c'est du XML : value='<object opsflux_tag="V-101" label="V-101"/>'
    """
    props = {}

    # Cas 1 : attributs directs sur mxCell
    for attr, val in cell.attrib.items():
        if attr.startswith("opsflux_"):
            props[attr.replace("opsflux_", "")] = val

    # Cas 2 : sous-élément UserData
    user_data = cell.find("UserData")
    if user_data is not None:
        for attr, val in user_data.attrib.items():
            if attr.startswith("opsflux_"):
                props[attr.replace("opsflux_", "")] = val

    # Cas 3 : value contient du XML (format draw.io "object")
    value = cell.get("value", "")
    if value.startswith("<"):
        try:
            val_elem = ET.fromstring(value)
            for attr, val in val_elem.attrib.items():
                if attr.startswith("opsflux_"):
                    props[attr.replace("opsflux_", "")] = val
            # Le label visible = attribut "label"
            if "label" in val_elem.attrib:
                props["label"] = val_elem.get("label")
        except ET.ParseError:
            pass

    return props
```

**Template SVG dans process_lib_items — exemple pompe :**

```xml
<!-- SVG template stocké dans process_lib_items.svg_template -->
<!-- Format "object" draw.io : les propriétés sont dans value -->
<object
  label="%opsflux_tag%"
  opsflux_type="pump"
  opsflux_tag=""
  opsflux_description=""
  opsflux_design_pressure_barg=""
  opsflux_design_temperature_c=""
  opsflux_service=""
  opsflux_fluid=""
  opsflux_capacity_value=""
  opsflux_capacity_unit="m³/h"
  id="1">
  <mxCell
    style="shape=mxgraph.pid.pumps.centrifugalPump;fillColor=#dae8fc;strokeColor=#6c8ebf;"
    vertex="1">
    <mxGeometry width="60" height="60" as="geometry"/>
  </mxCell>
</object>
```

```
Résultat dans draw.io :
  - L'ingénieur pose la pompe → label affiche le tag (vide au départ)
  - Clic droit → "Edit Data" → formulaire avec tous les champs opsflux_*
  - Il remplit tag="P-101A", design_pressure_barg="65"
  - Sauvegarde → XML envoyé à OpsFlux → parse → DB mis à jour
  - Le label du symbole = valeur de opsflux_tag (auto-mis à jour via %opsflux_tag%)
```

---

## RÉSUMÉ FINAL — Toutes les décisions (référence rapide complète)

| # | Sujet | Décision |
|---|---|---|
| 1 | Library Builder → draw.io | Bibliothèque XML native via `customLibraries` URL |
| 2 | Reviewer en révision | Lecture seule + commentaires inline + panneau Révision |
| 3 | Connector Manager | Advanced : formulaire UI + mapping + pipeline transformation |
| 4 | i18n | FR + EN (AR hors scope pour l'instant) |
| 5 | PID collaboration | Lock optimiste Redis 30min |
| 6 | Onboarding | Wizard guidé 7 étapes |
| 7 | Pages d'erreur | Toast + reste en place |
| 8 | Email templates | Surcharge markdown via Settings |
| 9 | Éditeurs mobile | Docs lecture seule, PID bloqué |
| 10 | Numérotation | Débordement naturel + alphanumériques |
| 11 | Distribution | Email PDF + notif in-app au statut Publié |
| 12 | Création tenants | Super admin uniquement via /admin |
| 13 | Audit + Health | Rétention illimitée + dashboard infra |
| 14 | Super admin | H.B. uniquement + /admin séparé |
| 15 | Domaines | app/web/www.opsflux.io — .env configurable |
| 16 | web.opsflux.io | ShareLinks + forms + portail partenaires |
| 17 | www.opsflux.io | Landing marketing discret + contact form |
| 18 | Docker | 8 conteneurs dont arq-worker et hocuspocus séparés |
| 19 | SSO | Azure AD Entra ID — PKCE — JWT OpsFlux ensuite |
| 20 | draw.io | CDN dev, self-hosted Docker prod |
| 21 | Hocuspocus auth | Même JWT que FastAPI |
| 22 | ModuleRegistry | Upsert idempotent à chaque démarrage |
| 23 | Status Publié | Manuel après approbation → déclenche distribution |
| 24 | Health Dashboard | Grafana technique + /admin/health métier |
| 25.1 | Rôles Azure AD | Assignés manuellement par tenant_admin. User = "pending" en attente |
| 25.2 | Backup | pg_dump 02h30 quotidien, rétention 30j, volume VPS |
| 25.3 | www hébergement | Même VPS Dokploy, conteneur nginx statique |
| 25.4 | Service Token | Généré au démarrage FastAPI, partagé via volume Docker |
| 25.5 | draw.io props | Panneau natif draw.io "Edit Data" — OpsFlux parse au save |

---

## 26. Décisions techniques — Dernier lot

### 26.1 pgvector — dimension 768 (nomic-embed-text)

```python
# app/core/config.py
OLLAMA_EMBEDDING_MODEL: str = "nomic-embed-text"  # produit des vecteurs 768 dimensions
EMBEDDING_DIMENSIONS: int = 768

# Migration Alembic — correction de vector(1536) → vector(768)
# La colonne document_chunks.embedding doit être :
embedding = Column(Vector(768))  # PAS vector(1536)

# Index ivfflat adapté à 768 dimensions
# CREATE INDEX ON document_chunks USING ivfflat (embedding vector_cosine_ops)
# WITH (lists = 100);
# Règle : lists ≈ sqrt(nb_rows) — 100 est correct jusqu'à ~1M chunks

# Vérification au démarrage : tester que le modèle Ollama est disponible
async def verify_embedding_model():
    test_embedding = await ai_service.embed("test", tenant_id="system")
    actual_dim = len(test_embedding)
    if actual_dim != settings.EMBEDDING_DIMENSIONS:
        raise RuntimeError(
            f"Dimension embedding incorrecte : attendu {settings.EMBEDDING_DIMENSIONS}, "
            f"reçu {actual_dim}. Vérifiez OLLAMA_EMBEDDING_MODEL dans .env"
        )
```

**Ajout dans `.env.example` :**
```bash
OLLAMA_EMBEDDING_MODEL=nomic-embed-text   # dimension: 768
EMBEDDING_DIMENSIONS=768
```

---

### 26.2 SUPER_ADMIN_EMAILS — Dans .env

```bash
# .env.example
SUPER_ADMIN_EMAILS=admin@opsflux.io        # séparé par virgules si plusieurs
# ex: SUPER_ADMIN_EMAILS=hb@opsflux.io,it@perenco.com
```

```python
# app/core/config.py
SUPER_ADMIN_EMAILS: list[str] = ["admin@opsflux.io"]

@field_validator("SUPER_ADMIN_EMAILS", mode="before")
@classmethod
def parse_emails(cls, v):
    if isinstance(v, str):
        return [e.strip() for e in v.split(",") if e.strip()]
    return v
```

---

### 26.3 classify_intent() — RAG first, LLM décide

**Décision :** Pas de classification préalable. Toujours RAG d'abord. Le LLM reçoit le corpus de sources + les tools MCP disponibles, et décide lui-même dans sa réponse si une action est nécessaire.

```python
# app/api/routes/core/ai.py

async def handle_chat(message: str, history: list, tenant_id: str, user_id: str) -> dict:
    """
    Pipeline unique : RAG → LLM → réponse avec actions optionnelles.
    Pas de classify_intent(). Le LLM décide lui-même.
    """

    # 1. Embedding de la question
    q_embedding = await ai_service.embed(message, tenant_id)

    # 2. Recherche RAG (top 5 chunks pertinents)
    rag_context = await rag_service.search_chunks(q_embedding, tenant_id, top_k=5)

    # 3. Construire le contexte : sources + tools disponibles
    sources_text = "\n\n".join([
        f"[{c.metadata.get('document_number', '?')}] {c.content}"
        for c in rag_context
    ])

    tools_text = """
Tools disponibles si une action est nécessaire :
- search_documents(query, project_code, status) : chercher des documents
- get_pending_validations() : voir les validations en attente
- generate_from_template(template_id, project_id, context_data) : créer un document
- submit_document_for_validation(document_id) : soumettre un document
- search_assets(query, asset_type) : chercher des assets
- suggest_tag_name(tag_type, area, equipment_id) : suggérer un nom de tag
- rag_query(question) : poser une question sur le corpus
"""

    # 4. Appel LLM unique avec tout le contexte
    system_prompt = f"""Tu es l'assistant OpsFlux de Perenco.
Réponds en français. Sois concis et factuel.

Sources documentaires disponibles :
{sources_text if sources_text else "Aucune source trouvée."}

{tools_text}

Si la réponse est dans les sources → cite le numéro de document entre [].
Si une action est demandée → inclus dans ta réponse un bloc JSON :
```action
{{"tool": "nom_du_tool", "params": {{...}}, "confirmation_required": true/false, "confirmation_message": "..."}}
```
Si aucune action n'est nécessaire → réponds normalement en texte.
"""

    raw_response = await ai_service.complete(
        prompt=message,
        system=system_prompt,
        context=[{"role": m["role"], "content": m["content"]} for m in history[-6:]],
        tenant_id=tenant_id,
        temperature=0.3,
        max_tokens=1000,
    )

    # 5. Parser la réponse — texte pur ou texte + action JSON
    return parse_chat_response(raw_response, rag_context)


def parse_chat_response(raw: str, rag_chunks: list) -> dict:
    """
    Extrait le texte et l'action optionnelle de la réponse LLM.
    """
    import re

    # Chercher un bloc ```action ... ```
    action_match = re.search(r'```action\s*\n(.*?)\n```', raw, re.DOTALL)

    if action_match:
        action_json_str = action_match.group(1).strip()
        answer_text = raw[:action_match.start()].strip()
        try:
            action = json.loads(action_json_str)
        except json.JSONDecodeError:
            action = None
    else:
        answer_text = raw.strip()
        action = None

    return {
        "answer": answer_text,
        "sources": [
            {
                "document_number": c.metadata.get("document_number"),
                "document_id": str(c.object_id),
                "excerpt": c.content[:150] + "...",
            }
            for c in rag_chunks
        ],
        "action": action,  # None ou {"tool": "...", "params": {...}, "confirmation_required": bool, ...}
    }
```

---

### 26.4 Soft delete — Filtre manuel systématique

**Décision :** Chaque requête ajoute `.where(Model.is_active == True)` manuellement.

**Convention de code :**

```python
# RÈGLE : tout SELECT sur une table avec is_active DOIT filtrer explicitement
# Ne jamais oublier le filtre — c'est une check de la checklist PR

# ✅ Correct
documents = await db.execute(
    select(Document).where(
        Document.tenant_id == tenant_id,
        Document.is_active == True,    # ← OBLIGATOIRE
        Document.bu_id == bu_id,
    )
).scalars().all()

# ❌ Incorrect — affichera les documents archivés
documents = await db.execute(
    select(Document).where(Document.tenant_id == tenant_id)
).scalars().all()
```

**Tables concernées (toujours filtrer `is_active == True`) :**
```
users, user_tenants, business_units, tenants
documents, doc_types, templates, projects
assets, asset_types, tiers, contacts
pid_documents, equipment, process_lines, dcs_tags
dashboards, connectors, distribution_lists
process_lib_items, tag_naming_rules
```

**Tables où `is_active` n'existe pas (pas de filtre nécessaire) :**
```
workflow_transitions, object_activity, audit_log  ← immuables, jamais soft-deleted
revisions, pid_revisions                           ← immuables
object_comments, notifications                     ← gérés par is_resolved/is_read
```

**Helper pour ne pas oublier :**
```python
# app/core/database.py — helper de base pour les queries courantes
def active(model):
    """Filtre standard is_active pour éviter les oublis."""
    return model.is_active == True

# Usage
select(Document).where(Document.tenant_id == tenant_id, active(Document))
```

**Checklist PR — ajout :**
```
□ Toute nouvelle query sur une table avec is_active filtre active(Model)
```

---

### 26.5 Hocuspocus down — Toast + édition solo

**Décision :** Toast d'avertissement + édition possible en mode solo, collaboration désactivée temporairement.

```typescript
// src/components/modules/report/editor/useBlockNoteEditor.ts

export const useReportEditor = (documentId: string, ...) => {
    const [collabStatus, setCollabStatus] = useState<
        "connecting" | "connected" | "disconnected" | "solo"
    >("connecting")

    const provider = useMemo(() => new HocuspocusProvider({
        url: `${WS_URL}/hocuspocus`,
        name: `doc-${documentId}`,
        token: getAuthToken(),

        onConnect: () => {
            setCollabStatus("connected")
            // Dismisser le toast "hors ligne" s'il était affiché
            dismissToast("collab-offline")
        },

        onDisconnect: () => {
            setCollabStatus("disconnected")
        },

        onAuthenticationFailed: () => {
            setCollabStatus("solo")
            toast.warning({
                id: "collab-offline",
                title: "Collaboration indisponible.",
                description: "Vous éditez en mode solo. Vos modifications sont sauvegardées localement.",
                duration: Infinity,   // reste affiché jusqu'à reconnexion
            })
        },

        // Tentatives de reconnexion automatique
        maxAttempts: 10,
        delay: 3000,        // 3s entre chaque tentative
        factor: 1.5,        // backoff exponentiel
        timeout: 30000,
    }), [documentId])

    // Réessayer en arrière-plan
    useEffect(() => {
        const interval = setInterval(() => {
            if (collabStatus === "disconnected" && navigator.onLine) {
                provider.connect()
            }
        }, 15_000)  // retry toutes les 15s

        return () => clearInterval(interval)
    }, [collabStatus, provider])

    const editor = useCreateBlockNote({
        collaboration: collabStatus !== "solo" ? {
            provider,
            fragment: new Y.XmlFragment(),
            user: { name: currentUser.full_name, color: getUserColor(currentUser.id) },
        } : undefined,  // ← pas de collab si solo
    })

    return { editor, collabStatus }
}
```

**Indicateur dans la toolbar de l'éditeur :**

```tsx
// Indicateur de statut collab dans la DocumentToolbar
const CollabStatusIndicator = ({ status }: { status: CollabStatus }) => {
    if (status === "connected") return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            En ligne
        </div>
    )
    if (status === "disconnected" || status === "solo") return (
        <div className="flex items-center gap-1.5 text-xs text-amber-600">
            <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            Mode solo — reconnexion en cours...
        </div>
    )
    return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Connexion...
        </div>
    )
}
```

---

### 26.6 Dark mode — Dès P0

**Décision :** Toggle light/dark/system dans Settings > Compte > Préférences, dès P0.

```typescript
// user_preferences["theme"] = "light" | "dark" | "system"
// Appliqué immédiatement, persisté en DB
```

```tsx
// src/App.tsx — appliquer le thème au root HTML

const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
    const [theme] = useUserPreference<"light" | "dark" | "system">("theme", "system")

    useEffect(() => {
        const root = document.documentElement
        root.classList.remove("light", "dark")

        if (theme === "system") {
            const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches
            root.classList.add(systemDark ? "dark" : "light")
        } else {
            root.classList.add(theme)
        }
    }, [theme])

    // Écouter les changements système si mode "system"
    useEffect(() => {
        if (theme !== "system") return
        const mq = window.matchMedia("(prefers-color-scheme: dark)")
        const handler = (e: MediaQueryListEvent) => {
            document.documentElement.classList.remove("light", "dark")
            document.documentElement.classList.add(e.matches ? "dark" : "light")
        }
        mq.addEventListener("change", handler)
        return () => mq.removeEventListener("change", handler)
    }, [theme])

    return <>{children}</>
}

// Dans App.tsx
export default function App() {
    return (
        <QueryClientProvider client={queryClient}>
            <ThemeProvider>
                <RouterProvider router={router} />
                <Toaster />
            </ThemeProvider>
        </QueryClientProvider>
    )
}
```

```tsx
// src/pages/core/settings/PreferencesSettings.tsx — section thème

<SettingsSection title="Apparence">
    <div className="flex items-center justify-between">
        <div>
            <Label className="text-sm font-medium">Thème</Label>
            <p className="text-xs text-muted-foreground">
                Light, Dark, ou automatique selon votre système
            </p>
        </div>
        <div className="flex items-center border border-border rounded-md overflow-hidden h-8">
            {[
                { value: "light", icon: Sun,     label: "Clair"  },
                { value: "system", icon: Monitor, label: "Auto"   },
                { value: "dark",  icon: Moon,    label: "Sombre" },
            ].map(({ value, icon: Icon, label }) => (
                <button
                    key={value}
                    onClick={() => setTheme(value as any)}
                    className={cn(
                        "flex items-center gap-1.5 px-3 h-full text-xs transition-colors",
                        theme === value
                            ? "bg-secondary text-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground"
                    )}
                    aria-pressed={theme === value}
                >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                </button>
            ))}
        </div>
    </div>
</SettingsSection>
```

**Note P0 :** Tester que les tokens CSS dark mode (définis dans `09_DESIGN_SYSTEM.md §9`) s'appliquent correctement sur tous les composants shadcn/ui. shadcn gère le dark mode nativement via la classe `.dark` sur `<html>`.

---

## RÉSUMÉ FINAL COMPLET

| # | Sujet | Décision |
|---|---|---|
| ... | *(décisions 1-25 ci-dessus)* | ... |
| 26.1 | pgvector | `vector(768)` — `nomic-embed-text` via Ollama |
| 26.2 | SUPER_ADMIN_EMAILS | Dans `.env`, parsé en liste |
| 26.3 | classify_intent | Supprimé — RAG first, LLM décide dans sa réponse via bloc `action` JSON |
| 26.4 | Soft delete | Filtre manuel `.where(active(Model))` — helper `active()` fourni |
| 26.5 | Hocuspocus down | Toast Infinity + mode solo + retry 15s en arrière-plan |
| 26.6 | Dark mode | Dès P0 — toggle light/dark/system dans Settings > Préférences |

---

## 27. Décisions techniques — Lot final

### 27.1 Azure AD → OpsFlux Tenant Mapping

**Décision :** Double mécanisme — mapping DB configurable via `/admin` + assignation manuelle par super_admin au premier login.

**Le champ Azure AD de mapping est à déterminer** (Groups, Department, JobTitle, Extension attribute...) — configurable dans `/admin` une fois connu.

```python
# app/core/config.py
AZURE_TENANT_CLAIM: str = "groups"
# Valeur à configurer quand Perenco IT fournit le champ exact
# Options possibles : "groups", "department", "extension_perencoTenant", "jobTitle"

# app/models/core/tenant.py
class AzureTenantMapping(SQLModel, table=True):
    """Mappe une valeur du claim Azure vers un tenant OpsFlux."""
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    azure_claim_field: str       # ex: "groups", "department"
    azure_claim_value: str       # ex: "OpsFlux-PCM", "Perenco Cameroun"
    opsflux_tenant_id: UUID = Field(foreign_key="tenants.id")
    is_active: bool = True
```

```python
# app/core/security.py

async def resolve_tenant_from_azure(
    azure_payload: dict,
    db: AsyncSession,
) -> UUID | None:
    """
    Tente de résoudre le tenant OpsFlux depuis les claims Azure.
    Retourne None si aucun mapping trouvé → super_admin assignera manuellement.
    """
    claim_field = settings.AZURE_TENANT_CLAIM
    claim_values = azure_payload.get(claim_field, [])

    # claim peut être une liste (groups) ou une string (department)
    if isinstance(claim_values, str):
        claim_values = [claim_values]

    for value in claim_values:
        mapping = await db.execute(
            select(AzureTenantMapping).where(
                AzureTenantMapping.azure_claim_field == claim_field,
                AzureTenantMapping.azure_claim_value == value,
                AzureTenantMapping.is_active == True,
            )
        ).scalar_one_or_none()
        if mapping:
            return mapping.opsflux_tenant_id

    return None  # → assignation manuelle par super_admin

async def upsert_user_from_azure(azure_payload: dict, db: AsyncSession) -> User:
    existing = await db.execute(
        select(User).where(User.oauth_sub == azure_payload["sub"])
    ).scalar_one_or_none()

    if existing:
        existing.full_name = azure_payload.get("name", existing.full_name)
        existing.email = azure_payload.get("email", existing.email)
        existing.last_login_at = datetime.utcnow()
        await db.commit()
        return existing

    # Résoudre le tenant automatiquement
    tenant_id = await resolve_tenant_from_azure(azure_payload, db)

    user = User(
        email=azure_payload["email"],
        full_name=azure_payload.get("name", azure_payload["email"]),
        oauth_sub=azure_payload["sub"],
        last_login_at=datetime.utcnow(),
    )
    db.add(user)
    await db.flush()

    if tenant_id:
        db.add(UserTenant(
            user_id=user.id,
            tenant_id=tenant_id,
            role="pending",
            is_active=False,
        ))
        # Notifier tenant_admin
        await notify_admins_new_user(user, str(tenant_id))
    else:
        # Aucun mapping → notifier le super_admin
        await email_service.queue(
            to=settings.SUPER_ADMIN_EMAILS,
            template_key="system.unresolved_tenant_login",
            context={
                "user_name": user.full_name,
                "user_email": user.email,
                "azure_payload": json.dumps({
                    k: azure_payload.get(k)
                    for k in ["sub", "email", "name", "groups", "department"]
                }),
                "admin_url": f"{settings.APP_URL}/admin/users",
            },
            tenant_id="system",
            priority=1,
        )

    await db.commit()
    return user
```

**TODO P0** : contacter Perenco IT pour obtenir le nom exact du champ Azure AD à utiliser pour le mapping tenant. En attendant, configurer `AZURE_TENANT_CLAIM=groups` et créer les mappings manuellement dans `/admin`.

---

### 27.2 TreeView drag-and-drop — @dnd-kit + custom tree

```tsx
// src/components/modules/report/ArborescenceTree.tsx
// @dnd-kit pour le drag-and-drop, tree custom pour la hiérarchie

import {
    DndContext, closestCenter, DragOverlay,
    useSensor, useSensors, PointerSensor, KeyboardSensor,
    type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core"
import {
    SortableContext, verticalListSortingStrategy,
    useSortable, sortableKeyboardCoordinates,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

// Nœud d'arborescence sortable
const SortableTreeNode = ({ node, depth, children }: SortableTreeNodeProps) => {
    const {
        attributes, listeners, setNodeRef,
        transform, transition, isDragging,
    } = useSortable({ id: node.id })

    return (
        <div
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(transform),
                transition,
                paddingLeft: depth * 16,
                opacity: isDragging ? 0.4 : 1,
            }}
        >
            <div className="flex items-center gap-1.5 h-8 hover:bg-muted/50 rounded-md px-2 group">
                {/* Handle drag */}
                <button
                    {...attributes}
                    {...listeners}
                    className="cursor-grab opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Réordonner"
                >
                    <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                </button>

                {/* Toggle expand/collapse */}
                {node.children?.length > 0 && (
                    <button onClick={() => toggleExpand(node.id)}>
                        <ChevronRight className={cn("h-3.5 w-3.5 transition-transform",
                            expanded && "rotate-90")} />
                    </button>
                )}

                {/* Icône + Label */}
                <Folder className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-sm truncate flex-1">{node.name}</span>

                {/* Actions inline */}
                <div className="opacity-0 group-hover:opacity-100 flex gap-0.5">
                    <Button variant="ghost" size="icon" className="h-5 w-5"
                        onClick={() => addChild(node.id)}>
                        <Plus className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5"
                        onClick={() => renameNode(node.id)}>
                        <Pencil className="h-3 w-3" />
                    </Button>
                    <InlineConfirmButton
                        onConfirm={() => deleteNode(node.id)}
                        confirmLabel="Supprimer ?"
                        size="icon"
                        className="h-5 w-5"
                    >
                        <Trash2 className="h-3 w-3" />
                    </InlineConfirmButton>
                </div>
            </div>
            {expanded && children}
        </div>
    )
}
```

---

### 27.3 Pagination — Offset listes + Cursor temps réel

```python
# app/api/routes/core/_pagination.py

from pydantic import BaseModel
from typing import TypeVar, Generic, Optional

T = TypeVar("T")

# ── Offset pagination (listes standard) ────────────────────────────
class OffsetPage(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int

def paginate_offset(query, page: int, page_size: int):
    """Applique l'offset pagination à une query SQLAlchemy."""
    return query.offset((page - 1) * page_size).limit(page_size)

# Paramètres standard pour les endpoints liste
# page: int = Query(1, ge=1)
# page_size: int = Query(25, ge=1, le=100)

# ── Cursor pagination (notifications, activity, flux temps réel) ───
class CursorPage(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: Optional[str]   # UUID du dernier item, ou None si fin
    has_more: bool

def paginate_cursor(query, after_id: Optional[str], limit: int):
    """
    Cursor-based : récupère `limit` items après `after_id`.
    Toujours trié par created_at DESC pour les flux temps réel.
    """
    if after_id:
        # Récupérer la date du cursor pour le keyset
        query = query.where(Model.id < UUID(after_id))
    return query.order_by(Model.created_at.desc()).limit(limit + 1)
    # +1 pour savoir s'il y a une page suivante

# Usage notifications :
# GET /api/v1/notifications?limit=20&after=uuid
```

---

### 27.4 Objet supprimé du canvas draw.io

**Décision :** Selon le statut du PID parent.

```python
# app/services/modules/pid_service.py

async def parse_and_sync_pid(pid_id: str, xml_content: str, tenant_id: str, db):
    """
    Synchronisation complète XML → DB.
    Les objets présents dans le XML sont créés/mis à jour.
    Les objets absents du XML sont traités selon le statut du PID.
    """
    pid = await db.get(PIDDocument, pid_id)
    is_new_project = await _is_new_project(pid.project_id, db)

    # IDs des cellules dans le XML courant
    xml_cell_ids = set()
    for cell in parse_all_equipment_cells(xml_content):
        xml_cell_ids.add(cell.get("id"))

    # Équipements en DB pour ce PID
    db_equipment = await db.execute(
        select(Equipment).where(
            Equipment.pid_document_id == UUID(pid_id),
            Equipment.tenant_id == tenant_id,
        )
    ).scalars().all()

    for eq in db_equipment:
        if eq.mxgraph_cell_id not in xml_cell_ids:
            # L'objet a été supprimé du canvas
            if is_new_project:
                # Projet nouveau → supprimer physiquement
                await db.delete(eq)
            else:
                # PID existant → marquer comme retiré du PID
                eq.pid_document_id = None      # plus lié à ce PID
                eq.removed_from_pid_at = datetime.utcnow()
                eq.is_active = False
                # L'équipement reste dans la DB pour l'historique
                # Il pourrait exister sur d'autres PIDs

    await db.commit()

async def _is_new_project(project_id: UUID, db) -> bool:
    """
    Un projet est 'nouveau' s'il n'a aucun document publié
    ou approuvé (donc pas encore en production).
    """
    count = await db.execute(
        select(func.count(Document.id)).where(
            Document.project_id == project_id,
            Document.status.in_(["approved", "published"]),
        )
    )
    return count.scalar() == 0
```

---

### 27.5 Ollama — Conteneur Docker avec pull automatique

```yaml
# docker-compose.yml

  ollama:
    image: ollama/ollama:latest
    restart: unless-stopped
    volumes:
      - ollama_data:/root/.ollama
    environment:
      - OLLAMA_HOST=0.0.0.0
    # GPU si disponible (optionnel)
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - driver: nvidia
    #           count: 1
    #           capabilities: [gpu]

  # Sidecar qui pull les modèles au démarrage
  ollama-setup:
    image: ollama/ollama:latest
    depends_on: [ollama]
    restart: "no"    # run once
    entrypoint: ["/bin/sh", "-c"]
    command: |
      "sleep 5 &&
       ollama pull llama3 &&
       ollama pull nomic-embed-text &&
       echo 'Models ready'"
    environment:
      - OLLAMA_HOST=ollama:11434
    volumes:
      - ollama_data:/root/.ollama
```

```bash
# .env.example
OLLAMA_BASE_URL=http://ollama:11434    # interne Docker
OLLAMA_DEFAULT_MODEL=llama3
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

---

### 27.6 Notifications temps réel — WebSocket FastAPI

```python
# app/api/routes/core/websocket.py

from fastapi import WebSocket, WebSocketDisconnect
from collections import defaultdict
import asyncio

# Registry des connexions actives par user
_connections: dict[str, list[WebSocket]] = defaultdict(list)

@router.websocket("/ws/notifications")
async def notifications_ws(websocket: WebSocket, token: str):
    """
    WebSocket pour les notifications temps réel.
    Auth : token JWT en query param (pas de header possible en WS).
    """
    # Valider le JWT
    try:
        payload = validate_opsflux_token(token)
        user_id = payload["sub"]
        tenant_id = payload["tenant_id"]
    except Exception:
        await websocket.close(code=4001, reason="Token invalide")
        return

    await websocket.accept()
    _connections[user_id].append(websocket)

    try:
        # Envoyer le compteur initial au connect
        unread = await get_unread_count(user_id, tenant_id)
        await websocket.send_json({"type": "unread_count", "data": unread})

        # Keepalive + écoute des pings client
        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                if msg == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                await websocket.send_text("ping")  # keepalive serveur

    except WebSocketDisconnect:
        _connections[user_id].remove(websocket)

async def push_notification(user_id: str, notification: dict):
    """
    Appelé depuis notification_service.create_in_app_notification().
    Pousse en temps réel vers toutes les connexions de l'user.
    """
    for ws in _connections.get(user_id, []):
        try:
            await ws.send_json({"type": "new_notification", "data": notification})
        except Exception:
            pass  # connexion fermée entre-temps
```

```typescript
// src/components/core/NotificationBell.tsx — connexion WS

useEffect(() => {
    const token = getAuthToken()
    const ws = new WebSocket(`${WS_URL}/ws/notifications?token=${token}`)

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.type === "new_notification") {
            queryClient.invalidateQueries({ queryKey: ["notifications"] })
            queryClient.invalidateQueries({ queryKey: ["unread-count"] })
        }
        if (msg.type === "unread_count") {
            queryClient.setQueryData(["unread-count"], msg.data)
        }
        if (msg === "ping") ws.send("pong")
    }

    ws.onclose = () => {
        // Reconnexion automatique après 5s
        setTimeout(() => reconnect(), 5000)
    }

    return () => ws.close()
}, [])
```

---

### 27.7 React Query — Stratégie d'invalidation

**Règle :** mutations Core invalident large, mutations modules invalident ciblé.

```typescript
// src/lib/queryClient.ts — helpers d'invalidation

// ── Invalidations LARGES (après mutations Core) ────────────────────
// Après création/modification d'un objet → invalider sidebar badges + briefing IA

export const invalidateAfterCreate = (objectType: string) => {
    // Données de l'objet
    queryClient.invalidateQueries({ queryKey: [objectType] })
    // Sidebar badges (compteurs)
    queryClient.invalidateQueries({ queryKey: ["nav-badges"] })
    // Briefing IA (peut avoir une nouvelle recommandation)
    queryClient.invalidateQueries({ queryKey: ["ai-briefing"] })
}

export const invalidateAfterWorkflowAction = () => {
    queryClient.invalidateQueries({ queryKey: ["documents"] })
    queryClient.invalidateQueries({ queryKey: ["workflow"] })
    queryClient.invalidateQueries({ queryKey: ["nav-badges"] })
    queryClient.invalidateQueries({ queryKey: ["ai-briefing"] })
    queryClient.invalidateQueries({ queryKey: ["recommendations"] })
}

// ── Invalidations CIBLÉES (mutations modules) ──────────────────────
// Après modification d'un champ → invalider seulement l'objet concerné

export const invalidateObject = (objectType: string, objectId: string) => {
    queryClient.invalidateQueries({ queryKey: [objectType, objectId] })
    queryClient.invalidateQueries({ queryKey: [objectType] })
    // PAS de invalidation globale (nav-badges, ai-briefing)
}

// ── Règle d'usage par type d'action ───────────────────────────────
// CREATE  → invalidateAfterCreate(objectType)
// UPDATE  → invalidateObject(objectType, id)
// DELETE  → invalidateAfterCreate(objectType)  ← large car la liste change
// WORKFLOW action → invalidateAfterWorkflowAction()
// SETTINGS save → invalider seulement la section settings concernée
```

---

### 27.8 Asset CRUD — Vraiment dynamique

```python
# app/api/routes/modules/assets.py
# UN seul router gère TOUS les types d'assets

router = APIRouter(prefix="/assets", tags=["assets"])

@router.get("/{type_slug}")
async def list_assets(type_slug: str, ...):
    asset_type = await validate_asset_type(type_slug, tenant_id)  # 404 si inconnu
    # Puis query générique
    ...

@router.post("/{type_slug}")
async def create_asset(type_slug: str, body: dict, ...):
    asset_type = await validate_asset_type(type_slug, tenant_id)
    validated = await validate_asset_data(body, asset_type.fields)
    ...

# validate_asset_type() : vérifie que type_slug existe dans asset_types
# pour ce tenant. Retourne 404 si le slug est inconnu ou inactif.
# JAMAIS de if/elif type_slug == "platform": ...
# Les 4 types Perenco et tout nouveau type custom passent par le même code.
```

---

### 27.9 Dockerfiles — Multi-stage

```dockerfile
# backend/Dockerfile

# ── Stage 1 : Build (dépendances) ─────────────────────────────────
FROM python:3.12-slim AS builder
WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Stage 2 : Runtime léger ────────────────────────────────────────
FROM python:3.12-slim AS runtime
WORKDIR /app

# pg_dump pour les backups (dans le conteneur backend + arq-worker)
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copier les dépendances installées
COPY --from=builder /install /usr/local

# Copier le code
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini .

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```dockerfile
# frontend/Dockerfile

# ── Stage 1 : Build Vite ──────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build     # → /build/dist/

# ── Stage 2 : nginx runtime ───────────────────────────────────────
FROM nginx:alpine AS runtime
COPY --from=builder /build/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

```nginx
# frontend/nginx.conf — SPA routing
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # Toutes les routes → index.html (React Router)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache agressif pour les assets buildés (hash dans le nom)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Pas de cache pour index.html
    location = /index.html {
        add_header Cache-Control "no-cache";
    }
}
```

---

## RÉSUMÉ — Décisions lot 27

| # | Sujet | Décision |
|---|---|---|
| 27.1 | Azure tenant mapping | DB mapping configurable + fallback super_admin. Champ Azure à confirmer avec Perenco IT |
| 27.2 | TreeView drag-and-drop | @dnd-kit + custom tree |
| 27.3 | Pagination | Offset pour listes, cursor pour notifications/activity |
| 27.4 | Objet supprimé draw.io | Projet nouveau → DELETE physique. PID existant → `removed_from_pid`, `is_active=False` |
| 27.5 | Ollama models | Conteneur `ollama-setup` sidecar, run-once, pull `llama3` + `nomic-embed-text` |
| 27.6 | Notifications WS | `/ws/notifications?token=JWT` FastAPI, keepalive 30s, push via `_connections` registry |
| 27.7 | React Query invalidation | CREATE/DELETE → large (badges + briefing). UPDATE → ciblé (objet seul) |
| 27.8 | Asset CRUD | Dynamique : 1 endpoint `/{type_slug}/` — `validate_asset_type()` fait le 404 |
| 27.9 | Dockerfiles | Multi-stage : builder → runtime slim. nginx pour le frontend |

---

## 27. Décisions techniques — Lot final

### 27.1 Azure AD → OpsFlux tenant mapping

**Décision :** Mapping explicit en DB configurable depuis `/admin` + assignation manuelle du tenant_admin au premier login.

**Problème :** Perenco a un seul Azure tenant (`tid` identique pour tous les employés). OpsFlux ne peut pas déduire le tenant OpsFlux depuis le `tid` Azure seul.

**Solution :** Azure AD permet d'ajouter des **custom claims** (attributs étendus) dans le token JWT. Le nom exact du claim sera configuré quand l'IT Perenco communiquera la valeur. En attendant, la logique est prête.

```python
# app/core/config.py
AZURE_TENANT_CLAIM: str = "extension_OpsFluxTenant"
# ↑ Nom du claim custom à configurer dans Azure App Registration
# Exemples possibles : "extension_OpsFluxTenant", "groups", "department", "companyName"
# À confirmer avec IT Perenco — mettre à jour dans .env quand connu

# .env.example
AZURE_TENANT_CLAIM=extension_OpsFluxTenant
# IMPORTANT : À confirmer avec IT Perenco avant le déploiement prod
```

```python
# app/core/security.py

async def upsert_user_from_azure(azure_payload: dict, db: AsyncSession) -> tuple[User, str | None]:
    """
    Retourne (user, opsflux_tenant_id_or_None).
    tenant_id peut être None si le claim Azure n'est pas configuré ou absent.
    """
    # 1. Tenter de résoudre le tenant depuis le claim Azure custom
    azure_tenant_value = azure_payload.get(settings.AZURE_TENANT_CLAIM)
    opsflux_tenant_id = None

    if azure_tenant_value:
        # Chercher le mapping en DB
        mapping = await db.execute(
            select(AzureTenantMapping).where(
                AzureTenantMapping.azure_claim_value == azure_tenant_value,
                AzureTenantMapping.is_active == True,
            )
        ).scalar_one_or_none()

        if mapping:
            opsflux_tenant_id = str(mapping.opsflux_tenant_id)

    # 2. Upsert user
    user = await get_or_create_user(azure_payload, db)

    # 3. Si tenant résolu → créer UserTenant pending
    if opsflux_tenant_id:
        await ensure_user_tenant_pending(user.id, opsflux_tenant_id, db)
    else:
        # Pas de tenant résolu → super_admin doit assigner manuellement
        # User voit page "En attente d'assignation"
        pass

    return user, opsflux_tenant_id
```

```sql
-- Table de mapping Azure claim → OpsFlux tenant
CREATE TABLE azure_tenant_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    azure_claim_name VARCHAR(255) NOT NULL,   -- ex: "extension_OpsFluxTenant"
    azure_claim_value VARCHAR(255) NOT NULL,  -- ex: "PCM", "PCG", "SIEGE"
    opsflux_tenant_id UUID NOT NULL REFERENCES tenants(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (azure_claim_name, azure_claim_value)
);
```

**UI dans `/admin/tenants/{id}` :**
```
Mapping Azure AD
Claim Azure : [extension_OpsFluxTenant    ]
Valeur      : [PCM                        ]
→ Les users dont le claim "extension_OpsFluxTenant" = "PCM"
  seront automatiquement assignés à ce tenant.
```

**Fallback si claim absent :** L'utilisateur arrive dans OpsFlux sans tenant. Page "En attente d'assignation". Le super_admin l'assigne depuis `/admin/users`. À documenter dans le README du déploiement.

---

### 27.2 Arborescence — dnd-kit + custom tree

```typescript
// src/components/modules/report/ArborescenceTree.tsx
// @dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities

import {
    DndContext, DragEndEvent, DragOverlay,
    PointerSensor, useSensor, useSensors,
    closestCenter,
} from "@dnd-kit/core"
import {
    SortableContext, verticalListSortingStrategy,
    useSortable, arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

interface TreeNode {
    id: string
    parent_id: string | null
    name: string
    level: number
    display_order: number
    children?: TreeNode[]
}

const ArborescenceTree = ({ projectId }: { projectId: string }) => {
    const { data: nodes } = useQuery({
        queryKey: ["arborescence", projectId],
        queryFn: () => api.get(`/api/v1/projects/${projectId}/nodes`).then(r => r.data),
    })
    const [activeId, setActiveId] = useState<string | null>(null)

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
    )

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event
        if (!over || active.id === over.id) return

        // Calcul du nouvel ordre et du nouveau parent
        const newOrder = computeNewOrder(nodes, active.id as string, over.id as string)
        await api.patch(`/api/v1/projects/${projectId}/nodes/reorder`, newOrder)
        queryClient.invalidateQueries({ queryKey: ["arborescence", projectId] })
    }

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter}
            onDragStart={e => setActiveId(e.active.id as string)}
            onDragEnd={handleDragEnd}>
            <SortableContext items={flattenTree(nodes)} strategy={verticalListSortingStrategy}>
                {renderTree(nodes)}
            </SortableContext>
            <DragOverlay>
                {activeId && <TreeNodeOverlay node={findNode(nodes, activeId)} />}
            </DragOverlay>
        </DndContext>
    )
}

const SortableTreeNode = ({ node }: { node: TreeNode }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: node.id })

    return (
        <div ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={cn(
                "flex items-center gap-2 h-8 px-2 rounded hover:bg-accent group",
                isDragging && "opacity-50 bg-accent",
            )}
            style={{ paddingLeft: `${node.level * 16 + 8}px` }}
        >
            {/* Handle drag */}
            <GripVertical {...attributes} {...listeners}
                className="h-3.5 w-3.5 text-muted-foreground cursor-grab opacity-0 group-hover:opacity-100" />

            {/* Toggle collapse si enfants */}
            {node.children?.length ? (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
                <div className="w-3.5" />
            )}

            <span className="text-sm truncate flex-1">{node.name}</span>

            {/* Actions inline */}
            <div className="opacity-0 group-hover:opacity-100 flex gap-0.5">
                <Button variant="ghost" size="icon" className="h-5 w-5"
                    onClick={() => addChildNode(node.id)}>
                    <Plus className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-5 w-5"
                    onClick={() => renameNode(node.id)}>
                    <Pencil className="h-3 w-3" />
                </Button>
                <InlineConfirmButton onConfirm={() => deleteNode(node.id)}
                    confirmLabel="Supprimer ?"
                    className="h-5 w-5 text-destructive">
                    <Trash2 className="h-3 w-3" />
                </InlineConfirmButton>
            </div>
        </div>
    )
}
```

---

### 27.3 Pagination — Offset pour listes, cursor pour flux

```python
# app/api/routes/core/pagination.py

# ─── OFFSET — Pour toutes les listes DataTable ───────────────────

class OffsetPagination(BaseModel):
    page: int = Field(1, ge=1)
    page_size: int = Field(25, ge=1, le=100)

class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    total_pages: int

async def paginate_query(query, page: int, page_size: int, db: AsyncSession) -> dict:
    total = await db.scalar(select(func.count()).select_from(query.subquery()))
    items = await db.execute(
        query.offset((page - 1) * page_size).limit(page_size)
    )
    return {
        "items": items.scalars().all(),
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": math.ceil(total / page_size),
    }

# Usage dans un endpoint
@router.get("/documents")
async def list_documents(page: int = 1, page_size: int = 25, ...):
    query = select(Document).where(...)
    return await paginate_query(query, page, page_size, db)


# ─── CURSOR — Pour notifications et flux temps réel ──────────────

class CursorPagination(BaseModel):
    after: Optional[datetime] = None    # cursor = timestamp ISO
    limit: int = Field(20, ge=1, le=100)

async def cursor_paginate_notifications(
    user_id: str,
    tenant_id: str,
    after: Optional[datetime],
    limit: int,
    db: AsyncSession,
) -> dict:
    query = (
        select(Notification)
        .where(
            Notification.user_id == UUID(user_id),
            Notification.tenant_id == tenant_id,
        )
        .order_by(Notification.created_at.desc())
    )
    if after:
        query = query.where(Notification.created_at < after)

    items = await db.execute(query.limit(limit + 1))
    results = items.scalars().all()

    has_more = len(results) > limit
    items_page = results[:limit]
    next_cursor = items_page[-1].created_at.isoformat() if has_more and items_page else None

    return {
        "items": items_page,
        "next_cursor": next_cursor,    # None = plus de résultats
        "has_more": has_more,
    }
```

---

### 27.4 Objet supprimé du canvas draw.io

**Décision :** Dépend du contexte du PID.

```python
# app/services/modules/pid_service.py

async def sync_deleted_cells(
    pid_id: str,
    xml_content: str,
    tenant_id: str,
    db: AsyncSession,
):
    """
    Après parse du XML, détecte les cellules disparues et traite selon le contexte.
    """
    pid = await db.get(PIDDocument, pid_id)
    project = await db.get(Project, pid.project_id) if pid.project_id else None

    # Déterminer si c'est un projet "existant" (déjà en production)
    # ou un "nouveau projet" (encore en phase de design)
    is_existing_project = project and project.status in ("active", "completed")

    # Cellules en DB pour ce PID
    db_equipment = await db.execute(
        select(Equipment).where(
            Equipment.pid_document_id == UUID(pid_id),
            Equipment.is_active == True,
        )
    ).scalars().all()

    # Cellules dans le XML actuel
    cells_in_xml = {cell.get("id") for cell in parse_cells(xml_content)}

    for eq in db_equipment:
        if eq.mxgraph_cell_id not in cells_in_xml:
            # Cellule supprimée du canvas
            if is_existing_project:
                # PID existant → "removed from PID" (soft flag)
                eq.removed_from_pid = True
                eq.removed_from_pid_at = datetime.utcnow()
                # NE PAS mettre is_active = False — l'équipement existe toujours physiquement
                # Il pourrait apparaître sur d'autres PID
            else:
                # Nouveau projet → suppression physique
                await db.delete(eq)

    await db.commit()
```

```sql
-- Ajouter la colonne removed_from_pid sur equipment
ALTER TABLE equipment ADD COLUMN removed_from_pid BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE equipment ADD COLUMN removed_from_pid_at TIMESTAMPTZ;
```

**Règle affichage :** Les équipements `removed_from_pid = True` n'apparaissent PAS dans la liste d'équipements du PID, mais restent visibles dans la recherche globale d'équipements et dans leurs autres PID.

---

### 27.5 Ollama — Conteneur Docker avec pull auto

```yaml
# docker-compose.yml

  ollama:
    image: ollama/ollama:latest
    volumes:
      - ollama_data:/root/.ollama      # modèles persistés
    environment:
      - OLLAMA_KEEP_ALIVE=24h
    restart: unless-stopped
    profiles: ["ai"]                   # activé uniquement si profile ai

  # Conteneur init qui pull les modèles au démarrage
  ollama-init:
    image: ollama/ollama:latest
    volumes:
      - ollama_data:/root/.ollama
    environment:
      OLLAMA_HOST: http://ollama:11434
    entrypoint: >
      sh -c "
        sleep 5 &&
        ollama pull llama3 &&
        ollama pull nomic-embed-text &&
        echo 'Models ready'
      "
    depends_on: [ollama]
    restart: "no"                      # s'exécute une seule fois
    profiles: ["ai"]

volumes:
  ollama_data:
    # volume persistant — les modèles ne sont pas re-téléchargés au restart
```

```bash
# .env
OLLAMA_BASE_URL=http://ollama:11434    # dans Docker network
# En dev sans Docker Ollama : http://localhost:11434
```

---

### 27.6 Notifications temps réel — WebSocket FastAPI

```python
# app/api/routes/core/websocket.py

from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, Set
import asyncio

class NotificationConnectionManager:
    """Gestionnaire de connexions WebSocket pour les notifications."""

    def __init__(self):
        # user_id → set de connexions actives (multi-onglets)
        self.connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.connections:
            self.connections[user_id] = set()
        self.connections[user_id].add(websocket)

    def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.connections:
            self.connections[user_id].discard(websocket)
            if not self.connections[user_id]:
                del self.connections[user_id]

    async def send_to_user(self, user_id: str, payload: dict):
        """Envoie un message à tous les onglets de l'utilisateur."""
        if user_id not in self.connections:
            return
        dead = set()
        for ws in self.connections[user_id].copy():
            try:
                await ws.send_json(payload)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self.connections[user_id].discard(ws)


ws_manager = NotificationConnectionManager()


@router.websocket("/ws/notifications")
async def notifications_websocket(websocket: WebSocket):
    """
    Endpoint WebSocket pour les notifications temps réel.
    Auth via token en query param (WebSocket ne supporte pas les headers custom).
    """
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Token manquant")
        return

    try:
        payload = decode_opsflux_jwt(token)
        user_id = payload["sub"]
        tenant_id = payload["tenant_id"]
    except Exception:
        await websocket.close(code=4001, reason="Token invalide")
        return

    await ws_manager.connect(websocket, user_id)

    try:
        # Envoyer le compte non-lus immédiatement à la connexion
        unread = await get_unread_count(user_id, tenant_id)
        await websocket.send_json({"type": "unread_count", "count": unread})

        # Heartbeat toutes les 30s pour garder la connexion active
        while True:
            await asyncio.sleep(30)
            await websocket.send_json({"type": "ping"})

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, user_id)
```

```typescript
// src/hooks/useNotificationWebSocket.ts

export const useNotificationWebSocket = () => {
    const queryClient = useQueryClient()
    const { accessToken } = useAuthStore()

    useEffect(() => {
        const wsUrl = `${WS_URL}/ws/notifications?token=${accessToken}`
        const ws = new WebSocket(wsUrl)

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data)

            if (msg.type === "unread_count") {
                queryClient.setQueryData(["notifications", "unread-count"], msg.count)
            }
            if (msg.type === "new_notification") {
                // Invalider pour forcer le rechargement
                queryClient.invalidateQueries({ queryKey: ["notifications"] })
                queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] })
                queryClient.invalidateQueries({ queryKey: ["recommendations"] })
            }
            if (msg.type === "ping") {
                ws.send(JSON.stringify({ type: "pong" }))
            }
        }

        ws.onerror = () => {
            // Reconnexion automatique gérée par le composant parent
        }

        return () => ws.close()
    }, [accessToken])
}
```

```python
# Dans notification_service.py — envoyer via WS après création
async def create_in_app_notification(user_id: str, template_key: str,
                                      context: dict, tenant_id: str):
    notif = Notification(...)
    db.add(notif)
    await db.commit()

    # Pousser en temps réel via WebSocket
    await ws_manager.send_to_user(user_id, {
        "type": "new_notification",
        "notification_id": str(notif.id),
        "template_key": template_key,
        "title": notif.title,
    })
```

---

### 27.7 React Query — Stratégie d'invalidation

**Règle :** Mutations Core invalident large, mutations modules invalident ciblé.

```typescript
// src/lib/invalidation.ts

// ─── INVALIDATIONS LARGES (mutations Core) ───────────────────────

export const invalidateAfterCoreAction = () => {
    // Après login, switch tenant, switch BU, changement rôle
    queryClient.invalidateQueries({ queryKey: ["nav-items"] })
    queryClient.invalidateQueries({ queryKey: ["nav-badge"] })
    queryClient.invalidateQueries({ queryKey: ["preferences"] })
    queryClient.invalidateQueries({ queryKey: ["recommendations"] })
    queryClient.invalidateQueries({ queryKey: ["ai-briefing"] })
}

// ─── INVALIDATIONS CIBLÉES (mutations modules) ───────────────────

export const invalidateAfterDocumentMutation = (documentId?: string) => {
    queryClient.invalidateQueries({ queryKey: ["documents"] })
    if (documentId) {
        queryClient.invalidateQueries({ queryKey: ["document", documentId] })
    }
    // Badge sidebar "N documents à valider" mis à jour
    queryClient.invalidateQueries({ queryKey: ["nav-badge", "report_editor"] })
    // Le briefing IA pourrait mentionner ce doc
    queryClient.invalidateQueries({ queryKey: ["ai-briefing"] })
}

export const invalidateAfterAssetMutation = (typeSlug: string, assetId?: string) => {
    queryClient.invalidateQueries({ queryKey: ["assets", typeSlug] })
    if (assetId) {
        queryClient.invalidateQueries({ queryKey: ["asset", typeSlug, assetId] })
    }
    // Pas besoin d'invalider les badges sidebar pour les assets
}

export const invalidateAfterWorkflowTransition = (documentId: string) => {
    queryClient.invalidateQueries({ queryKey: ["document", documentId] })
    queryClient.invalidateQueries({ queryKey: ["workflow-instance", documentId] })
    queryClient.invalidateQueries({ queryKey: ["nav-badge", "report_editor"] })
    queryClient.invalidateQueries({ queryKey: ["pending-validations"] })
    queryClient.invalidateQueries({ queryKey: ["recommendations"] })
    queryClient.invalidateQueries({ queryKey: ["ai-briefing"] })
}

export const invalidateAfterTagMutation = (tagId?: string) => {
    queryClient.invalidateQueries({ queryKey: ["dcs-tags"] })
    if (tagId) {
        queryClient.invalidateQueries({ queryKey: ["dcs-tag", tagId] })
    }
    // Pas de badge sidebar pour les tags
}
```

---

### 27.8 Asset CRUD — Un seul endpoint dynamique

```python
# app/api/routes/modules/assets.py
# UN SEUL fichier pour TOUS les types d'assets

router = APIRouter(prefix="/assets")

@router.get("/{type_slug}")
async def list_assets(
    type_slug: str,
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: Optional[str] = None,
    status: Optional[str] = None,
    parent_id: Optional[str] = None,
    with_geo: bool = False,
    db: AsyncSession = Depends(get_db),
):
    # Vérifier que le type_slug existe pour ce tenant
    asset_type = await get_asset_type_or_404(type_slug, request.state.tenant_id, db)

    # Vérifier permission dynamiquement
    await check_permission(request.state.user_id, request.state.tenant_id,
                           "asset.read", db)

    return await asset_service.list_assets(
        type_slug=type_slug,
        tenant_id=request.state.tenant_id,
        bu_id=request.state.bu_id,
        page=page, page_size=page_size,
        search=search, status=status,
        parent_id=parent_id, with_geo=with_geo,
        db=db,
    )

# Même pattern pour POST, GET/{id}, PUT/{id}, DELETE/{id}, POST/import
# → un seul fichier assets.py couvre platform, well, logistics_asset, zone_hse,
#   et tous les types custom créés par les admins
```

---

### 27.9 Dockerfiles — Multi-stage

```dockerfile
# backend/Dockerfile

# ─── Stage 1 : Build / install deps ─────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# ─── Stage 2 : Runtime léger ─────────────────────────────────────
FROM python:3.12-slim AS runtime

# Dépendances système minimales
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    tesseract-ocr tesseract-ocr-fra \
    puppeteer-deps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copier les packages installés depuis builder
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

# Copier le code
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini .

# User non-root
RUN useradd -m appuser && chown -R appuser /app
USER appuser

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```dockerfile
# frontend/Dockerfile

# ─── Stage 1 : Build Vite ────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /build
COPY package*.json .
RUN npm ci --frozen-lockfile

COPY . .
RUN npm run build        # → /build/dist/

# ─── Stage 2 : nginx static ──────────────────────────────────────
FROM nginx:alpine AS runtime

# Config nginx pour SPA (toutes les routes → index.html)
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /build/dist /usr/share/nginx/html

EXPOSE 80
```

```nginx
# frontend/nginx.conf
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # Compression gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    # Cache assets statiques (hashed filenames)
    location ~* \.(js|css|png|svg|ico|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback — toutes les routes → index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## RÉSUMÉ FINAL — Décisions lot 27

| # | Sujet | Décision |
|---|---|---|
| 27.1 | Azure AD mapping | Table `azure_tenant_mappings` + claim configurable `AZURE_TENANT_CLAIM` |
| 27.2 | TreeView drag | `@dnd-kit/core` + `@dnd-kit/sortable` + custom tree |
| 27.3 | Pagination | Offset pour listes, cursor (timestamp) pour notifications/activity |
| 27.4 | Objet supprimé PID | `removed_from_pid=True` si projet existant, delete physique si nouveau projet |
| 27.5 | Ollama pull | Conteneur `ollama-init` profile `ai` qui pull au premier démarrage |
| 27.6 | Notifications RT | WebSocket `/ws/notifications?token=JWT` — `NotificationConnectionManager` |
| 27.7 | React Query invalidation | Core = large (nav+briefing+reco), modules = ciblé (liste+badge+briefing) |
| 27.8 | Asset CRUD | 1 seul fichier `assets.py` — `type_slug` en path param pour tous les types |
| 27.9 | Dockerfiles | Multi-stage backend (python-slim) + frontend (node build → nginx alpine) |

---

## 28. Décisions — Lot infrastructure & UX critique

### 28.1 RBAC — check_user_permission()

**Décision :** Table `user_roles` + `role_permissions`. Cache Redis TTL 5min.

```python
# app/core/security.py

# ─── Tables DB ───────────────────────────────────────────────────
# user_tenants.role VARCHAR(30)  ← rôle de l'user dans ce tenant
# role_permissions : stocké dans Redis (pas de table dédiée — géré par ModuleRegistry)
# Format Redis : "rbac:{tenant_id}:{role}" → JSON list de permissions
# Ex : "rbac:uuid-pcm:reviewer" → ["document.read", "document.submit"]

REDIS_RBAC_TTL = 300  # 5 minutes

async def check_user_permission(
    db: AsyncSession,
    user_id: str,
    tenant_id: str,
    permission: str,
) -> bool:
    """
    Vérifie qu'un user a une permission dans un tenant.
    Résolution : user_tenants.role → role_permissions (cache Redis).
    """
    # 1. Récupérer le rôle de l'user dans ce tenant
    user_tenant = await db.execute(
        select(UserTenant).where(
            UserTenant.user_id == UUID(user_id),
            UserTenant.tenant_id == UUID(tenant_id),
            UserTenant.is_active == True,
        )
    ).scalar_one_or_none()

    if not user_tenant or user_tenant.role == "pending":
        return False

    role = user_tenant.role

    # super_admin a tout
    if role == "super_admin":
        return True

    # 2. Récupérer les permissions du rôle (cache Redis d'abord)
    cache_key = f"rbac:{tenant_id}:{role}"
    cached = await redis_client.get(cache_key)

    if cached:
        permissions = json.loads(cached)
    else:
        permissions = await _load_role_permissions(role, tenant_id, db)
        await redis_client.setex(cache_key, REDIS_RBAC_TTL, json.dumps(permissions))

    return permission in permissions


async def _load_role_permissions(role: str, tenant_id: str, db: AsyncSession) -> list[str]:
    """
    Charge les permissions d'un rôle depuis la DB.
    Les permissions sont déclarées par les modules via leurs manifests
    et synchronisées dans la table permissions au démarrage.
    """
    # Permissions de base par rôle (définies dans le Core)
    BASE_ROLE_PERMISSIONS = {
        "reader": [
            "document.read", "asset.read", "tiers.read",
            "dashboard.read", "pid.read", "tag.read",
        ],
        "editor": [
            "document.read", "document.create", "document.edit", "document.submit",
            "asset.read", "asset.create", "asset.edit",
            "tiers.read", "tiers.create", "tiers.edit",
            "dashboard.read",
            "pid.read", "tag.read", "tag.create",
        ],
        "reviewer": [
            "document.read", "document.approve",
            "asset.read", "tiers.read", "dashboard.read",
            "pid.read", "tag.read",
        ],
        "template_manager": [
            "document.read", "document.create", "document.edit",
            "template.read", "template.create", "template.edit",
            "asset.read", "tiers.read", "dashboard.read",
        ],
        "pid_manager": [
            "document.read", "asset.read",
            "pid.read", "pid.write", "pid.publish",
            "tag.read", "tag.create", "tag.rename", "tag.admin",
            "library.read", "library.write",
        ],
        "tenant_admin": [],  # tenant_admin a TOUT — géré séparément
    }

    if role == "tenant_admin":
        # Toutes les permissions de tous les modules
        all_perms = await db.execute(select(Permission.key))
        return [p for p in all_perms.scalars().all()]

    # Permissions de base + permissions custom attribuées au rôle pour ce tenant
    base = BASE_ROLE_PERMISSIONS.get(role, [])

    custom = await db.execute(
        select(RolePermissionOverride.permission_key).where(
            RolePermissionOverride.tenant_id == UUID(tenant_id),
            RolePermissionOverride.role == role,
            RolePermissionOverride.is_active == True,
        )
    )
    custom_perms = custom.scalars().all()

    return list(set(base + list(custom_perms)))


def invalidate_rbac_cache(tenant_id: str, role: str = None):
    """
    Invalide le cache RBAC après un changement de rôle ou de permissions.
    Appelé depuis : assign_role(), revoke_role(), update_role_permissions().
    """
    if role:
        redis_client.delete(f"rbac:{tenant_id}:{role}")
    else:
        # Invalider tout le tenant
        for key in redis_client.scan_iter(f"rbac:{tenant_id}:*"):
            redis_client.delete(key)
```

```sql
-- Tables nécessaires (ajout migration)

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) NOT NULL UNIQUE,   -- ex: "document.create"
    module_slug VARCHAR(50) NOT NULL,
    label VARCHAR(255)
);

CREATE TABLE role_permission_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    role VARCHAR(30) NOT NULL,
    permission_key VARCHAR(100) NOT NULL REFERENCES permissions(key),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    UNIQUE (tenant_id, role, permission_key)
);
```

---

### 28.2 TenantMiddleware — JWT + X-Tenant-ID

**Décision :** JWT pour l'authentification, `X-Tenant-ID` pour le switch actif vérifié en DB.

```python
# app/core/middleware/tenant.py

class TenantMiddleware(BaseHTTPMiddleware):
    """
    Résout tenant_id, user_id, bu_id à chaque requête.
    Injecte dans request.state.
    """

    SKIP_PATHS = {"/health", "/docs", "/openapi.json", "/metrics",
                  "/api/public/contact", "/auth/callback", "/auth/login"}

    async def dispatch(self, request: Request, call_next):
        if request.url.path in self.SKIP_PATHS:
            return await call_next(request)

        # 1. Extraire et valider le JWT
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse({"detail": "Token manquant"}, status_code=401)

        token = auth_header.removeprefix("Bearer ").strip()
        try:
            payload = decode_opsflux_jwt(token)
        except Exception:
            return JSONResponse({"detail": "Token invalide"}, status_code=401)

        user_id = payload["sub"]
        jwt_tenant_id = payload.get("tenant_id")   # tenant au moment de la génération du token

        # 2. Résoudre le tenant actif
        # X-Tenant-ID permet de switcher sans regénérer un JWT
        requested_tenant_id = request.headers.get("X-Tenant-ID") or jwt_tenant_id

        if not requested_tenant_id:
            return JSONResponse({"detail": "Tenant non spécifié"}, status_code=400)

        # 3. Vérifier que l'user appartient bien à ce tenant (DB ou cache Redis)
        cache_key = f"user_tenant:{user_id}:{requested_tenant_id}"
        cached = await redis_client.get(cache_key)

        if cached:
            user_tenant_data = json.loads(cached)
        else:
            async with get_db() as db:
                ut = await db.execute(
                    select(UserTenant).where(
                        UserTenant.user_id == UUID(user_id),
                        UserTenant.tenant_id == UUID(requested_tenant_id),
                        UserTenant.is_active == True,
                    )
                ).scalar_one_or_none()

                if not ut:
                    return JSONResponse(
                        {"detail": "Accès non autorisé à ce tenant"},
                        status_code=403
                    )

                user_tenant_data = {
                    "role": ut.role,
                    "bu_id": str(ut.primary_bu_id) if ut.primary_bu_id else None,
                }
                # Cache 10 minutes
                await redis_client.setex(cache_key, 600, json.dumps(user_tenant_data))

        # 4. Injecter dans request.state
        request.state.user_id = user_id
        request.state.tenant_id = requested_tenant_id
        request.state.user_role = user_tenant_data["role"]

        # BU scope : depuis préférences user si pas de BU primaire
        active_bu = request.headers.get("X-BU-ID") or user_tenant_data.get("bu_id")
        request.state.bu_id = active_bu  # peut être None = toutes les BU

        return await call_next(request)
```

---

### 28.3 PWA Offline — Scope complet

**Décision :** Les 5 fonctionnalités listées doivent fonctionner hors ligne.

```typescript
// src/lib/offline/offlineCapabilities.ts

/*
Ce qui fonctionne OFFLINE :

1. LECTURE documents récents
   → React Query cache en mémoire (pendant la session)
   → Dexie.js IndexedDB pour persistance cross-session
   → Les 20 derniers documents consultés sont mis en cache automatiquement

2. MODIFICATION document
   → Yjs CRDT continue de fonctionner localement
   → Hocuspocus déconnecté → mode solo automatique (§26.5)
   → Les modifications sont dans le Y.Doc local
   → À la reconnexion → Hocuspocus merge via CRDT

3. NAVIGATION arborescence
   → Workbox + Service Worker cache les réponses GET /api/v1/projects/*/nodes
   → Strategy : NetworkFirst avec fallback cache (TTL 1h)

4. CRÉATION document offline
   → Document créé localement dans IndexedDB avec ID temporaire (offline_*)
   → Marqué "pending_sync" dans Dexie
   → À la reconnexion → POST /api/v1/documents → ID réel → remplace ID temporaire
   → Possible uniquement si le template est dans le cache

5. DASHBOARDS (données figées)
   → Les widgets affichent les données du dernier snapshot
   → Indicateur "Données du {date}" visible
   → Pas de refresh possible offline (normal)
*/

// Workbox Service Worker — stratégies de cache
// src/sw.ts

import { registerRoute } from "workbox-routing"
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from "workbox-strategies"
import { BackgroundSyncPlugin } from "workbox-background-sync"

// API : NetworkFirst — fraîcheur prioritaire
registerRoute(
    ({ url }) => url.pathname.startsWith("/api/v1/"),
    new NetworkFirst({
        cacheName: "api-cache",
        networkTimeoutSeconds: 5,
        plugins: [{
            cacheWillUpdate: async ({ response }) =>
                response.status === 200 ? response : null,
        }],
    })
)

// Assets statiques : CacheFirst
registerRoute(
    ({ request }) => ["style", "script", "font"].includes(request.destination),
    new CacheFirst({ cacheName: "static-assets" })
)

// Background Sync — mutations offline en attente
const bgSyncPlugin = new BackgroundSyncPlugin("mutations-queue", {
    maxRetentionTime: 24 * 60,  // 24h max
})

// POST/PATCH/DELETE → mis en queue si offline
registerRoute(
    ({ request }) =>
        ["POST", "PATCH", "DELETE"].includes(request.method) &&
        request.url.includes("/api/v1/"),
    new NetworkFirst({ plugins: [bgSyncPlugin] }),
    "POST"
)
```

```typescript
// src/lib/offline/dexieDb.ts — IndexedDB schema

import Dexie from "dexie"

export class OpsFluxDB extends Dexie {
    documents!: Dexie.Table<CachedDocument, string>
    pendingSync!: Dexie.Table<PendingSyncItem, string>
    navigationCache!: Dexie.Table<CachedNavItem, string>
    dashboardSnapshots!: Dexie.Table<DashboardSnapshot, string>

    constructor() {
        super("opsflux_offline")
        this.version(1).stores({
            documents:         "id, tenant_id, updated_at, last_accessed",
            pendingSync:       "id, object_type, action, created_at",
            navigationCache:   "id, project_id, cached_at",
            dashboardSnapshots: "id, dashboard_id, cached_at",
        })
    }
}

export const offlineDb = new OpsFluxDB()

// Mettre en cache un document consulté (auto sur chaque ouverture)
export const cacheDocumentForOffline = async (doc: Document) => {
    await offlineDb.documents.put({
        ...doc,
        last_accessed: Date.now(),
    })
    // Garder max 20 documents en cache — supprimer les plus anciens
    const count = await offlineDb.documents.count()
    if (count > 20) {
        const oldest = await offlineDb.documents
            .orderBy("last_accessed").first()
        if (oldest) await offlineDb.documents.delete(oldest.id)
    }
}
```

---

### 28.4 Share Links — Token + Magic Link email

**Décision :** Token signé dans l'URL + email de confirmation (magic link).

```python
# app/services/core/share_link_service.py

async def create_share_link(
    object_type: str,
    object_id: str,
    permission: str,         # "view" | "fill_form" | "download"
    created_by: str,
    tenant_id: str,
    expires_in_days: int = 30,
    recipient_emails: list[str] = None,
    password: str = None,    # optionnel
    db: AsyncSession = None,
) -> ShareLink:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(days=expires_in_days)

    link = ShareLink(
        token=token,
        tenant_id=UUID(tenant_id),
        object_type=object_type,
        object_id=UUID(object_id),
        permission=permission,
        created_by=UUID(created_by),
        expires_at=expires_at,
        recipient_emails=recipient_emails or [],
        password_hash=hash_password(password) if password else None,
        requires_email_confirmation=bool(recipient_emails),
    )
    db.add(link)
    await db.commit()

    share_url = f"{settings.WEB_URL}/share/{token}"

    # Si destinataires spécifiés → envoyer magic link par email
    if recipient_emails:
        for email in recipient_emails:
            # Générer un sous-token d'accès par email
            access_token = generate_signed_token({
                "share_token": token,
                "email": email,
                "exp": expires_at.timestamp(),
            })
            await email_service.queue(
                to=[email],
                template_key="system.share_link_invitation",
                context={
                    "share_url": f"{share_url}?access={access_token}",
                    "object_type": object_type,
                    "expires_at": expires_at.strftime("%d/%m/%Y"),
                    "permission_label": PERMISSION_LABELS[permission],
                },
                tenant_id=tenant_id,
            )

    return link, share_url


# Validation de l'accès sur web.opsflux.io
@router.get("/share/{token}")
async def validate_share_link(
    token: str,
    access: Optional[str] = None,   # sous-token email si magic link
    db: AsyncSession = Depends(get_db),
):
    link = await db.execute(
        select(ShareLink).where(
            ShareLink.token == token,
            ShareLink.is_active == True,
            ShareLink.expires_at > datetime.utcnow(),
        )
    ).scalar_one_or_none()

    if not link:
        raise HTTPException(404, "Lien invalide ou expiré")

    # Si magic link requis → valider le sous-token email
    if link.requires_email_confirmation:
        if not access:
            # Proposer de saisir son email pour recevoir le lien
            return {"requires_email": True, "token": token}

        # Valider le sous-token
        try:
            payload = verify_signed_token(access)
            if payload["share_token"] != token:
                raise ValueError("Token mismatch")
        except Exception:
            raise HTTPException(403, "Accès non autorisé à ce lien")

    # Logger l'accès
    db.add(ShareLinkAccess(
        share_link_id=link.id,
        accessed_at=datetime.utcnow(),
        ip_address=request.client.host,
    ))
    await db.commit()

    return {
        "valid": True,
        "object_type": link.object_type,
        "object_id": str(link.object_id),
        "permission": link.permission,
    }
```

---

### 28.5 Object Relations — Bidirectionnel

**Décision :** Depuis asset ET depuis document — la relation est visible des deux côtés.

```python
# Table object_relations (déjà dans le Core)
# from_type, from_id, to_type, to_id, relation_type

# Création depuis la fiche asset :
# POST /api/v1/relations
# { from_type: "asset", from_id: "uuid", to_type: "document", to_id: "uuid",
#   relation_type: "documented_by" }

# Création depuis la fiche document :
# POST /api/v1/relations
# { from_type: "document", from_id: "uuid", to_type: "asset", to_id: "uuid",
#   relation_type: "concerns" }

# Résolution bidirectionnelle :
async def get_related_objects(
    object_type: str, object_id: str, tenant_id: str, db: AsyncSession
) -> list[dict]:
    """Retourne tous les objets liés dans les deux sens."""
    result = await db.execute(
        select(ObjectRelation).where(
            ObjectRelation.tenant_id == UUID(tenant_id),
            or_(
                and_(ObjectRelation.from_type == object_type,
                     ObjectRelation.from_id == UUID(object_id)),
                and_(ObjectRelation.to_type == object_type,
                     ObjectRelation.to_id == UUID(object_id)),
            )
        )
    )
    return result.scalars().all()
```

```tsx
// Dans la fiche Asset — onglet "Documents"
const AssetDocumentsTab = ({ assetId }) => {
    const { data: relations } = useQuery({
        queryKey: ["relations", "asset", assetId],
        queryFn: () => api.get(`/api/v1/relations?object_type=asset&object_id=${assetId}`)
            .then(r => r.data.filter(r => r.related_type === "document")),
    })
    return (
        <div className="space-y-3">
            <div className="flex justify-end">
                <Button size="sm" onClick={() => setShowPicker(true)}>
                    <Link2 className="h-3.5 w-3.5 mr-1.5" />
                    Lier un document
                </Button>
            </div>
            <DataTable data={relations} columns={documentRelationColumns} />
            {showPicker && (
                <ObjectPickerModal
                    objectType="document"
                    onSelect={(doc) => createRelation("asset", assetId, "document", doc.id)}
                    onClose={() => setShowPicker(false)}
                />
            )}
        </div>
    )
}

// Dans la fiche Document — champ "Assets concernés" dans le FormBlock
// Champ type "reference" avec object_type="asset" → même picker
```

---

### 28.6 Export PDF — Job ARQ asynchrone

**Décision :** ARQ asynchrone. L'user reçoit une notification in-app + email quand le PDF est prêt.

```python
# app/api/routes/core/export.py

@router.post("/export/pdf")
async def request_pdf_export(
    body: ExportPDFRequest,   # document_id, options
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Lance un job ARQ et retourne immédiatement un job_id."""
    job = await arq_queue.enqueue(
        "generate_pdf_export",
        document_id=body.document_id,
        options=body.options or {},
        user_id=request.state.user_id,
        tenant_id=request.state.tenant_id,
        _queue_name="default",
    )
    return {
        "job_id": job.job_id,
        "status": "queued",
        "message": "Export en cours. Vous serez notifié quand le PDF sera prêt.",
    }


@router.get("/export/jobs/{job_id}")
async def get_export_job_status(job_id: str, request: Request):
    """Polling du statut du job (utilisé par le frontend)."""
    job_info = await arq_queue.job(job_id)
    if not job_info:
        raise HTTPException(404, "Job introuvable")
    return {
        "job_id": job_id,
        "status": job_info.status,   # queued | in_progress | complete | failed
        "result": job_info.result,   # {"download_url": "..."} si complete
    }
```

```python
# app/workers/export_worker.py

async def generate_pdf_export(ctx: dict, document_id: str,
                               options: dict, user_id: str, tenant_id: str):
    """Job ARQ — génère le PDF via Puppeteer headless."""
    try:
        # 1. Récupérer le document + son contenu
        doc = await get_document_with_content(document_id, tenant_id)

        # 2. Générer le HTML depuis les blocs BlockNote + template
        html_content = await render_document_to_html(doc, options)

        # 3. Puppeteer → PDF
        pdf_bytes = await puppeteer_service.html_to_pdf(
            html=html_content,
            format=options.get("format", "A4"),
            margin={"top": "20mm", "bottom": "20mm",
                    "left": "15mm", "right": "15mm"},
        )

        # 4. Stocker dans le storage
        file_key = f"exports/{tenant_id}/{document_id}/{doc.number}_Rev{doc.revision}.pdf"
        download_url = await storage_service.upload(
            content=pdf_bytes,
            key=file_key,
            content_type="application/pdf",
            expires_in=24 * 3600,  # lien valable 24h
        )

        # 5. Notifier l'user
        await notify(
            user_id=user_id,
            template_key="system.export_ready",
            context={
                "document_number": doc.number,
                "download_url": download_url,
            },
            tenant_id=tenant_id,
        )

        return {"download_url": download_url, "filename": f"{doc.number}.pdf"}

    except Exception as e:
        await notify(
            user_id=user_id,
            template_key="system.export_failed",
            context={"document_number": document_id, "error": str(e)},
            tenant_id=tenant_id,
        )
        raise
```

```tsx
// Frontend — bouton Export avec polling
const ExportPDFButton = ({ documentId }) => {
    const [jobId, setJobId] = useState<string | null>(null)
    const [isExporting, setIsExporting] = useState(false)

    const startExport = async () => {
        setIsExporting(true)
        const { data } = await api.post("/api/v1/export/pdf", { document_id: documentId })
        setJobId(data.job_id)
    }

    // Polling du statut toutes les 2s
    useQuery({
        queryKey: ["export-job", jobId],
        queryFn: () => api.get(`/api/v1/export/jobs/${jobId}`).then(r => r.data),
        enabled: !!jobId,
        refetchInterval: 2000,
        onSuccess: (data) => {
            if (data.status === "complete") {
                setIsExporting(false)
                setJobId(null)
                // Déclencher le téléchargement
                window.open(data.result.download_url, "_blank")
                toast.success({ title: "PDF prêt.", action: {
                    label: "Télécharger",
                    onClick: () => window.open(data.result.download_url, "_blank"),
                }})
            }
            if (data.status === "failed") {
                setIsExporting(false)
                setJobId(null)
                toast.error({ title: "Erreur lors de la génération du PDF." })
            }
        },
    })

    return (
        <Button variant="outline" size="sm" onClick={startExport} disabled={isExporting}>
            {isExporting
                ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Génération...</>
                : <><FileDown className="h-3.5 w-3.5 mr-2" />Exporter PDF</>
            }
        </Button>
    )
}
```

---

### 28.7 ARQ WorkerSettings — 5 workers, 2 queues

```python
# app/workers/settings.py

from arq import cron
from arq.connections import RedisSettings

from app.workers.email_worker import send_email_job
from app.workers.notification_worker import send_notification_job
from app.workers.export_worker import generate_pdf_export
from app.workers.backup_worker import run_postgres_backup
from app.workers.rag_worker import index_document_for_rag
from app.workers.health_worker import check_infrastructure_health
from app.workers.deadline_worker import check_workflow_deadlines
from app.workers.connector_worker import run_connector_sync
from app.core.config import settings

# ─── 2 QUEUES ────────────────────────────────────────────────────

QUEUE_CRITICAL = "critical"   # emails, notifications — TTL court, priorité max
QUEUE_DEFAULT  = "default"    # exports PDF, indexation RAG, backups, connecteurs

# Les workers écoutent LES DEUX queues, mais QUEUE_CRITICAL en premier

class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(settings.REDIS_URL)

    # 5 workers en parallèle
    max_jobs = 5

    # Queues écoutées dans l'ordre de priorité
    queue_read_limit_pairs = [
        (QUEUE_CRITICAL, 10),   # max 10 jobs critiques simultanés
        (QUEUE_DEFAULT, 3),     # max 3 jobs lourds simultanés (Puppeteer, indexation)
    ]

    # Fonctions disponibles
    functions = [
        send_email_job,
        send_notification_job,
        generate_pdf_export,
        index_document_for_rag,
        run_connector_sync,
    ]

    # Crons
    cron_jobs = [
        cron(run_postgres_backup,        hour=2,  minute=30),
        cron(check_infrastructure_health, hour=8,  minute=0),
        cron(check_infrastructure_health, hour=14, minute=0),
        cron(check_workflow_deadlines,    hour=8,  minute=5),
    ]

    # Timeout par défaut et par job
    job_timeout = 300           # 5 min par défaut
    max_tries = 3               # 3 tentatives avant abandon
    keep_result = 3600          # garder les résultats 1h (pour le polling export)

    # Health
    health_check_interval = 30  # secondes entre chaque heartbeat du worker


# Usage dans les services :
# await arq_queue.enqueue("send_email_job", ..., _queue_name=QUEUE_CRITICAL)
# await arq_queue.enqueue("generate_pdf_export", ..., _queue_name=QUEUE_DEFAULT)
# await arq_queue.enqueue("index_document_for_rag", ..., _queue_name=QUEUE_DEFAULT)
```

---

### 28.8 Notifications — Lu individuel + global

```python
# app/api/routes/core/notifications.py

@router.patch("/{notification_id}/read")
async def mark_notification_read(notification_id: str, request: Request):
    """Marquer une notification individuelle comme lue."""
    await db.execute(
        update(Notification)
        .where(
            Notification.id == UUID(notification_id),
            Notification.user_id == UUID(request.state.user_id),
        )
        .values(is_read=True, read_at=datetime.utcnow())
    )
    await db.commit()
    # Décrémenter le compteur non-lus dans Redis
    await redis_client.decr(f"notif_unread:{request.state.user_id}")
    return {"status": "ok"}


@router.post("/read-all")
async def mark_all_notifications_read(request: Request):
    """Marquer toutes les notifications comme lues d'un coup."""
    await db.execute(
        update(Notification)
        .where(
            Notification.user_id == UUID(request.state.user_id),
            Notification.tenant_id == UUID(request.state.tenant_id),
            Notification.is_read == False,
        )
        .values(is_read=True, read_at=datetime.utcnow())
    )
    await db.commit()
    await redis_client.set(f"notif_unread:{request.state.user_id}", 0)
    # Notifier le badge sidebar via WebSocket
    await ws_manager.send_to_user(request.state.user_id, {
        "type": "unread_count", "count": 0
    })
    return {"status": "ok"}
```

```tsx
// Popover notifications — comportement

const NotificationsPopover = () => (
    <Popover>
        <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-8 w-8">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full
                        bg-destructive text-[10px] text-white flex items-center justify-center">
                        {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                )}
            </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between px-3 py-2 border-b">
                <span className="text-sm font-semibold">Notifications</span>
                {unreadCount > 0 && (
                    <Button variant="ghost" size="sm" className="text-xs h-6"
                        onClick={markAllRead}>
                        Tout marquer comme lu
                    </Button>
                )}
            </div>
            <div className="max-h-[360px] overflow-y-auto">
                {notifications.map(notif => (
                    <NotificationItem
                        key={notif.id}
                        notification={notif}
                        onRead={() => markOneRead(notif.id)}  // ← clic = lu
                    />
                ))}
            </div>
        </PopoverContent>
    </Popover>
)

// Marquer lu au clic sur la notification (pas besoin d'un bouton dédié)
const NotificationItem = ({ notification, onRead }) => (
    <div
        className={cn(
            "flex gap-3 px-3 py-2.5 cursor-pointer hover:bg-accent/50 transition-colors",
            !notification.is_read && "bg-primary/5"
        )}
        onClick={() => {
            onRead()
            if (notification.action_url) navigate(notification.action_url)
        }}
    >
        {!notification.is_read && (
            <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
            <p className="text-xs font-medium leading-snug">{notification.title}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {notification.body}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
                {formatRelativeTime(notification.created_at)}
            </p>
        </div>
    </div>
)
```

---

### 28.9 Custom Fields — Intégrés dans l'onglet Informations

**Décision :** Les custom fields apparaissent dans l'onglet "Informations" parmi les champs standards, sans distinction visuelle autre que leur position (après les champs standards).

```tsx
// Pattern dans AssetInformationsTab (et tous les objets avec extrafields)

const AssetInformationsTab = ({ asset, assetType }) => {
    const canEdit = useInlineEditPermission("asset", asset.id, "asset.edit")
    const { data: extraFields } = useExtraFields("asset", assetType.slug)

    return (
        <div className="p-4 space-y-6">
            {/* Champs standards définis par le type */}
            <section>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase
                    tracking-wider mb-3">
                    Informations générales
                </h3>
                <div className="space-y-2">
                    {assetType.fields.map(field => (
                        <InlineEditRow
                            key={field.key}
                            label={field.label[lang]}
                            value={asset.properties[field.key]}
                            fieldType={field.field_type}
                            canEdit={canEdit}
                            onSave={(v) => updateAssetProperty(asset.id, field.key, v)}
                        />
                    ))}
                </div>
            </section>

            {/* Custom Fields — intégrés sans séparation visuelle marquée */}
            {extraFields?.length > 0 && (
                <section>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase
                        tracking-wider mb-3">
                        Informations complémentaires
                    </h3>
                    <div className="space-y-2">
                        {extraFields.map(field => (
                            <InlineEditRow
                                key={field.field_key}
                                label={field.label[lang]}
                                value={asset.extra_values?.[field.field_key]}
                                fieldType={field.field_type}
                                canEdit={canEdit}
                                onSave={(v) => updateExtraField(
                                    "asset", asset.id, field.field_key, v
                                )}
                            />
                        ))}
                    </div>
                </section>
            )}
        </div>
    )
}

// ─── useExtraFields hook ────────────────────────────────────────
export const useExtraFields = (objectType: string, objectSlug?: string) => {
    return useQuery({
        queryKey: ["extra-fields", objectType, objectSlug],
        queryFn: () => api.get("/api/v1/extrafields", {
            params: { object_type: objectType, object_slug: objectSlug }
        }).then(r => r.data),
        staleTime: 10 * 60 * 1000,  // stable 10min — rarement modifié
    })
}
```

---

## RÉSUMÉ — Décisions lot 28

| # | Sujet | Décision |
|---|---|---|
| 28.1 | RBAC check_user_permission | Table user_roles + role_permissions. Cache Redis TTL 5min. invalidate_rbac_cache() après changement |
| 28.2 | TenantMiddleware | JWT auth + X-Tenant-ID switch (vérifié en DB, cache Redis 10min) |
| 28.3 | PWA Offline | 5 fonctionnalités : lecture, modification (Yjs), navigation, création, dashboards figés |
| 28.4 | Share Links auth | Token URL + magic link email avec sous-token signé par destinataire |
| 28.5 | Object Relations | Bidirectionnel — créable depuis asset OU document — visible des deux côtés |
| 28.6 | Export PDF | ARQ asynchrone — polling frontend 2s — notification + téléchargement à completion |
| 28.7 | ARQ Workers | 5 workers, 2 queues : critical (emails/notifs) + default (PDF/RAG/backup) |
| 28.8 | Notifications lu | Clic individuel (auto au clic) + bouton "Tout marquer comme lu" |
| 28.9 | Custom Fields placement | Section "Informations complémentaires" dans l'onglet Informations, après les champs standards |

---

## 29. Implémentations techniques manquantes

### 29.1 JWT OpsFlux — Payload exact

```python
# app/core/security.py

from jose import jwt, JWTError
from datetime import datetime, timedelta

ACCESS_TOKEN_EXPIRE_MINUTES = 480    # 8h
REFRESH_TOKEN_EXPIRE_DAYS = 7

def create_opsflux_jwt(
    user: User,
    tenant_id: str,
    user_role: str,
    bu_id: str | None = None,
) -> dict:
    """
    Génère les tokens OpsFlux après validation Azure AD.
    Retourne access_token + refresh_token.
    """
    now = datetime.utcnow()

    # ─── Access Token ────────────────────────────────────────────
    access_payload = {
        # Claims standard JWT
        "sub": str(user.id),              # user OpsFlux UUID
        "iat": now,
        "exp": now + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "jti": secrets.token_hex(16),     # unique token ID (révocation)

        # Claims OpsFlux custom
        "tenant_id": tenant_id,
        "role": user_role,
        "bu_id": bu_id,
        "name": user.full_name,
        "email": user.email,
        "type": "access",
    }

    # ─── Refresh Token (minimal — pas de claims sensibles) ───────
    refresh_payload = {
        "sub": str(user.id),
        "tenant_id": tenant_id,
        "iat": now,
        "exp": now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        "jti": secrets.token_hex(16),
        "type": "refresh",
    }

    return {
        "access_token": jwt.encode(access_payload, settings.SECRET_KEY, algorithm="HS256"),
        "refresh_token": jwt.encode(refresh_payload, settings.SECRET_KEY, algorithm="HS256"),
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


def decode_opsflux_jwt(token: str) -> dict:
    """
    Décode et valide un JWT OpsFlux.
    Utilisé dans TenantMiddleware et Hocuspocus.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        if payload.get("type") not in ("access", "service"):
            raise JWTError("Type de token invalide")
        return payload
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Token invalide : {e}")


def generate_signed_token(payload: dict) -> str:
    """Token signé générique (share links, service tokens, magic links)."""
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def verify_signed_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except JWTError as e:
        raise HTTPException(403, f"Token invalide : {e}")


# ─── Endpoint refresh token ───────────────────────────────────────
@router.post("/auth/refresh")
async def refresh_token(body: RefreshTokenRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_opsflux_jwt(body.refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(401, "Token de rafraîchissement invalide")

    user = await db.get(User, UUID(payload["sub"]))
    if not user or not user.is_active:
        raise HTTPException(401, "Utilisateur invalide")

    # Récupérer le rôle actuel (peut avoir changé)
    ut = await db.execute(
        select(UserTenant).where(
            UserTenant.user_id == user.id,
            UserTenant.tenant_id == UUID(payload["tenant_id"]),
            UserTenant.is_active == True,
        )
    ).scalar_one_or_none()

    if not ut:
        raise HTTPException(403, "Accès révoqué")

    return create_opsflux_jwt(user, payload["tenant_id"], ut.role,
                               str(ut.primary_bu_id) if ut.primary_bu_id else None)
```

---

### 29.2 ARQ Queue — Initialisation et accès global

```python
# app/core/arq.py

from arq import create_pool
from arq.connections import RedisSettings, ArqRedis
from app.core.config import settings

# Singleton global — initialisé au démarrage de l'app
_arq_pool: ArqRedis | None = None


async def init_arq_pool() -> ArqRedis:
    global _arq_pool
    _arq_pool = await create_pool(
        RedisSettings.from_dsn(settings.REDIS_URL),
        default_queue_name="default",
    )
    return _arq_pool


def get_arq_pool() -> ArqRedis:
    if _arq_pool is None:
        raise RuntimeError("ARQ pool non initialisé. Appeler init_arq_pool() au startup.")
    return _arq_pool


# Dans main.py lifespan :
# @asynccontextmanager
# async def lifespan(app: FastAPI):
#     await init_arq_pool()   ← ajouter ici
#     ...
#     yield


# Dependency FastAPI pour les routes qui en ont besoin
async def get_arq(arq: ArqRedis = Depends(get_arq_pool)) -> ArqRedis:
    return arq


# ─── Helper d'enqueue avec queue explicite ────────────────────────

from app.workers.settings import QUEUE_CRITICAL, QUEUE_DEFAULT

async def enqueue_critical(job_name: str, **kwargs):
    """Enqueue dans la queue prioritaire (emails, notifications)."""
    pool = get_arq_pool()
    return await pool.enqueue_job(job_name, _queue_name=QUEUE_CRITICAL, **kwargs)


async def enqueue_default(job_name: str, **kwargs):
    """Enqueue dans la queue standard (exports, indexation, backup)."""
    pool = get_arq_pool()
    return await pool.enqueue_job(job_name, _queue_name=QUEUE_DEFAULT, **kwargs)


# ─── Utilisation dans les services ───────────────────────────────

# Envoyer un email :
# await enqueue_critical("send_email_job", to=[...], template_key="...", context={...})

# Exporter un PDF :
# await enqueue_default("generate_pdf_export", document_id="...", user_id="...", tenant_id="...")

# Indexer un document pour le RAG :
# await enqueue_default("index_document_for_rag", document_id="...", revision_id="...", tenant_id="...")
```

---

### 29.3 PuppeteerService — Python → Node.js

```python
# app/services/core/puppeteer_service.py

import subprocess
import tempfile
import asyncio
from pathlib import Path

class PuppeteerService:
    """
    Génère des PDFs via Puppeteer (Node.js) depuis Python.
    Stratégie : appel subprocess vers un script Node.js dédié.
    Le script Node est inclus dans le repo à app/puppeteer/render.js
    """

    PUPPETEER_SCRIPT = Path(__file__).parent.parent.parent / "puppeteer" / "render.js"

    async def html_to_pdf(
        self,
        html: str,
        format: str = "A4",
        margin: dict = None,
        landscape: bool = False,
    ) -> bytes:
        """
        Convertit du HTML en PDF via Puppeteer.
        Retourne les bytes du PDF.
        """
        if margin is None:
            margin = {"top": "20mm", "bottom": "20mm",
                      "left": "15mm", "right": "15mm"}

        # Écrire le HTML dans un fichier temporaire
        with tempfile.NamedTemporaryFile(
            suffix=".html", mode="w", encoding="utf-8", delete=False
        ) as f:
            f.write(html)
            html_path = f.name

        output_path = html_path.replace(".html", ".pdf")

        try:
            # Appel Node.js Puppeteer
            options = {
                "format": format,
                "landscape": landscape,
                "margin": margin,
                "printBackground": True,    # inclure les couleurs de fond CSS
            }

            proc = await asyncio.create_subprocess_exec(
                "node", str(self.PUPPETEER_SCRIPT),
                html_path, output_path,
                json.dumps(options),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)

            if proc.returncode != 0:
                raise RuntimeError(
                    f"Puppeteer error (code {proc.returncode}): {stderr.decode()}"
                )

            return Path(output_path).read_bytes()

        finally:
            Path(html_path).unlink(missing_ok=True)
            Path(output_path).unlink(missing_ok=True)


puppeteer_service = PuppeteerService()
```

```javascript
// app/puppeteer/render.js
// Script Node.js appelé par Python

const puppeteer = require("puppeteer")
const fs = require("fs")

async function render(htmlPath, outputPath, optionsJson) {
    const options = JSON.parse(optionsJson)

    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",   // important dans Docker
        ],
    })

    const page = await browser.newPage()

    // Charger le HTML depuis le fichier (supporte les assets locaux)
    await page.goto(`file://${htmlPath}`, { waitUntil: "networkidle0" })

    // Attendre que les fonts et images soient chargées
    await page.evaluate(() => document.fonts.ready)

    await page.pdf({
        path: outputPath,
        format: options.format || "A4",
        landscape: options.landscape || false,
        margin: options.margin || {},
        printBackground: options.printBackground !== false,
    })

    await browser.close()
    process.exit(0)
}

const [,, htmlPath, outputPath, optionsJson] = process.argv
render(htmlPath, outputPath, optionsJson || "{}").catch(err => {
    console.error(err)
    process.exit(1)
})
```

```dockerfile
# Ajouter dans backend/Dockerfile (stage runtime)
# Puppeteer nécessite Chrome/Chromium + Node.js

RUN apt-get update && apt-get install -y --no-install-recommends \
    nodejs npm \
    chromium \
    fonts-liberation fonts-noto \
    && rm -rf /var/lib/apt/lists/*

# Variables pour Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Installer les dépendances Node pour Puppeteer
COPY puppeteer/package.json /app/puppeteer/
RUN cd /app/puppeteer && npm install --production
```

```json
// app/puppeteer/package.json
{
    "name": "opsflux-puppeteer",
    "version": "1.0.0",
    "dependencies": {
        "puppeteer-core": "^22.0.0"
    }
}
```

---

### 29.4 render_document_to_html() — Rendu BlockNote → HTML

```python
# app/services/core/document_renderer.py

async def render_document_to_html(
    doc: Document,
    revision: Revision,
    options: dict = None,
) -> str:
    """
    Transforme un document OpsFlux (BlockNote JSON) en HTML complet pour Puppeteer.
    Gère les 3 blocs custom : CartoucheBlock, FormBlock, DynamicDataBlock.
    """
    blocks = revision.content.get("content") or revision.content.get("blocks") or []

    html_parts = [get_document_html_head(doc, options)]
    html_parts.append('<div class="document-body">')

    for block in blocks:
        html_parts.append(await render_block_to_html(block, doc, revision))

    html_parts.append("</div></body></html>")
    return "\n".join(html_parts)


async def render_block_to_html(block: dict, doc: Document, revision: Revision) -> str:
    block_type = block.get("type", "paragraph")

    # ─── Blocs natifs BlockNote ──────────────────────────────────
    if block_type == "heading":
        level = block.get("props", {}).get("level", 1)
        text = extract_inline_text(block.get("content", []))
        return f"<h{level}>{text}</h{level}>"

    elif block_type == "paragraph":
        text = extract_inline_text(block.get("content", []))
        return f"<p>{text}</p>"

    elif block_type == "bulletListItem":
        text = extract_inline_text(block.get("content", []))
        return f"<li>{text}</li>"

    elif block_type == "table":
        return render_table_block(block)

    elif block_type == "image":
        url = block.get("props", {}).get("url", "")
        alt = block.get("props", {}).get("caption", "")
        return f'<img src="{url}" alt="{alt}" class="doc-image"/>'

    # ─── Bloc CARTOUCHE ──────────────────────────────────────────
    elif block_type == "cartouche":
        return render_cartouche_html(doc)

    # ─── Bloc FORMULAIRE ─────────────────────────────────────────
    elif block_type == "form_block":
        fields = json.loads(block.get("props", {}).get("fields_json", "[]"))
        form_data = revision.form_data or {}
        title = block.get("props", {}).get("section_title", "")
        return render_form_block_html(title, fields, form_data)

    # ─── Bloc DONNÉES DYNAMIQUES ─────────────────────────────────
    elif block_type == "dynamic_data":
        # En export : TOUJOURS utiliser le snapshot figé
        snapshot_raw = block.get("props", {}).get("snapshot_data", "[]")
        snapshot = json.loads(snapshot_raw) if snapshot_raw else []
        title = block.get("props", {}).get("title", "")
        display_type = block.get("props", {}).get("display_type", "table")
        last_synced = block.get("props", {}).get("last_synced_at", "")
        return render_dynamic_data_html(title, snapshot, display_type, last_synced)

    return ""  # bloc inconnu → ignorer


def render_cartouche_html(doc: Document) -> str:
    """Cartouche officiel Perenco en HTML."""
    rev = doc.revision or "0"
    status_labels = {
        "draft": "Brouillon", "approved": "Approuvé",
        "published": "Publié", "in_review": "En révision",
    }
    return f"""
<table class="cartouche" border="1" cellpadding="4" cellspacing="0"
    style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:10px;">
  <tr>
    <td rowspan="2" style="width:80px;text-align:center;vertical-align:middle;">
      <img src="/static/logo-perenco.png" style="height:40px;"/>
    </td>
    <td colspan="3" style="text-align:center;font-weight:bold;font-size:13px;padding:8px;">
      {doc.title}
    </td>
    <td style="width:110px;text-align:center;">
      <div style="font-size:9px;color:#666;">N° Document</div>
      <div style="font-family:monospace;font-weight:bold;">{doc.number}</div>
    </td>
  </tr>
  <tr>
    <td style="width:70px;text-align:center;">
      <div style="font-size:9px;color:#666;">Révision</div>
      <strong>{rev}</strong>
    </td>
    <td style="width:100px;text-align:center;">
      <div style="font-size:9px;color:#666;">Statut</div>
      <strong>{status_labels.get(doc.status, doc.status)}</strong>
    </td>
    <td style="text-align:center;">
      <div style="font-size:9px;color:#666;">Date</div>
      <strong>{doc.updated_at.strftime("%d/%m/%Y") if doc.updated_at else "—"}</strong>
    </td>
    <td style="text-align:center;">
      <div style="font-size:9px;color:#666;">Classification</div>
      <strong>{doc.classification or "Interne"}</strong>
    </td>
  </tr>
</table>"""


def render_form_block_html(title: str, fields: list, form_data: dict) -> str:
    """Section formulaire en tableau HTML."""
    rows = ""
    for field in fields:
        label = field.get("label", {}).get("fr", field.get("key", ""))
        value = form_data.get(field["key"], "—") or "—"
        req = field.get("is_required", False)
        rows += f"""
    <tr>
      <td style="width:35%;font-weight:{'600' if req else '400'};
          padding:4px 8px;background:#f8f9fa;border:1px solid #dee2e6;">
        {label}
      </td>
      <td style="padding:4px 8px;border:1px solid #dee2e6;">{value}</td>
    </tr>"""

    return f"""
<div class="form-section" style="margin-bottom:16px;">
  <div style="font-size:11px;font-weight:600;margin-bottom:6px;
      padding:4px 8px;background:#e9ecef;">{title}</div>
  <table style="width:100%;border-collapse:collapse;font-size:10px;">
    {rows}
  </table>
</div>"""


def render_dynamic_data_html(
    title: str, data: list, display_type: str, last_synced: str
) -> str:
    """Données dynamiques figées (snapshot) en HTML."""
    synced_label = ""
    if last_synced:
        try:
            dt = datetime.fromisoformat(last_synced)
            synced_label = f" — données du {dt.strftime('%d/%m/%Y %H:%M')}"
        except ValueError:
            pass

    header = f"""
<div class="dynamic-block" style="margin-bottom:16px;border:1px solid #dee2e6;
    border-radius:4px;overflow:hidden;">
  <div style="font-size:10px;font-weight:600;padding:4px 8px;
      background:#f8f9fa;border-bottom:1px solid #dee2e6;">
    {title}{synced_label}
  </div>"""

    if not data:
        return header + '<div style="padding:8px;font-size:10px;color:#666;">Aucune donnée disponible.</div></div>'

    if display_type == "kpi":
        first = data[0] if data else {}
        value = list(first.values())[0] if first else "—"
        return header + f'<div style="padding:16px;text-align:center;font-size:28px;font-weight:bold;">{value}</div></div>'

    # Table (défaut pour chart aussi — PDF ne peut pas afficher un graphe interactif)
    if not data:
        return header + "</div>"

    cols = list(data[0].keys())
    th_row = "".join(
        f'<th style="padding:4px 8px;background:#f8f9fa;border:1px solid #dee2e6;'
        f'font-size:10px;text-align:left;">{col}</th>'
        for col in cols
    )
    td_rows = ""
    for row in data[:50]:  # max 50 lignes en PDF
        cells = "".join(
            f'<td style="padding:4px 8px;border:1px solid #dee2e6;font-size:10px;">'
            f'{row.get(col, "")}</td>'
            for col in cols
        )
        td_rows += f"<tr>{cells}</tr>"

    if len(data) > 50:
        td_rows += f'<tr><td colspan="{len(cols)}" style="padding:4px 8px;font-size:10px;color:#666;">' \
                   f'... {len(data) - 50} lignes supplémentaires (voir le document en ligne)</td></tr>'

    return header + f"""
  <table style="width:100%;border-collapse:collapse;">
    <thead><tr>{th_row}</tr></thead>
    <tbody>{td_rows}</tbody>
  </table>
</div>"""


def get_document_html_head(doc: Document, options: dict = None) -> str:
    """En-tête HTML + CSS pour le rendu PDF."""
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{doc.number} — {doc.title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: 'Inter', Arial, sans-serif;
      font-size: 11px;
      line-height: 1.5;
      color: #1a1a1a;
      padding: 0;
    }}
    .document-body {{
      padding: 0;
    }}
    h1 {{ font-size: 18px; font-weight: 700; margin: 16px 0 8px; }}
    h2 {{ font-size: 15px; font-weight: 600; margin: 14px 0 6px; }}
    h3 {{ font-size: 13px; font-weight: 600; margin: 12px 0 4px; }}
    p  {{ margin-bottom: 8px; }}
    .doc-image {{ max-width: 100%; height: auto; margin: 8px 0; }}
    @page {{
      size: {options.get('format', 'A4') if options else 'A4'};
      margin: 20mm 15mm;
    }}
  </style>
</head>
<body>"""
```

---

### 29.5 ObjectPickerModal — Composant universel

```tsx
// src/components/core/ObjectPickerModal.tsx
// Utilisé dans : workflow editor (assigner users/rôles), relations,
// listes de distribution, FormBlock (champ reference), Quick Entry

interface ObjectPickerModalProps {
    objectType: "user" | "document" | "asset" | "tiers" | "contact" | "project"
        | "equipment" | "template"
    title?: string
    multiple?: boolean                      // sélection multiple
    value?: string | string[]               // valeur(s) sélectionnée(s) actuelle(s)
    filters?: Record<string, any>           // filtres supplémentaires (ex: asset_type_slug)
    onSelect: (selected: ObjectPickerResult | ObjectPickerResult[]) => void
    onClose: () => void
}

interface ObjectPickerResult {
    id: string
    label: string           // nom principal affiché
    sublabel?: string       // info secondaire (email, code, type...)
    metadata?: Record<string, any>
}

export const ObjectPickerModal = ({
    objectType, title, multiple = false,
    value, filters, onSelect, onClose,
}: ObjectPickerModalProps) => {
    const [search, setSearch] = useState("")
    const [selected, setSelected] = useState<Set<string>>(
        new Set(Array.isArray(value) ? value : value ? [value] : [])
    )

    const { data, isLoading } = useQuery({
        queryKey: ["object-picker", objectType, search, filters],
        queryFn: () => api.get(`/api/v1/search/picker`, {
            params: { object_type: objectType, q: search, ...filters }
        }).then(r => r.data),
        debounce: 300,
    })

    const handleToggle = (item: ObjectPickerResult) => {
        if (!multiple) {
            onSelect(item)
            onClose()
            return
        }
        const next = new Set(selected)
        if (next.has(item.id)) next.delete(item.id)
        else next.add(item.id)
        setSelected(next)
    }

    const handleConfirm = () => {
        const selectedItems = (data?.items || []).filter(
            (item: ObjectPickerResult) => selected.has(item.id)
        )
        onSelect(multiple ? selectedItems : selectedItems[0])
        onClose()
    }

    const TITLES: Record<string, string> = {
        user:      "Sélectionner un utilisateur",
        document:  "Sélectionner un document",
        asset:     "Sélectionner un asset",
        tiers:     "Sélectionner un tiers",
        contact:   "Sélectionner un contact",
        project:   "Sélectionner un projet",
        equipment: "Sélectionner un équipement",
        template:  "Sélectionner un template",
    }

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>{title || TITLES[objectType]}</DialogTitle>
                </DialogHeader>

                {/* Recherche */}
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2
                        h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        autoFocus
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Rechercher..."
                        className="pl-8 h-8 text-sm"
                    />
                </div>

                {/* Résultats */}
                <div className="max-h-[320px] overflow-y-auto -mx-6 px-6">
                    {isLoading ? (
                        <div className="space-y-2 py-2">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <Skeleton key={i} className="h-10 rounded-md" />
                            ))}
                        </div>
                    ) : data?.items?.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">
                            Aucun résultat pour "{search}"
                        </p>
                    ) : (
                        <div className="space-y-0.5 py-1">
                            {data?.items?.map((item: ObjectPickerResult) => (
                                <button
                                    key={item.id}
                                    onClick={() => handleToggle(item)}
                                    className={cn(
                                        "w-full flex items-center gap-3 px-3 py-2 rounded-md",
                                        "text-left hover:bg-accent transition-colors",
                                        selected.has(item.id) && "bg-primary/10",
                                    )}
                                >
                                    {/* Avatar / icône selon le type */}
                                    <ObjectTypeAvatar
                                        objectType={objectType}
                                        label={item.label}
                                        className="h-7 w-7 flex-shrink-0"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">
                                            {item.label}
                                        </p>
                                        {item.sublabel && (
                                            <p className="text-xs text-muted-foreground truncate">
                                                {item.sublabel}
                                            </p>
                                        )}
                                    </div>
                                    {multiple && selected.has(item.id) && (
                                        <Check className="h-4 w-4 text-primary flex-shrink-0" />
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer multiple uniquement */}
                {multiple && (
                    <DialogFooter>
                        <span className="text-xs text-muted-foreground mr-auto">
                            {selected.size} sélectionné{selected.size > 1 ? "s" : ""}
                        </span>
                        <Button variant="outline" size="sm" onClick={onClose}>
                            Annuler
                        </Button>
                        <Button size="sm" onClick={handleConfirm}
                            disabled={selected.size === 0}>
                            Confirmer
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    )
}
```

```python
# Endpoint dédié pour le picker (recherche légère, pas de pagination lourde)
# app/api/routes/core/search.py

@router.get("/search/picker")
async def search_for_picker(
    object_type: str,
    q: str = "",
    limit: int = 20,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    **filters,
):
    """Recherche légère pour ObjectPickerModal."""
    tenant_id = request.state.tenant_id

    PICKER_QUERIES = {
        "user": (User, ["full_name", "email"],
                 lambda q: [User.full_name.ilike(f"%{q}%"), User.email.ilike(f"%{q}%")]),
        "document": (Document, ["number", "title"],
                     lambda q: [Document.number.ilike(f"%{q}%"), Document.title.ilike(f"%{q}%")]),
        "asset": (Asset, ["code", "name"],
                  lambda q: [Asset.code.ilike(f"%{q}%"), Asset.name.ilike(f"%{q}%")]),
        "contact": (Contact, ["first_name", "last_name", "professional_email"],
                    lambda q: [Contact.first_name.ilike(f"%{q}%"),
                               Contact.last_name.ilike(f"%{q}%")]),
        "equipment": (Equipment, ["tag", "description"],
                      lambda q: [Equipment.tag.ilike(f"%{q}%")]),
    }

    if object_type not in PICKER_QUERIES:
        raise HTTPException(400, f"object_type '{object_type}' non supporté pour le picker")

    model, _, filter_fn = PICKER_QUERIES[object_type]
    where_clauses = [
        getattr(model, "tenant_id") == UUID(tenant_id),
        getattr(model, "is_active") == True,
    ]
    if q:
        where_clauses.append(or_(*filter_fn(q)))

    result = await db.execute(
        select(model).where(*where_clauses).limit(limit)
    )
    items = result.scalars().all()

    return {
        "items": [
            {
                "id": str(item.id),
                "label": _get_picker_label(item, object_type),
                "sublabel": _get_picker_sublabel(item, object_type),
            }
            for item in items
        ]
    }


def _get_picker_label(item, object_type: str) -> str:
    labels = {
        "user":      lambda i: i.full_name,
        "document":  lambda i: f"{i.number} — {i.title}",
        "asset":     lambda i: f"{i.code} — {i.name}",
        "contact":   lambda i: f"{i.first_name} {i.last_name}",
        "equipment": lambda i: i.tag,
    }
    return labels.get(object_type, lambda i: str(i.id))(item)


def _get_picker_sublabel(item, object_type: str) -> str | None:
    sublabels = {
        "user":      lambda i: i.email,
        "document":  lambda i: i.status,
        "contact":   lambda i: i.professional_email,
        "equipment": lambda i: i.equipment_type,
    }
    fn = sublabels.get(object_type)
    return fn(item) if fn else None
```

---

## RÉSUMÉ — Lot 29

| # | Implémentation | Ce qui est maintenant défini |
|---|---|---|
| 29.1 | JWT OpsFlux | Payload exact (sub, tenant_id, role, bu_id, jti, type). Access 8h + refresh 7j. Endpoint /auth/refresh |
| 29.2 | ARQ Queue init | Singleton `_arq_pool`, `init_arq_pool()` au startup, `enqueue_critical()` + `enqueue_default()` helpers |
| 29.3 | PuppeteerService | Subprocess Python → Node.js `render.js`. Fichiers temp. Dockerfile avec chromium + node |
| 29.4 | render_document_to_html | Dispatch par type de bloc. CartoucheBlock → table HTML officiel. FormBlock → tableau. DynamicDataBlock → snapshot figé (table max 50 lignes) |
| 29.5 | ObjectPickerModal | Dialog avec search + liste résultats + sélection simple/multiple. Endpoint `/search/picker` dédié. Utilisable partout |
