import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import UnauthorizedPage from './pages/UnauthorizedPage'
import OnboardingWizard from './pages/OnboardingWizard'
import CampaignCatalog from './pages/CampaignCatalog'
import SettingsPage from './pages/SettingsPage'
import EarningsPage from './pages/EarningsPage'
import AdHealthPage from './pages/AdHealthPage'
import DashboardPage from './pages/DashboardPage'
import QueuePage from './pages/QueuePage'
import PricingPage from './pages/PricingPage'
import AuthGuard from './components/AuthGuard'

const IS_MOCK = import.meta.env.VITE_MOCK === 'true'
const Guard = ({ children }) => IS_MOCK ? children : <AuthGuard requireOnboarding={true} requirePayment={true}>{children}</AuthGuard>

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route path="/onboarding" element={IS_MOCK ? <OnboardingWizard /> : <AuthGuard requireOnboarding={false}><OnboardingWizard /></AuthGuard>} />
        <Route path="/dashboard" element={<Guard><DashboardPage /></Guard>} />
        <Route path="/" element={<Guard><CampaignCatalog /></Guard>} />
        <Route path="/settings" element={<Guard><SettingsPage /></Guard>} />
        <Route path="/earnings" element={<Guard><EarningsPage /></Guard>} />
        <Route path="/ad-health" element={<Guard><AdHealthPage /></Guard>} />
        <Route path="/queue" element={<Guard><QueuePage /></Guard>} />
        <Route path="/pricing" element={IS_MOCK ? <PricingPage /> : <AuthGuard requireOnboarding={false}><PricingPage /></AuthGuard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
