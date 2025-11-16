-- ============================================================================
-- Module Rédacteur - Schéma de base de données PostgreSQL
-- ============================================================================
-- Date: 2025-11-03
-- Version: 1.0
-- Description: Tables pour le système de rédaction de rapports professionnels
-- ============================================================================

-- Extensions requises
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- Pour la recherche full-text

-- ============================================================================
-- Table: reports (Rapports)
-- ============================================================================
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    type VARCHAR(100) NOT NULL DEFAULT 'general', -- 'activity', 'technical', 'meeting', 'general'
    content JSONB NOT NULL DEFAULT '{}', -- EditorJS/Tiptap blocks
    status VARCHAR(50) NOT NULL DEFAULT 'draft', -- 'draft', 'review', 'published', 'archived'
    template_id UUID REFERENCES report_templates(id) ON DELETE SET NULL,

    -- Ownership and versioning
    created_by UUID NOT NULL, -- REFERENCES users(id)
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    updated_by UUID, -- REFERENCES users(id)
    published_at TIMESTAMP,
    published_by UUID, -- REFERENCES users(id)

    -- Metadata
    metadata JSONB DEFAULT '{}', -- Custom fields, tags, etc.
    version INTEGER DEFAULT 1,
    parent_version_id UUID REFERENCES reports(id) ON DELETE SET NULL,

    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by UUID, -- REFERENCES users(id)

    -- Search
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('french', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('french', coalesce(metadata->>'description', '')), 'B')
    ) STORED,

    CONSTRAINT valid_status CHECK (status IN ('draft', 'review', 'published', 'archived'))
);

-- Indexes
CREATE INDEX idx_reports_created_by ON reports(created_by);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_type ON reports(type);
CREATE INDEX idx_reports_template ON reports(template_id);
CREATE INDEX idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX idx_reports_search_vector ON reports USING GIN (search_vector);
CREATE INDEX idx_reports_is_deleted ON reports(is_deleted) WHERE is_deleted = FALSE;

-- ============================================================================
-- Table: report_templates (Gabarits de rapports)
-- ============================================================================
CREATE TABLE IF NOT EXISTS report_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(100) NOT NULL, -- 'activity', 'technical', 'meeting', etc.

    -- Template structure
    structure JSONB NOT NULL DEFAULT '{}', -- EditorJS/Tiptap template structure
    custom_blocks JSONB DEFAULT '[]', -- Configuration des blocs personnalisés
    settings JSONB DEFAULT '{}', -- Layout, styles, etc.

    -- Metadata
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    category VARCHAR(100),
    tags TEXT[],

    -- Ownership
    created_by UUID NOT NULL, -- REFERENCES users(id)
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    updated_by UUID, -- REFERENCES users(id)

    -- Usage tracking
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP
);

-- Indexes
CREATE INDEX idx_templates_type ON report_templates(type);
CREATE INDEX idx_templates_is_active ON report_templates(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_templates_is_default ON report_templates(is_default) WHERE is_default = TRUE;
CREATE INDEX idx_templates_category ON report_templates(category);

-- ============================================================================
-- Table: custom_blocks (Blocs personnalisés)
-- ============================================================================
CREATE TABLE IF NOT EXISTS custom_blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(50), -- lucide icon name

    -- Configuration
    block_type VARCHAR(100) NOT NULL, -- 'data-fetch', 'chart', 'calculation', etc.
    config JSONB NOT NULL DEFAULT '{}', -- Configuration du bloc (API endpoint, fields, etc.)
    schema JSONB DEFAULT '{}', -- JSON Schema for validation

    -- Rendering
    render_code TEXT, -- Code React pour le rendu (si custom)
    validation_rules JSONB DEFAULT '[]', -- Règles de validation

    -- Permissions
    permissions JSONB DEFAULT '{"roles": ["editor", "admin"]}', -- Permissions d'utilisation

    -- Metadata
    category VARCHAR(50) DEFAULT 'custom', -- 'data', 'media', 'layout', 'interactive'
    created_by UUID NOT NULL, -- REFERENCES users(id)
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,

    -- Usage tracking
    usage_count INTEGER DEFAULT 0
);

