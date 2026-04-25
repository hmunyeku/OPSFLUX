import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { usePermission } from '@/hooks/usePermission'
import { useModules } from '@/hooks/useModules'
import { AppLayout } from '@/components/layout/AppLayout'
import CookieConsent from '@/components/layout/CookieConsent'
import { LoginPage } from '@/pages/auth/LoginPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'
const VerifyEmailPage = lazy(() => import('@/pages/auth/VerifyEmailPage'))
const PrivacyPage = lazy(() => import('@/pages/legal/PrivacyPage'))

const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage').then(m => ({ default: m.DashboardPage })))
const AssetsPage = lazy(() => import('@/pages/assets/AssetsPage').then(m => ({ default: m.AssetsPage })))
const AssetRegistryPage = lazy(() => import('@/pages/asset-registry/AssetRegistryPage').then(m => ({ default: m.AssetRegistryPage })))
const TiersPage = lazy(() => import('@/pages/tiers/TiersPage').then(m => ({ default: m.TiersPage })))
const ConformitePage = lazy(() => import('@/pages/conformite/ConformitePage').then(m => ({ default: m.ConformitePage })))
const ProjetsPage = lazy(() => import('@/pages/projets/ProjetsPage').then(m => ({ default: m.ProjetsPage })))
const WorkflowPage = lazy(() => import('@/pages/workflow/WorkflowPage').then(m => ({ default: m.WorkflowPage })))
const PaxLogPage = lazy(() => import('@/pages/paxlog/PaxLogPage').then(m => ({ default: m.PaxLogPage })))
const AdsBoardingScanPage = lazy(() => import('@/pages/paxlog/AdsBoardingScanPage').then(m => ({ default: m.AdsBoardingScanPage })))
const PlannerPage = lazy(() => import('@/pages/planner/PlannerPage').then(m => ({ default: m.PlannerPage })))
const TravelWizPage = lazy(() => import('@/pages/travelwiz/TravelWizPage').then(m => ({ default: m.TravelWizPage })))
const PackLogPage = lazy(() => import('@/pages/packlog/PackLogPage').then(m => ({ default: m.PackLogPage })))
const ImputationsPage = lazy(() => import('@/pages/imputations/ImputationsPage').then(m => ({ default: m.ImputationsPage })))
const PapyrusPage = lazy(() => import('@/pages/papyrus/PapyrusPage').then(m => ({ default: m.PapyrusPage })))
const PidPfdPage = lazy(() => import('@/pages/pid-pfd/PidPfdPage').then(m => ({ default: m.PidPfdPage })))
const UsersPage = lazy(() => import('@/pages/users/UsersPage').then(m => ({ default: m.UsersPage })))
const EntitiesPage = lazy(() => import('@/pages/entities/EntitiesPage').then(m => ({ default: m.EntitiesPage })))
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage').then(m => ({ default: m.SettingsPage })))
const SearchPage = lazy(() => import('@/pages/search/SearchPage').then(m => ({ default: m.SearchPage })))
const CaptainPortalPage = lazy(() => import('@/pages/travelwiz/CaptainPortalPage').then(m => ({ default: m.CaptainPortalPage })))
const TVModePage = lazy(() => import('@/pages/dashboard/TVModePage').then(m => ({ default: m.TVModePage })))
const FileManagerPage = lazy(() => import('@/pages/files/FileManagerPage'))
const SupportPage = lazy(() => import('@/pages/support/SupportPage').then(m => ({ default: m.SupportPage })))

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

