# OpsFlux — 06_MODULE_TIERS.md
# Module Tiers — Spécification Complète

---

## 1. Modèle conceptuel complet

```
Tiers (= entreprise / organisation)
  ├── Attributs propres : raison sociale, RC, type, statut, secteur...
  ├── 1..N Adresses (type: principale, facturation, livraison, site)
  └── 0..N Contacts (personnes physiques rattachées)

Contact standalone (sans tiers associé)
  └── OpsFlux crée automatiquement un "Tiers virtuel" (is_virtual=True)
       ├── company_name = "{prenom} {nom}"
       ├── Même structure que Tiers
       └── Fusionnable avec un vrai Tiers ultérieurement

Cas d'usage :
  - Fournisseur avec plusieurs contacts commerciaux/techniques → Tiers + Contacts liés
  - Interlocuteur externe ponctuel → Contact standalone → Tiers virtuel auto
  - Sous-traitant avec équipe sur site → Tiers + Contacts + Documents liés
```

---

## 2. Manifest

```python
MODULE_MANIFEST = {
    "slug": "tiers",
    "version": "1.0.0",
    "depends_on": ["core"],

    "objects": [
        {
            "slug": "tiers",
            "capabilities": {
                "versioning": True,
                "attachments": True,          # contrats, certifications...
                "comments": True,
                "labels": True,
                "watch": True,
                "relations": True,            # lié à projets, assets, documents
                "search": True,
                "audit": True,
                "custom_fields": True,
                "categories": True,
                "geolocation": True,          # via adresses
                "export": True,
                "import": True,
            }
        },
        {
            "slug": "contact",
            "capabilities": {
                "versioning": False,
                "attachments": True,          # CV, certifications, cartes de visite
                "comments": True,
                "labels": False,
                "relations": True,
                "search": True,
                "audit": True,
                "custom_fields": True,
                "export": True,
                "import": True,
            }
        }
    ],

    "permissions": [
        "tiers.read", "tiers.create", "tiers.edit", "tiers.delete", "tiers.admin",
        "contact.read", "contact.create", "contact.edit",
    ],

    "menu_items": [
        {"zone": "sidebar", "label": "Tiers", "icon": "Building2",
         "route": "/tiers", "order": 45}
    ],

    "mcp_tools": [
        "search_tiers", "get_tiers", "create_tiers",
        "search_contacts", "get_contact",
        "get_tiers_contacts", "get_tiers_documents",
    ],

    "email_templates": [],

    "settings": [
        {"key": "default_tiers_type", "type": "select",
         "options": [{"value": "supplier", "label": "Fournisseur"},
                     {"value": "partner", "label": "Partenaire"},
                     {"value": "client", "label": "Client"},
                     {"value": "subcontractor", "label": "Sous-traitant"},
                     {"value": "other", "label": "Autre"}],
         "default": "supplier", "scope": "tenant"},
        {"key": "auto_create_virtual_tiers", "type": "toggle",
         "default": True, "scope": "tenant",
         "description": {"fr": "Créer automatiquement un tiers virtuel pour les contacts standalone"}},
    ],

    "migrations_path": "alembic/versions/",
}
```

---

## 3. Modèle de données complet

