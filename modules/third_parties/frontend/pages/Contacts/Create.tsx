"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { auth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  IconArrowLeft,
  IconDeviceFloppy,
  IconUser,
} from "@tabler/icons-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { createContact, getCompanies } from "../../api"
import { ContactRole, ContactStatus, ContactRoleLabels, ContactStatusLabels } from "../../types"
import type { ContactCreate, Company } from "../../types"

export default function CreateContact() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [isSaving, setIsSaving] = useState(false)
  const [loadingCompanies, setLoadingCompanies] = useState(true)
  const [companies, setCompanies] = useState<Company[]>([])

  const [formData, setFormData] = useState<ContactCreate>({
    company_id: searchParams.get("company_id") || "",
    first_name: "",
    last_name: "",
    civility: "",
    job_title: "",
    department: "",
    role: ContactRole.EMPLOYEE,
    email: "",
    phone: "",
    mobile: "",
    extension: "",
    linkedin_url: "",
    twitter_handle: "",
    status: ContactStatus.ACTIVE,
    notes: "",
    is_primary: false,
  })

  useEffect(() => {
    loadCompanies()
  }, [])

  const loadCompanies = async () => {
    try {
      const token = auth.getToken()
      if (!token) {
        router.push("/login")
        return
      }

      setLoadingCompanies(true)
      const response = await getCompanies(token, { limit: 1000, status: "active" })
      setCompanies(response.data || [])
    } catch (error) {
      console.error("Failed to load companies:", error)
      toast({
        title: "Erreur",
        description: "Impossible de charger les entreprises",
        variant: "destructive",
      })
    } finally {
      setLoadingCompanies(false)
    }
  }

  const handleChange = (field: keyof ContactCreate, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.company_id) {
      toast({
        title: "Erreur",
        description: "Veuillez sélectionner une entreprise",
        variant: "destructive",
      })
      return
    }

    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      toast({
        title: "Erreur",
        description: "Le prénom et le nom sont requis",
        variant: "destructive",
      })
      return
    }

    if (!formData.email.trim()) {
      toast({
        title: "Erreur",
        description: "L'email est requis",
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)
    try {
      const token = auth.getToken()
      if (!token) {
        router.push("/login")
        return
      }

      // Clean up empty optional fields
      const cleanData: any = { ...formData }
      Object.keys(cleanData).forEach((key) => {
        if (cleanData[key] === "" || cleanData[key] === undefined) {
          delete cleanData[key]
        }
      })

      const created = await createContact(token, cleanData)

      toast({
        title: "Contact créé",
        description: `"${created.first_name} ${created.last_name}" a été créé avec succès`,
      })

      router.push(`/third-parties/contacts/${created.id}`)
    } catch (error: any) {
      console.error("Failed to create contact:", error)
      toast({
        title: "Erreur",
        description: error.message || "Impossible de créer le contact",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (loadingCompanies) {
    return (
      <div className="container max-w-4xl mx-auto px-4 py-6 sm:py-8">
        <Skeleton className="h-12 w-64 mb-6" />
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="container max-w-4xl mx-auto px-4 py-6 sm:py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/third-parties/contacts")}
        >
          <IconArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <IconUser className="h-6 w-6" />
            Nouveau contact
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Créer un nouveau contact pour une entreprise
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Company Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Entreprise</CardTitle>
            <CardDescription>
              Sélectionnez l'entreprise associée à ce contact
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company_id">
                Entreprise <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.company_id}
                onValueChange={(value) => handleChange("company_id", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une entreprise" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Informations personnelles</CardTitle>
            <CardDescription>
              Informations de base du contact
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="civility">Civilité</Label>
                <Select
                  value={formData.civility}
                  onValueChange={(value) => handleChange("civility", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mr">M.</SelectItem>
                    <SelectItem value="mrs">Mme</SelectItem>
                    <SelectItem value="ms">Mlle</SelectItem>
                    <SelectItem value="dr">Dr</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="first_name">
                  Prénom <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="first_name"
                  placeholder="Jean"
                  value={formData.first_name}
                  onChange={(e) => handleChange("first_name", e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="last_name">
                  Nom <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="last_name"
                  placeholder="Dupont"
                  value={formData.last_name}
                  onChange={(e) => handleChange("last_name", e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="job_title">Poste</Label>
                <Input
                  id="job_title"
                  placeholder="Directeur Commercial"
                  value={formData.job_title}
                  onChange={(e) => handleChange("job_title", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="department">Département</Label>
                <Input
                  id="department"
                  placeholder="Commercial"
                  value={formData.department}
                  onChange={(e) => handleChange("department", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="role">Rôle</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) => handleChange("role", value as ContactRole)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ContactRoleLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Statut</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => handleChange("status", value as ContactStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ContactStatusLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="is_primary">Contact principal</Label>
                <p className="text-xs text-muted-foreground">
                  Marquer ce contact comme contact principal de l'entreprise
                </p>
              </div>
              <Switch
                id="is_primary"
                checked={formData.is_primary}
                onCheckedChange={(checked) => handleChange("is_primary", checked)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle>Coordonnées</CardTitle>
            <CardDescription>
              Informations de contact
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="jean.dupont@entreprise.com"
                value={formData.email}
                onChange={(e) => handleChange("email", e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Téléphone</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+33 1 23 45 67 89"
                  value={formData.phone}
                  onChange={(e) => handleChange("phone", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mobile">Mobile</Label>
                <Input
                  id="mobile"
                  type="tel"
                  placeholder="+33 6 12 34 56 78"
                  value={formData.mobile}
                  onChange={(e) => handleChange("mobile", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="extension">Extension</Label>
                <Input
                  id="extension"
                  placeholder="1234"
                  value={formData.extension}
                  onChange={(e) => handleChange("extension", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="linkedin_url">LinkedIn</Label>
                <Input
                  id="linkedin_url"
                  type="url"
                  placeholder="https://linkedin.com/in/jeandupont"
                  value={formData.linkedin_url}
                  onChange={(e) => handleChange("linkedin_url", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="twitter_handle">Twitter</Label>
                <Input
                  id="twitter_handle"
                  placeholder="@jeandupont"
                  value={formData.twitter_handle}
                  onChange={(e) => handleChange("twitter_handle", e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Additional Information */}
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
            <CardDescription>
              Informations complémentaires sur le contact
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="notes">Notes internes</Label>
              <Textarea
                id="notes"
                placeholder="Notes privées à usage interne..."
                value={formData.notes}
                onChange={(e) => handleChange("notes", e.target.value)}
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/third-parties/contacts")}
            disabled={isSaving}
            className="w-full sm:w-auto"
          >
            Annuler
          </Button>
          <Button
            type="submit"
            disabled={isSaving || !formData.company_id || !formData.first_name.trim() || !formData.last_name.trim() || !formData.email.trim()}
            className="w-full sm:w-auto"
          >
            <IconDeviceFloppy className="h-4 w-4 mr-2" />
            {isSaving ? "Création..." : "Créer le contact"}
          </Button>
        </div>
      </form>
    </div>
  )
}
