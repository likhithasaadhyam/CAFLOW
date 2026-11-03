import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, Home, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface RoleGuardProps {
  allowedRoles: string[];
  children: React.ReactNode;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ allowedRoles, children }) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return null;
  }

  // FIRM_OWNER and FIRM_ADMIN have master permission
  const isAuthorized =
    user.role === 'FIRM_OWNER' ||
    user.role === 'FIRM_ADMIN' ||
    allowedRoles.includes(user.role);

  if (isAuthorized) {
    return <>{children}</>;
  }

  const roleNameMap: Record<string, string> = {
    FIRM_OWNER: 'Firm Owner (Managing Partner)',
    FIRM_ADMIN: 'Firm Admin (Operations)',
    MANAGER: 'Senior Audit Manager',
    ACCOUNTANT: 'Finance Controller / Accountant',
    TAX_PROFESSIONAL: 'CA / Tax Consultant',
    EMPLOYEE: 'Employee / Audit Assistant',
    CLIENT: 'External Client Portal User',
  };

  const returnPath = user.role === 'CLIENT' ? '/portal' : '/dashboard';

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl border border-[#E1E7E2] p-8 text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-[#FEE2E2] flex items-center justify-center text-[#DC2626] shadow-sm">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FEF2F2] border border-[#FECACA] text-[11px] font-bold text-[#DC2626] uppercase tracking-wider">
            <Lock className="w-3 h-3" />
            Security Boundary Enforced
          </div>
          <h2 className="text-xl font-black text-[#202A33] tracking-tight">
            Access Restricted (అనుమతి నిరాకరించబడింది)
          </h2>
          <p className="text-xs text-[#607274] leading-relaxed">
            Your current logged-in role <strong className="text-[#202A33]">{roleNameMap[user.role] || user.role}</strong> does not have authorization to access this operational module.
          </p>
        </div>

        <div className="bg-[#FAFBF9] rounded-xl border border-[#E1E7E2] p-4 text-left space-y-2">
          <div className="text-[10px] font-bold text-[#8C9B90] uppercase tracking-wider">
            Authorized Roles for this Module:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allowedRoles.map(role => (
              <span
                key={role}
                className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[#E8F3EF] text-[#176B57]"
              >
                {roleNameMap[role] || role}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 text-xs font-semibold text-[#4A5568] hover:text-[#202A33] bg-[#F1F4F1] hover:bg-[#E5EAE6] rounded-lg transition flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Go Back
          </button>
          <button
            onClick={() => navigate(returnPath)}
            className="px-5 py-2 text-xs font-bold text-white bg-[#176B57] hover:bg-[#135847] rounded-lg shadow transition flex items-center gap-1.5"
          >
            <Home className="w-3.5 h-3.5" />
            Go to My Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};