```sql
-- ─── TIERS (entreprises / organisations) ─────────────────────────

CREATE TABLE tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    bu_id UUID REFERENCES business_units(id),

    -- Identification
    company_name VARCHAR(500) NOT NULL,
    short_name VARCHAR(100),                -- ex: "Schlumberger" pour "Schlumberger Ltd"
    legal_form VARCHAR(50),                 -- SARL, SA, SAS, Ltd, Inc...
    registration_number VARCHAR(100),       -- RCCM, SIRET, Company number...
    tax_number VARCHAR(100),               -- Numéro TVA, NIF...

    -- Classification
    tiers_type VARCHAR(50) NOT NULL DEFAULT 'other',
    -- supplier | partner | client | subcontractor | government | ngo | other
    tiers_category VARCHAR(100),           -- sous-catégorie libre (ex: "Forage", "Inspection")
    industry_sector VARCHAR(100),
    -- Oil & Gas | Engineering | Logistics | IT | Finance | Legal | Medical | Other

    -- Coordonnées principales
    main_phone VARCHAR(50),
    main_email VARCHAR(255),
    website VARCHAR(255),

    -- Statut
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    -- active | inactive | blacklisted | pending_validation

    -- Données spéciales
    is_virtual BOOLEAN NOT NULL DEFAULT FALSE,
    -- TRUE = créé automatiquement pour un contact standalone
    -- Ne jamais afficher les virtuels dans les listes Tiers standard (filtre is_virtual = false)
    virtual_merged_at TIMESTAMPTZ,          -- date de fusion si le virtuel a été fusionné

    -- Notes
    notes TEXT,

    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tiers_tenant ON tiers(tenant_id, is_virtual, status);
CREATE INDEX idx_tiers_search ON tiers USING gin(to_tsvector('french', company_name || ' ' || COALESCE(short_name, '')));

-- ─── ADRESSES DES TIERS ──────────────────────────────────────────

CREATE TABLE tiers_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tiers_id UUID NOT NULL REFERENCES tiers(id) ON DELETE CASCADE,
    address_type VARCHAR(30) NOT NULL DEFAULT 'main',
    -- main | billing | shipping | site | registered
    label VARCHAR(100),                     -- ex: "Siège social", "Bureau Douala"

    -- Adresse structurée
    street_line1 VARCHAR(500),
    street_line2 VARCHAR(500),
    po_box VARCHAR(50),
    city VARCHAR(255),
    state_province VARCHAR(255),
    postal_code VARCHAR(20),
    country_code VARCHAR(2),                -- ISO 3166-1 alpha-2 (CM, GA, FR, UK...)
    country_name VARCHAR(100),              -- nom complet pour affichage

    -- Géolocalisation de l'adresse
    lat NUMERIC(10, 7),
    lng NUMERIC(10, 7),
    geocoded_at TIMESTAMPTZ,               -- quand la géo a été calculée

    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tiers_addresses_tiers ON tiers_addresses(tiers_id);

-- ─── CONTACTS (personnes physiques) ──────────────────────────────

CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tiers_id UUID REFERENCES tiers(id) ON DELETE SET NULL,
    -- NULL théoriquement impossible (on crée toujours un tiers virtuel)
    -- mais ON DELETE SET NULL pour robustesse

    -- Identité
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    salutation VARCHAR(20),                 -- M. | Mme | Dr. | Pr. | etc.
    gender VARCHAR(10),                     -- M | F | Other

    -- Fonction
    job_title VARCHAR(255),                 -- ex: "Ingénieur de forage"
    department VARCHAR(255),               -- ex: "Direction Technique"
    is_primary_contact BOOLEAN NOT NULL DEFAULT FALSE,
    -- Contact principal du tiers (interlocuteur par défaut)

    -- Coordonnées
    professional_email VARCHAR(255),
    personal_email VARCHAR(255),
    phone_office VARCHAR(50),
    phone_mobile VARCHAR(50),
    phone_fax VARCHAR(50),

    -- Certifications offshore (utilisé par PaxLog)
    offshore_certified BOOLEAN NOT NULL DEFAULT FALSE,
    medical_certificate_expiry DATE,
    safety_training_expiry DATE,
    huet_certificate_expiry DATE,          -- Helicopter Underwater Escape Training
    bosiet_certificate_expiry DATE,        -- Basic Offshore Safety Induction

    -- Statut
    status VARCHAR(20) NOT NULL DEFAULT 'active',   -- active | inactive | left_company

    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contacts_tiers ON contacts(tiers_id, status);
CREATE INDEX idx_contacts_tenant ON contacts(tenant_id, status);
CREATE INDEX idx_contacts_email ON contacts(professional_email) WHERE professional_email IS NOT NULL;
```

---

## 4. Logique Tiers Virtuel — Implémentation complète

