import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import UnauthorizedPage from './pages/UnauthorizedPage'
import OnboardingWizard from './pages/OnboardingWizard'
import CampaignCatalog from './pages/CampaignCatalog'
import SettingsPage from './pages/SettingsPage'
import EarningsPage from './pages/EarningsPage'
import AdHealthPage from './pages/AdHealthPage'
import DashboardPage from './pages/DashboardPage'
import AuthGuard from './components/AuthGuard'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route
          path="/onboarding"
          element={
            <AuthGuard requireOnboarding={false}>
              <OnboardingWizard />
            </AuthGuard>
          }
        />
        <Route
          path="/dashboard"
          element={
            <AuthGuard requireOnboarding={true}>
              <DashboardPage />
            </AuthGuard>
          }
        />
        <Route
          path="/"
          element={
            <AuthGuard requireOnboarding={true}>
              <CampaignCatalog />
            </AuthGuard>
          }
        />
        <Route
          path="/settings"
          element={
            <AuthGuard requireOnboarding={true}>
              <SettingsPage />
            </AuthGuard>
          }
        />
        <Route
          path="/earnings"
          element={
            <AuthGuard requireOnboarding={true}>
              <EarningsPage />
            </AuthGuard>
          }
        />
        <Route
          path="/ad-health"
          element={
            <AuthGuard requireOnboarding={true}>
              <AdHealthPage />
            </AuthGuard>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
