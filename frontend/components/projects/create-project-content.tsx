"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { CalendarIcon, Plus, X, Upload, Save, ArrowLeft } from "lucide-react"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { cn } from "@/lib/utils"
import Link from "next/link"

export function CreateProjectContent() {
  const [startDate, setStartDate] = useState<Date>()
  const [endDate, setEndDate] = useState<Date>()
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState("")
  const [teamMembers, setTeamMembers] = useState<string[]>([])
  const [milestones, setMilestones] = useState<Array<{ name: string; date: Date | undefined }>>([])

  const addTag = () => {
    if (newTag && !tags.includes(newTag)) {
      setTags([...tags, newTag])
      setNewTag("")
    }
  }

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag))
  }

  const addMilestone = () => {
    setMilestones([...milestones, { name: "", date: undefined }])
  }

  const removeMilestone = (index: number) => {
    setMilestones(milestones.filter((_, i) => i !== index))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    console.log("[v0] Creating project with full details...")
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/projects/list">
            <Button variant="ghost" size="sm" className="h-8">
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              Retour
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-bold leading-none">Nouveau Projet</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Créer un projet avec toutes les options</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs">
            <Save className="h-3.5 w-3.5 mr-1.5" />
            Enregistrer comme brouillon
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={handleSubmit}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Créer le projet
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="general" className="flex-1">
        <TabsList className="h-9">
          <TabsTrigger value="general" className="text-xs">Général</TabsTrigger>
          <TabsTrigger value="team" className="text-xs">Équipe</TabsTrigger>
          <TabsTrigger value="budget" className="text-xs">Budget & Ressources</TabsTrigger>
          <TabsTrigger value="milestones" className="text-xs">Jalons</TabsTrigger>
          <TabsTrigger value="documents" className="text-xs">Documents</TabsTrigger>
          <TabsTrigger value="settings" className="text-xs">Paramètres</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Informations générales</CardTitle>
              <CardDescription className="text-xs">Détails de base du projet</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="name">Nom du projet *</Label>
                  <Input id="name" placeholder="Ex: Plateforme offshore Alpha" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">Code projet</Label>
                  <Input id="code" placeholder="Ex: PRJ-2024-001" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="client" className="text-xs">Client *</Label>
                  <Input id="client" placeholder="Ex: TotalEnergies" className="h-9 text-xs" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manager" className="text-xs">Chef de projet</Label>
                  <Select>
                    <SelectTrigger id="manager" className="h-9 text-xs">
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user1" className="text-xs">Jean Dupont</SelectItem>
                      <SelectItem value="user2" className="text-xs">Marie Martin</SelectItem>
                      <SelectItem value="user3" className="text-xs">Pierre Durand</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-xs">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Description détaillée du projet..."
                  rows={3}
                  className="resize-none text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Date de début *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !startDate && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, "PPP", { locale: fr }) : "Sélectionner"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>Date de fin *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !endDate && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, "PPP", { locale: fr }) : "Sélectionner"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="priority">Priorité *</Label>
                  <Select defaultValue="medium">
                    <SelectTrigger id="priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Basse</SelectItem>
                      <SelectItem value="medium">Moyenne</SelectItem>
                      <SelectItem value="high">Haute</SelectItem>
                      <SelectItem value="critical">Critique</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status">Statut *</Label>
                  <Select defaultValue="planning">
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="planning">Planification</SelectItem>
                      <SelectItem value="in-progress">En cours</SelectItem>
                      <SelectItem value="on-hold">En attente</SelectItem>
                      <SelectItem value="completed">Terminé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Catégorie</Label>
                  <Select>
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="offshore">Offshore</SelectItem>
                      <SelectItem value="onshore">Onshore</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="construction">Construction</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => removeTag(tag)} />
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ajouter un tag..."
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                  />
                  <Button type="button" variant="outline" onClick={addTag}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Équipe projet</CardTitle>
              <CardDescription className="text-xs">Gérer les membres de l'équipe</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="w-full bg-transparent">
                <Plus className="h-4 w-4 mr-2" />
                Ajouter un membre
              </Button>
              <div className="space-y-2">
                {["Jean Dupont", "Marie Martin", "Pierre Durand"].map((member) => (
                  <div key={member} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>
                          {member
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{member}</p>
                        <p className="text-sm text-muted-foreground">Chef de projet</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="budget" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Budget & Ressources</CardTitle>
              <CardDescription className="text-xs">Gérer le budget et les ressources du projet</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="budget">Budget total (€)</Label>
                  <Input id="budget" type="number" placeholder="Ex: 500000" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency">Devise</Label>
                  <Select defaultValue="eur">
                    <SelectTrigger id="currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eur">EUR (€)</SelectItem>
                      <SelectItem value="usd">USD ($)</SelectItem>
                      <SelectItem value="gbp">GBP (£)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="milestones" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Jalons du projet</CardTitle>
              <CardDescription className="text-xs">Définir les étapes clés du projet</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="w-full bg-transparent" onClick={addMilestone}>
                <Plus className="h-4 w-4 mr-2" />
                Ajouter un jalon
              </Button>
              <div className="space-y-2">
                {milestones.map((milestone, index) => (
                  <div key={index} className="flex items-center gap-2 p-3 border rounded-lg">
                    <Input placeholder="Nom du jalon" className="flex-1" />
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-[200px] bg-transparent">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {milestone.date ? format(milestone.date, "PPP", { locale: fr }) : "Date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={milestone.date}
                          onSelect={(date) => {
                            const newMilestones = [...milestones]
                            newMilestones[index].date = date
                            setMilestones(newMilestones)
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    <Button variant="ghost" size="sm" onClick={() => removeMilestone(index)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Documents</CardTitle>
              <CardDescription className="text-xs">Joindre des documents au projet</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-2">
                  Glissez-déposez des fichiers ici ou cliquez pour parcourir
                </p>
                <Button variant="outline" size="sm">
                  Parcourir les fichiers
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Paramètres avancés</CardTitle>
              <CardDescription className="text-xs">Configuration supplémentaire du projet</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="visibility">Visibilité</Label>
                <Select defaultValue="private">
                  <SelectTrigger id="visibility">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Privé</SelectItem>
                    <SelectItem value="team">Équipe</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