```python
# app/services/modules/tiers_service.py

async def create_standalone_contact(
    data: ContactCreateSchema,
    tenant_id: str,
    user_id: str,
    db: AsyncSession,
) -> Contact:
    """
    Crée un contact sans tiers.
    Génère automatiquement un tiers virtuel sauf si auto_create_virtual_tiers = False.
    """
    setting = await get_module_setting("tiers", "auto_create_virtual_tiers", tenant_id, db)
    auto_create = setting if setting is not None else True

    if auto_create:
        # Créer le tiers virtuel
        virtual_tiers = Tiers(
            tenant_id=tenant_id,
            company_name=f"{data.first_name} {data.last_name}",
            short_name=f"{data.first_name[0]}. {data.last_name}",
            tiers_type="other",
            is_virtual=True,
            main_email=data.professional_email or data.personal_email,
            main_phone=data.phone_mobile or data.phone_office,
            created_by=user_id,
        )
        db.add(virtual_tiers)
        await db.flush()  # obtenir l'ID sans commit
        tiers_id = virtual_tiers.id
    else:
        tiers_id = None

    # Créer le contact
    contact = Contact(
        tenant_id=tenant_id,
        tiers_id=tiers_id,
        first_name=data.first_name,
        last_name=data.last_name,
        salutation=data.salutation,
        job_title=data.job_title,
        department=data.department,
        professional_email=data.professional_email,
        personal_email=data.personal_email,
        phone_office=data.phone_office,
        phone_mobile=data.phone_mobile,
        is_primary_contact=True,  # seul contact du tiers virtuel = primaire
        created_by=user_id,
    )
    db.add(contact)
    await db.commit()

    # Logger l'activité
    if tiers_id:
        await log_activity(tenant_id, user_id, "tiers", tiers_id, "virtual_tiers_created",
                          {"contact_id": str(contact.id), "reason": "standalone_contact"})

    return contact


async def merge_virtual_into_real_tiers(
    virtual_tiers_id: str,
    real_tiers_id: str,
    tenant_id: str,
    user_id: str,
    db: AsyncSession,
) -> None:
    """
    Fusionne un tiers virtuel dans un tiers réel.

    Opérations :
    1. Rattacher tous les contacts du virtuel au tiers réel
    2. Transférer les attachments vers le tiers réel
    3. Transférer les object_relations
    4. Marquer le tiers virtuel comme fusionné (ne pas supprimer — audit trail)
    5. Logger l'opération
    """
    # Vérification : le tiers virtuel doit être virtuel et du bon tenant
    virtual = await db.get(Tiers, virtual_tiers_id)
    if not virtual or not virtual.is_virtual or virtual.tenant_id != tenant_id:
        raise ValueError("Tiers virtuel introuvable ou non accessible")

    real = await db.get(Tiers, real_tiers_id)
    if not real or real.tenant_id != tenant_id:
        raise ValueError("Tiers réel introuvable ou non accessible")

    # 1. Rattacher les contacts
    await db.execute(
        update(Contact)
        .where(Contact.tiers_id == virtual_tiers_id)
        .values(tiers_id=real_tiers_id)
    )

    # 2. Transférer les attachments
    await db.execute(
        update(ObjectAttachment)
        .where(
            ObjectAttachment.object_type == "tiers",
            ObjectAttachment.object_id == UUID(virtual_tiers_id)
        )
        .values(object_id=UUID(real_tiers_id))
    )

    # 3. Transférer les relations
    await db.execute(
        update(ObjectRelation)
        .where(
            ObjectRelation.from_type == "tiers",
            ObjectRelation.from_id == UUID(virtual_tiers_id)
        )
        .values(from_id=UUID(real_tiers_id))
    )
    await db.execute(
        update(ObjectRelation)
        .where(
            ObjectRelation.to_type == "tiers",
            ObjectRelation.to_id == UUID(virtual_tiers_id)
        )
        .values(to_id=UUID(real_tiers_id))
    )

    # 4. Marquer le virtuel comme fusionné (ne pas supprimer)
    virtual.virtual_merged_at = datetime.utcnow()
    virtual.status = "inactive"
    virtual.notes = f"Fusionné dans {real.company_name} ({real_tiers_id}) le {datetime.utcnow().date()}"

    await db.commit()

    # 5. Logger
    await log_activity(tenant_id, user_id, "tiers", real_tiers_id, "virtual_tiers_merged",
                      {"virtual_tiers_id": virtual_tiers_id, "virtual_name": virtual.company_name})
```