-- Indexes
CREATE INDEX idx_custom_blocks_block_type ON custom_blocks(block_type);
CREATE INDEX idx_custom_blocks_category ON custom_blocks(category);
CREATE INDEX idx_custom_blocks_is_active ON custom_blocks(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- Table: report_versions (Historique des versions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS report_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,

    -- Content snapshot
    content JSONB NOT NULL,
    title VARCHAR(500) NOT NULL,

    -- Changes tracking
    changes JSONB DEFAULT '{}', -- Diff with previous version
    change_summary TEXT,

    -- Metadata
    created_by UUID NOT NULL, -- REFERENCES users(id)
    created_at TIMESTAMP DEFAULT NOW(),
    comment TEXT,

    UNIQUE(report_id, version_number)
);

-- Indexes
CREATE INDEX idx_versions_report_id ON report_versions(report_id);
CREATE INDEX idx_versions_created_at ON report_versions(created_at DESC);

-- ============================================================================
-- Table: report_collaborators (Collaborateurs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS report_collaborators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- REFERENCES users(id)
    role VARCHAR(50) NOT NULL, -- 'owner', 'editor', 'commenter', 'viewer'

    -- Metadata
    added_by UUID, -- REFERENCES users(id)
    added_at TIMESTAMP DEFAULT NOW(),
    last_seen TIMESTAMP,

    -- Notifications
    notify_on_changes BOOLEAN DEFAULT TRUE,
    notify_on_comments BOOLEAN DEFAULT TRUE,

    UNIQUE(report_id, user_id),
    CONSTRAINT valid_role CHECK (role IN ('owner', 'editor', 'commenter', 'viewer'))
);

-- Indexes
CREATE INDEX idx_collaborators_report_id ON report_collaborators(report_id);
CREATE INDEX idx_collaborators_user_id ON report_collaborators(user_id);
CREATE INDEX idx_collaborators_role ON report_collaborators(role);

-- ============================================================================
-- Table: report_comments (Commentaires)
-- ============================================================================
CREATE TABLE IF NOT EXISTS report_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- REFERENCES users(id)

    -- Comment content
    content TEXT NOT NULL,

    -- Position in document
    block_id VARCHAR(255), -- EditorJS block ID
    selection_start INTEGER, -- Start position in text
    selection_end INTEGER, -- End position in text
    quoted_text TEXT, -- Text that was selected

    -- Threading
    parent_id UUID REFERENCES report_comments(id) ON DELETE CASCADE,
    thread_id UUID, -- Root comment ID for threading

    -- Status
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_by UUID, -- REFERENCES users(id)
    resolved_at TIMESTAMP,

    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    is_deleted BOOLEAN DEFAULT FALSE,

    -- Mentions
    mentions UUID[] DEFAULT ARRAY[]::UUID[] -- Array of mentioned user IDs
);

-- Indexes
CREATE INDEX idx_comments_report_id ON report_comments(report_id);
CREATE INDEX idx_comments_user_id ON report_comments(user_id);
CREATE INDEX idx_comments_parent_id ON report_comments(parent_id);
CREATE INDEX idx_comments_thread_id ON report_comments(thread_id);
CREATE INDEX idx_comments_is_resolved ON report_comments(is_resolved) WHERE is_resolved = FALSE;
CREATE INDEX idx_comments_created_at ON report_comments(created_at DESC);

-- ============================================================================
-- Table: report_audit_log (Journal d'audit)
-- ============================================================================
CREATE TABLE IF NOT EXISTS report_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID REFERENCES reports(id) ON DELETE CASCADE,
    user_id UUID, -- REFERENCES users(id), can be NULL for system actions

    -- Action details
    action VARCHAR(100) NOT NULL, -- 'created', 'updated', 'published', 'deleted', 'restored', etc.
    entity_type VARCHAR(50) NOT NULL DEFAULT 'report', -- 'report', 'comment', 'collaborator'
    entity_id UUID, -- ID of the affected entity

    -- Changes tracking
    changes JSONB DEFAULT '{}', -- Détails des modifications
    previous_state JSONB, -- État avant modification
    new_state JSONB, -- État après modification

    -- Context
    metadata JSONB DEFAULT '{}', -- User agent, IP, etc.
    created_at TIMESTAMP DEFAULT NOW(),

    -- Security
    ip_address INET,
    user_agent TEXT
);

-- Indexes
CREATE INDEX idx_audit_report_id ON report_audit_log(report_id);
CREATE INDEX idx_audit_user_id ON report_audit_log(user_id);
CREATE INDEX idx_audit_action ON report_audit_log(action);
CREATE INDEX idx_audit_entity_type ON report_audit_log(entity_type);
CREATE INDEX idx_audit_created_at ON report_audit_log(created_at DESC);
CREATE INDEX idx_audit_ip_address ON report_audit_log(ip_address);

