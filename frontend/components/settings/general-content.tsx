"use client"

import { useState, useEffect } from "react"
import { SettingsApi, type AppSettings } from "@/lib/settings-api"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Check, X, Loader2, Save } from "lucide-react"
import { useHeaderContext } from "@/components/header-context"

type SettingField = {
  key: string
  label: string
  value: any
  type: 'string' | 'number' | 'boolean'
  category: string
  description: string
  editable: boolean
}

export function SettingsGeneralContent() {
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null)
  const [settingsFields, setSettingsFields] = useState<SettingField[]>([])
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string | number | boolean>("")
  const [modifiedKeys, setModifiedKeys] = useState<Set<string>>(new Set())
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const { setContextualHeader } = useHeaderContext()

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const settings = await SettingsApi.getSettingsAdmin()
      setAppSettings(settings)

      // Convert settings to fields array for display
      const fields = convertSettingsToFields(settings)
      setSettingsFields(fields)
    } catch (error) {
      console.error('Failed to load settings:', error)
      setError("Impossible de charger les paramètres")
    } finally {
      setIsLoading(false)
    }
  }

  const convertSettingsToFields = (settings: AppSettings): SettingField[] => {
    const fields: SettingField[] = []

    // Define field categories and labels - EXHAUSTIVE LIST
    const fieldConfig: Record<string, { label: string; category: string; description: string; editable: boolean }> = {
      // Application
      app_name: { label: "Nom de l'Application", category: "Application", description: "Nom affiché dans l'application", editable: true },
      app_logo: { label: "Logo Application", category: "Application", description: "URL du logo de l'application", editable: true },
      default_theme: { label: "Thème par Défaut", category: "Application", description: "Thème de couleur par défaut", editable: true },
      default_language: { label: "Langue par Défaut", category: "Application", description: "Langue de l'interface (fr, en)", editable: true },
      font: { label: "Police", category: "Application", description: "Police de caractères", editable: true },

      // Entreprise
      company_name: { label: "Nom de l'Entreprise", category: "Entreprise", description: "Nom de votre entreprise", editable: true },
      company_logo: { label: "Logo Entreprise", category: "Entreprise", description: "URL du logo de l'entreprise", editable: true },
      company_tax_id: { label: "ID Fiscal", category: "Entreprise", description: "Identifiant fiscal/SIRET", editable: true },
      company_address: { label: "Adresse", category: "Entreprise", description: "Adresse complète de l'entreprise", editable: true },

      // UI
      auto_save_delay_seconds: { label: "Délai Auto-save (s)", category: "Interface Utilisateur", description: "Délai avant affichage tag 'Modifié'", editable: true },

      // Sécurité 2FA
      twofa_max_attempts: { label: "Tentatives 2FA Max", category: "Sécurité 2FA", description: "Nombre max de tentatives avant blocage", editable: true },
      twofa_sms_timeout_minutes: { label: "Timeout SMS (min)", category: "Sécurité 2FA", description: "Durée de validité du code SMS", editable: true },
      twofa_sms_rate_limit: { label: "Limite SMS/h", category: "Sécurité 2FA", description: "Nombre max de SMS par heure", editable: true },

      // SMS Provider
      sms_provider: { label: "Fournisseur SMS", category: "SMS", description: "twilio, bulksms, ovh, messagebird, vonage", editable: true },
      sms_provider_account_sid: { label: "Account SID / API Key", category: "SMS", description: "Identifiant du compte SMS", editable: true },
      sms_provider_auth_token: { label: "Auth Token / Secret", category: "SMS", description: "Token d'authentification SMS (masqué)", editable: true },
      sms_provider_phone_number: { label: "Numéro Émetteur", category: "SMS", description: "Numéro de téléphone émetteur", editable: true },

      // Email
      email_host: { label: "Serveur SMTP", category: "Email", description: "Hôte du serveur SMTP", editable: true },
      email_port: { label: "Port SMTP", category: "Email", description: "Port du serveur SMTP (25, 465, 587)", editable: true },
      email_username: { label: "Utilisateur SMTP", category: "Email", description: "Nom d'utilisateur SMTP", editable: true },
      email_password: { label: "Mot de passe SMTP", category: "Email", description: "Mot de passe SMTP (masqué)", editable: true },
      email_from: { label: "Email Expéditeur", category: "Email", description: "Adresse email expéditeur", editable: true },
      email_from_name: { label: "Nom Expéditeur", category: "Email", description: "Nom affiché de l'expéditeur", editable: true },
      email_use_tls: { label: "Utiliser TLS", category: "Email", description: "Activer TLS pour SMTP", editable: true },
      email_use_ssl: { label: "Utiliser SSL", category: "Email", description: "Activer SSL pour SMTP", editable: true },

      // Intranet
      intranet_url: { label: "URL Intranet", category: "Intranet", description: "URL avec placeholder {user_id}", editable: true },

      // Backups
      backup_storage_type: { label: "Type Stockage Backup", category: "Backups", description: "local, s3, ftp, sftp", editable: true },
      backup_local_path: { label: "Chemin Local", category: "Backups", description: "Chemin local pour les backups", editable: true },
      backup_s3_bucket: { label: "Bucket S3", category: "Backups", description: "Nom du bucket S3", editable: true },
      backup_s3_endpoint: { label: "Endpoint S3", category: "Backups", description: "URL endpoint S3/MinIO", editable: true },
      backup_s3_access_key: { label: "Clé Accès S3", category: "Backups", description: "Access Key S3 (masquée)", editable: true },
      backup_s3_secret_key: { label: "Clé Secrète S3", category: "Backups", description: "Secret Key S3 (masquée)", editable: true },
      backup_s3_region: { label: "Région S3", category: "Backups", description: "Région AWS S3", editable: true },
      backup_ftp_host: { label: "Hôte FTP", category: "Backups", description: "Serveur FTP/SFTP", editable: true },
      backup_ftp_port: { label: "Port FTP", category: "Backups", description: "Port FTP/SFTP", editable: true },
      backup_ftp_username: { label: "Utilisateur FTP", category: "Backups", description: "Nom d'utilisateur FTP", editable: true },
      backup_ftp_password: { label: "Mot de passe FTP", category: "Backups", description: "Mot de passe FTP (masqué)", editable: true },
      backup_ftp_path: { label: "Chemin FTP", category: "Backups", description: "Chemin distant pour backups", editable: true },
      backup_retention_days: { label: "Rétention (jours)", category: "Backups", description: "Durée de conservation des backups", editable: true },
      backup_auto_cleanup: { label: "Nettoyage Auto", category: "Backups", description: "Suppression automatique anciens backups", editable: true },

      // Cache Redis
      redis_host: { label: "Hôte Redis", category: "Cache (Redis)", description: "Serveur Redis", editable: true },
      redis_port: { label: "Port Redis", category: "Cache (Redis)", description: "Port Redis (6379)", editable: true },
      redis_db: { label: "Base Redis", category: "Cache (Redis)", description: "Numéro de base Redis", editable: true },
      redis_password: { label: "Mot de passe Redis", category: "Cache (Redis)", description: "Mot de passe Redis (masqué)", editable: true },
      redis_default_ttl: { label: "TTL Défaut (s)", category: "Cache (Redis)", description: "Durée de vie du cache par défaut", editable: true },
      redis_max_ttl: { label: "TTL Max (s)", category: "Cache (Redis)", description: "Durée de vie maximale du cache", editable: true },

      // Storage S3
      storage_backend: { label: "Backend Stockage", category: "Stockage (S3)", description: "local, s3, minio", editable: true },
      s3_endpoint: { label: "Endpoint S3", category: "Stockage (S3)", description: "URL endpoint S3/MinIO", editable: true },
      s3_access_key: { label: "Clé Accès S3", category: "Stockage (S3)", description: "Access Key S3 (masquée)", editable: true },
      s3_secret_key: { label: "Clé Secrète S3", category: "Stockage (S3)", description: "Secret Key S3 (masquée)", editable: true },
      s3_bucket: { label: "Bucket S3", category: "Stockage (S3)", description: "Nom du bucket S3", editable: true },
      s3_region: { label: "Région S3", category: "Stockage (S3)", description: "Région AWS S3", editable: true },

      // Search
      search_backend: { label: "Backend Recherche", category: "Recherche", description: "postgresql, elasticsearch, typesense", editable: true },
      search_language: { label: "Langue Recherche", category: "Recherche", description: "Langue pour analyse de texte", editable: true },
      elasticsearch_url: { label: "URL Elasticsearch", category: "Recherche", description: "URL du serveur Elasticsearch", editable: true },
      typesense_api_key: { label: "Clé API Typesense", category: "Recherche", description: "API Key Typesense (masquée)", editable: true },
      typesense_host: { label: "Hôte Typesense", category: "Recherche", description: "Serveur Typesense", editable: true },

      // Audit
      audit_retention_days: { label: "Rétention (jours)", category: "Audit Logs", description: "Durée de conservation des logs", editable: true },
      audit_log_level: { label: "Niveau de Log", category: "Audit Logs", description: "DEBUG, INFO, WARNING, ERROR", editable: true },
      audit_enabled: { label: "Audit Activé", category: "Audit Logs", description: "Activer les logs d'audit", editable: true },

      // AI
      ai_provider: { label: "Fournisseur IA", category: "Intelligence Artificielle", description: "openai, anthropic, none", editable: true },
      ai_openai_api_key: { label: "Clé API OpenAI", category: "Intelligence Artificielle", description: "API Key OpenAI (masquée)", editable: true },
      ai_openai_model: { label: "Modèle OpenAI", category: "Intelligence Artificielle", description: "Modèle OpenAI à utiliser", editable: true },
      ai_openai_base_url: { label: "URL Base OpenAI", category: "Intelligence Artificielle", description: "URL de base OpenAI (optionnel)", editable: true },
      ai_anthropic_api_key: { label: "Clé API Anthropic", category: "Intelligence Artificielle", description: "API Key Anthropic (masquée)", editable: true },
      ai_anthropic_model: { label: "Modèle Anthropic", category: "Intelligence Artificielle", description: "Modèle Anthropic à utiliser", editable: true },
      ai_max_tokens: { label: "Tokens Max", category: "Intelligence Artificielle", description: "Nombre max de tokens pour réponses", editable: true },
      ai_temperature: { label: "Température", category: "Intelligence Artificielle", description: "Température IA (0.0-1.0)", editable: true },

      // Invitations
      invitation_expiry_days: { label: "Expiration Invitation (j)", category: "Invitations", description: "Durée de validité des invitations", editable: true },

      // System (read-only)
      database_name: { label: "Base de Données", category: "Système", description: "Nom de la base", editable: false },
      postgres_version: { label: "Version PostgreSQL", category: "Système", description: "Version de PostgreSQL", editable: false },
    }

    Object.entries(settings).forEach(([key, value]) => {
      const config = fieldConfig[key]
      if (!config) return

      const type = typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string'

      fields.push({
        key,
        label: config.label,
        value,
        type,
        category: config.category,
        description: config.description,
        editable: config.editable,
      })
    })

    return fields.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category)
      }
      return a.label.localeCompare(b.label)
    })
  }

  useEffect(() => {
    setContextualHeader({
      searchPlaceholder: "Rechercher un paramètre...",
      searchValue: searchQuery,
      onSearchChange: setSearchQuery,
      customRender: modifiedKeys.size > 0 ? (
        <Button size="sm" onClick={handleSaveAll} disabled={isSaving}>
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? 'Enregistrement...' : `Enregistrer (${modifiedKeys.size})`}
        </Button>
      ) : undefined,
    })

    return () => {
      setContextualHeader({})
    }
  }, [searchQuery, modifiedKeys, isSaving, setContextualHeader])

  const filteredSettings = settingsFields.filter((field) => {
    const matchesCategory = !categoryFilter || field.category === categoryFilter
    const matchesSearch =
      !searchQuery ||
      field.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      field.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      field.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      field.category.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const categories = Array.from(new Set(settingsFields.map((s) => s.category)))

  const handleCategoryClick = (category: string) => {
    setCategoryFilter(categoryFilter === category ? null : category)
  }

  const handleEdit = (field: SettingField) => {
    if (!field.editable) return
    setEditingKey(field.key)
    setEditValue(field.value)
  }

  const handleSave = (key: string) => {
    setSettingsFields((prev) => prev.map((s) => (s.key === key ? { ...s, value: editValue } : s)))
    setEditingKey(null)

    // Add to modified keys
    setModifiedKeys((prev) => new Set(prev).add(key))
  }

  const handleCancel = () => {
    setEditingKey(null)
    setEditValue("")
  }

  const handleSaveAll = async () => {
    try {
      setIsSaving(true)
      setError(null)
      setSuccessMessage(null)

      // Build update object with only modified fields
      const updates: Record<string, any> = {}
      modifiedKeys.forEach((key) => {
        const field = settingsFields.find((f) => f.key === key)
        if (field) {
          updates[key] = field.value
        }
      })

      await SettingsApi.updateSettings(updates)

      setSuccessMessage(`${modifiedKeys.size} paramètre(s) mis à jour`)
      setModifiedKeys(new Set())
      await loadSettings()
    } catch (error) {
      console.error('Failed to save settings:', error)
      setError("Impossible de sauvegarder les paramètres")
    } finally {
      setIsSaving(false)
    }
  }

  const isSensitiveField = (key: string): boolean => {
    const sensitiveFields = [
      'password', 'token', 'secret', 'key', 'api_key', 'auth_token',
      'email_password', 'redis_password', 'backup_s3_secret_key', 's3_secret_key',
      'backup_ftp_password', 'sms_provider_auth_token', 'ai_openai_api_key',
      'ai_anthropic_api_key', 'typesense_api_key', 'backup_s3_access_key', 's3_access_key'
    ]
    return sensitiveFields.some(sensitive => key.toLowerCase().includes(sensitive))
  }

  const renderValueCell = (field: SettingField) => {
    const isEditing = editingKey === field.key
    const isSensitive = isSensitiveField(field.key)

    if (!field.editable && !isEditing) {
      return (
        <span className="text-sm text-muted-foreground">
          {field.value === null || field.value === undefined ? 'N/A' : String(field.value)}
        </span>
      )
    }

    if (isEditing) {
      if (field.type === "boolean") {
        return (
          <div className="flex items-center gap-2">
            <Switch checked={editValue as boolean} onCheckedChange={setEditValue} />
            <Button size="sm" variant="ghost" onClick={() => handleSave(field.key)}>
              <Check className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancel}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )
      }

      return (
        <div className="flex items-center gap-2">
          <Input
            type={isSensitive ? "password" : field.type === "number" ? "number" : "text"}
            value={editValue as string | number}
            onChange={(e) => setEditValue(field.type === "number" ? Number(e.target.value) : e.target.value)}
            className="h-8 max-w-xs"
            placeholder={isSensitive ? "••••••••" : undefined}
          />
          <Button size="sm" variant="ghost" onClick={() => handleSave(field.key)}>
            <Check className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={handleCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )
    }

    if (field.type === "boolean") {
      return <Switch checked={field.value as boolean} onCheckedChange={() => handleEdit(field)} />
    }

    // Display sensitive fields as masked
    if (isSensitive && field.value && field.value !== null && field.value !== undefined && String(field.value).trim() !== '') {
      return (
        <button onClick={() => handleEdit(field)} className="text-left hover:underline flex items-center gap-2">
          <span className="font-mono">••••••••</span>
          <Badge variant="secondary" className="text-xs">Masqué</Badge>
        </button>
      )
    }

    return (
      <button onClick={() => handleEdit(field)} className="text-left hover:underline">
        {field.value === null || field.value === undefined || String(field.value).trim() === '' ? (
          <span className="text-muted-foreground">Non défini</span>
        ) : (
          String(field.value)
        )}
      </button>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-sm text-muted-foreground">Chargement des paramètres...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Error and success messages */}
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="rounded-md bg-green-50 dark:bg-green-900/20 p-3 text-sm text-green-600 dark:text-green-400">
          {successMessage}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-2">
        <div>
          <h1 className="text-2xl font-bold">Paramètres Généraux</h1>
          <p className="text-sm text-muted-foreground">Configuration globale de l'application</p>
        </div>

        {/* Category filters */}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={categoryFilter === null ? "default" : "outline"}
            onClick={() => setCategoryFilter(null)}
          >
            Tous ({settingsFields.length})
          </Button>
          {categories.map((category) => {
            const count = settingsFields.filter((f) => f.category === category).length
            return (
              <Button
                key={category}
                size="sm"
                variant={categoryFilter === category ? "default" : "outline"}
                onClick={() => handleCategoryClick(category)}
              >
                {category} ({count})
              </Button>
            )
          })}
        </div>
      </div>

      {/* Settings Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Catégorie</TableHead>
              <TableHead>Paramètre</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Valeur</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSettings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Aucun paramètre trouvé
                </TableCell>
              </TableRow>
            ) : (
              filteredSettings.map((field) => (
                <TableRow key={field.key}>
                  <TableCell>
                    <button onClick={() => handleCategoryClick(field.category)} className="hover:underline">
                      {field.category}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{field.label}</span>
                      {modifiedKeys.has(field.key) && (
                        <Badge variant="secondary" className="text-xs">
                          Modifié
                        </Badge>
                      )}
                      {!field.editable && (
                        <Badge variant="outline" className="text-xs">
                          Lecture seule
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">{field.key}</p>
                  </TableCell>
                  <TableCell className="text-sm">{field.description}</TableCell>
                  <TableCell>{renderValueCell(field)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
