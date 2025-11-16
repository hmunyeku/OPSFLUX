"use client"
import { Wifi, RefreshCw, Maximize2, Minimize2, HelpCircle, MessageSquare, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"

export function Footer() {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [helpQuery, setHelpQuery] = useState("")

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  const helpTopics = [
    { title: "Créer un nouveau MOC", description: "Guide pour créer une demande de modification", category: "MOCVue" },
    {
      title: "Gérer les utilisateurs",
      description: "Ajouter, modifier et supprimer des utilisateurs",
      category: "Paramètres",
    },
    {
      title: "Configurer les webhooks",
      description: "Intégrer des webhooks pour les notifications",
      category: "Développeurs",
    },
    { title: "Créer un dashboard", description: "Personnaliser votre tableau de bord", category: "Pilotage" },
    { title: "Gérer les rôles", description: "Configurer les permissions et rôles", category: "Paramètres" },
    { title: "Utiliser l'API", description: "Documentation de l'API REST", category: "Développeurs" },
  ]

  const filteredHelp = helpQuery
    ? helpTopics.filter(
        (topic) =>
          topic.title.toLowerCase().includes(helpQuery.toLowerCase()) ||
          topic.description.toLowerCase().includes(helpQuery.toLowerCase()),
      )
    : helpTopics

  return (
    <>
      <footer className="flex h-10 items-center justify-between border-t bg-card px-4 text-xs text-muted-foreground">
        {/* Left Section */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
            <span className="hidden sm:inline">Opérationnel</span>
          </div>
          <button className="flex items-center gap-1 hover:text-foreground transition-colors">
            <RefreshCw className="h-3 w-3" />
            <span className="hidden md:inline">Synchronisé il y a 2 min</span>
          </button>
          <div className="flex items-center gap-1">
            <Wifi className="h-3 w-3" />
            <span className="hidden sm:inline">En ligne</span>
          </div>
        </div>

        {/* Center Section */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAboutOpen(true)}
            className="hover:text-foreground transition-colors hidden sm:inline"
          >
            v2.4.1
          </button>
          <Badge variant="secondary" className="h-5 text-[10px] hidden sm:inline-flex">
            Production
          </Badge>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setHelpOpen(true)}
            title="Aide contextuelle"
          >
            <HelpCircle className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Assistant IA">
            <MessageSquare className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
          >
            {isFullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </Button>
          <span className="ml-2 hidden lg:inline">© 2025 OpsFlux • Confidentialité</span>
        </div>
      </footer>

      <Sheet open={helpOpen} onOpenChange={setHelpOpen}>
        <SheetContent side="right" className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>Aide contextuelle</SheetTitle>
            <SheetDescription>Recherchez de l'aide sur les fonctionnalités d'OpsFlux</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-4">
            <Input
              placeholder="Rechercher dans l'aide..."
              value={helpQuery}
              onChange={(e) => setHelpQuery(e.target.value)}
            />
            <ScrollArea className="h-[calc(100vh-200px)]">
              <div className="space-y-3">
                {filteredHelp.map((topic, index) => (
                  <button
                    key={index}
                    className="w-full text-left p-3 rounded-lg border hover:bg-accent transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h4 className="font-medium text-sm">{topic.title}</h4>
                        <p className="text-xs text-muted-foreground mt-1">{topic.description}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {topic.category}
                      </Badge>
                    </div>
                  </button>
                ))}
                {filteredHelp.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">Aucun résultat trouvé</p>
                )}
              </div>
            </ScrollArea>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={aboutOpen} onOpenChange={setAboutOpen}>
        <SheetContent side="right" className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>À propos d'OpsFlux</SheetTitle>
            <SheetDescription>Plateforme de gestion opérationnelle</SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center">
                <Info className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">OpsFlux</h3>
                <p className="text-sm text-muted-foreground">Version 2.4.1</p>
              </div>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <h4 className="font-medium mb-2">Description</h4>
                <p className="text-muted-foreground">
                  OpsFlux est une plateforme complète de gestion opérationnelle conçue pour optimiser les processus de
                  changement, la gestion des utilisateurs, et l'intégration des systèmes.
                </p>
              </div>

              <div>
                <h4 className="font-medium mb-2">Modules</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• MOCVue - Gestion des demandes de modification</li>
                  <li>• Pilotage - Tableaux de bord et analytics</li>
                  <li>• Paramètres - Configuration système</li>
                  <li>• Développeurs - API et intégrations</li>
                </ul>
              </div>

              <div>
                <h4 className="font-medium mb-2">Informations système</h4>
                <div className="space-y-1 text-muted-foreground">
                  <p>Environnement: Production</p>
                  <p>Dernière mise à jour: 15 janvier 2025</p>
                  <p>Licence: Propriétaire</p>
                </div>
              </div>

              <div className="pt-4 border-t">
                <p className="text-xs text-muted-foreground">© 2025 OpsFlux. Tous droits réservés.</p>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
