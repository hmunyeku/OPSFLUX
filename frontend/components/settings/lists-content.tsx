"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import {
  Plus,
  Edit2,
  Search,
  MapPin,
  Home,
  GraduationCap,
  Award,
  Briefcase,
  CheckCircle2,
  XCircle,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ListItem {
  id: string
  value: string
  description?: string
  active: boolean
  mandatory?: boolean
}

interface StaticList {
  id: string
  name: string
  description: string
  items: ListItem[]
}

const initialLists: StaticList[] = [
  {
    id: "destinations",
    name: "Destinations",
    description: "Liste des destinations disponibles",
    items: [
      { id: "1", value: "Douala", active: true },
      { id: "2", value: "Kribi", active: true },
      { id: "3", value: "Offshore Platform A", active: true },
      { id: "4", value: "Offshore Platform B", active: true },
    ],
  },
  {
    id: "accommodations",
    name: "Hébergements",
    description: "Types d'hébergement disponibles",
    items: [
      { id: "1", value: "Hotel Sawa", description: "Hotel", active: true },
      { id: "2", value: "Camp Base", description: "Camp", active: true },
      { id: "3", value: "Platform Quarters", description: "Offshore", active: true },
    ],
  },
  {
    id: "training_types",
    name: "Types de Formation",
    description: "Types de formation requis",
    items: [
      { id: "1", value: "Induction", active: true, mandatory: true },
      { id: "2", value: "Visite Médicale", active: true, mandatory: true },
      { id: "3", value: "RTS", active: true, mandatory: false },
      { id: "4", value: "Lutte Incendie", active: true, mandatory: true },
      { id: "5", value: "SST", active: true, mandatory: true },
    ],
  },
  {
    id: "certification_types",
    name: "Types d'Habilitation",
    description: "Types d'habilitation et certification",
    items: [
      { id: "1", value: "CACES", active: true },
      { id: "2", value: "Habilitation Électrique", active: true },
      { id: "3", value: "Travail en Hauteur", active: true },
      { id: "4", value: "Espace Confiné", active: true },
    ],
  },
  {
    id: "functions",
    name: "Fonctions",
    description: "Fonctions et postes disponibles",
    items: [
      { id: "1", value: "Ingénieur", active: true },
      { id: "2", value: "Technicien", active: true },
      { id: "3", value: "Chef de projet", active: true },
      { id: "4", value: "Superviseur", active: true },
    ],
  },
]

const listIcons = {
  destinations: MapPin,
  accommodations: Home,
  training_types: GraduationCap,
  certification_types: Award,
  functions: Briefcase,
}

