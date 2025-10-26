/**
 * Module Registry - Frontend
 *
 * Chargement dynamique des modules compilés.
 * Les modules sont compilés en JavaScript lors du build et chargés dynamiquement depuis /modules
 */

import type { Module } from "@/lib/types/module"

/**
 * Charge un module compilé depuis l'API backend
 */
async function loadCompiledModule(moduleCode: string): Promise<Module> {
  console.log(`[Registry] Loading compiled module: ${moduleCode}`)

  try {
    // Charger le module compilé depuis l'API backend
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.opsflux.io'
    const modulePath = `${API_URL}/api/v1/modules/${moduleCode}/frontend/module.config.js?t=${Date.now()}`
    console.log(`[Registry] Loading from API: ${modulePath}`)

    // Récupérer le token d'authentification
    const token = localStorage.getItem('access_token')
    if (!token) {
      throw new Error('No authentication token found')
    }

    // Fetch le code JavaScript depuis l'API
    const response = await fetch(modulePath, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch module: ${response.status} ${response.statusText}`)
    }

    const code = await response.text()

    // Précharger toutes les dépendances externes nécessaires
    const [
      react,
      reactDom,
      jsxRuntime,
      nextNavigation,
      tablerIcons,
    ] = await Promise.all([
      import('react'),
      import('react-dom'),
      import('react/jsx-runtime'),
      import('next/navigation'),
      import('@tabler/icons-react'),
    ])

    // Créer un environnement pour le module avec un require personnalisé
    // Le module IIFE utilise __require() pour les dépendances externes
    const moduleRequire = (id: string) => {
      // Mapper les IDs de modules aux imports préchargés
      const modules: Record<string, any> = {
        'react': react,
        'react-dom': reactDom,
        'react/jsx-runtime': jsxRuntime,
        'next/navigation': nextNavigation,
        '@tabler/icons-react': tablerIcons,
      }

      // Si le module commence par @/, c'est un alias Next.js
      if (id.startsWith('@/')) {
        throw new Error(`Module ${id} uses @/ alias which is not supported in dynamic modules. Please use relative imports instead.`)
      }

      if (!(id in modules)) {
        throw new Error(`Module ${id} is not available. External dependencies must be pre-registered.`)
      }

      return modules[id]
    }

    // Injecter le require dans le contexte global temporairement
    const originalRequire = (window as any).__require
    ;(window as any).__require = moduleRequire

    try {
      // Exécuter le code dans un contexte global
      // Le module est compilé en IIFE avec --global-name=ModuleExport
      const script = document.createElement('script')
      script.textContent = code
      document.head.appendChild(script)

      // Récupérer l'export du module
      const moduleExport = (window as any).ModuleExport

      // Nettoyer
      document.head.removeChild(script)
      delete (window as any).ModuleExport

      // Restaurer __require
      if (originalRequire !== undefined) {
        (window as any).__require = originalRequire
      } else {
        delete (window as any).__require
      }

      if (!moduleExport || !moduleExport.default) {
        throw new Error('Module did not export a default value')
      }

      console.log(`[Registry] Module loaded:`, moduleExport.default)

      return moduleExport.default as Module
    } catch (error) {
      // Restaurer __require en cas d'erreur
      if (originalRequire !== undefined) {
        (window as any).__require = originalRequire
      } else {
        delete (window as any).__require
      }
      throw error
    }
  } catch (error) {
    console.error(`[Registry] Failed to load module ${moduleCode}:`, error)
    throw error
  }
}

// Liste des modules disponibles
// Cette liste sera automatiquement mise à jour par le module-loader
// en fonction des modules actifs dans la base de données
const availableModules: Record<string, () => Promise<Module>> = {
  third_parties: () => loadCompiledModule('third_parties'),
  // Les autres modules seront ajoutés automatiquement
}

/**
 * Charge un module depuis le registre
 */
export async function loadModuleFromRegistry(moduleCode: string): Promise<Module | null> {
  const moduleLoader = availableModules[moduleCode]

  if (!moduleLoader) {
    console.warn(`Module ${moduleCode} not found in registry`)
    return null
  }

  try {
    const module = await moduleLoader()
    console.log(`[Registry] Module ${moduleCode} loaded:`, module)
    console.log(`[Registry] Module ${moduleCode} type:`, typeof module)
    console.log(`[Registry] Module ${moduleCode} has config:`, !!module?.config)
    console.log(`[Registry] Module ${moduleCode} config:`, module?.config)
    return module || null
  } catch (error) {
    console.error(`Failed to load module ${moduleCode}:`, error)
    return null
  }
}

/**
 * Retourne la liste des codes de modules disponibles
 */
export function getAvailableModuleCodes(): string[] {
  return Object.keys(availableModules)
}

/**
 * Vérifie si un module est disponible
 */
export function isModuleAvailable(moduleCode: string): boolean {
  return moduleCode in availableModules
}