/** Route-level permission guard — redirects to /dashboard if user lacks the required permission. */
function RequirePermission({ permission, children }: { permission: string; children: React.ReactNode }) {
  const { hasPermission, loading } = usePermission()
  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  if (!hasPermission(permission)) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function RequireAnyPermission({ permissions, children }: { permissions: string[]; children: React.ReactNode }) {
  const { hasAny, loading } = usePermission()
  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  if (!hasAny(permissions)) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

function RequireModuleEnabled({ module, children }: { module: string; children: React.ReactNode }) {
  const { data: modules = [], isLoading } = useModules()
  if (isLoading) return <div className="flex items-center justify-center h-full"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  const enabled = modules.some((entry) => entry.slug === module && entry.enabled)
  if (!enabled) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <>
    <CookieConsent />
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/privacy" element={<Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}><PrivacyPage /></Suspense>} />
      <Route path="/verify-email" element={<Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}><VerifyEmailPage /></Suspense>} />
      <Route path="/captain-portal" element={<Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}><CaptainPortalPage /></Suspense>} />
      <Route path="/tv/:token" element={<Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}><TVModePage /></Suspense>} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/comptes" element={<Navigate to="/users" replace />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/assets/*" element={<RequireModuleEnabled module="asset_registry"><RequirePermission permission="asset.read"><AssetRegistryPage /></RequirePermission></RequireModuleEnabled>} />
                  <Route path="/assets-legacy/*" element={<RequireModuleEnabled module="asset_registry"><RequirePermission permission="asset.read"><AssetsPage /></RequirePermission></RequireModuleEnabled>} />
                  <Route path="/entities/*" element={<RequirePermission permission="core.entity.read"><EntitiesPage /></RequirePermission>} />
                  <Route path="/users/*" element={<RequirePermission permission="core.users.read"><UsersPage /></RequirePermission>} />
                  <Route path="/tiers/*" element={<RequireModuleEnabled module="tiers"><RequirePermission permission="tier.read"><TiersPage /></RequirePermission></RequireModuleEnabled>} />
                  <Route path="/conformite/*" element={<RequireModuleEnabled module="conformite"><RequirePermission permission="conformite.record.read"><ConformitePage /></RequirePermission></RequireModuleEnabled>} />
                  <Route path="/projets/*" element={<RequireModuleEnabled module="projets"><RequirePermission permission="project.read"><ProjetsPage /></RequirePermission></RequireModuleEnabled>} />
                  {/* English-language alias redirects so /projects, /companies, /compliance,
                      /workflows do not 404 (cf E2E bug #2). */}
                  <Route path="/projects/*" element={<Navigate to="/projets" replace />} />
                  <Route path="/companies/*" element={<Navigate to="/tiers" replace />} />
                  <Route path="/compliance/*" element={<Navigate to="/conformite" replace />} />
                  <Route path="/workflows/*" element={<Navigate to="/workflow" replace />} />
                  <Route path="/workflow/*" element={<RequirePermission permission="workflow.definition.read"><WorkflowPage /></RequirePermission>} />
                  <Route path="/paxlog/ads-boarding/:token" element={<RequireModuleEnabled module="paxlog"><RequirePermission permission="travelwiz.boarding.manage"><AdsBoardingScanPage /></RequirePermission></RequireModuleEnabled>} />
                  <Route path="/paxlog/*" element={<RequireModuleEnabled module="paxlog"><RequireAnyPermission permissions={['paxlog.ads.read', 'paxlog.ads.create', 'paxlog.ads.approve', 'paxlog.avm.read', 'paxlog.avm.create', 'paxlog.avm.update', 'paxlog.avm.approve', 'paxlog.avm.complete', 'paxlog.profile.read', 'paxlog.compliance.read']}><PaxLogPage /></RequireAnyPermission></RequireModuleEnabled>} />
                  <Route path="/planner/*" element={<RequireModuleEnabled module="planner"><RequirePermission permission="planner.activity.read"><PlannerPage /></RequirePermission></RequireModuleEnabled>} />
                  <Route path="/travelwiz/*" element={<RequireModuleEnabled module="travelwiz"><RequirePermission permission="travelwiz.voyage.read"><TravelWizPage /></RequirePermission></RequireModuleEnabled>} />
                  <Route path="/packlog/*" element={<RequireModuleEnabled module="packlog"><RequirePermission permission="packlog.cargo.read"><PackLogPage /></RequirePermission></RequireModuleEnabled>} />
                  <Route path="/imputations/*" element={<RequirePermission permission="imputation.read"><ImputationsPage /></RequirePermission>} />
                  <Route path="/report-editor/*" element={<Navigate to="/papyrus" replace />} />
                  <Route path="/papyrus/*" element={<RequireModuleEnabled module="papyrus"><RequirePermission permission="document.read"><PapyrusPage /></RequirePermission></RequireModuleEnabled>} />
                  <Route path="/pid-pfd/*" element={<RequireModuleEnabled module="pid_pfd"><RequirePermission permission="pid.read"><PidPfdPage /></RequirePermission></RequireModuleEnabled>} />
                  <Route path="/files/*" element={<RequirePermission permission="core.settings.manage"><Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}><FileManagerPage /></Suspense></RequirePermission>} />
                  <Route path="/support/*" element={<RequireModuleEnabled module="support"><RequirePermission permission="support.ticket.read"><SupportPage /></RequirePermission></RequireModuleEnabled>} />
                  <Route path="/settings/*" element={<SettingsPage />} />
                  {/* French path aliases → redirect to canonical English paths */}
                  <Route path="/workflows/*" element={<Navigate to="/workflow" replace />} />
                  <Route path="/fichiers/*" element={<Navigate to="/files" replace />} />
                  <Route path="/entites/*" element={<Navigate to="/entities" replace />} />
                </Routes>
              </Suspense>
            </AppLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
    </>
  )
}