-- ============================================================================
-- Table: report_exports (Exports)
-- ============================================================================
CREATE TABLE IF NOT EXISTS report_exports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,

    -- Export configuration
    format VARCHAR(50) NOT NULL, -- 'pdf', 'docx', 'xlsx', 'html'
    template_id UUID REFERENCES report_templates(id), -- Export template
    settings JSONB DEFAULT '{}', -- Export options

    -- Status
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'

    -- File information
    file_path TEXT,
    file_url TEXT,
    file_size BIGINT, -- Size in bytes
    file_hash VARCHAR(64), -- SHA256 hash

    -- Metadata
    requested_by UUID NOT NULL, -- REFERENCES users(id)
    requested_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,

    -- Error handling
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,

    -- Expiration
    expires_at TIMESTAMP, -- Auto-delete after expiration

    CONSTRAINT valid_format CHECK (format IN ('pdf', 'docx', 'xlsx', 'html', 'markdown')),
    CONSTRAINT valid_export_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'))
);

-- Indexes
CREATE INDEX idx_exports_report_id ON report_exports(report_id);
CREATE INDEX idx_exports_requested_by ON report_exports(requested_by);
CREATE INDEX idx_exports_status ON report_exports(status);
CREATE INDEX idx_exports_created_at ON report_exports(requested_at DESC);
CREATE INDEX idx_exports_expires_at ON report_exports(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================================
-- Table: ai_suggestions (Suggestions IA)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_suggestions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,

    -- Context
    block_id VARCHAR(255), -- EditorJS block ID
    suggestion_type VARCHAR(100) NOT NULL, -- 'completion', 'correction', 'translation', 'summary', 'analysis'

    -- Content
    original_text TEXT,
    suggested_text TEXT,
    alternatives JSONB DEFAULT '[]', -- Array of alternative suggestions

    -- Quality metrics
    confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
    relevance_score FLOAT,

    -- User feedback
    accepted BOOLEAN,
    accepted_at TIMESTAMP,
    feedback_rating INTEGER CHECK (feedback_rating >= 1 AND feedback_rating <= 5),
    feedback_comment TEXT,

    -- Metadata
    user_id UUID NOT NULL, -- REFERENCES users(id)
    created_at TIMESTAMP DEFAULT NOW(),
    ai_model VARCHAR(100), -- Model used (e.g., 'gpt-4', 'claude-3')
    processing_time_ms INTEGER -- Time taken to generate suggestion
);

-- Indexes
CREATE INDEX idx_ai_suggestions_report_id ON ai_suggestions(report_id);
CREATE INDEX idx_ai_suggestions_user_id ON ai_suggestions(user_id);
CREATE INDEX idx_ai_suggestions_type ON ai_suggestions(suggestion_type);
CREATE INDEX idx_ai_suggestions_accepted ON ai_suggestions(accepted) WHERE accepted IS NOT NULL;
CREATE INDEX idx_ai_suggestions_created_at ON ai_suggestions(created_at DESC);

-- ============================================================================
-- Table: offline_sync_queue (Queue de synchronisation offline)
-- ============================================================================
CREATE TABLE IF NOT EXISTS offline_sync_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL, -- REFERENCES users(id)
    entity_type VARCHAR(50) NOT NULL, -- 'report', 'comment', 'collaborator'
    entity_id UUID NOT NULL,

    -- Operation details
    operation VARCHAR(50) NOT NULL, -- 'create', 'update', 'delete'
    data JSONB NOT NULL,

    -- Sync status
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'conflict'
    priority INTEGER DEFAULT 0, -- Higher = more urgent

    -- Metadata
    client_timestamp TIMESTAMP NOT NULL,
    server_timestamp TIMESTAMP DEFAULT NOW(),
    synced_at TIMESTAMP,

    -- Conflict resolution
    conflict_data JSONB, -- Data from server causing conflict
    resolution VARCHAR(50), -- 'server_wins', 'client_wins', 'merged', 'manual'

    -- Error handling
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,

    CONSTRAINT valid_sync_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'conflict'))
);

-- Indexes
CREATE INDEX idx_sync_queue_user_id ON offline_sync_queue(user_id);
CREATE INDEX idx_sync_queue_status ON offline_sync_queue(status);
CREATE INDEX idx_sync_queue_priority ON offline_sync_queue(priority DESC);
CREATE INDEX idx_sync_queue_client_timestamp ON offline_sync_queue(client_timestamp);

-- ============================================================================
-- Functions and Triggers
-- ============================================================================

-- Function: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger: reports updated_at
CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger: report_templates updated_at
CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON report_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger: report_comments updated_at
CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON report_comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function: Create audit log entry on report change
CREATE OR REPLACE FUNCTION create_report_audit_log()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO report_audit_log (report_id, user_id, action, entity_type, new_state)
        VALUES (NEW.id, NEW.created_by, 'created', 'report', to_jsonb(NEW));
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO report_audit_log (report_id, user_id, action, entity_type, previous_state, new_state, changes)
        VALUES (NEW.id, NEW.updated_by, 'updated', 'report', to_jsonb(OLD), to_jsonb(NEW),
                jsonb_build_object('changed_fields', (SELECT jsonb_object_agg(key, value)
                FROM jsonb_each(to_jsonb(NEW))
                WHERE to_jsonb(NEW)->key IS DISTINCT FROM to_jsonb(OLD)->key)));
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO report_audit_log (report_id, user_id, action, entity_type, previous_state)
        VALUES (OLD.id, OLD.deleted_by, 'deleted', 'report', to_jsonb(OLD));
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Audit log for reports
CREATE TRIGGER report_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON reports
FOR EACH ROW EXECUTE FUNCTION create_report_audit_log();