export function ListsContent() {
  const [lists, setLists] = useState<StaticList[]>(initialLists)
  const [activeList, setActiveList] = useState(lists[0].id)
  const [searchQuery, setSearchQuery] = useState("")
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ListItem | null>(null)
  const [editValue, setEditValue] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editMandatory, setEditMandatory] = useState(false)

  const currentList = lists.find((l) => l.id === activeList)

  const filteredItems =
    currentList?.items.filter(
      (item) =>
        item.value.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchQuery.toLowerCase()),
    ) || []

  const handleAddItem = () => {
    if (!currentList) return

    const newItem: ListItem = {
      id: String(Date.now()),
      value: "",
      description: "",
      active: true,
    }

    setEditingItem(newItem)
    setEditValue("")
    setEditDescription("")
    setEditMandatory(false)
    setIsEditSheetOpen(true)
  }

  const handleDeleteItem = (itemId: string) => {
    setLists(
      lists.map((list) =>
        list.id === activeList ? { ...list, items: list.items.filter((item) => item.id !== itemId) } : list,
      ),
    )
  }

  const handleEditItem = (item: ListItem) => {
    setEditingItem(item)
    setEditValue(item.value)
    setEditDescription(item.description || "")
    setEditMandatory(item.mandatory || false)
    setIsEditSheetOpen(true)
  }

  const handleSaveItem = () => {
    if (!editingItem || !editValue.trim()) return

    if (editingItem.id && currentList?.items.find((i) => i.id === editingItem.id)) {
      setLists(
        lists.map((list) =>
          list.id === activeList
            ? {
                ...list,
                items: list.items.map((item) =>
                  item.id === editingItem.id
                    ? { ...item, value: editValue, description: editDescription, mandatory: editMandatory }
                    : item,
                ),
              }
            : list,
        ),
      )
    } else {
      const newItem: ListItem = {
        id: String(Date.now()),
        value: editValue,
        description: editDescription,
        active: true,
        mandatory: editMandatory,
      }
      setLists(lists.map((list) => (list.id === activeList ? { ...list, items: [...list.items, newItem] } : list)))
    }

    setIsEditSheetOpen(false)
    setEditingItem(null)
    setEditValue("")
    setEditDescription("")
    setEditMandatory(false)
  }

  const handleToggleActive = (itemId: string) => {
    setLists(
      lists.map((list) =>
        list.id === activeList
          ? {
              ...list,
              items: list.items.map((item) => (item.id === itemId ? { ...item, active: !item.active } : item)),
            }
          : list,
      ),
    )
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6 p-3 sm:p-4 md:p-6">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Listes Statiques</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Configurez les listes de valeurs utilisées dans l'application
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 md:gap-6">
        <div className="hidden lg:block lg:w-72 shrink-0">
          <Card className="border-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Catégories</CardTitle>
              <CardDescription className="text-xs">Sélectionnez une liste à gérer</CardDescription>
            </CardHeader>
            <CardContent className="p-2 space-y-1">
              {lists.map((list) => {
                const Icon = listIcons[list.id as keyof typeof listIcons]
                return (
                  <button
                    key={list.id}
                    onClick={() => setActiveList(list.id)}
                    className={cn(
                      "w-full text-left px-3 py-3 rounded-lg text-sm transition-all flex items-start gap-3 group",
                      activeList === list.id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "hover:bg-muted/50 text-foreground",
                    )}
                  >
                    {Icon && (
                      <Icon
                        className={cn(
                          "h-5 w-5 shrink-0 mt-0.5",
                          activeList === list.id
                            ? "text-primary-foreground"
                            : "text-muted-foreground group-hover:text-foreground",
                        )}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{list.name}</div>
                      <div
                        className={cn(
                          "text-xs mt-0.5",
                          activeList === list.id ? "text-primary-foreground/80" : "text-muted-foreground",
                        )}
                      >
                        {list.items.length} élément{list.items.length > 1 ? "s" : ""}
                      </div>
                    </div>
                  </button>
                )
              })}
            </CardContent>
          </Card>
        </div>

        <div className="lg:hidden">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {lists.map((list) => {
              const Icon = listIcons[list.id as keyof typeof listIcons]
              return (
                <button
                  key={list.id}
                  onClick={() => setActiveList(list.id)}
                  className={cn(
                    "px-4 py-2.5 rounded-lg text-sm whitespace-nowrap transition-all flex items-center gap-2 shrink-0",
                    activeList === list.id
                      ? "bg-primary text-primary-foreground shadow-sm font-medium"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted",
                  )}
                >
                  {Icon && <Icon className="h-4 w-4" />}
                  {list.name}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {currentList && (
            <Card className="border-2">
              <CardHeader className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="text-xl">{currentList.name}</CardTitle>
                    <CardDescription>{currentList.description}</CardDescription>
                  </div>
                  <Button onClick={handleAddItem} className="w-full sm:w-auto shrink-0 shadow-sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Ajouter
                  </Button>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {filteredItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <div className="rounded-full bg-muted p-3 mb-4">
                      <Search className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <h3 className="font-semibold text-lg mb-1">{searchQuery ? "Aucun résultat" : "Liste vide"}</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {searchQuery
                        ? "Aucun élément ne correspond à votre recherche"
                        : "Commencez par ajouter un élément à cette liste"}
                    </p>
                    {!searchQuery && (
                      <Button onClick={handleAddItem} size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Ajouter un élément
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="min-w-[200px] font-semibold">Valeur</TableHead>
                          <TableHead className="min-w-[200px] font-semibold">Description</TableHead>
                          {currentList.id === "training_types" && (
                            <TableHead className="w-[120px] font-semibold">Obligatoire</TableHead>
                          )}
                          <TableHead className="w-[100px] font-semibold">Statut</TableHead>
                          <TableHead className="w-[120px] text-right font-semibold">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredItems.map((item) => (
                          <TableRow key={item.id} className="group">
                            <TableCell className="font-medium">{item.value}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {item.description || <span className="italic">Aucune description</span>}
                            </TableCell>
                            {currentList.id === "training_types" && (
                              <TableCell>
                                <Badge variant={item.mandatory ? "default" : "secondary"} className="font-medium">
                                  {item.mandatory ? (
                                    <>
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      Oui
                                    </>
                                  ) : (
                                    <>
                                      <XCircle className="h-3 w-3 mr-1" />
                                      Non
                                    </>
                                  )}
                                </Badge>
                              </TableCell>
                            )}
                            <TableCell>
                              <Badge
                                variant={item.active ? "default" : "secondary"}
                                className="cursor-pointer font-medium transition-all hover:opacity-80"
                                onClick={() => handleToggleActive(item.id)}
                              >
                                {item.active ? "Actif" : "Inactif"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleEditItem(item)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteItem(item.id)}
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Sheet open={isEditSheetOpen} onOpenChange={setIsEditSheetOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {editingItem?.id && currentList?.items.find((i) => i.id === editingItem.id)
                ? "Modifier l'élément"
                : "Nouvel élément"}
            </SheetTitle>
            <SheetDescription>{currentList?.name}</SheetDescription>
          </SheetHeader>

          <div className="space-y-6 py-6">
            <div className="space-y-2">
              <Label htmlFor="value">Valeur *</Label>
              <Input
                id="value"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="Entrez la valeur"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Entrez une description (optionnel)"
                rows={3}
              />
            </div>

            {currentList?.id === "training_types" && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="mandatory"
                  checked={editMandatory}
                  onCheckedChange={(checked) => setEditMandatory(checked as boolean)}
                />
                <Label htmlFor="mandatory" className="text-sm font-normal cursor-pointer">
                  Formation obligatoire
                </Label>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button onClick={handleSaveItem} disabled={!editValue.trim()} className="flex-1">
                Enregistrer
              </Button>
              <Button variant="outline" onClick={() => setIsEditSheetOpen(false)} className="flex-1">
                Annuler
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
