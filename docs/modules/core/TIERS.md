# Module Tiers -- Specification Fusionnee

## 1. Role et positionnement

Le module Tiers est le **referentiel des entreprises, partenaires et organisations externes** d'OpsFlux. Il gere les sous-traitants, fournisseurs, prestataires et tout tiers interagissant avec les operations.

Il est distinct de la gestion des utilisateurs internes (module Auth/IAM). Un Tiers est une **entite externe** -- elle peut avoir des PAX enregistres dans PaxLog, des colis dans TravelWiz, et des imputations dans les projets.

**Multi-tenancy :** Tenant (schema PG) > Entity (entity_id) > BU.
**ORM :** SQLAlchemy 2.0 async.
**Event bus :** PostgreSQL LISTEN/NOTIFY.
**Domaines :** *.opsflux.io
**Architecture :** Module core, extensible par les modules metier (PaxLog ajoute compliance stats, TravelWiz ajoute suivi colis).

---

## 2. Modele conceptuel complet

```
Tiers (= entreprise / organisation)
  |-- Attributs propres : raison sociale, RC, type, statut, secteur...
  |-- 1..N Adresses (type: principale, facturation, livraison, site)
  +-- 0..N Contacts (personnes physiques rattachees)

Contact standalone (sans tiers associe)
  +-- OpsFlux cree automatiquement un "Tiers virtuel" (is_virtual=True)
       |-- company_name = "{prenom} {nom}"
       |-- Meme structure que Tiers
       +-- Fusionnable avec un vrai Tiers ulterieurement

Donnees etendues par modules metier :
  PaxLog ajoute :
    - Nombre de PAX actifs
    - Taux de compliance HSE moyen
    - Nombre d'AdS en cours
    - Nombre de signalements actifs
    - Taux de no-show sur 12 mois
  TravelWiz ajoute :
    - Nombre de colis en transit
```

---

## 3. Manifest

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
                "relations": True,            # lie a projets, assets, documents
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
        "tiers.suspend", "tiers.blacklist",
        "contact.read", "contact.create", "contact.edit",
        "tiers.external_link.create", "tiers.external_link.revoke",
    ],

    "menu_items": [
        {"zone": "sidebar", "label": "Tiers", "icon": "Building2",
         "route": "/tiers", "order": 45}
    ],

    "mcp_tools": [
        "search_tiers", "get_tiers", "create_tiers",
        "search_contacts", "get_contact",
        "get_tiers_contacts", "get_tiers_documents",
        "get_tiers_compliance_summary", "get_tiers_pax",
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
         "description": "Creer automatiquement un tiers virtuel pour les contacts standalone"},
        {"key": "external_link_default_days", "type": "number",
         "default": 14, "scope": "tenant",
         "description": "Duree par defaut des liens de gestion d'equipe (jours)"},
        {"key": "validation_reminder_hours", "type": "number",
         "default": 48, "scope": "tenant",
         "description": "Delai avant rappel automatique au CHSE pour validation certifications"},
        {"key": "block_ads_on_expired_contract", "type": "toggle",
         "default": False, "scope": "tenant",
         "description": "Bloquer la creation d'AdS pour les PAX d'un Tiers dont le contrat est expire"},
        {"key": "certification_alert_days", "type": "number",
         "default": 90, "scope": "tenant",
         "description": "Nombre de jours avant expiration pour declencher les alertes certifications offshore"},
    ],

    "migrations_path": "alembic/versions/",
}
```

---

## 4. Modele de donnees complet

```sql
-- === TIERS (entreprises / organisations) ===