---

## 5. UI — Composants React

### Fiche Tiers (vue détail)

```tsx
// src/pages/modules/tiers/TiersDetailPage.tsx

const TiersDetailPage = ({ tiersId }: { tiersId: string }) => {
    const { data: tiers } = useTiers(tiersId)
    const { data: contacts } = useTiersContacts(tiersId)
    const { data: documents } = useTiersDocuments(tiersId)

    if (!tiers) return <Skeleton />

    return (
        <div className="flex flex-col gap-4 p-4">
            {/* En-tête */}
            <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                    <h1 className="text-lg font-semibold truncate">{tiers.company_name}</h1>
                    {tiers.short_name && (
                        <p className="text-sm text-muted-foreground">{tiers.short_name}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                        <TiersTypeBadge type={tiers.tiers_type} />
                        <TiersStatusBadge status={tiers.status} />
                        {tiers.is_virtual && (
                            <Badge variant="outline" className="text-[10px]">Virtuel</Badge>
                        )}
                    </div>
                </div>
                <TiersActionMenu tiers={tiers} />
            </div>

            {/* Tabs */}
            <Tabs defaultValue="contacts">
                <TabsList>
                    <TabsTrigger value="contacts">
                        Contacts ({contacts?.length || 0})
                    </TabsTrigger>
                    <TabsTrigger value="addresses">Adresses</TabsTrigger>
                    <TabsTrigger value="documents">Documents</TabsTrigger>
                    <TabsTrigger value="info">Informations</TabsTrigger>
                </TabsList>

                <TabsContent value="contacts">
                    <ContactsList tiersId={tiersId} contacts={contacts} />
                </TabsContent>
                <TabsContent value="addresses">
                    <AddressesList tiersId={tiersId} />
                </TabsContent>
                <TabsContent value="documents">
                    {/* Documents OpsFlux liés à ce tiers via object_relations */}
                    <TiersDocumentsList tiersId={tiersId} />
                </TabsContent>
                <TabsContent value="info">
                    <TiersInfoForm tiers={tiers} />
                </TabsContent>
            </Tabs>
        </div>
    )
}
```

### Badges de type et statut

```tsx
const TIERS_TYPES = {
    supplier:       { label: "Fournisseur",     color: "bg-blue-100 text-blue-800" },
    partner:        { label: "Partenaire",       color: "bg-purple-100 text-purple-800" },
    client:         { label: "Client",           color: "bg-green-100 text-green-800" },
    subcontractor:  { label: "Sous-traitant",   color: "bg-amber-100 text-amber-800" },
    government:     { label: "Gouvernement",     color: "bg-gray-100 text-gray-800" },
    other:          { label: "Autre",            color: "bg-muted text-muted-foreground" },
}

const TIERS_STATUSES = {
    active:     { label: "Actif",              color: "bg-green-100 text-green-800" },
    inactive:   { label: "Inactif",            color: "bg-gray-100 text-gray-600" },
    blacklisted:{ label: "Liste noire",        color: "bg-red-100 text-red-800" },
    pending_validation: { label: "En validation", color: "bg-amber-100 text-amber-800" },
}
```

---

## 6. Import CSV Tiers et Contacts

```python
# Colonnes attendues pour l'import de Tiers
TIERS_IMPORT_COLUMNS = {
    "company_name": {"required": True, "type": "text"},
    "short_name": {"required": False, "type": "text"},
    "tiers_type": {"required": False, "type": "select",
                   "values": ["supplier", "partner", "client", "subcontractor", "other"]},
    "main_phone": {"required": False, "type": "phone"},
    "main_email": {"required": False, "type": "email"},
    "website": {"required": False, "type": "url"},
    "registration_number": {"required": False, "type": "text"},
    "city": {"required": False, "type": "text"},
    "country_code": {"required": False, "type": "text", "format": "ISO 3166-1 alpha-2"},
    "status": {"required": False, "type": "select",
               "values": ["active", "inactive"], "default": "active"},
}

# Colonnes attendues pour l'import de Contacts
CONTACTS_IMPORT_COLUMNS = {
    "first_name": {"required": True, "type": "text"},
    "last_name": {"required": True, "type": "text"},
    "company_name": {"required": False, "type": "text",
                     "description": "Nom du tiers existant — si vide, crée un tiers virtuel"},
    "job_title": {"required": False, "type": "text"},
    "professional_email": {"required": False, "type": "email"},
    "phone_mobile": {"required": False, "type": "phone"},
    "offshore_certified": {"required": False, "type": "boolean"},
    "medical_certificate_expiry": {"required": False, "type": "date", "format": "YYYY-MM-DD"},
}
```

