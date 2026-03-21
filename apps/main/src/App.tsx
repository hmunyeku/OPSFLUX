import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoginPage } from '@/pages/auth/LoginPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'

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

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
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
                  <Route path="/assets/*" element={<AssetsPage />} />
                  <Route path="/entities/*" element={<EntitiesPage />} />
                  <Route path="/users/*" element={<UsersPage />} />
                  <Route path="/tiers/*" element={<TiersPage />} />
                  <Route path="/conformite/*" element={<ConformitePage />} />
                  <Route path="/projets/*" element={<ProjetsPage />} />
                  <Route path="/workflow/*" element={<WorkflowPage />} />
                  <Route path="/paxlog/*" element={<PaxLogPage />} />
                  <Route path="/planner/*" element={<PlannerPage />} />
                  <Route path="/travelwiz/*" element={<TravelWizPage />} />
                  <Route path="/report-editor/*" element={<ReportEditorPage />} />
                  <Route path="/pid-pfd/*" element={<PidPfdPage />} />
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