CREATE TABLE tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities(id),
    bu_id UUID REFERENCES business_units(id),

    -- Identification
    company_name VARCHAR(500) NOT NULL,
    short_name VARCHAR(100),
    code VARCHAR(50),                   -- code tiers unique
    legal_form VARCHAR(50),             -- SARL, SA, SAS, Ltd, Inc...
    registration_number VARCHAR(100),   -- RCCM, SIRET, Company number...
    tax_number VARCHAR(100),            -- Numero TVA, NIF...

    -- Classification
    tiers_type VARCHAR(50) NOT NULL DEFAULT 'other',
    -- supplier | partner | client | subcontractor | contractor |
    -- service_provider | transporter | government | ngo | other
    tiers_category VARCHAR(100),        -- sous-categorie libre (ex: "Forage", "Inspection")
    industry_sector VARCHAR(100),
    -- Oil & Gas | Engineering | Logistics | IT | Finance | Legal | Medical | Other

    -- Coordonnees principales
    main_phone VARCHAR(50),
    main_email VARCHAR(255),
    website VARCHAR(255),

    -- Contrat
    contract_expiry_date DATE,              -- date d'expiration du contrat

    -- Statut
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    -- active | inactive | suspended | blacklisted | pending_validation | archived

    -- Donnees speciales
    is_virtual BOOLEAN NOT NULL DEFAULT FALSE,
    -- TRUE = cree automatiquement pour un contact standalone
    virtual_merged_at TIMESTAMPTZ,

    -- Notes
    notes TEXT,

    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tiers_tenant ON tiers(tenant_id, is_virtual, status);
CREATE INDEX idx_tiers_entity ON tiers(entity_id, status);
CREATE INDEX idx_tiers_search ON tiers USING gin(
    to_tsvector('french', company_name || ' ' || COALESCE(short_name, ''))
);

-- === ADRESSES DES TIERS ===

CREATE TABLE tiers_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tiers_id UUID NOT NULL REFERENCES tiers(id) ON DELETE CASCADE,
    address_type VARCHAR(30) NOT NULL DEFAULT 'main',
    -- main | billing | shipping | site | registered
    label VARCHAR(100),

    -- Adresse structuree
    street_line1 VARCHAR(500),
    street_line2 VARCHAR(500),
    po_box VARCHAR(50),
    city VARCHAR(255),
    state_province VARCHAR(255),
    postal_code VARCHAR(20),
    country_code VARCHAR(2),            -- ISO 3166-1 alpha-2
    country_name VARCHAR(100),

    -- Geolocalisation
    lat NUMERIC(10, 7),
    lng NUMERIC(10, 7),
    geocoded_at TIMESTAMPTZ,

    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tiers_addresses_tiers ON tiers_addresses(tiers_id);

-- === CONTACTS (personnes physiques) ===

CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tiers_id UUID REFERENCES tiers(id) ON DELETE SET NULL,

    -- Identite
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    salutation VARCHAR(20),
    gender VARCHAR(10),

    -- Fonction
    job_title VARCHAR(255),
    department VARCHAR(255),
    is_primary_contact BOOLEAN NOT NULL DEFAULT FALSE,

    -- Coordonnees
    professional_email VARCHAR(255),
    personal_email VARCHAR(255),
    phone_office VARCHAR(50),
    phone_mobile VARCHAR(50),
    phone_fax VARCHAR(50),

    -- Certifications offshore (utilise par PaxLog)
    offshore_certified BOOLEAN NOT NULL DEFAULT FALSE,
    medical_certificate_expiry DATE,
    safety_training_expiry DATE,
    huet_certificate_expiry DATE,
    bosiet_certificate_expiry DATE,

    -- Statut
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    -- active | inactive | left_company

    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contacts_tiers ON contacts(tiers_id, status);
CREATE INDEX idx_contacts_tenant ON contacts(tenant_id, status);
CREATE INDEX idx_contacts_email ON contacts(professional_email) WHERE professional_email IS NOT NULL;

