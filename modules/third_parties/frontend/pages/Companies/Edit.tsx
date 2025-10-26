"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { auth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  IconArrowLeft,
  IconDeviceFloppy,
  IconBuilding,
} from "@tabler/icons-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/hooks/use-toast"
import { getCompany, updateCompany } from "../../api"
import { CompanyType, CompanyStatus, CompanyTypeLabels, CompanyStatusLabels } from "../../types"
import type { Company, CompanyUpdate } from "../../types"

interface EditCompanyProps {
  companyId: string
}

export default function EditCompany({ companyId }: EditCompanyProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [company, setCompany] = useState<Company | null>(null)

  useEffect(() => {
    if (companyId) {
      loadCompany()
    }
  }, [companyId])

  const loadCompany = async () => {
    try {
      const token = auth.getToken()
      if (!token) {
        router.push("/login")
        return
      }

      setLoading(true)
      const data = await getCompany(token, companyId)
      setCompany(data)
    } catch (error) {
      console.error("Failed to load company:", error)
      toast({
        title: "Erreur",
        description: "Impossible de charger l'entreprise",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (field: keyof Company, value: any) => {
    if (!company) return
    setCompany({ ...company, [field]: value })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!company) return

    if (!company.name.trim()) {
      toast({
        title: "Erreur",
        description: "Le nom de l'entreprise est requis",
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

      // Prepare update data
      const updateData: CompanyUpdate = {
        name: company.name,
        legal_name: company.legal_name || undefined,
        registration_number: company.registration_number || undefined,
        vat_number: company.vat_number || undefined,
        company_type: company.company_type,
        status: company.status,
        email: company.email || undefined,
        phone: company.phone || undefined,
        website: company.website || undefined,
        address_line1: company.address_line1 || undefined,
        address_line2: company.address_line2 || undefined,
        city: company.city || undefined,
        postal_code: company.postal_code || undefined,
        state: company.state || undefined,
        country: company.country || undefined,
        industry: company.industry || undefined,
        description: company.description || undefined,
        notes: company.notes || undefined,
      }

      const updated = await updateCompany(token, company.id, updateData)

      toast({
        title: "Entreprise mise à jour",
        description: `"${updated.name}" a été mise à jour avec succès`,
      })

      router.push(`/third-parties/companies/${company.id}`)
    } catch (error: any) {
      console.error("Failed to update company:", error)
      toast({
        title: "Erreur",
        description: error.message || "Impossible de mettre à jour l'entreprise",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="container max-w-4xl mx-auto px-4 py-6 sm:py-8">
        <Skeleton className="h-12 w-64 mb-6" />
        <div className="space-y-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (!company) {
    return (
      <div className="container max-w-4xl mx-auto px-4 py-6 sm:py-8">
        <p>Entreprise non trouvée</p>
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
          onClick={() => router.push(`/third-parties/companies/${company.id}`)}
        >
          <IconArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            <IconBuilding className="h-6 w-6" />
            Modifier {company.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Modifier les informations de l'entreprise
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Informations générales</CardTitle>
            <CardDescription>
              Informations de base de l'entreprise
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">
                  Nom commercial <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  placeholder="Acme Corporation"
                  value={company.name}
                  onChange={(e) => handleChange("name", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="legal_name">Raison sociale</Label>
                <Input
                  id="legal_name"
                  placeholder="Acme Corporation SARL"
                  value={company.legal_name || ""}
                  onChange={(e) => handleChange("legal_name", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="company_type">
                  Type <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={company.company_type}
                  onValueChange={(value) => handleChange("company_type", value as CompanyType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CompanyTypeLabels).map(([value, label]) => (
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
                  value={company.status}
                  onValueChange={(value) => handleChange("status", value as CompanyStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CompanyStatusLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="registration_number">SIRET/SIREN</Label>
                <Input
                  id="registration_number"
                  placeholder="123 456 789 00012"
                  value={company.registration_number || ""}
                  onChange={(e) => handleChange("registration_number", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="vat_number">Numéro de TVA</Label>
                <Input
                  id="vat_number"
                  placeholder="FR12345678901"
                  value={company.vat_number || ""}
                  onChange={(e) => handleChange("vat_number", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="industry">Secteur d'activité</Label>
              <Input
                id="industry"
                placeholder="Technologies de l'information"
                value={company.industry || ""}
                onChange={(e) => handleChange("industry", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle>Coordonnées</CardTitle>
            <CardDescription>
              Informations de contact de l'entreprise
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="contact@acme.com"
                  value={company.email || ""}
                  onChange={(e) => handleChange("email", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Téléphone</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+33 1 23 45 67 89"
                  value={company.phone || ""}
                  onChange={(e) => handleChange("phone", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">Site web</Label>
              <Input
                id="website"
                type="url"
                placeholder="https://www.acme.com"
                value={company.website || ""}
                onChange={(e) => handleChange("website", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Address */}
        <Card>
          <CardHeader>
            <CardTitle>Adresse</CardTitle>
            <CardDescription>
              Adresse du siège social
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="address_line1">Adresse ligne 1</Label>
              <Input
                id="address_line1"
                placeholder="123 Rue de la Paix"
                value={company.address_line1 || ""}
                onChange={(e) => handleChange("address_line1", e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address_line2">Adresse ligne 2</Label>
              <Input
                id="address_line2"
                placeholder="Bâtiment A, 2ème étage"
                value={company.address_line2 || ""}
                onChange={(e) => handleChange("address_line2", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="postal_code">Code postal</Label>
                <Input
                  id="postal_code"
                  placeholder="75001"
                  value={company.postal_code || ""}
                  onChange={(e) => handleChange("postal_code", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">Ville</Label>
                <Input
                  id="city"
                  placeholder="Paris"
                  value={company.city || ""}
                  onChange={(e) => handleChange("city", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="state">Région/État</Label>
                <Input
                  id="state"
                  placeholder="Île-de-France"
                  value={company.state || ""}
                  onChange={(e) => handleChange("state", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="country">Pays</Label>
              <Input
                id="country"
                placeholder="France"
                value={company.country || ""}
                onChange={(e) => handleChange("country", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Additional Information */}
        <Card>
          <CardHeader>
            <CardTitle>Informations complémentaires</CardTitle>
            <CardDescription>
              Description et notes sur l'entreprise
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Description courte de l'entreprise..."
                value={company.description || ""}
                onChange={(e) => handleChange("description", e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes internes</Label>
              <Textarea
                id="notes"
                placeholder="Notes privées à usage interne..."
                value={company.notes || ""}
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
            onClick={() => router.push(`/third-parties/companies/${company.id}`)}
            disabled={isSaving}
            className="w-full sm:w-auto"
          >
            Annuler
          </Button>
          <Button
            type="submit"
            disabled={isSaving || !company.name.trim()}
            className="w-full sm:w-auto"
          >
            <IconDeviceFloppy className="h-4 w-4 mr-2" />
            {isSaving ? "Enregistrement..." : "Enregistrer les modifications"}
          </Button>
        </div>
      </form>
    </div>
  )
}
