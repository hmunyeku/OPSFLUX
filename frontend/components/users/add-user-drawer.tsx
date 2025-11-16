"use client"

import { useState } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { roles } from "@/lib/user-management-data"

interface AddUserDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd?: (userData: any) => void
}

export function AddUserDrawer({ open, onOpenChange, onAdd }: AddUserDrawerProps) {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    jobTitle: "",
    employeeId: "",
    department: "",
    location: "",
    role: "role-user",
    status: "active",
    sendInvitation: true,
    requirePasswordChange: true,
    twoFactorEnabled: false,
  })

  const handleCreate = () => {
    if (onAdd) {
      onAdd(formData)
    }
    onOpenChange(false)
    // Reset form
    setFormData({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      jobTitle: "",
      employeeId: "",
      department: "",
      location: "",
      role: "role-user",
      status: "active",
      sendInvitation: true,
      requirePasswordChange: true,
      twoFactorEnabled: false,
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[600px] sm:max-w-[600px]">
        <SheetHeader>
          <SheetTitle>Ajouter un nouvel utilisateur</SheetTitle>
          <SheetDescription>Créer un nouveau compte utilisateur et attribuer des permissions</SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-180px)] pr-4">
          <div className="space-y-6 py-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Informations de base</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">Prénom *</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    placeholder="Jean"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Nom *</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    placeholder="Dupont"
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="email">Adresse email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="jean.dupont@entreprise.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Numéro de téléphone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+33 1 23 45 67 89"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="jobTitle">Poste</Label>
                  <Input
                    id="jobTitle"
                    value={formData.jobTitle}
                    onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                    placeholder="Ingénieur Logiciel"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employeeId">ID Employé</Label>
                  <Input
                    id="employeeId"
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                    placeholder="EMP001"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Organization */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Organisation</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="department">Département *</Label>
                  <Input
                    id="department"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    placeholder="Ingénierie"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Localisation</Label>
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    placeholder="Paris, France"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Account Settings */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Paramètres du compte</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="role">Rôle *</Label>
                  <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="sendInvitation">Envoyer un email d'invitation</Label>
                    <p className="text-xs text-muted-foreground">
                      L'utilisateur recevra un email pour configurer son compte
                    </p>
                  </div>
                  <Switch
                    id="sendInvitation"
                    checked={formData.sendInvitation}
                    onCheckedChange={(checked) => setFormData({ ...formData, sendInvitation: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="requirePasswordChange">Exiger un changement de mot de passe</Label>
                    <p className="text-xs text-muted-foreground">
                      L'utilisateur doit changer son mot de passe à la première connexion
                    </p>
                  </div>
                  <Switch
                    id="requirePasswordChange"
                    checked={formData.requirePasswordChange}
                    onCheckedChange={(checked) => setFormData({ ...formData, requirePasswordChange: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="2fa">Activer 2FA</Label>
                    <p className="text-xs text-muted-foreground">Nécessite une authentification à deux facteurs</p>
                  </div>
                  <Switch
                    id="2fa"
                    checked={formData.twoFactorEnabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, twoFactorEnabled: checked })}
                  />
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 border-t bg-background p-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate}>Créer l'utilisateur</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