-- Function: Increment version number
CREATE OR REPLACE FUNCTION increment_report_version()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE' AND OLD.content IS DISTINCT FROM NEW.content) THEN
        NEW.version = OLD.version + 1;

        -- Create version snapshot
        INSERT INTO report_versions (report_id, version_number, content, title, created_by)
        VALUES (NEW.id, OLD.version, OLD.content, OLD.title, NEW.updated_by);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Version increment
CREATE TRIGGER report_version_increment
BEFORE UPDATE ON reports
FOR EACH ROW EXECUTE FUNCTION increment_report_version();

-- ============================================================================
-- Initial Data / Seed Data
-- ============================================================================

-- Insert default report template
INSERT INTO report_templates (id, name, description, type, structure, is_default, created_by)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'Rapport Standard', 'Template par défaut pour tous types de rapports', 'general',
     '{"blocks": []}', TRUE, '00000000-0000-0000-0000-000000000000'),
    ('00000000-0000-0000-0000-000000000002', 'Rapport d''Activité', 'Template pour rapports d''activité', 'activity',
     '{"blocks": []}', TRUE, '00000000-0000-0000-0000-000000000000'),
    ('00000000-0000-0000-0000-000000000003', 'Rapport Technique', 'Template pour rapports techniques', 'technical',
     '{"blocks": []}', TRUE, '00000000-0000-0000-0000-000000000000')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Permissions / Row Level Security (RLS)
-- ============================================================================

-- Enable RLS on sensitive tables
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_collaborators ENABLE ROW LEVEL SECURITY;

-- Policies examples (à adapter selon votre système d'authentification)
-- CREATE POLICY "Users can view their own reports or reports they collaborate on"
-- ON reports FOR SELECT
-- USING (created_by = current_user_id() OR id IN (
--     SELECT report_id FROM report_collaborators WHERE user_id = current_user_id()
-- ));

-- ============================================================================
-- Views utiles
-- ============================================================================

-- Vue: Reports avec statistiques
CREATE OR REPLACE VIEW reports_with_stats AS
SELECT
    r.*,
    (SELECT COUNT(*) FROM report_comments WHERE report_id = r.id AND is_resolved = FALSE) as open_comments_count,
    (SELECT COUNT(*) FROM report_collaborators WHERE report_id = r.id) as collaborators_count,
    (SELECT COUNT(*) FROM report_versions WHERE report_id = r.id) as versions_count,
    t.name as template_name
FROM reports r
LEFT JOIN report_templates t ON r.template_id = t.id;

-- Vue: Activité récente
CREATE OR REPLACE VIEW recent_activity AS
SELECT
    'report' as activity_type,
    id as entity_id,
    title as activity_title,
    created_by as user_id,
    created_at as activity_date
FROM reports
WHERE created_at >= NOW() - INTERVAL '30 days'
UNION ALL
SELECT
    'comment' as activity_type,
    id as entity_id,
    LEFT(content, 100) as activity_title,
    user_id,
    created_at as activity_date
FROM report_comments
WHERE created_at >= NOW() - INTERVAL '30 days'
ORDER BY activity_date DESC
LIMIT 100;

-- ============================================================================
-- Fin du script
-- ============================================================================

COMMENT ON TABLE reports IS 'Table principale des rapports/documents';
COMMENT ON TABLE report_templates IS 'Templates/gabarits réutilisables pour les rapports';
COMMENT ON TABLE custom_blocks IS 'Blocs personnalisés configurables par les administrateurs';
COMMENT ON TABLE report_versions IS 'Historique des versions des rapports';
COMMENT ON TABLE report_collaborators IS 'Gestion des collaborateurs et permissions par rapport';
COMMENT ON TABLE report_comments IS 'Commentaires et discussions sur les rapports';
COMMENT ON TABLE report_audit_log IS 'Journal d''audit de toutes les actions';
COMMENT ON TABLE report_exports IS 'Historique des exports (PDF, Word, etc.)';
COMMENT ON TABLE ai_suggestions IS 'Suggestions générées par l''IA';
COMMENT ON TABLE offline_sync_queue IS 'Queue de synchronisation pour mode offline';
