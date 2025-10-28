import { AppShell } from "@/components/layout/app-shell"
import { Header } from "@/components/layout/header"
import { Sidebar } from "@/components/layout/sidebar"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Page d'accueil OpsFlux
 * Démontre l'App Shell avec les 5 zones
 * Conforme FRONTEND_RULES.md - Radix UI + Tailwind uniquement, ZERO spinner
 */
export default function Home() {
  return (
    <AppShell
      header={<Header />}
      sidebar={<Sidebar />}
    >
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Bienvenue sur OpsFlux
          </h1>
          <p className="text-muted-foreground mt-2">
            Management Operating System pour l'industrie Oil & Gas
          </p>
        </div>

        {/* Démonstration des états de chargement avec Skeletons */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">
            États de chargement (Skeletons uniquement - Pas de spinners!)
          </h2>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-3 rounded-lg border p-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <Skeleton className="h-12 w-12 rounded-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-full" />
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <Skeleton className="h-32 w-full rounded-md" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        </div>

        {/* Architecture conforme */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Architecture</h2>
          <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
            <li>✅ App Shell 5 zones (Header, Sidebar, Drawer, Main, Footer)</li>
            <li>✅ Radix UI primitives uniquement (NO shadcn/ui)</li>
            <li>✅ Skeletons pour chargements (ZERO spinner)</li>
            <li>✅ Tailwind CSS 3.4+ uniquement</li>
            <li>✅ TypeScript strict mode</li>
            <li>✅ Next.js 15 App Router</li>
          </ul>
        </div>
      </div>
    </AppShell>
  )
}