---

## 7. Sync Exchange (Calendar module)

```python
# Cette fonctionnalité est dans le module Calendar mais utilise les Contacts du module Tiers

# GET /api/v1/calendar/sync/exchange/contacts
async def sync_exchange_contacts(tenant_id: str, user_id: str, db: AsyncSession):
    """
    Synchronise les contacts Exchange/Outlook avec le module Tiers.
    Appelé lors de la configuration de la sync Exchange dans Settings.
    """
    exchange_config = await get_exchange_config(tenant_id, db)
    if not exchange_config:
        raise ValueError("Exchange non configuré pour ce tenant")

    # Récupérer les contacts via Microsoft Graph API
    graph_contacts = await microsoft_graph.list_contacts(exchange_config.access_token)

    for gc in graph_contacts:
        existing = await db.execute(
            select(Contact).where(
                Contact.tenant_id == tenant_id,
                Contact.professional_email == gc["emailAddresses"][0]["address"]
                    if gc.get("emailAddresses") else None
            )
        ).scalar_one_or_none()

        if not existing and gc.get("givenName") and gc.get("surname"):
            # Créer le contact (avec tiers virtuel auto si besoin)
            await create_standalone_contact(
                ContactCreateSchema(
                    first_name=gc["givenName"],
                    last_name=gc["surname"],
                    job_title=gc.get("jobTitle"),
                    professional_email=gc["emailAddresses"][0]["address"] if gc.get("emailAddresses") else None,
                    phone_mobile=gc["mobilePhone"],
                    phone_office=gc["businessPhones"][0] if gc.get("businessPhones") else None,
                ),
                tenant_id=tenant_id,
                user_id=user_id,
                db=db,
            )
```

---

## 8. PDCA — Phase Tiers (Phase 2, inclus avec Asset Registry)

| Étape | Tâche | Critère de validation | Effort |
|---|---|---|---|
| PLAN | ERD Tiers + Contacts + Adresses + logique virtuel | ERD validé, cas de fusion documenté | 1j |
| DO | API CRUD Tiers : list/get/create/update/archive | Tests pytest : 0 erreur sur CRUD complet | 2j |
| DO | API CRUD Contacts : list/get/create (avec tiers virtuel auto) | Créer contact → tiers virtuel créé auto en DB | 2j |
| DO | API fusion tiers virtuel → réel | Fusion : contacts et PJ transférés, virtuel marqué | 1j |
| DO | UI Liste Tiers avec filtres (type, statut, secteur) | Filtrer les fournisseurs actifs de la BU courante | 2j |
| DO | UI Fiche Tiers avec tabs (Contacts, Adresses, Documents, Info) | Fiche complète avec timeline Core | 3j |
| DO | UI Formulaire Contact avec création tiers virtuel auto | Toast "Tiers virtuel créé" si pas de tiers sélectionné | 2j |
| DO | Import CSV : Tiers et Contacts avec mapping visuel | Import 50 fournisseurs, rapport d'erreurs clair | 2j |
| DO | Modal fusion tiers virtuel → tiers réel | Fusion complète sans perte de données | 1j |
| CHECK | Scénario : créer contact "Jean Dupont" sans tiers → tiers virtuel créé → fusionner dans "Schlumberger SA" → contacts transférés | Toutes les données cohérentes, audit trail présent | 1j |
| ACT | Importer les principaux fournisseurs Perenco depuis Excel existant | Au moins 20 tiers réels importés par l'admin | 1j |