-- === LIENS EXTERNES (portail gestion d'equipe) ===

CREATE TABLE tiers_external_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tiers_id UUID NOT NULL REFERENCES tiers(id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities(id),
    token VARCHAR(255) NOT NULL UNIQUE,
    recipient_email VARCHAR(255),
    recipient_phone VARCHAR(50),

    -- Configuration
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ NOT NULL,
    site_asset_id UUID REFERENCES assets(id),   -- site de reference (optionnel)

    -- Permissions du lien
    can_view_pax BOOLEAN NOT NULL DEFAULT TRUE,
    can_view_compliance BOOLEAN NOT NULL DEFAULT TRUE,
    can_update_profiles BOOLEAN NOT NULL DEFAULT TRUE,
    can_upload_certifications BOOLEAN NOT NULL DEFAULT TRUE,
    can_add_members BOOLEAN NOT NULL DEFAULT FALSE,

    instructions TEXT,

    -- Statut
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    -- active | expired | revoked
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES users(id),
    revoke_reason TEXT,

    -- Statistiques d'utilisation
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    modifications_count INTEGER NOT NULL DEFAULT 0,

    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_external_links_token ON tiers_external_links(token) WHERE status = 'active';
CREATE INDEX idx_external_links_tiers ON tiers_external_links(tiers_id);
```

---

## 5. Logique Tiers Virtuel

```python
# app/services/modules/tiers_service.py

async def create_standalone_contact(
    data: ContactCreateSchema,
    tenant_id: str,
    user_id: str,
    db: AsyncSession,
) -> Contact:
    """
    Cree un contact sans tiers.
    Genere automatiquement un tiers virtuel sauf si auto_create_virtual_tiers = False.
    """
    setting = await get_module_setting("tiers", "auto_create_virtual_tiers", tenant_id, db)
    auto_create = setting if setting is not None else True

    if auto_create:
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
        await db.flush()
        tiers_id = virtual_tiers.id
    else:
        tiers_id = None

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
        is_primary_contact=True,
        created_by=user_id,
    )
    db.add(contact)
    await db.commit()

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
    Fusionne un tiers virtuel dans un tiers reel.

    Operations :
    1. Rattacher tous les contacts du virtuel au tiers reel
    2. Transferer les attachments vers le tiers reel
    3. Transferer les object_relations
    4. Marquer le tiers virtuel comme fusionne (ne pas supprimer -- audit trail)
    5. Logger l'operation
    """
    virtual = await db.get(Tiers, virtual_tiers_id)
    if not virtual or not virtual.is_virtual or virtual.tenant_id != tenant_id:
        raise ValueError("Tiers virtuel introuvable ou non accessible")

    real = await db.get(Tiers, real_tiers_id)
    if not real or real.tenant_id != tenant_id:
        raise ValueError("Tiers reel introuvable ou non accessible")

    # 1. Rattacher les contacts
    await db.execute(
        update(Contact).where(Contact.tiers_id == virtual_tiers_id)
        .values(tiers_id=real_tiers_id)
    )

    # 2. Transferer les attachments
    await db.execute(
        update(ObjectAttachment)
        .where(ObjectAttachment.object_type == "tiers",
               ObjectAttachment.object_id == UUID(virtual_tiers_id))
        .values(object_id=UUID(real_tiers_id))
    )

    # 3. Transferer les relations
    await db.execute(
        update(ObjectRelation)
        .where(ObjectRelation.from_type == "tiers",
               ObjectRelation.from_id == UUID(virtual_tiers_id))
        .values(from_id=UUID(real_tiers_id))
    )
    await db.execute(
        update(ObjectRelation)
        .where(ObjectRelation.to_type == "tiers",
               ObjectRelation.to_id == UUID(virtual_tiers_id))
        .values(to_id=UUID(real_tiers_id))
    )

    # 4. Marquer le virtuel comme fusionne
    virtual.virtual_merged_at = datetime.utcnow()
    virtual.status = "inactive"
    virtual.notes = f"Fusionne dans {real.company_name} ({real_tiers_id}) le {datetime.utcnow().date()}"

    await db.commit()

    await log_activity(tenant_id, user_id, "tiers", real_tiers_id, "virtual_tiers_merged",
                      {"virtual_tiers_id": virtual_tiers_id, "virtual_name": virtual.company_name})
```

---

## 6. Portail externe -- Gestion d'equipe

### 6.1 Principe

Un utilisateur habilite genere un lien securise depuis la fiche du Tiers. Ce lien permet au responsable de l'entreprise externe de **gerer les profils de ses PAX en continu**, sans passer par une AdS specifique.

### 6.2 Configuration du lien

```
Depuis : Tiers > DIXSTONE > Onglet "Acces externe"
Cliquer : "Generer un lien de gestion d'equipe"

Configuration :
  Destinataire (OTP) : responsable@dixstone.com  ou  +237XXXXXXXXX
  Duree de validite  : [7 jours] [14 jours] [30 jours] [Personnalise]
  Site de reference  : [Tous les sites] ou [Munja] ou [ESF1]
  Permissions :
    [x] Voir la liste des PAX
    [x] Voir le statut compliance
    [x] Mettre a jour les profils
    [x] Uploader des certifications
    [ ] Ajouter de nouveaux membres
  Instructions : "Merci de mettre a jour les certifications de votre
                  equipe avant le 30 avril."

-> [Generer le lien]
```

### 6.3 Interface du portail externe

**URL :** `https://ext.opsflux.io/team/{token}`

```
Bienvenue -- Gestion de l'equipe DIXSTONE
Lien valide jusqu'au 30/04/2026

Votre equipe (12 membres)
------------------------------------------------------
[Photo] Jean DUPONT        OK Conforme (Munja)
[Photo] Amadou NZIE        ! 1 certification expiree  [Mettre a jour]
[Photo] Marie EKWALLA      X 2 certifications manquantes [Completer]
[Photo] Paul MBALLA        OK Conforme (Munja)
...

Certifications en attente de validation : 3
  -> Vos justificatifs uploades sont en cours de verification

[+ Ajouter un nouveau membre]   (si permission activee)
```

**Ce qui N'est PAS visible par l'externe :**
- Les signalements (decisions internes)
- Les donnees medicales detaillees
- Les AdS des autres entreprises
- Les profils masques (`hidden = true`)
- Les commentaires internes des validateurs

### 6.4 Workflow apres mise a jour par l'externe

1. La certification passe en `pending_validation` dans OpsFlux
2. Le CHSE ou HSE_SITE est notifie
3. Le responsable externe voit : "En attente de validation"
4. Si valide : `valid` -- la compliance du PAX se met a jour
5. Si rejete : message affiche sur le portail avec la raison

**Delai de validation :** Configurable (defaut 48h). Si depasse : rappel automatique au CHSE.

---

## 7. Suspension et blacklist d'un Tiers

### 7.1 Suspension

Un Tiers suspendu ne peut plus creer de nouvelles AdS. Les AdS en cours restent actives mais sont signalees.

**Declenchement automatique :** Si un signalement `blacklist_temporaire` ou `blacklist_permanent` est cree pour l'entreprise entiere.

**Declenchement manuel :** DO ou DQHSE peut suspendre un Tiers manuellement avec motif.

### 7.2 Blacklist

Un Tiers blackliste :
- Toutes ses nouvelles AdS sont bloquees automatiquement
- Ses PAX apparaissent avec un badge d'interdiction dans les manifestes
- Il n'est plus propose dans les listes de selection des formulaires
- Les liens de portail externe existants sont revoques automatiquement

**Levee :** DO uniquement, avec motif documente.

### 7.3 Expiration de contrat

Le champ `contract_expiry_date` sur la fiche Tiers permet de suivre la validite du contrat liant l'entreprise externe au tenant.

**Alertes automatiques :**
- **J-30** : notification au responsable administratif du tenant (rappel anticipatif)
- **J-7** : notification urgente au responsable administratif (renouvellement imminent)
- Les notifications sont envoyees via le systeme de notifications Core (email + in-app)

**A l'expiration :**
- Le statut visuel "Contrat expire" (badge rouge) est affiche sur la fiche Tiers dans la liste et en detail
- Le Tiers reste en statut `active` mais le badge visuel alerte les utilisateurs

**Blocage optionnel des AdS :**
- Configurable par tenant via le setting `block_ads_on_expired_contract` (defaut : `false`)
- Si active : la creation de nouvelles AdS pour les PAX de ce Tiers est bloquee tant que le contrat est expire
- Message explicite : "Impossible de creer une AdS : le contrat de {company_name} a expire le DD/MM/YYYY"

### 7.4 Score compliance par site

Le module Tiers calcule un **score de compliance par site** pour chaque entreprise, base sur le pourcentage d'intervenants conformes aux exigences HSE du site.

- Formule : `(nombre de contacts conformes / nombre total de contacts affectes au site) x 100`
- Exemple : "DIXSTONE — Conformite pour ESF1 : 11/14 intervenants, 78%"
- Accessible depuis deux points d'entree :
  - **Fiche Tiers** : onglet "Compliance", tableau avec un score par site ou le Tiers a des intervenants
  - **Fiche Asset** : onglet "Compliance Tiers", tableau avec un score par entreprise ayant des intervenants sur le site
- Le score est **rafraichi en temps reel** a chaque mise a jour de certification (evenement `certification.updated` ou `certification.validated`)
- Code couleur : vert >= 90%, orange 70-89%, rouge < 70%

### 7.5 Alertes certifications offshore (anticipation 90 jours)

Des alertes automatiques sont envoyees **90 jours avant l'expiration** des certifications offshore critiques :
- HUET (Helicopter Underwater Escape Training)
- BOSIET (Basic Offshore Safety Induction and Emergency Training)
- Aptitude medicale offshore

**Destinataires :**
- Le contact concerne (si adresse email renseignee)
- Le responsable HSE de l'entreprise (contact avec `is_primary_contact = true` et `department = 'HSE'`)
- Le CHSE du tenant

**Badge visuel :** Sur le profil du contact dans les listes et fiches detail, un badge indique "Certification expire dans N jours" (orange si 30-90 jours, rouge si < 30 jours).

**Periodicite :** Les alertes sont envoyees a J-90, J-60, J-30 et J-7. Chaque palier genere une notification distincte avec un niveau d'urgence croissant.

### 7.6 Restriction certifications expirees

Un contact dont des **certifications obligatoires sont expirees** ne peut pas etre affecte a une nouvelle mission ou Autorisation de Sejour (AdS).

**Verification automatique :** Lors de l'ajout d'un PAX a une AdS, le systeme verifie que toutes les certifications requises par l'asset de destination sont valides (en tenant compte de la duree residuelle minimale definie dans les regles HSE de l'asset -- cf. Asset Registry, section 9.4).

**Blocage :** Si une certification obligatoire est expiree, l'ajout est refuse avec un message explicite :
- "Ce PAX ne peut pas etre ajoute : BOSIET expiree depuis le DD/MM/YYYY"
- "Ce PAX ne peut pas etre ajoute : aptitude medicale expire le DD/MM/YYYY, duree residuelle insuffisante (requise : 30 jours)"

**Deblocage :** Le PAX peut etre ajoute des que la certification est renouvelee et validee par le CHSE (statut `valid`).

---

## 8. Statistiques automatiques (calculees, etendues par modules metier)

Depuis la fiche Tiers, les utilisateurs habilites voient :

| Statistique | Source | Acces |
|---|---|---|
| Nombre de PAX actifs | PaxLog | Tous roles |
| Taux de compliance HSE moyen | PaxLog | CHSE, CDS, DO |
| Nombre d'AdS en cours | PaxLog | CDS, CHSE, DO |
| Nombre de signalements actifs | PaxLog | CHSE, CDS, DO |
| Taux de no-show sur 12 mois | PaxLog / TravelWiz | LOG_BASE, DO |
| Nombre de colis en transit | TravelWiz | LOG_BASE, DO |
| Historique AdS | PaxLog | CDS, CHSE, DO |

Ces statistiques sont calculees a la volee ou mises en cache. Les modules metier les enregistrent comme extensions du module Tiers.

---

## 9. API Tiers

```
# CRUD Tiers
GET    /api/v1/tiers                          Liste des Tiers (filtrable)
POST   /api/v1/tiers                          Creer un Tiers
GET    /api/v1/tiers/:id                      Fiche complete d'un Tiers
PATCH  /api/v1/tiers/:id                      Modifier
PATCH  /api/v1/tiers/:id/status               Changer le statut (suspend/blacklist)

# CRUD Contacts
GET    /api/v1/tiers/:id/contacts             Contacts du Tiers
POST   /api/v1/contacts                       Creer un contact (tiers virtuel auto si standalone)
PATCH  /api/v1/contacts/:id                   Modifier un contact
POST   /api/v1/tiers/:virtual_id/merge/:real_id  Fusionner tiers virtuel dans reel

# Extensions PaxLog (donnees calculees)
GET    /api/v1/tiers/:id/pax                  PAX de ce Tiers
GET    /api/v1/tiers/:id/ads                  Historique AdS de ce Tiers
GET    /api/v1/tiers/:id/signalements         Signalements actifs/historique
GET    /api/v1/tiers/:id/compliance-summary   Score compliance de l'equipe
GET    /api/v1/tiers/:id/noshows              Statistiques no-shows

# Portail externe
POST   /api/v1/tiers/:id/external-link        Generer lien gestion d'equipe
GET    /api/v1/tiers/:id/external-links        Historique des liens generes
DELETE /api/v1/tiers/:id/external-links/:lid   Revoquer un lien

# Portail externe (public, auth par OTP)
GET    /api/ext/team/:token                    Acces portail (verifie OTP)
POST   /api/ext/team/:token/otp               Valider OTP
GET    /api/ext/team/:token/pax               Liste PAX de l'equipe
POST   /api/ext/team/:token/pax               Ajouter un PAX
PATCH  /api/ext/team/:token/pax/:id           Mettre a jour un PAX
POST   /api/ext/team/:token/pax/:id/photo     Uploader photo
POST   /api/ext/team/:token/pax/:id/credentials  Uploader certification
GET    /api/ext/team/:token/compliance         Vue compliance
```

---

## 10. RBAC Tiers (permissions granulaires)

| Action | Permissions requises |
|---|---|
| Voir la liste des Tiers | `tiers.read` |
| Creer/modifier un Tiers | `tiers.create` / `tiers.edit` |
| Suspendre / blacklister | `tiers.suspend` / `tiers.blacklist` |
| Generer lien equipe | `tiers.external_link.create` |
| Revoquer un lien | `tiers.external_link.revoke` |
| Voir compliance equipe | `tiers.read` + extension PaxLog |
| Voir historique AdS | `tiers.read` + extension PaxLog |
| Voir signalements | `tiers.read` + extension PaxLog |

---

## 11. Import CSV Tiers et Contacts

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
                     "description": "Nom du tiers existant -- si vide, cree un tiers virtuel"},
    "job_title": {"required": False, "type": "text"},
    "professional_email": {"required": False, "type": "email"},
    "phone_mobile": {"required": False, "type": "phone"},
    "offshore_certified": {"required": False, "type": "boolean"},
    "medical_certificate_expiry": {"required": False, "type": "date", "format": "YYYY-MM-DD"},
}
```

---

## 12. UI -- Composants React

### Fiche Tiers (vue detail)

```tsx
// src/pages/modules/tiers/TiersDetailPage.tsx

const TiersDetailPage = ({ tiersId }: { tiersId: string }) => {
    const { data: tiers } = useTiers(tiersId)
    const { data: contacts } = useTiersContacts(tiersId)

    return (
        <div className="flex flex-col gap-4 p-4">
            {/* En-tete */}
            <div className="flex items-start gap-4">
                <TiersAvatar tiers={tiers} />
                <div className="flex-1 min-w-0">
                    <h1>{tiers.company_name}</h1>
                    <TiersTypeBadge type={tiers.tiers_type} />
                    <TiersStatusBadge status={tiers.status} />
                    {tiers.is_virtual && <Badge variant="outline">Virtuel</Badge>}
                </div>
            </div>

            <Tabs defaultValue="contacts">
                <TabsList>
                    <TabsTrigger value="contacts">Contacts</TabsTrigger>
                    <TabsTrigger value="addresses">Adresses</TabsTrigger>
                    <TabsTrigger value="documents">Documents</TabsTrigger>
                    <TabsTrigger value="compliance">Compliance</TabsTrigger>
                    <TabsTrigger value="external">Acces externe</TabsTrigger>
                    <TabsTrigger value="info">Informations</TabsTrigger>
                </TabsList>

                <TabsContent value="contacts"><ContactsList /></TabsContent>
                <TabsContent value="addresses"><AddressesList /></TabsContent>
                <TabsContent value="documents"><TiersDocumentsList /></TabsContent>
                <TabsContent value="compliance"><ComplianceSummary /></TabsContent>
                <TabsContent value="external"><ExternalLinksManager /></TabsContent>
                <TabsContent value="info"><TiersInfoForm /></TabsContent>
            </Tabs>
        </div>
    )
}
```

### Badges de type et statut

```tsx
const TIERS_TYPES = {
    supplier:        { label: "Fournisseur",     color: "bg-blue-100 text-blue-800" },
    partner:         { label: "Partenaire",      color: "bg-purple-100 text-purple-800" },
    client:          { label: "Client",          color: "bg-green-100 text-green-800" },
    subcontractor:   { label: "Sous-traitant",   color: "bg-amber-100 text-amber-800" },
    contractor:      { label: "Contractant",     color: "bg-orange-100 text-orange-800" },
    service_provider:{ label: "Prestataire",     color: "bg-teal-100 text-teal-800" },
    transporter:     { label: "Transporteur",    color: "bg-indigo-100 text-indigo-800" },
    government:      { label: "Gouvernement",    color: "bg-gray-100 text-gray-800" },
    other:           { label: "Autre",           color: "bg-muted text-muted-foreground" },
}

const TIERS_STATUSES = {
    active:              { label: "Actif",          color: "bg-green-100 text-green-800" },
    inactive:            { label: "Inactif",        color: "bg-gray-100 text-gray-600" },
    suspended:           { label: "Suspendu",       color: "bg-orange-100 text-orange-800" },
    blacklisted:         { label: "Liste noire",    color: "bg-red-100 text-red-800" },
    pending_validation:  { label: "En validation",  color: "bg-amber-100 text-amber-800" },
}
```

---

## 13. Enregistrement module

```python
# Au startup de l'application
from app.core.module_registry import module_registry

module_registry.register("tiers", MODULE_MANIFEST)
```

---

## 14. PDCA -- Phase Tiers (Phase 2, inclus avec Asset Registry)

| Etape | Tache | Critere de validation | Effort |
|---|---|---|---|
| PLAN | ERD Tiers + Contacts + Adresses + logique virtuel + liens externes | ERD valide, cas de fusion documente | 1j |
| DO | API CRUD Tiers : list/get/create/update/archive | Tests pytest : 0 erreur sur CRUD complet | 2j |
| DO | API CRUD Contacts : list/get/create (avec tiers virtuel auto) | Creer contact -> tiers virtuel cree auto en DB | 2j |
| DO | API fusion tiers virtuel -> reel | Fusion : contacts et PJ transferes, virtuel marque | 1j |
| DO | UI Liste Tiers avec filtres (type, statut, secteur) | Filtrer les fournisseurs actifs de la BU courante | 2j |
| DO | UI Fiche Tiers avec tabs (Contacts, Adresses, Documents, Compliance, Externe, Info) | Fiche complete avec timeline Core | 3j |
| DO | UI Formulaire Contact avec creation tiers virtuel auto | Toast "Tiers virtuel cree" si pas de tiers selectionne | 2j |
| DO | Import CSV : Tiers et Contacts avec mapping visuel | Import 50 fournisseurs, rapport d'erreurs clair | 2j |
| DO | Modal fusion tiers virtuel -> tiers reel | Fusion complete sans perte de donnees | 1j |
| DO | Portail externe : generation lien + interface simplifiee + OTP | Lien genere, acces externe fonctionnel avec OTP | 4j |
| DO | Workflow certifications : upload externe -> pending_validation -> validation CHSE | Cycle complet upload -> notification -> validation | 2j |
| DO | Suspension / blacklist avec impacts automatiques (AdS, liens externes) | Blacklist -> AdS bloquees + liens revoques | 1j |
| CHECK | Scenario : creer contact standalone -> tiers virtuel cree -> fusionner dans Tiers reel -> donnees coherentes | Audit trail present, 0 perte de donnees | 1j |
| CHECK | Scenario : generer lien externe -> upload certification -> validation CHSE -> compliance mise a jour | Cycle complet fonctionnel | 1j |
| ACT | Importer les principaux fournisseurs depuis Excel existant | Au moins 20 tiers reels importes par l'admin | 1j |
