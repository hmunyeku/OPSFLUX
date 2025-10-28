"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  IconSearch,
  IconRefresh,
  IconFileText,
  IconAlertCircle,
  IconCheck,
} from "@tabler/icons-react"
import ContentSection from "../components/content-section"
import { useToast } from "@/hooks/use-toast"
import { searchDocuments, type SearchResult } from "@/api/search"
import { useTranslation } from "@/hooks/use-translation"
import { PermissionGuard } from "@/components/permission-guard"

export default function SearchPage() {
  return (
    <PermissionGuard permission="core.search.query">
      <SearchPageContent />
    </PermissionGuard>
  )
}

function SearchPageContent() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [selectedCollections, setSelectedCollections] = useState<string[]>([])
  const [fuzzySearch, setFuzzySearch] = useState(true)

  const { toast } = useToast()
  const { t } = useTranslation("core.search")

  // Collections disponibles
  const availableCollections = [
    { id: "users", label: "Utilisateurs" },
    { id: "incidents", label: "Incidents" },
    { id: "tasks", label: "Tâches" },
    { id: "documents", label: "Documents" },
    { id: "modules", label: "Modules" },
  ]

  const handleSearch = async () => {
    if (!query.trim()) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Veuillez entrer une requête de recherche",
      })
      return
    }

    setSearching(true)
    setSearched(false)
    try {
      const data = await searchDocuments({
        query: query.trim(),
        collections: selectedCollections.length > 0 ? selectedCollections : undefined,
        fuzzy: fuzzySearch,
        limit: 50,
      })
      setResults(data.results)
      setSearched(true)
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible d'effectuer la recherche",
      })
    } finally {
      setSearching(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const toggleCollection = (collectionId: string) => {
    setSelectedCollections(prev =>
      prev.includes(collectionId)
        ? prev.filter(id => id !== collectionId)
        : [...prev, collectionId]
    )
  }

  return (
    <ContentSection
      title="Recherche Full-Text"
      desc="Recherchez dans tous les contenus de l'application"
      className="w-full lg:max-w-full"
    >
      <div className="space-y-6">
        {/* Barre de recherche */}
        <Card>
          <CardHeader>
            <CardTitle>Rechercher</CardTitle>
            <CardDescription>
              Effectuez une recherche full-text dans les contenus indexés
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Input de recherche */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="pl-10"
                />
              </div>
              <Button onClick={handleSearch} disabled={searching}>
                {searching ? (
                  <>
                    <IconRefresh className="mr-2 h-4 w-4 animate-spin" />
                    Recherche...
                  </>
                ) : (
                  <>
                    <IconSearch className="mr-2 h-4 w-4" />
                    Rechercher
                  </>
                )}
              </Button>
            </div>

            {/* Options de recherche */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="fuzzy"
                  checked={fuzzySearch}
                  onCheckedChange={(checked) => setFuzzySearch(checked as boolean)}
                />
                <label
                  htmlFor="fuzzy"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Recherche floue (tolère les fautes de frappe)
                </label>
              </div>

              {/* Collections */}
              <div className="space-y-2">
                <div className="text-sm font-medium">Collections à rechercher :</div>
                <div className="flex flex-wrap gap-2">
                  {availableCollections.map((collection) => (
                    <Badge
                      key={collection.id}
                      variant={selectedCollections.includes(collection.id) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleCollection(collection.id)}
                    >
                      {selectedCollections.includes(collection.id) && (
                        <IconCheck className="mr-1 h-3 w-3" />
                      )}
                      {collection.label}
                    </Badge>
                  ))}
                </div>
                {selectedCollections.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Aucune collection sélectionnée = recherche dans toutes les collections
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Résultats */}
        {searched && (
          <Card>
            <CardHeader>
              <CardTitle>Résultats de recherche</CardTitle>
              <CardDescription>
                {results.length} résultat{results.length > 1 ? 's' : ''} trouvé{results.length > 1 ? 's' : ''}
                {query && ` pour "${query}"`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {results.length > 0 ? (
                <div className="space-y-4">
                  {results.map((result, index) => (
                    <div
                      key={`${result.collection}-${result.doc_id}-${index}`}
                      className="rounded-lg border p-4 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <IconFileText className="h-4 w-4 text-muted-foreground" />
                            <Badge variant="secondary">{result.collection}</Badge>
                            <span className="text-sm text-muted-foreground">
                              Score: {(result.score * 100).toFixed(1)}%
                            </span>
                          </div>

                          <div className="space-y-1">
                            <h4 className="font-medium">
                              {result.document.title as string ||
                               result.document.name as string ||
                               `Document ${result.doc_id}`}
                            </h4>
                            {result.document.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {result.document.description as string}
                              </p>
                            )}
                          </div>

                          {/* Métadonnées */}
                          {result.metadata && Object.keys(result.metadata).length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {Object.entries(result.metadata).map(([key, value]) => (
                                <Badge key={key} variant="outline" className="text-xs">
                                  {key}: {String(value)}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Score visuel */}
                        <div className="text-right">
                          <div
                            className="h-2 w-20 rounded-full bg-muted overflow-hidden"
                            title={`Score: ${(result.score * 100).toFixed(1)}%`}
                          >
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${result.score * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <IconAlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Aucun résultat trouvé</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Aucun document ne correspond à votre recherche.
                    Essayez avec d'autres mots-clés ou activez la recherche floue.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Instructions */}
        {!searched && (
          <Card>
            <CardHeader>
              <CardTitle>Comment utiliser la recherche</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <IconCheck className="h-4 w-4 text-green-600" />
                  Recherche full-text
                </h4>
                <p className="text-sm text-muted-foreground pl-6">
                  La recherche analyse le contenu complet des documents indexés (titres, descriptions, contenus).
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <IconCheck className="h-4 w-4 text-green-600" />
                  Recherche floue
                </h4>
                <p className="text-sm text-muted-foreground pl-6">
                  Active la tolérance aux fautes de frappe. "incendie" trouvera aussi "incendi", "incendie", etc.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <IconCheck className="h-4 w-4 text-green-600" />
                  Filtres par collection
                </h4>
                <p className="text-sm text-muted-foreground pl-6">
                  Sélectionnez une ou plusieurs collections pour limiter la recherche.
                  Sans sélection, la recherche s'effectue dans toutes les collections.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium flex items-center gap-2">
                  <IconCheck className="h-4 w-4 text-green-600" />
                  Score de pertinence
                </h4>
                <p className="text-sm text-muted-foreground pl-6">
                  Les résultats sont triés par pertinence. Un score élevé indique une meilleure correspondance.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ContentSection>
  )
}
