/**
 * Module Loader - Frontend
 *
 * Ce service charge automatiquement les modules actifs et leurs composants.
 * Il fonctionne en tandem avec le ModuleLoader backend.
 *
 * Architecture:
 * 1. Récupère la liste des modules actifs depuis l'API
 * 2. Charge dynamiquement chaque module via import()
 * 3. Enregistre automatiquement les widgets, routes, etc.
 *
 * Supporte le hot reload:
 * - Vérifie périodiquement les nouveaux modules
 * - Charge automatiquement les nouveaux modules détectés
 */

import { registerWidgets } from "@/widgets/registry"
import type { Module, LoadedModule } from "@/lib/types/module"

// API base URL from environment
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.opsflux.io'

// Map des modules chargés (indexés par code)
const loadedModules = new Map<string, LoadedModule>()

/**
 * Charge un module spécifique de manière dynamique
 */
async function loadModule(moduleCode: string): Promise<LoadedModule | null> {
  try {
    console.log(`  📦 Loading module: ${moduleCode}...`)

    // Import dynamique du module
    // Le chemin est relatif au dossier modules à la racine du projet
    const modulePath = `../../../modules/${moduleCode}/frontend/module.config`
    const moduleExport = await import(modulePath)

    // Le module doit exporter un objet Module par défaut
    const module: Module = moduleExport.default || moduleExport.ThirdPartiesModule

    if (!module || !module.config) {
      throw new Error(`Module ${moduleCode} does not export a valid Module object`)
    }

    // Vérifier que le code correspond
    if (module.config.code !== moduleCode) {
      console.warn(
        `Module code mismatch: expected "${moduleCode}", got "${module.config.code}"`
      )
    }

    // Créer l'objet LoadedModule
    const loadedModule: LoadedModule = {
      config: module.config,
      module: module,
      loadedAt: new Date(),
      status: "loading",
    }

    // Enregistrer les widgets si présents
    if (module.widgets && Array.isArray(module.widgets)) {
      registerWidgets(module.widgets)
      console.log(`    ✓ Registered ${module.widgets.length} widget(s)`)
    }

    // Appeler le hook d'initialisation si présent
    if (module.onInit) {
      try {
        await module.onInit()
        console.log(`    ✓ Module initialized`)
      } catch (error) {
        console.error(`    ✗ Error during module initialization:`, error)
      }
    }

    // Marquer comme actif
    loadedModule.status = "active"
    console.log(`  ✅ Module ${moduleCode} loaded successfully`)

    return loadedModule
  } catch (error) {
    console.error(`  ❌ Failed to load module ${moduleCode}:`, error)

    return {
      config: {
        code: moduleCode,
        name: moduleCode,
        version: "unknown",
        description: "Failed to load",
      },
      module: { config: { code: moduleCode, name: moduleCode, version: "unknown", description: "" } },
      loadedAt: new Date(),
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Récupère la liste des modules actifs depuis l'API
 */
async function getActiveModules(): Promise<string[]> {
  try {
    const token = localStorage.getItem('access_token')
    if (!token) {
      console.warn("No access token found for fetching modules")
      return []
    }

    const response = await fetch(`${API_URL}/api/v1/modules?status=active&limit=100`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch modules: ${response.statusText}`)
    }

    const data = await response.json()
    return data.data?.map((m: any) => m.code) || []
  } catch (error) {
    console.error("Error fetching active modules:", error)
    return []
  }
}

/**
 * Initialise tous les modules actifs
 *
 * Cette fonction est appelée au démarrage de l'application pour charger
 * tous les modules activés et enregistrer leurs composants.
 */
export async function initializeModuleWidgets(): Promise<void> {
  console.log("🔌 Initializing modules...")

  try {
    // Récupérer la liste des modules actifs
    const activeModules = await getActiveModules()

    if (activeModules.length === 0) {
      console.log("  ℹ️  No active modules found")
      return
    }

    console.log(`  📋 Found ${activeModules.length} active module(s): ${activeModules.join(", ")}`)

    // Charger chaque module
    const loadPromises = activeModules.map(async (moduleCode) => {
      if (!loadedModules.has(moduleCode)) {
        const loaded = await loadModule(moduleCode)
        if (loaded) {
          loadedModules.set(moduleCode, loaded)
        }
      }
    })

    await Promise.all(loadPromises)

    const successCount = Array.from(loadedModules.values()).filter(
      (m) => m.status === "active"
    ).length
    const errorCount = Array.from(loadedModules.values()).filter(
      (m) => m.status === "error"
    ).length

    console.log(
      `✅ Modules initialization complete: ${successCount} loaded, ${errorCount} failed`
    )
  } catch (error) {
    console.error("❌ Error initializing modules:", error)
  }
}

/**
 * Vérifie et charge les nouveaux modules (hot reload)
 *
 * Cette fonction peut être appelée périodiquement pour détecter
 * de nouveaux modules sans rechargement de page.
 */
export async function checkForNewModules(): Promise<void> {
  try {
    const activeModules = await getActiveModules()
    const newModules: string[] = []

    for (const moduleCode of activeModules) {
      if (!loadedModules.has(moduleCode)) {
        newModules.push(moduleCode)
      }
    }

    if (newModules.length === 0) {
      return
    }

    console.log(`🆕 New module(s) detected: ${newModules.join(", ")}`)

    // Charger les nouveaux modules
    for (const moduleCode of newModules) {
      const loaded = await loadModule(moduleCode)
      if (loaded) {
        loadedModules.set(moduleCode, loaded)
      }
    }

    const successCount = newModules.filter(
      (code) => loadedModules.get(code)?.status === "active"
    ).length

    console.log(`✅ ${successCount} new module(s) loaded`)
  } catch (error) {
    console.error("Error checking for new modules:", error)
  }
}

/**
 * Démarre la surveillance périodique des nouveaux modules
 *
 * @param intervalMs Intervalle de vérification en millisecondes (défaut: 30 secondes)
 * @returns ID de l'intervalle (pour pouvoir l'arrêter avec clearInterval)
 */
export function startModuleWatcher(intervalMs: number = 30000): NodeJS.Timeout {
  console.log(`🔍 Starting module watcher (interval: ${intervalMs}ms)`)

  return setInterval(() => {
    checkForNewModules()
  }, intervalMs)
}

/**
 * Récupère tous les modules chargés
 */
export function getLoadedModules(): LoadedModule[] {
  return Array.from(loadedModules.values())
}

/**
 * Récupère un module spécifique par son code
 */
export function getModule(code: string): LoadedModule | undefined {
  return loadedModules.get(code)
}

/**
 * Décharge un module (appelle son hook onDestroy)
 */
export async function unloadModule(code: string): Promise<boolean> {
  const loadedModule = loadedModules.get(code)

  if (!loadedModule) {
    console.warn(`Module ${code} is not loaded`)
    return false
  }

  try {
    console.log(`🗑️  Unloading module: ${code}...`)

    // Appeler le hook de nettoyage
    if (loadedModule.module.onDestroy) {
      await loadedModule.module.onDestroy()
    }

    loadedModules.delete(code)
    console.log(`✅ Module ${code} unloaded`)
    return true
  } catch (error) {
    console.error(`❌ Error unloading module ${code}:`, error)
    return false
  }
}
