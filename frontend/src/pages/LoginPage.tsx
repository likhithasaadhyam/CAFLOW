import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, Building2, Shield, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F8F5] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#176B57] text-white font-extrabold text-2xl shadow-md">
            CF
          </div>
          <h1 className="text-2xl font-black text-[#202A33] tracking-tight">CAFlow</h1>
          <p className="text-xs text-[#607274]">Chartered Accountant Office Operations & Management Platform</p>
        </div>

        {/* Card */}
        <div className="caflow-card p-8 bg-white shadow-xl rounded-2xl border border-[#E1E7E2]">
          <h2 className="text-base font-bold text-[#202A33] mb-4 text-center">Sign in to your Practice</h2>

          {error && (
            <div className="mb-4 rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] p-3 text-xs text-[#DC2626] font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#202A33] mb-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-[#8C9B90]" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. name@manavi.com"
                  className="w-full rounded-lg border border-[#E1E7E2] bg-[#FAFBF9] py-2 pl-9 pr-3 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#202A33] mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-[#8C9B90]" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-lg border border-[#E1E7E2] bg-[#FAFBF9] py-2 pl-9 pr-3 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim() || !password.trim()}
              className="w-full py-2.5 bg-[#176B57] hover:bg-[#135847] text-white font-bold text-xs rounded-lg shadow transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Authenticating...' : 'Sign In'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
