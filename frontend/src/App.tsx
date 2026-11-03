import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppLayout } from './components/layout/AppLayout';
import { RoleGuard } from './components/layout/RoleGuard';
import { DashboardPage } from './pages/DashboardPage';
import { ClientsPage } from './pages/ClientsPage';
import { TasksPage } from './pages/TasksPage';
import { TodoPage } from './pages/TodoPage';
import { AttendancePage } from './pages/AttendancePage';
import { RenewalsPage } from './pages/RenewalsPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { FinancePage } from './pages/FinancePage';
import { TimesheetPage } from './pages/TimesheetPage';
import { ServicesPage } from './pages/ServicesPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { ClientPortalPage } from './pages/ClientPortalPage';
import { ClientLoginPage } from './pages/ClientLoginPage';
import { LoginPage } from './pages/LoginPage';
import { LandingPage } from './pages/LandingPage';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F8F5]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#176B57] border-t-transparent" />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

// Main Entry Point: Whoever visits http://localhost:5173/ sees the Landing Page with both Client and Staff Logins
const RootEntry: React.FC = () => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0F3D32]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#A0D4C5] border-t-transparent" />
      </div>
    );
  }
  if (user) {
    if (user.role === 'CLIENT') {
      return <Navigate to="/portal" replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }
  return <LandingPage />;
};

const RootRedirect: React.FC = () => {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/" replace />;
  }
  if (user?.role === 'CLIENT') {
    return <Navigate to="/portal" replace />;
  }
  return <Navigate to="/dashboard" replace />;
};

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Main Landing Page with unified Client & Staff Logins */}
          <Route path="/" element={<RootEntry />} />
          <Route path="/portal/login" element={<LandingPage />} />
          <Route path="/login" element={<LandingPage />} />
          <Route path="/portal" element={<ClientPortalPage />} />

          {/* Protected Practice & Staff Dashboard Routes */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="dashboard" element={<DashboardPage />} />

            {/* Clients - Staff only */}
            <Route
              path="clients"
              element={
                <RoleGuard allowedRoles={['FIRM_OWNER', 'FIRM_ADMIN', 'MANAGER', 'ACCOUNTANT', 'TAX_PROFESSIONAL']}>
                  <ClientsPage />
                </RoleGuard>
              }
            />
            <Route
              path="clients/:id"
              element={
                <RoleGuard allowedRoles={['FIRM_OWNER', 'FIRM_ADMIN', 'MANAGER', 'ACCOUNTANT', 'TAX_PROFESSIONAL']}>
                  <ClientsPage />
                </RoleGuard>
              }
            />

            {/* Tasks */}
            <Route
              path="tasks"
              element={
                <RoleGuard allowedRoles={['FIRM_OWNER', 'FIRM_ADMIN', 'MANAGER', 'TAX_PROFESSIONAL', 'EMPLOYEE']}>
                  <TasksPage />
                </RoleGuard>
              }
            />

            {/* To-Do - Staff only */}
            <Route
              path="todo"
              element={
                <RoleGuard allowedRoles={['FIRM_OWNER', 'FIRM_ADMIN', 'MANAGER', 'ACCOUNTANT', 'TAX_PROFESSIONAL', 'EMPLOYEE']}>
                  <TodoPage />
                </RoleGuard>
              }
            />

            {/* Attendance - Staff only */}
            <Route
              path="attendance"
              element={
                <RoleGuard allowedRoles={['FIRM_OWNER', 'FIRM_ADMIN', 'MANAGER', 'ACCOUNTANT', 'TAX_PROFESSIONAL', 'EMPLOYEE']}>
                  <AttendancePage />
                </RoleGuard>
              }
            />

            {/* Renewals - Staff only */}
            <Route
              path="renewals"
              element={
                <RoleGuard allowedRoles={['FIRM_OWNER', 'FIRM_ADMIN', 'MANAGER', 'TAX_PROFESSIONAL', 'EMPLOYEE']}>
                  <RenewalsPage />
                </RoleGuard>
              }
            />

            {/* Documents */}
            <Route path="documents" element={<DocumentsPage />} />

            {/* Finance - Firm Owner, Admin, Accountant, Manager */}
            <Route
              path="finance"
              element={
                <RoleGuard allowedRoles={['FIRM_OWNER', 'FIRM_ADMIN', 'ACCOUNTANT', 'MANAGER']}>
                  <FinancePage />
                </RoleGuard>
              }
            />

            {/* Timesheet - Staff only */}
            <Route
              path="timesheet"
              element={
                <RoleGuard allowedRoles={['FIRM_OWNER', 'FIRM_ADMIN', 'MANAGER', 'ACCOUNTANT', 'TAX_PROFESSIONAL', 'EMPLOYEE']}>
                  <TimesheetPage />
                </RoleGuard>
              }
            />

            {/* Services & Retainers - Staff only */}
            <Route
              path="services"
              element={
                <RoleGuard allowedRoles={['FIRM_OWNER', 'FIRM_ADMIN', 'MANAGER', 'ACCOUNTANT', 'TAX_PROFESSIONAL']}>
                  <ServicesPage />
                </RoleGuard>
              }
            />

            {/* Notifications - Manager, Accountant, Admin, Owner */}
            <Route
              path="notifications"
              element={
                <RoleGuard allowedRoles={['FIRM_OWNER', 'FIRM_ADMIN', 'MANAGER', 'ACCOUNTANT']}>
                  <NotificationsPage />
                </RoleGuard>
              }
            />

            {/* Reports & Analytics - Accountant, Manager, Admin, Owner */}
            <Route
              path="reports"
              element={
                <RoleGuard allowedRoles={['FIRM_OWNER', 'FIRM_ADMIN', 'ACCOUNTANT', 'MANAGER']}>
                  <ReportsPage />
                </RoleGuard>
              }
            />

            {/* Settings - Firm Owner & Admin only */}
            <Route
              path="settings"
              element={
                <RoleGuard allowedRoles={['FIRM_OWNER', 'FIRM_ADMIN']}>
                  <SettingsPage />
                </RoleGuard>
              }
            />

            {/* Dedicated Client Portal view */}
            <Route path="portal" element={<ClientPortalPage />} />

            {/* Path aliases for resilience */}
            <Route path="todos" element={<Navigate to="/todo" replace />} />
            <Route path="timesheets" element={<Navigate to="/timesheet" replace />} />
            <Route path="client-portal" element={<Navigate to="/portal" replace />} />
          </Route>

          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
