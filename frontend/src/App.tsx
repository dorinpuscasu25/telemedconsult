import React from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate } from
'react-router-dom';
import { AuthProvider, useAuth, Role } from './contexts/AuthContext';
import { FeatureFlagsProvider, useFeatureFlags, type FeatureKey } from './contexts/FeatureFlagsContext';
import { SiteContentProvider } from './contexts/SiteContentContext';
// Layouts
import { AdminLayout } from './layouts/AdminLayout';
import { AppLayout } from './layouts/AppLayout';
// Pages
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { PendingApprovalPage } from './pages/PendingApprovalPage';
// Public site
import { PublicLayout } from './layouts/PublicLayout';
import { HomePage } from './pages/public/HomePage';
import { BlogListPage } from './pages/public/BlogListPage';
import { BlogPostPage } from './pages/public/BlogPostPage';
import { PartnersPage as PublicPartnersPage } from './pages/public/PartnersPage';
import { PatientHome } from './pages/patient/PatientHome';
import { DoctorHome } from './pages/doctor/DoctorHome';
import { OperatorHome } from './pages/operator/OperatorHome';
import { AdminDashboard } from './pages/admin/AdminDashboard';
// New Patient Pages
import { DoctorsList } from './pages/patient/DoctorsList';
import { OperatorsList } from './pages/patient/OperatorsList';
import { WalletPage } from './pages/patient/WalletPage';
import { ChatPage } from './pages/patient/ChatPage';
import { ProfilePage } from './pages/patient/ProfilePage';
import { ComplaintsPage as PatientComplaintsPage } from './pages/patient/ComplaintsPage';
// New Doctor Pages
import { ConsultationsPage } from './pages/doctor/ConsultationsPage';
import { DoctorChatPage } from './pages/doctor/DoctorChatPage';
import { StatsPage } from './pages/doctor/StatsPage';
import { DoctorProfilePage } from './pages/doctor/DoctorProfilePage';
// New Operator Pages
import { RequestsPage } from './pages/operator/RequestsPage';
import { OperatorChatPage } from './pages/operator/OperatorChatPage';
// New Admin Pages
import { UsersPage } from './pages/admin/UsersPage';
import { DoctorsPage } from './pages/admin/DoctorsPage';
import { SpecialtiesPage } from './pages/admin/SpecialtiesPage';
import { TransactionsPage } from './pages/admin/TransactionsPage';
import { ComplaintsPage } from './pages/admin/ComplaintsPage';
import { ContractsPage } from './pages/admin/ContractsPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { RegionsPage } from './pages/admin/RegionsPage';
import { InvestigationsPage } from './pages/admin/InvestigationsPage';
import { FeatureFlagsPage } from './pages/admin/FeatureFlagsPage';
import { PatientCardPackagesPage } from './pages/admin/PatientCardPackagesPage';
import { AdminBlogPage } from './pages/admin/BlogPage';
import { AdminBlogEditorPage } from './pages/admin/BlogEditorPage';
import { AdminPartnersPage } from './pages/admin/PartnersPage';
import { RegistrationsPage } from './pages/admin/RegistrationsPage';
import { CoordinatorDashboard } from './pages/coordinator/CoordinatorDashboard';
// Noutăți (fost Blog) — publice și în interiorul aplicației
import { AppNewsListPage, AppNewsPostPage, LegacyBlogPostRedirect } from './pages/NewsRoutes';
import { SiteContentPage } from './pages/admin/SiteContentPage';
import { HigoSyncPage } from './pages/admin/HigoSyncPage';
// Conectarea contului la botul de notificări — aceeași pagină pentru toate rolurile
import { TelegramPage } from './pages/TelegramPage';
// Protected Route Wrapper
function ProtectedRoute({
  children,
  allowedRoles



}: {children: React.ReactNode;allowedRoles: Role[];}) {
  const { isAuthenticated, role, user, isLoading } = useAuth();
  if (isLoading) {
    return <div className="min-h-screen grid place-items-center text-slate-500">Se încarcă...</div>;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (user?.status === 'pending') {
    return <Navigate to="/pending" replace />;
  }
  if (role && !allowedRoles.includes(role)) {
    return <Navigate to={`/${role}`} replace />;
  }
  return <>{children}</>;
}
function FeatureRoute({ feature, children }: { feature: FeatureKey; children: React.ReactNode }) {
  const { isEnabled, isLoading } = useFeatureFlags();

  if (isLoading) {
    return <div className="grid min-h-64 place-items-center text-slate-500">Se încarcă...</div>;
  }

  if (!isEnabled(feature)) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-slate-950">Funcționalitate indisponibilă</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Această secțiune este momentan dezactivată de administrator.</p>
      </div>
    );
  }

  return <>{children}</>;
}
function AppRoutes() {
  const { isAuthenticated, role, user, isLoading } = useAuth();
  if (isLoading) {
    return <div className="min-h-screen grid place-items-center text-slate-500">Se încarcă...</div>;
  }

  const isPending = user?.status === 'pending';
  const homePath = isPending ? '/pending' : role ? `/${role}` : '/patient';

  return (
    <Routes>
      {/* Public site (accessible to everyone) */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/noutati" element={<BlogListPage />} />
        <Route path="/noutati/:slug" element={<BlogPostPage />} />
        {/* Rutele vechi /blog rămân funcționale ca să nu se strice linkurile
            deja trimise; redirecționează spre noile adrese. */}
        <Route path="/blog" element={<Navigate to="/noutati" replace />} />
        <Route path="/blog/:slug" element={<LegacyBlogPostRedirect />} />
        <Route path="/parteneri" element={<PublicPartnersPage />} />
      </Route>

      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to={homePath} replace /> : <LoginPage />} />

      <Route
        path="/register"
        element={isAuthenticated ? <Navigate to={homePath} replace /> : <RegisterPage />} />

      <Route
        path="/pending"
        element={
        isAuthenticated ?
        isPending ? <PendingApprovalPage /> : <Navigate to={homePath} replace /> :
        <Navigate to="/login" replace />
        } />


      {/* Admin Routes */}
      <Route
        path="/admin"
        element={
        <ProtectedRoute allowedRoles={['admin']}>
            <AdminLayout />
          </ProtectedRoute>
        }>
        
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="registrations" element={<RegistrationsPage />} />
        <Route path="specialties" element={<SpecialtiesPage />} />
        <Route path="doctors" element={<DoctorsPage />} />
        <Route path="operators" element={<UsersPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="complaints" element={<ComplaintsPage />} />
        <Route path="contracts" element={<ContractsPage />} />
        <Route path="card-packages" element={<PatientCardPackagesPage />} />
        <Route path="regions" element={<RegionsPage />} />
        <Route path="investigations" element={<InvestigationsPage />} />
        <Route path="features" element={<FeatureFlagsPage />} />
        <Route path="higo" element={<HigoSyncPage />} />
        <Route path="blog" element={<AdminBlogPage />} />
        <Route path="blog/new" element={<AdminBlogEditorPage />} />
        <Route path="blog/:id/edit" element={<AdminBlogEditorPage />} />
        <Route path="partners" element={<AdminPartnersPage />} />
        <Route path="content" element={<SiteContentPage />} />
        <Route path="noutati" element={<AppNewsListPage />} />
        <Route path="noutati/:slug" element={<AppNewsPostPage />} />
        <Route path="telegram" element={<TelegramPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      {/* Patient Routes */}
      <Route
        path="/patient"
        element={
        <ProtectedRoute allowedRoles={['patient']}>
            <AppLayout />
          </ProtectedRoute>
        }>
        
        <Route index element={<PatientHome />} />
        <Route path="doctors" element={<FeatureRoute feature="doctors"><DoctorsList /></FeatureRoute>} />
        <Route path="operators" element={<FeatureRoute feature="operators"><OperatorsList /></FeatureRoute>} />
        <Route path="wallet" element={<FeatureRoute feature="payments"><WalletPage /></FeatureRoute>} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="complaints" element={<PatientComplaintsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="noutati" element={<AppNewsListPage />} />
        <Route path="noutati/:slug" element={<AppNewsPostPage />} />
        <Route path="telegram" element={<TelegramPage />} />
      </Route>

      {/* Doctor Routes */}
      <Route
        path="/doctor"
        element={
        <ProtectedRoute allowedRoles={['doctor']}>
            <AppLayout />
          </ProtectedRoute>
        }>
        
        <Route index element={<DoctorHome />} />
        <Route path="consultations" element={<ConsultationsPage />} />
        <Route path="chat" element={<DoctorChatPage />} />
        <Route path="stats" element={<StatsPage />} />
        <Route path="profile" element={<DoctorProfilePage />} />
        <Route path="noutati" element={<AppNewsListPage />} />
        <Route path="noutati/:slug" element={<AppNewsPostPage />} />
        <Route path="telegram" element={<TelegramPage />} />
      </Route>

      {/* Operator Routes */}
      <Route
        path="/operator"
        element={
        <ProtectedRoute allowedRoles={['operator']}>
            <AppLayout />
          </ProtectedRoute>
        }>
        
        <Route index element={<OperatorHome />} />
        <Route path="patients" element={<RequestsPage />} />
        <Route path="chat" element={<OperatorChatPage />} />
        <Route path="profile" element={<div>Profile</div>} />
        <Route path="noutati" element={<AppNewsListPage />} />
        <Route path="noutati/:slug" element={<AppNewsPostPage />} />
        <Route path="telegram" element={<TelegramPage />} />
      </Route>

      {/* Coordinator Routes */}
      <Route
        path="/coordinator"
        element={
        <ProtectedRoute allowedRoles={['coordinator', 'admin']}>
            <AdminLayout />
          </ProtectedRoute>
        }>
        <Route index element={<CoordinatorDashboard />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="doctors" element={<DoctorsPage />} />
        <Route path="noutati" element={<AppNewsListPage />} />
        <Route path="noutati/:slug" element={<AppNewsPostPage />} />
        <Route path="telegram" element={<TelegramPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>);

}
export function App() {
  // Router-ul este cel mai în exterior ca providerele să poată folosi hook-urile
  // de navigare (necesar pentru redirect-ul pe sesiune expirată).
  return (
    <Router>
      <AuthProvider>
        <FeatureFlagsProvider>
          <SiteContentProvider>
            <AppRoutes />
          </SiteContentProvider>
        </FeatureFlagsProvider>
      </AuthProvider>
    </Router>);

}
