import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ShieldCheck,
  Building2,
  Lock,
  Mail,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Briefcase,
  FileCheck,
  TrendingUp,
  Receipt,
  FileText,
  BadgeCheck,
  Users,
  PhoneCall,
  Clock,
  Sparkles,
} from 'lucide-react';
import { api, setAuthToken, setCurrentUser } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, login } = useAuth();

  // If query param ?tab=staff or pathname is /login, default to staff tab; else client tab
  const searchParams = new URLSearchParams(location.search);
  const initialTab = searchParams.get('tab') === 'staff' || location.pathname === '/login' ? 'staff' : 'client';
  const [activeTab, setActiveTab] = useState<'client' | 'staff'>(initialTab);

  // Client Login Inputs
  const [clientBusinessName, setClientBusinessName] = useState('');
  const [clientPhonePassword, setClientPhonePassword] = useState('');
  const [showClientPassword, setShowClientPassword] = useState(false);

  // Staff Login Inputs
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [showStaffPassword, setShowStaffPassword] = useState(false);

  // Status & Feedback
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      if (user.role === 'CLIENT') {
        navigate('/portal', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [user, navigate]);

  // Sync activeTab if location changes
  useEffect(() => {
    if (location.pathname === '/login' || searchParams.get('tab') === 'staff') {
      setActiveTab('staff');
    } else if (location.pathname === '/portal/login' || searchParams.get('tab') === 'client') {
      setActiveTab('client');
    }
  }, [location.pathname, location.search]);

  // Switch Tab Handler
  const handleTabSwitch = (tab: 'client' | 'staff') => {
    setActiveTab(tab);
    setError(null);
    setSuccessMsg(null);
  };

  // =========================================================================
  // 1. CLIENT LOGIN: Business Name + Connected Phone Number
  // =========================================================================
  const handleClientLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const cleanName = clientBusinessName.trim();
    const cleanPhone = clientPhonePassword.replace(/\D/g, '').slice(-10);

    if (!cleanName) {
      setError('Please enter your Business / Client Name.');
      return;
    }
    if (cleanPhone.length < 10) {
      setError('Please enter your connected 10-digit registered mobile number as password.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.loginClientPortal(cleanName, cleanPhone);
      if (!res.success || !res.token) {
        throw new Error(res.message || 'Business Name and connected mobile number do not match.');
      }

      setAuthToken(res.token);
      setCurrentUser(res.client);
      window.dispatchEvent(new Event('caflow_auth_changed'));

      setSuccessMsg(res.message || 'Credentials verified! Opening Client Portal...');
      setTimeout(() => {
        navigate('/portal');
      }, 500);
    } catch (err: any) {
      console.error('Portal credential login error:', err);
      setError(err.message || 'Business Name and connected phone number password do not match.');
    } finally {
      setLoading(false);
    }
  };

  // =========================================================================
  // 2. STAFF & PRACTICE LOGIN: Email + Password
  // =========================================================================
  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!staffEmail.trim() || !staffPassword.trim()) {
      setError('Please enter both staff email address and password.');
      return;
    }

    setLoading(true);
    try {
      await login(staffEmail.trim(), staffPassword);
      setSuccessMsg('Authenticated successfully! Opening practice dashboard...');
      setTimeout(() => {
        navigate('/dashboard');
      }, 500);
    } catch (err: any) {
      console.error('Staff login error:', err);
      setError(err.message || 'Invalid email address or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A2922] text-slate-100 flex flex-col justify-between relative overflow-hidden selection:bg-[#176B57] selection:text-white">
      {/* Background Glows & Subtle Grid */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0F3D32] via-[#0A2922] to-[#061814] -z-10" />
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#176B57]/20 rounded-full blur-3xl -z-10 pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-[30rem] h-[30rem] bg-emerald-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
      <div className="absolute inset-0 opacity-[0.04] bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none -z-10" />

      {/* Top Navigation Bar */}
      <header className="border-b border-white/10 bg-white/5 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#176B57] to-[#0F3D32] border border-[#A0D4C5]/30 flex items-center justify-center shadow-lg text-white font-black text-lg tracking-wider">
            MA
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-white text-base tracking-tight">MANAVI ASSOCIATES</span>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-[#176B57] text-[#D4EDE4] uppercase tracking-wider">
                Chartered Accountants
              </span>
            </div>
            <p className="text-[11px] text-[#A0D4C5]">Taxation • Audit & Assurance • Corporate Advisory • Compliance</p>
          </div>
        </div>

        {/* Quick Tab Switcher in Navbar */}
        <div className="flex items-center bg-white/10 rounded-xl p-1 border border-white/10 text-xs">
          <button
            onClick={() => handleTabSwitch('client')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'client'
                ? 'bg-white text-[#176B57] shadow-sm'
                : 'text-white/80 hover:text-white'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            Client Portal
          </button>
          <button
            onClick={() => handleTabSwitch('staff')}
            className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'staff'
                ? 'bg-white text-[#176B57] shadow-sm'
                : 'text-white/80 hover:text-white'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            Staff & Practice
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:px-6 lg:px-12 z-10">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          
          {/* Left Column: Firm Presentation & Highlights */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-[#A0D4C5]/30 text-xs text-[#D4EDE4] backdrop-blur-sm">
              <ShieldCheck className="w-4 h-4 text-[#A0D4C5]" />
              <span>ICAI Registered Practice • Bank-Grade Cryptographic Security</span>
            </div>

            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight">
                Unified Practice Management &{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#A0D4C5] via-emerald-300 to-teal-100">
                  Client Portal
                </span>
              </h1>
              <p className="text-sm sm:text-base text-slate-300 max-w-xl mx-auto lg:mx-0 leading-relaxed font-normal">
                Seamless digital compliance for businesses, corporate filers, and practice staff. 
                Access tax records, statutory return filings, invoices, and direct document vaults.
              </p>
            </div>

            {/* Feature Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-left">
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 hover:border-[#176B57] transition group backdrop-blur-xs">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs mb-1">
                  <TrendingUp className="w-4 h-4" />
                  <span>Statutory Compliance & GST</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  GSTR-1, 3B, Income Tax returns, 24Q TDS filings, and periodic review workflows.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 hover:border-[#176B57] transition group backdrop-blur-xs">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs mb-1">
                  <FileCheck className="w-4 h-4" />
                  <span>Digital Client Document Vault</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Secure direct uploads for bank statements, GST invoices, PAN, and identity proofs.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 hover:border-[#176B57] transition group backdrop-blur-xs">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs mb-1">
                  <Receipt className="w-4 h-4" />
                  <span>Fee Billing & Invoicing</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Transparent bills, outstanding balances, online receipts, and payment settlements.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 hover:border-[#176B57] transition group backdrop-blur-xs">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs mb-1">
                  <Users className="w-4 h-4" />
                  <span>Dedicated Staff Workspace</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Task allocations, review approvals, attendance punching, and timesheet tracking.
                </p>
              </div>
            </div>

            {/* Practice Contact Badge */}
            <div className="pt-2 flex flex-wrap items-center justify-center lg:justify-start gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[#A0D4C5]" />
                Manavi Associates • Chartered Accountants
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#A0D4C5]" />
                Mon - Sat: 9:30 AM - 7:30 PM
              </span>
            </div>
          </div>

          {/* Right Column: Unified Login Card */}
          <div className="lg:col-span-5 w-full max-w-md mx-auto">
            <div className="bg-white text-slate-900 rounded-3xl shadow-2xl p-6 sm:p-8 border border-white/20 backdrop-blur-md relative">
              
              {/* Tab Selector Buttons */}
              <div className="flex rounded-2xl bg-slate-100 p-1.5 mb-6 border border-slate-200">
                <button
                  type="button"
                  onClick={() => handleTabSwitch('client')}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    activeTab === 'client'
                      ? 'bg-[#176B57] text-white shadow-md'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  <span>Client Login</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTabSwitch('staff')}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    activeTab === 'staff'
                      ? 'bg-[#176B57] text-white shadow-md'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  <Briefcase className="w-4 h-4" />
                  <span>Staff Login</span>
                </button>
              </div>

              {/* Portal Context Title */}
              <div className="mb-5 text-center">
                <h2 className="text-xl font-black text-[#202A33] tracking-tight">
                  {activeTab === 'client' ? 'Client Portal Sign In' : 'Practice Staff Sign In'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {activeTab === 'client'
                    ? 'Enter business name & registered phone number password'
                    : 'Access partner desk, compliance workloads, & timesheets'}
                </p>
              </div>

              {/* Error & Success Alerts */}
              {error && (
                <div className="mb-4 rounded-xl bg-red-50 p-3.5 border border-red-200 flex items-start gap-2.5 text-xs text-red-700 animate-fadeIn">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="font-medium flex-1">{error}</p>
                </div>
              )}

              {successMsg && (
                <div className="mb-4 rounded-xl bg-emerald-50 p-3.5 border border-emerald-200 flex items-start gap-2.5 text-xs text-emerald-700 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <p className="font-medium flex-1">{successMsg}</p>
                </div>
              )}

              {/* ============================================================= */}
              {/* TAB 1: CLIENT PORTAL LOGIN                                    */}
              {/* ============================================================= */}
              {activeTab === 'client' && (
                <form onSubmit={handleClientLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Business / Client Name <span className="text-red-500">*</span>
                    </label>
                    <div className="relative rounded-xl shadow-xs">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Building2 className="h-4 w-4 text-[#176B57]" />
                      </div>
                      <input
                        type="text"
                        required
                        value={clientBusinessName}
                        onChange={(e) => setClientBusinessName(e.target.value)}
                        placeholder="e.g. A M DAIRY PRODUCTS"
                        className="block w-full pl-10 pr-3.5 py-2.5 text-xs font-medium border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#176B57] focus:border-[#176B57] text-slate-900 placeholder-slate-400 bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Password (Connected Mobile Number) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative rounded-xl shadow-xs">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 font-semibold text-xs">
                        <Lock className="h-3.5 w-3.5 mr-1 text-[#176B57]" />
                        +91
                      </div>
                      <input
                        type={showClientPassword ? 'text' : 'password'}
                        required
                        maxLength={10}
                        value={clientPhonePassword}
                        onChange={(e) => setClientPhonePassword(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="Enter 10-digit registered mobile number"
                        className="block w-full pl-16 pr-10 py-2.5 text-xs font-mono font-bold tracking-wider border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#176B57] focus:border-[#176B57] text-slate-900 placeholder-slate-400 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowClientPassword(!showClientPassword)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showClientPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Your registered 10-digit mobile number serves as your secure client password.
                    </p>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={loading || !clientBusinessName.trim() || clientPhonePassword.replace(/\D/g, '').length < 10}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold text-white bg-[#176B57] hover:bg-[#135847] active:bg-[#0F3D32] shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {loading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Verifying Client Access...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4 text-[#A0D4C5]" />
                          <span>Access Client Dashboard</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* ============================================================= */}
              {/* TAB 2: STAFF & PRACTICE LOGIN                                 */}
              {/* ============================================================= */}
              {activeTab === 'staff' && (
                <form onSubmit={handleStaffLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Staff Email Address <span className="text-red-500">*</span>
                    </label>
                    <div className="relative rounded-xl shadow-xs">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Mail className="h-4 w-4 text-[#176B57]" />
                      </div>
                      <input
                        type="email"
                        required
                        value={staffEmail}
                        onChange={(e) => setStaffEmail(e.target.value)}
                        placeholder="e.g. suresh@caflow.com"
                        className="block w-full pl-10 pr-3.5 py-2.5 text-xs font-medium border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#176B57] focus:border-[#176B57] text-slate-900 placeholder-slate-400 bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Staff Login Password <span className="text-red-500">*</span>
                    </label>
                    <div className="relative rounded-xl shadow-xs">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <Lock className="h-4 w-4 text-[#176B57]" />
                      </div>
                      <input
                        type={showStaffPassword ? 'text' : 'password'}
                        required
                        value={staffPassword}
                        onChange={(e) => setStaffPassword(e.target.value)}
                        placeholder="Enter your staff password"
                        className="block w-full pl-10 pr-10 py-2.5 text-xs font-medium border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#176B57] focus:border-[#176B57] text-slate-900 placeholder-slate-400 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowStaffPassword(!showStaffPassword)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showStaffPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Assigned by Managing Partner / Practice Administrator.
                    </p>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={loading || !staffEmail.trim() || !staffPassword.trim()}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold text-white bg-[#176B57] hover:bg-[#135847] active:bg-[#0F3D32] shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {loading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Authenticating Staff...</span>
                        </>
                      ) : (
                        <>
                          <Briefcase className="w-4 h-4 text-[#A0D4C5]" />
                          <span>Sign In to Practice Portal</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Bottom Security Notice */}
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-400 text-center">
                <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>256-Bit Encrypted Session • Isolated Client Workspaces</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-white/5 backdrop-blur-md px-4 sm:px-8 py-3 text-center text-xs text-slate-400 z-10 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div>
          © {new Date().getFullYear()} MANAVI ASSOCIATES • Chartered Accountants. All rights reserved.
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <span>Security & Compliance</span>
          <span>•</span>
          <span>Client Confidentiality</span>
          <span>•</span>
          <span>ICAI Standards Adherence</span>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
