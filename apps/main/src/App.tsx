import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { usePermission } from '@/hooks/usePermission'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoginPage } from '@/pages/auth/LoginPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'
const VerifyEmailPage = lazy(() => import('@/pages/auth/VerifyEmailPage'))

const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage').then(m => ({ default: m.DashboardPage })))
const AssetsPage = lazy(() => import('@/pages/assets/AssetsPage').then(m => ({ default: m.AssetsPage })))
const TiersPage = lazy(() => import('@/pages/tiers/TiersPage').then(m => ({ default: m.TiersPage })))
const ConformitePage = lazy(() => import('@/pages/conformite/ConformitePage').then(m => ({ default: m.ConformitePage })))
const ProjetsPage = lazy(() => import('@/pages/projets/ProjetsPage').then(m => ({ default: m.ProjetsPage })))
const WorkflowPage = lazy(() => import('@/pages/workflow/WorkflowPage').then(m => ({ default: m.WorkflowPage })))
const PaxLogPage = lazy(() => import('@/pages/paxlog/PaxLogPage').then(m => ({ default: m.PaxLogPage })))
const PlannerPage = lazy(() => import('@/pages/planner/PlannerPage').then(m => ({ default: m.PlannerPage })))
const TravelWizPage = lazy(() => import('@/pages/travelwiz/TravelWizPage').then(m => ({ default: m.TravelWizPage })))
const ReportEditorPage = lazy(() => import('@/pages/report-editor/ReportEditorPage').then(m => ({ default: m.ReportEditorPage })))
const PidPfdPage = lazy(() => import('@/pages/pid-pfd/PidPfdPage').then(m => ({ default: m.PidPfdPage })))
const UsersPage = lazy(() => import('@/pages/users/UsersPage').then(m => ({ default: m.UsersPage })))
const EntitiesPage = lazy(() => import('@/pages/entities/EntitiesPage').then(m => ({ default: m.EntitiesPage })))
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage').then(m => ({ default: m.SettingsPage })))
const SearchPage = lazy(() => import('@/pages/search/SearchPage').then(m => ({ default: m.SearchPage })))
const CaptainPortalPage = lazy(() => import('@/pages/travelwiz/CaptainPortalPage').then(m => ({ default: m.CaptainPortalPage })))

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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}><VerifyEmailPage /></Suspense>} />
      <Route path="/captain-portal" element={<Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}><CaptainPortalPage /></Suspense>} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/assets/*" element={<RequirePermission permission="asset.read"><AssetsPage /></RequirePermission>} />
                  <Route path="/entities/*" element={<RequirePermission permission="core.entity.read"><EntitiesPage /></RequirePermission>} />
                  <Route path="/users/*" element={<RequirePermission permission="core.users.read"><UsersPage /></RequirePermission>} />
                  <Route path="/tiers/*" element={<RequirePermission permission="tier.read"><TiersPage /></RequirePermission>} />
                  <Route path="/conformite/*" element={<RequirePermission permission="conformite.record.read"><ConformitePage /></RequirePermission>} />
                  <Route path="/projets/*" element={<RequirePermission permission="project.read"><ProjetsPage /></RequirePermission>} />
                  <Route path="/workflow/*" element={<RequirePermission permission="workflow.definition.read"><WorkflowPage /></RequirePermission>} />
                  <Route path="/paxlog/*" element={<RequirePermission permission="paxlog.profile.read"><PaxLogPage /></RequirePermission>} />
                  <Route path="/planner/*" element={<RequirePermission permission="planner.activity.read"><PlannerPage /></RequirePermission>} />
                  <Route path="/travelwiz/*" element={<RequirePermission permission="travelwiz.voyage.read"><TravelWizPage /></RequirePermission>} />
                  <Route path="/report-editor/*" element={<RequirePermission permission="document.read"><ReportEditorPage /></RequirePermission>} />
                  <Route path="/pid-pfd/*" element={<RequirePermission permission="pid.read"><PidPfdPage /></RequirePermission>} />
                  <Route path="/settings/*" element={<SettingsPage />} />
                </Routes>
              </Suspense>
            </AppLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
