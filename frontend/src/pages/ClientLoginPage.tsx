import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Building2,
  Lock,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { api, setAuthToken, setCurrentUser } from '../services/api';

export const ClientLoginPage: React.FC = () => {
  const navigate = useNavigate();

  // Credentials inputs
  const [businessName, setBusinessName] = useState('');
  const [phonePassword, setPhonePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // UI status
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Business Name + Password (Connected Phone Number) Authentication
  const handleCredentialLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const cleanName = businessName.trim();
    const cleanPhone = phonePassword.replace(/\D/g, '').slice(-10);

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
        throw new Error(res.message || 'Credentials match failed.');
      }

      // Store authentic JWT and client details
      setAuthToken(res.token);
      setCurrentUser(res.client);
      window.dispatchEvent(new Event('caflow_auth_changed'));

      setSuccessMsg(res.message || 'Credentials verified! Opening your client dashboard...');

      // Redirect directly to client dashboard
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F3D32] via-[#176B57] to-[#0A2922] flex flex-col justify-center items-center px-4 py-8 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Decorative background grid pattern */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

      {/* Top Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center z-10 mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-xl mb-3">
          <ShieldCheck className="w-9 h-9 text-[#A0D4C5]" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Client Portal Login
        </h1>
        <p className="mt-1 text-sm text-[#D4EDE4] flex items-center justify-center gap-1.5">
          <Building2 className="w-4 h-4 text-[#A0D4C5]" />
          MANAVI ASSOCIATES • Chartered Accountants
        </p>
      </div>

      {/* Main Authentication Card */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10 w-full">
        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 border border-slate-100">
          {/* Feedback messages */}
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

          {/* Business Credentials Login Form */}
          <form onSubmit={handleCredentialLogin} className="space-y-4">
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
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Enter registered business name"
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
                  type={showPassword ? 'text' : 'password'}
                  required
                  maxLength={10}
                  value={phonePassword}
                  onChange={(e) => setPhonePassword(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="Enter 10-digit registered mobile number"
                  className="block w-full pl-16 pr-10 py-2.5 text-xs font-mono font-bold tracking-wider border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#176B57] focus:border-[#176B57] text-slate-900 placeholder-slate-400 bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Your registered 10-digit mobile number acts as your secure portal password.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || !businessName.trim() || phonePassword.replace(/\D/g, '').length < 10}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-[#176B57] hover:bg-[#135847] active:bg-[#0F3D32] shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-[#A0D4C5]" />
                    <span>Login to Client Portal</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Security & Isolation Note */}
          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-center gap-2 text-[11px] text-slate-400">
            <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>End-to-End Cryptographically Isolated Client Session</span>
          </div>
        </div>

        {/* Bottom Switcher to Staff Login */}
        <div className="mt-6 text-center">
          <p className="text-xs text-[#E8F3EF]">
            Are you a partner, accountant, or staff member?{' '}
            <button
              onClick={() => navigate('/login')}
              className="font-bold text-white hover:underline ml-1 cursor-pointer"
            >
              Staff Portal Login →
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};
