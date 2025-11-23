"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import {
  Maximize2,
  HelpCircle,
  Lightbulb,
  Minimize2,
  Book,
  ExternalLink,
  Keyboard,
  LifeBuoy,
  FileText,
  Github,
  Mail,
  Zap,
  Activity,
  Filter,
  Users,
  Shield,
  Settings,
  Package,
  CheckCircle2,
  Webhook,
  Play,
  FolderTree,
  Database,
  Wrench,
  Clock,
  Download,
  Navigation,
  LayoutGrid,
  Plus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ConnectionStatus } from "@/components/connection-status"
import { getHelpForRoute } from "@/lib/help-content"

// Icon mapping for dynamic rendering
const iconMap: Record<string, any> = {
  Zap,
  Activity,
  Filter,
  Users,
  Shield,
  Settings,
  Package,
  CheckCircle2,
  Webhook,
  Play,
  FolderTree,
  Database,
  Wrench,
  Clock,
  Download,
  Keyboard,
  Navigation,
  LayoutGrid,
  Plus,
  Book,
  HelpCircle,
}

export function BottomBar() {
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const pathname = usePathname()

  // Get contextual help for current page
  const pageHelp = React.useMemo(() => getHelpForRoute(pathname), [pathname])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between h-10 px-4 border-t bg-card">
      <div className="flex items-center gap-2">
        <ConnectionStatus />
        <span className="text-xs text-muted-foreground hidden md:inline">Dernière sauvegarde: il y a 2 min</span>
      </div>

      <div className="flex items-center gap-1">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1">
              <Lightbulb className="h-3 w-3" />
              <span className="hidden sm:inline text-xs">Aide</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[400px] sm:w-[500px] p-0">
            <SheetHeader className="px-6 py-4 border-b">
              <SheetTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-primary" />
                {pageHelp?.title || "Aide"}
              </SheetTitle>
              <p className="text-xs text-muted-foreground mt-1">{pageHelp?.description || "Aucune aide disponible pour cette page"}</p>
            </SheetHeader>
            <div className="p-6">
              <ScrollArea className="h-[calc(100vh-120px)]">
                <div className="space-y-4">
                  {pageHelp?.sections?.map((section, sectionIdx) => {
                    const IconComponent = iconMap[section.icon] || HelpCircle
                    return (
                      <Card key={sectionIdx}>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base flex items-center gap-2">
                            <IconComponent className="h-4 w-4" />
                            {section.title}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {section.items.map((item, itemIdx) => (
                            <div key={itemIdx}>
                              {item.shortcut ? (
                                <div className="flex items-center justify-between text-sm">
                                  <div>
                                    <p className="font-medium text-sm">{item.label}</p>
                                    <p className="text-xs text-muted-foreground">{item.description}</p>
                                  </div>
                                  <kbd className="px-2 py-1 text-xs bg-muted rounded shrink-0 ml-2">
                                    {item.shortcut}
                                  </kbd>
                                </div>
                              ) : (
                                <div>
                                  <p className="font-medium text-sm">{item.label}</p>
                                  <p className="text-xs text-muted-foreground">{item.description}</p>
                                </div>
                              )}
                              {itemIdx < section.items.length - 1 && <Separator className="my-2" />}
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )
                  })}

                  {/* Always show support section */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <LifeBuoy className="h-4 w-4" />
                        Support
                      </CardTitle>
                      <CardDescription>Besoin d'aide ? Contactez-nous</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Button variant="outline" size="sm" className="w-full justify-start gap-2 bg-transparent">
                        <Mail className="h-3 w-3" />
                        support@opsflux.com
                      </Button>
                      <Button variant="outline" size="sm" className="w-full justify-start gap-2 bg-transparent">
                        <FileText className="h-3 w-3" />
                        Ouvrir un ticket
                      </Button>
                      <Button variant="outline" size="sm" className="w-full justify-start gap-2 bg-transparent">
                        <Book className="h-3 w-3" />
                        Documentation
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </div>
          </SheetContent>
        </Sheet>

        <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={toggleFullscreen}>
          {isFullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          <span className="hidden sm:inline text-xs">{isFullscreen ? "Réduire" : "Agrandir"}</span>
        </Button>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1">
              <HelpCircle className="h-3 w-3" />
              <span className="hidden sm:inline text-xs">À propos</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[400px] sm:w-[500px] p-0">
            <SheetHeader className="px-6 py-4 border-b">
              <SheetTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-primary" />À propos d'OpsFlux
              </SheetTitle>
            </SheetHeader>
            <div className="p-6">
              <ScrollArea className="h-[calc(100vh-120px)]">
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Version</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-bold">1.0.0</span>
                        <Badge variant="secondary">Stable</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">Dernière mise à jour: 15 janvier 2025</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Description</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        OpsFlux est une plateforme complète de gestion d'opérations offshore intégrant la gestion de
                        projets, la logistique, les ressources humaines, la documentation et bien plus encore.
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Équipe</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <p className="text-sm font-medium">Développé par</p>
                        <p className="text-sm text-muted-foreground">OpsFlux Team</p>
                      </div>
                      <Separator />
                      <div>
                        <p className="text-sm font-medium">Licence</p>
                        <p className="text-sm text-muted-foreground">Propriétaire - Tous droits réservés</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Liens utiles</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Button variant="outline" size="sm" className="w-full justify-start gap-2 bg-transparent">
                        <Github className="h-3 w-3" />
                        Code source
                      </Button>
                      <Button variant="outline" size="sm" className="w-full justify-start gap-2 bg-transparent">
                        <FileText className="h-3 w-3" />
                        Notes de version
                      </Button>
                      <Button variant="outline" size="sm" className="w-full justify-start gap-2 bg-transparent">
                        <ExternalLink className="h-3 w-3" />
                        Site web
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  )
}
