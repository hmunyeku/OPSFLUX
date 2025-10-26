/**
 * Module Page Router
 *
 * Cette page catch-all charge dynamiquement les pages des modules
 * en fonction du chemin URL.
 *
 * Fonctionnement:
 * - URL: /third-parties/companies → charge le module third_parties, page "companies"
 * - URL: /third-parties/companies/123 → charge avec params { id: "123" }
 */

"use client"

import { notFound, useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { getLoadedModules } from "@/lib/module-loader"

export default function ModulePage() {
  const params = useParams()
  const modulePath = params.modulePath as string[]

  const [PageComponent, setPageComponent] = useState<React.ComponentType<any> | null>(null)
  const [pageParams, setPageParams] = useState<Record<string, string>>({})
  const [notFoundState, setNotFoundState] = useState(false)

  useEffect(() => {
    // Construire le chemin complet: /third-parties/companies
    const fullPath = `/${modulePath.join("/")}`

    console.log(`[Module Router] Looking for page: ${fullPath}`)

    let retryCount = 0
    const maxRetries = 50 // 5 seconds max

    // Fonction pour essayer de charger la page
    const tryLoadPage = () => {
      // Charger tous les modules actifs
      const loadedModules = getLoadedModules()

      console.log(`[Module Router] Found ${loadedModules.length} loaded modules (retry ${retryCount})`)

      // Si aucun module n'est chargé, attendre un peu et réessayer
      if (loadedModules.length === 0) {
        retryCount++
        if (retryCount < maxRetries) {
          console.log(`[Module Router] No modules loaded yet, waiting...`)
          setTimeout(tryLoadPage, 100)
          return
        } else {
          console.error(`[Module Router] Timeout: No modules loaded after ${maxRetries} retries`)
          setNotFoundState(true)
          return
        }
      }

      // Chercher la page correspondante dans les modules
      for (const loadedModule of loadedModules) {
        const { module } = loadedModule

        console.log(`[Module Router] Checking module ${module.config.code}, pages: ${module.pages?.length || 0}`)

        if (!module.pages || module.pages.length === 0) {
          continue
        }

        // Chercher la page qui correspond au chemin
        for (const page of module.pages) {
          // Convertir le pattern de route en regex pour supporter les paramètres
          // Ex: /third-parties/companies/:id → /third-parties/companies/[^/]+
          const routePattern = page.path
            .replace(/:\w+/g, "[^/]+")  // Remplacer :id par [^/]+
            .replace(/\//g, "\\/")       // Échapper les /

          const routeRegex = new RegExp(`^${routePattern}$`)

          console.log(`[Module Router] Testing ${page.path} against ${fullPath}`)

          if (routeRegex.test(fullPath)) {
            console.log(`[Module Router] ✅ Found matching page in module ${module.config.code}: ${page.path}`)
            console.log(`[Module Router] Component type:`, typeof page.component)

            // Extraire les paramètres de l'URL
            const paramNames = (page.path.match(/:\w+/g) || []).map(p => p.slice(1))
            const pathSegments = fullPath.split("/").filter(Boolean)
            const routeSegments = page.path.split("/").filter(Boolean)

            const extractedParams: Record<string, string> = {}
            routeSegments.forEach((segment, index) => {
              if (segment.startsWith(":")) {
                const paramName = segment.slice(1)
                extractedParams[paramName] = pathSegments[index]
              }
            })

            console.log(`[Module Router] Extracted params:`, extractedParams)

            // Définir le composant et les paramètres
            setPageComponent(() => page.component)
            setPageParams(extractedParams)
            return
          }
        }
      }

      // Aucune page trouvée
      console.log(`[Module Router] ❌ No matching page found for: ${fullPath}`)
      setNotFoundState(true)
    }

    // Démarrer la tentative de chargement
    tryLoadPage()
  }, [modulePath])

  if (notFoundState) {
    console.log(`[Module Router] Rendering 404`)
    notFound()
  }

  if (!PageComponent) {
    console.log(`[Module Router] Rendering loading state`)
    return <div className="flex items-center justify-center p-8">Loading...</div>
  }

  console.log(`[Module Router] Rendering component with params:`, pageParams)
  return <PageComponent params={pageParams} />
}
