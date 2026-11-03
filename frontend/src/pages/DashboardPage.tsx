import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  Play,
  Square,
  CheckCircle2,
  AlertCircle,
  PauseCircle,
  Plus,
  ArrowRight,
  TrendingUp,
  FileCheck,
  Shield,
  IndianRupee,
  Users,
  Calendar,
  CheckSquare,
  Briefcase,
  AlertTriangle,
  Receipt,
  FileText,
  BadgeCheck,
  UserPlus,
  Key,
  Lock,
  Mail,
  Phone,
  Copy,
  Check,
  Search,
  Eye,
  EyeOff,
  Sparkles,
  RefreshCw,
  UserCheck,
  UserX,
  X,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { CreatableSelect } from '../components/common/CreatableSelect';

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [taskTab, setTaskTab] = useState<'Pending' | 'Hold' | 'In-Progress' | 'Completed'>('Pending');
  const [todoTab, setTodoTab] = useState<'Today' | 'Upcoming' | 'Completed'>('Today');
  const [checkingAttendance, setCheckingAttendance] = useState(false);

  // Employee Management State for Admin / Firm Owner / Manager
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [selectedEmployeeForReset, setSelectedEmployeeForReset] = useState<any | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [employeeRoleFilter, setEmployeeRoleFilter] = useState('ALL');
  const [employeeFormData, setEmployeeFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'EMPLOYEE',
    designation: 'Audit Assistant',
    department: 'Audit & Assurance',
    phone: '',
  });
  const [newPasswordValue, setNewPasswordValue] = useState('');
  const [employeeSubmitting, setEmployeeSubmitting] = useState(false);
  const [employeeModalSuccess, setEmployeeModalSuccess] = useState<{
    fullName: string;
    email: string;
    password: string;
    role: string;
  } | null>(null);
  const [employeeModalError, setEmployeeModalError] = useState<string | null>(null);
  const [resetModalSuccess, setResetModalSuccess] = useState<string | null>(null);
  const [resetModalError, setResetModalError] = useState<string | null>(null);
  const [showPasswordText, setShowPasswordText] = useState(true);
  const [showResetPasswordText, setShowResetPasswordText] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const role = user?.role || 'EMPLOYEE';
  const isOwnerOrAdmin = role === 'FIRM_OWNER' || role === 'FIRM_ADMIN';
  const isManager = role === 'MANAGER';
  const isAccountant = role === 'ACCOUNTANT';
  const isTaxPro = role === 'TAX_PROFESSIONAL';
  const isEmployee = role === 'EMPLOYEE';
  const isClient = role === 'CLIENT';

  const fetchMetrics = async (isBackground = false) => {
    if (!isBackground) {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await api.getDashboardMetrics();
      if (res && res.success) {
        setData(res.data);
      } else {
        setError(res?.message || 'Failed to load authorized dashboard metrics.');
      }
    } catch (err: any) {
      console.error('Failed to load dashboard metrics:', err);
      setError(err?.message || 'Error communicating with practice server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    fetchMetrics();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleAttendanceAction = async () => {
    setCheckingAttendance(true);
    try {
      if (data?.attendanceWidget?.isCheckedIn) {
        await api.checkOut();
      } else {
        await api.checkIn();
      }
      await fetchMetrics(true);
    } catch (err) {
      console.error(err);
    } finally {
      setCheckingAttendance(false);
    }
  };

  const handleToggleTodo = async (todoId: string) => {
    try {
      await api.toggleTodo(todoId);
      await fetchMetrics(true);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopy = (text: string, key: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleToggleEmployeeStatus = async (employeeId: string, currentStatus: boolean) => {
    try {
      await api.updateTeamMemberStatus(employeeId, !currentStatus);
      await fetchMetrics(true);
    } catch (err: any) {
      alert(err?.message || 'Failed to update employee status');
    }
  };

  const generateRandomPassword = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let pwd = '';
    for (let i = 0; i < 8; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setEmployeeFormData((prev) => ({ ...prev, password: pwd }));
  };

  const generateResetPassword = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let pwd = '';
    for (let i = 0; i < 8; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPasswordValue(pwd);
  };

  const handleAddEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmployeeSubmitting(true);
    setEmployeeModalError(null);
    try {
      const res = await api.addTeamMember(employeeFormData);
      if (res && res.success) {
        setEmployeeModalSuccess({
          fullName: employeeFormData.fullName,
          email: employeeFormData.email,
          password: employeeFormData.password,
          role: employeeFormData.role,
        });
        await fetchMetrics(true);
      } else {
        setEmployeeModalError(res?.message || 'Failed to add employee');
      }
    } catch (err: any) {
      setEmployeeModalError(err?.message || 'Failed to create employee. Please check inputs.');
    } finally {
      setEmployeeSubmitting(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeForReset || !newPasswordValue.trim()) return;
    setEmployeeSubmitting(true);
    setResetModalError(null);
    try {
      const res = await api.resetTeamMemberPassword(selectedEmployeeForReset.id, newPasswordValue.trim());
      if (res && res.success) {
        setResetModalSuccess(`Password reset successfully for ${selectedEmployeeForReset.fullName}`);
        setTimeout(() => {
          setShowResetPasswordModal(false);
          setSelectedEmployeeForReset(null);
          setNewPasswordValue('');
          setResetModalSuccess(null);
        }, 1800);
      } else {
        setResetModalError(res?.message || 'Failed to reset password');
      }
    } catch (err: any) {
      setResetModalError(err?.message || 'Failed to reset password');
    } finally {
      setEmployeeSubmitting(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-20 bg-white rounded-xl border border-[#E1E7E2]" />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 bg-white rounded-xl border border-[#E1E7E2] p-4 flex flex-col justify-center items-center">
              <div className="h-6 w-12 bg-[#E1E7E2] rounded mb-2" />
              <div className="h-3 w-16 bg-[#F1F4F1] rounded" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 h-80 bg-white rounded-xl border border-[#E1E7E2]" />
          <div className="lg:col-span-4 h-80 bg-white rounded-xl border border-[#E1E7E2]" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
        <h3 className="text-sm font-bold text-red-800">Unable to load dashboard metrics</h3>
        <p className="text-xs text-red-600 mt-1 max-w-md mx-auto">{error}</p>
        <button
          onClick={() => fetchMetrics()}
          className="mt-4 px-4 py-2 bg-[#176B57] text-white text-xs font-bold rounded-lg shadow hover:bg-[#135847] transition"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  // If Client role, render the Client Portal view directly
  if (isClient) {
    const clientData = data || {};
    const summary = clientData.summary || { activeTasks: 0, unpaidAmount: 0, pendingDocs: 0 };

    return (
      <div className="space-y-6">
        {/* Client Welcome Banner */}
        <div className="rounded-2xl bg-gradient-to-r from-[#176B57] to-[#135847] p-6 text-white shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-white/20 text-[11px] font-bold tracking-wider uppercase mb-2">
                Client Portal • Verified Entity
              </span>
              <h1 className="text-2xl font-black tracking-tight">{user?.clientName || 'My Organization Portal'}</h1>
              <p className="text-xs text-white/80 mt-1">
                Filing status, document collection requests, invoices, and service records
              </p>
            </div>
            <button
              onClick={() => navigate('/portal')}
              className="px-4 py-2 bg-white text-[#176B57] text-xs font-bold rounded-lg shadow hover:bg-[#F7F8F5] transition flex items-center gap-2 self-start md:self-auto"
            >
              Open Full Portal
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Client Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="caflow-card p-5 border-l-4 border-l-[#D97706]">
            <div className="text-2xl font-extrabold text-[#D97706] mb-1">{summary.activeTasks}</div>
            <div className="text-xs font-bold text-[#202A33]">Active Compliance Tasks</div>
            <p className="text-[11px] text-[#607274] mt-1">Ongoing GST, Tax & Regulatory filings</p>
          </div>

          <div className="caflow-card p-5 border-l-4 border-l-[#DC2626]">
            <div className="text-2xl font-extrabold text-[#DC2626] mb-1">
              ₹{(summary.unpaidAmount || 0).toLocaleString('en-IN')}
            </div>
            <div className="text-xs font-bold text-[#202A33]">Outstanding Invoices</div>
            <p className="text-[11px] text-[#607274] mt-1">{summary.unpaidInvoicesCount || 0} bills pending payment</p>
          </div>

          <div className="caflow-card p-5 border-l-4 border-l-[#2563EB]">
            <div className="text-2xl font-extrabold text-[#2563EB] mb-1">{summary.pendingDocs}</div>
            <div className="text-xs font-bold text-[#202A33]">Document Requests Pending</div>
            <p className="text-[11px] text-[#607274] mt-1">Awaiting statement or bill upload</p>
          </div>
        </div>

        {/* Client Active Tasks Table */}
        <div className="caflow-card p-5">
          <div className="flex items-center justify-between border-b border-[#E1E7E2] pb-3 mb-4">
            <h2 className="text-sm font-bold text-[#202A33]">My Active Compliance Filings</h2>
            <button onClick={() => navigate('/portal')} className="text-xs text-[#176B57] font-semibold hover:underline">
              View all
            </button>
          </div>

          {(!clientData.tasks || clientData.tasks.length === 0) ? (
            <div className="text-center py-8 text-xs text-[#607274]">
              No active filing tasks for your organization at this time.
            </div>
          ) : (
            <div className="divide-y divide-[#F1F4F1]">
              {clientData.tasks.slice(0, 5).map((t: any) => (
                <div key={t.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-[#202A33]">{t.title}</div>
                    <div className="text-[11px] text-[#607274]">Service: {t.service?.name || 'General'}</div>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#E8F3EF] text-[#176B57]">
                      {t.status}
                    </span>
                    <div className="text-[10px] text-[#607274] mt-0.5">
                      Due: {new Date(t.dueDate).toLocaleDateString('en-IN')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const summary = data?.summary || {
    dueToday: 0,
    dueTomorrow: 0,
    dueIn7Days: 0,
    overdueUpTo7Days: 0,
    overdueOver7Days: 0,
    pendingCount: 0,
    inProgressCount: 0,
    holdCount: 0,
    submittedForReviewCount: 0,
    completedCount: 0,
    totalActive: 0,
  };

  const donutData = data?.taskDistribution || [
    { name: 'Pending', value: summary.pendingCount || 0, color: '#F59E0B' },
    { name: 'In-Progress', value: summary.inProgressCount || 0, color: '#0EA5E9' },
    { name: 'Hold', value: summary.holdCount || 0, color: '#94A3B8' },
    { name: 'Completed', value: summary.completedCount || 0, color: '#10B981' },
  ];

  const roleBadgeMap: Record<string, { label: string; bg: string; text: string }> = {
    FIRM_OWNER: { label: 'Firm Owner (Managing Partner)', bg: 'bg-[#176B57]', text: 'text-white' },
    FIRM_ADMIN: { label: 'Practice Operations Admin', bg: 'bg-[#0E7490]', text: 'text-white' },
    MANAGER: { label: 'Senior Audit Manager', bg: 'bg-[#6D28D9]', text: 'text-white' },
    ACCOUNTANT: { label: 'Finance Controller / Accountant', bg: 'bg-[#B45309]', text: 'text-white' },
    TAX_PROFESSIONAL: { label: 'CA / Tax Consultant', bg: 'bg-[#047857]', text: 'text-white' },
    EMPLOYEE: { label: 'Audit Assistant (Staff)', bg: 'bg-[#334155]', text: 'text-white' },
  };

  const currentBadge = roleBadgeMap[role] || { label: role, bg: 'bg-[#176B57]', text: 'text-white' };

  return (
    <div className="space-y-6">
      {/* Role Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-[#E1E7E2] shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${currentBadge.bg} ${currentBadge.text}`}>
              {currentBadge.label}
            </span>
            <span className="text-xs text-[#607274]">
              {user?.department ? `${user.department} Department` : 'CAFlow Practice'}
            </span>
          </div>
          <h1 className="text-lg font-black text-[#202A33] tracking-tight mt-1">
            {isEmployee ? 'My Daily Workdesk' : isAccountant ? 'Finance & Accounts Overview' : isManager ? 'Audit & Review Dashboard' : isTaxPro ? 'Tax & Compliance Workdesk' : 'Practice Operations Overview'}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {(isOwnerOrAdmin || isManager) && (
            <button
              onClick={() => {
                setEmployeeModalSuccess(null);
                setEmployeeModalError(null);
                setShowAddEmployeeModal(true);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-[#0F3D32] border border-[#176B57] px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#176B57] transition"
            >
              <UserPlus className="h-3.5 w-3.5 text-emerald-300" />
              + Add Employee
            </button>
          )}
          {!isAccountant && !isEmployee && (
            <button
              onClick={() => navigate('/tasks')}
              className="flex items-center gap-1.5 rounded-lg bg-[#176B57] px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#135847] transition"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Task
            </button>
          )}
          {isAccountant && (
            <button
              onClick={() => navigate('/finance')}
              className="flex items-center gap-1.5 rounded-lg bg-[#176B57] px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#135847] transition"
            >
              <Plus className="h-3.5 w-3.5" />
              New Invoice
            </button>
          )}
        </div>
      </div>

      {/* =========================================================================
          ACCOUNTANT ROLE TOP KPI CARDS
      ========================================================================= */}
      {isAccountant && data?.outstandingReceivables && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="caflow-card p-4 border-l-4 border-l-[#176B57]">
            <div className="text-2xl font-black text-[#176B57]">
              ₹{(data.outstandingReceivables.totalBilled || 0).toLocaleString('en-IN')}
            </div>
            <div className="text-xs font-bold text-[#202A33] mt-1">Total Billed</div>
            <p className="text-[10px] text-[#607274]">All practice fee invoices</p>
          </div>

          <div className="caflow-card p-4 border-l-4 border-l-[#16A34A]">
            <div className="text-2xl font-black text-[#16A34A]">
              ₹{(data.outstandingReceivables.totalCollected || 0).toLocaleString('en-IN')}
            </div>
            <div className="text-xs font-bold text-[#202A33] mt-1">Total Collected</div>
            <p className="text-[10px] text-[#607274]">Settled via NEFT / UPI / Cheque</p>
          </div>

          <div className="caflow-card p-4 border-l-4 border-l-[#D97706]">
            <div className="text-2xl font-black text-[#D97706]">
              ₹{(data.outstandingReceivables.total || 0).toLocaleString('en-IN')}
            </div>
            <div className="text-xs font-bold text-[#202A33] mt-1">Outstanding Receivables</div>
            <p className="text-[10px] text-[#607274]">Pending client fee collections</p>
          </div>

          <div className="caflow-card p-4 border-l-4 border-l-[#DC2626]">
            <div className="text-2xl font-black text-[#DC2626]">
              {data.outstandingReceivables.invoices?.length || 0}
            </div>
            <div className="text-xs font-bold text-[#202A33] mt-1">Overdue Invoices</div>
            <p className="text-[10px] text-[#607274]">Awaiting collection reminder</p>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAX PROFESSIONAL ROLE TOP CARDS
      ========================================================================= */}
      {isTaxPro && data?.taxProMetrics && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="caflow-card p-4 border-l-4 border-l-[#176B57]">
            <div className="text-2xl font-black text-[#176B57]">
              {data.taxProMetrics.activeGstFilings || 0}
            </div>
            <div className="text-xs font-bold text-[#202A33] mt-1">Active GST Returns</div>
            <p className="text-[10px] text-[#607274]">GSTR-3B & GSTR-1 preparation</p>
          </div>

          <div className="caflow-card p-4 border-l-4 border-l-[#0284C7]">
            <div className="text-2xl font-black text-[#0284C7]">
              {data.taxProMetrics.activeTaxReturns || 0}
            </div>
            <div className="text-xs font-bold text-[#202A33] mt-1">Income Tax & TDS Tasks</div>
            <p className="text-[10px] text-[#607274]">ITR filings & 24Q quarterly returns</p>
          </div>

          <div className="caflow-card p-4 border-l-4 border-l-[#D97706]">
            <div className="text-2xl font-black text-[#D97706]">
              {data.taxProMetrics.upcomingDeadlines?.length || 0}
            </div>
            <div className="text-xs font-bold text-[#202A33] mt-1">Statutory Deadlines (7 Days)</div>
            <p className="text-[10px] text-[#607274]">Requires immediate client filing</p>
          </div>
        </div>
      )}

      {/* =========================================================================
          MANAGER ROLE TOP CARDS (Review Queue & Team Attendance)
      ========================================================================= */}
      {isManager && data?.managerMetrics && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="caflow-card p-4 border-l-4 border-l-[#8B5CF6]">
            <div className="text-2xl font-black text-[#8B5CF6]">
              {data.managerMetrics.submittedForReviewCount || 0}
            </div>
            <div className="text-xs font-bold text-[#202A33] mt-1">Tasks Awaiting Review</div>
            <p className="text-[10px] text-[#607274]">Submitted by staff for sign-off</p>
          </div>

          <div className="caflow-card p-4 border-l-4 border-l-[#0284C7]">
            <div className="text-2xl font-black text-[#0284C7]">
              {data.managerMetrics.pendingTimesheetsCount || 0}
            </div>
            <div className="text-xs font-bold text-[#202A33] mt-1">Timesheets Pending Approval</div>
            <p className="text-[10px] text-[#607274]">Weekly staff billable logs</p>
          </div>

          <div className="caflow-card p-4 border-l-4 border-l-[#16A34A]">
            <div className="text-2xl font-black text-[#16A34A]">
              {data.managerMetrics.teamPresentCount || 0}
            </div>
            <div className="text-xs font-bold text-[#202A33] mt-1">Team Members Present Today</div>
            <p className="text-[10px] text-[#607274]">Punched in via attendance module</p>
          </div>
        </div>
      )}

      {/* =========================================================================
          STANDARD / EMPLOYEE / FIRM OWNER SUMMARY COUNTERS
      ========================================================================= */}
      {!isAccountant && (
        <div className={`grid grid-cols-2 sm:grid-cols-3 ${isOwnerOrAdmin || isManager ? 'md:grid-cols-6' : 'md:grid-cols-5'} gap-3`}>
          <div
            onClick={() => navigate('/tasks?date=today')}
            className="caflow-card cursor-pointer p-4 text-center hover:border-[#DDAA45] transition relative group"
          >
            <div className="text-3xl font-extrabold text-[#D97706] mb-1">{summary.dueToday}</div>
            <div className="text-[11px] font-semibold text-[#607274] uppercase tracking-wider">
              {isEmployee ? 'My Due Today' : 'Due Today'}
            </div>
          </div>

          <div
            onClick={() => navigate('/tasks?date=tomorrow')}
            className="caflow-card cursor-pointer p-4 text-center hover:border-[#0284C7] transition relative group"
          >
            <div className="text-3xl font-extrabold text-[#2563EB] mb-1">{summary.dueTomorrow}</div>
            <div className="text-[11px] font-semibold text-[#607274] uppercase tracking-wider">Due Tomorrow</div>
          </div>

          <div
            onClick={() => navigate('/tasks?date=7days')}
            className="caflow-card cursor-pointer p-4 text-center hover:border-[#10B981] transition relative group"
          >
            <div className="text-3xl font-extrabold text-[#16A34A] mb-1">{summary.dueIn7Days}</div>
            <div className="text-[11px] font-semibold text-[#607274] uppercase tracking-wider">Due in 7 Days</div>
          </div>

          <div
            onClick={() => navigate('/tasks?date=overdue')}
            className="caflow-card cursor-pointer p-4 text-center hover:border-[#F97316] transition relative group"
          >
            <div className="text-3xl font-extrabold text-[#EA580C] mb-1">{summary.overdueUpTo7Days}</div>
            <div className="text-[11px] font-semibold text-[#607274] uppercase tracking-wider">Overdue up to 7d</div>
          </div>

          <div
            onClick={() => navigate('/tasks?date=overdue')}
            className="caflow-card cursor-pointer p-4 text-center hover:border-[#DC2626] transition relative group"
          >
            <div className="text-3xl font-extrabold text-[#DC2626] mb-1">{summary.overdueOver7Days}</div>
            <div className="text-[11px] font-semibold text-[#607274] uppercase tracking-wider">Overdue &gt; 7d</div>
          </div>

          {(isOwnerOrAdmin || isManager) && (
            <div
              onClick={() => {
                const el = document.getElementById('team-roster-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="caflow-card cursor-pointer p-4 text-center hover:border-[#176B57] transition relative group border-t-2 border-t-[#176B57]"
            >
              <div className="text-3xl font-extrabold text-[#176B57] mb-1">
                {data?.teamMetrics?.totalEmployees || 0}
              </div>
              <div className="text-[11px] font-semibold text-[#607274] uppercase tracking-wider">
                Employees ({data?.teamMetrics?.activeCount || 0} Active)
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          MAIN TWO-COLUMN DASHBOARD GRID
      ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN (8 COLS) */}
        <div className="lg:col-span-8 space-y-6">
          {/* MANAGER: Review Queue Widget */}
          {isManager && data?.managerMetrics?.reviewQueue?.length > 0 && (
            <div className="caflow-card p-5 border-l-4 border-l-[#8B5CF6]">
              <div className="flex items-center justify-between border-b border-[#E1E7E2] pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-[#8B5CF6]" />
                  <h2 className="text-sm font-bold text-[#202A33]">Review Queue (Awaiting Manager Approval)</h2>
                </div>
                <button onClick={() => navigate('/tasks')} className="text-xs text-[#8B5CF6] font-semibold hover:underline">
                  Open Tasks
                </button>
              </div>
              <div className="divide-y divide-[#F1F4F1]">
                {data.managerMetrics.reviewQueue.map((t: any) => (
                  <div key={t.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-[#202A33]">{t.title}</div>
                      <div className="text-[11px] text-[#607274]">
                        Client: {t.client?.name} • Submitted by: {t.assignments?.[0]?.user?.fullName || 'Staff'}
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/tasks?id=${t.id}`)}
                      className="px-2.5 py-1 bg-[#8B5CF6] text-white font-bold text-[10px] rounded hover:bg-[#7C3AED] transition"
                    >
                      Review & Approve
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ACCOUNTANT: Recent Unpaid Invoices */}
          {isAccountant && data?.outstandingReceivables?.invoices && (
            <div className="caflow-card p-5">
              <div className="flex items-center justify-between border-b border-[#E1E7E2] pb-3 mb-3">
                <h2 className="text-sm font-bold text-[#202A33]">Fee Invoices Pending Collection</h2>
                <button onClick={() => navigate('/finance')} className="text-xs text-[#176B57] font-semibold hover:underline">
                  Open Billing
                </button>
              </div>
              <div className="divide-y divide-[#F1F4F1]">
                {data.outstandingReceivables.invoices.map((inv: any) => (
                  <div key={inv.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-[#202A33]">{inv.client?.name}</div>
                      <div className="text-[11px] text-[#607274]">
                        Invoice: {inv.invoiceNumber} • Total: ₹{inv.totalAmount.toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-[#DC2626]">₹{inv.balanceDue.toLocaleString('en-IN')} Due</div>
                      <div className="text-[10px] text-[#607274]">Due on {new Date(inv.dueDate).toLocaleDateString('en-IN')}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAX PRO: Upcoming Deadlines */}
          {isTaxPro && data?.taxProMetrics?.upcomingDeadlines && (
            <div className="caflow-card p-5 border-l-4 border-l-[#176B57]">
              <div className="flex items-center justify-between border-b border-[#E1E7E2] pb-3 mb-3">
                <h2 className="text-sm font-bold text-[#202A33]">Upcoming Statutory Filing Deadlines</h2>
                <button onClick={() => navigate('/tasks')} className="text-xs text-[#176B57] font-semibold hover:underline">
                  View All
                </button>
              </div>
              <div className="divide-y divide-[#F1F4F1]">
                {data.taxProMetrics.upcomingDeadlines.map((t: any) => (
                  <div key={t.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-[#202A33]">{t.title}</div>
                      <div className="text-[11px] text-[#607274]">
                        Client: {t.client?.name} • Service: {t.service?.name || 'Tax'}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#FEF3C7] text-[#92400E]">
                        Due {new Date(t.dueDate).toLocaleDateString('en-IN')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Standard Service Workload Breakdown */}
          {!isAccountant && (
            <div className="caflow-card p-5">
              <div className="flex items-center justify-between border-b border-[#E1E7E2] pb-3 mb-4">
                <h2 className="text-sm font-bold text-[#202A33]">
                  {isEmployee ? 'My Assigned Workload' : 'Compliance & Service Distribution'}
                </h2>
                <button onClick={() => navigate('/tasks')} className="text-xs text-[#176B57] font-semibold hover:underline">
                  View Tasks
                </button>
              </div>

              <div className="divide-y divide-[#F1F4F1]">
                {data?.serviceBreakdown?.slice(0, 6).map((s: any) => (
                  <div key={s.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-[#202A33]">{s.name}</div>
                      <div className="text-[11px] text-[#607274]">{s.category}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-medium text-[#F59E0B]">{s.pending} Pending</span>
                      <span className="text-[11px] font-medium text-[#0EA5E9]">{s.inProgress} In-Progress</span>
                      <span className="text-[11px] font-medium text-[#10B981]">{s.completed} Done</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* EMPLOYEE: Weekly Hours Logged */}
          {isEmployee && data?.employeeMetrics && (
            <div className="caflow-card p-5 border-l-4 border-l-[#0284C7]">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-bold text-[#202A33]">My Weekly Productivity</h2>
                <button onClick={() => navigate('/timesheet')} className="text-xs text-[#0284C7] font-semibold hover:underline">
                  Open Timesheets
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div className="bg-[#FAFBF9] p-3 rounded-lg border border-[#E1E7E2]">
                  <div className="text-xl font-black text-[#202A33]">{data.employeeMetrics.weeklyHours} hrs</div>
                  <div className="text-[10px] text-[#607274] uppercase font-bold">Total Logged (Past 7d)</div>
                </div>
                <div className="bg-[#FAFBF9] p-3 rounded-lg border border-[#E1E7E2]">
                  <div className="text-xl font-black text-[#16A34A]">{data.employeeMetrics.weeklyBillableHours} hrs</div>
                  <div className="text-[10px] text-[#607274] uppercase font-bold">Billable Work Hours</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Attendance & To-Do Widgets (4 COLS) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Live Attendance Punch In/Out Widget */}
          <div className="caflow-card p-5">
            <div className="flex items-center justify-between border-b border-[#E1E7E2] pb-3 mb-4">
              <h2 className="text-sm font-bold text-[#202A33]">Daily Attendance</h2>
              <button onClick={() => navigate('/attendance')} className="text-xs text-[#176B57] font-semibold hover:underline">
                View Log
              </button>
            </div>

            <div className="text-center py-3">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F3EF] text-[#176B57] mb-2">
                <Clock className="h-7 w-7" />
              </div>
              <div className="text-xl font-extrabold text-[#202A33]">
                {data?.attendanceWidget?.workedDurationFormatted || '0h 0m'}
              </div>
              <div className="text-xs text-[#607274] font-medium">Logged today</div>

              <div className="mt-4 flex justify-center">
                <button
                  disabled={checkingAttendance}
                  onClick={handleAttendanceAction}
                  className={`flex items-center gap-2 rounded-lg px-6 py-2.5 text-xs font-bold text-white shadow transition disabled:opacity-50 ${
                    data?.attendanceWidget?.isCheckedIn
                      ? 'bg-[#DC2626] hover:bg-[#B91C1C]'
                      : 'bg-[#176B57] hover:bg-[#135847]'
                  }`}
                >
                  {data?.attendanceWidget?.isCheckedIn ? (
                    <>
                      <Square className="h-4 w-4 fill-white" />
                      Punch Check-Out
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 fill-white" />
                      Punch Check-In
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Personal To-Do Widget */}
          <div className="caflow-card p-5">
            <div className="flex items-center justify-between border-b border-[#E1E7E2] pb-3 mb-3">
              <h2 className="text-sm font-bold text-[#202A33]">My To-Do Reminders</h2>
              <button onClick={() => navigate('/todo')} className="text-xs text-[#176B57] font-semibold hover:underline">
                All To-Dos
              </button>
            </div>

            {(!data?.todos || data.todos.length === 0) ? (
              <div className="text-center py-6 text-xs text-[#607274]">
                No pending to-dos for today.
              </div>
            ) : (
              <div className="space-y-2">
                {data.todos.slice(0, 5).map((td: any) => (
                  <div
                    key={td.id}
                    onClick={() => handleToggleTodo(td.id)}
                    className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-[#FAFBF9] cursor-pointer border border-transparent hover:border-[#E1E7E2] transition"
                  >
                    <input
                      type="checkbox"
                      checked={td.status === 'COMPLETED'}
                      onChange={() => {}}
                      className="mt-0.5 rounded border-[#8C9B90] text-[#176B57] focus:ring-[#176B57]"
                    />
                    <div className="flex-1 text-xs">
                      <span className={td.status === 'COMPLETED' ? 'line-through text-[#8C9B90]' : 'text-[#202A33] font-medium'}>
                        {td.title}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================================
          ADMIN & MANAGEMENT: PRACTICE EMPLOYEES & CREDENTIALS OVERVIEW
      ========================================================================= */}
      {(isOwnerOrAdmin || isManager) && (() => {
        const teamEmployees: any[] = data?.teamMetrics?.employees || [];
        const filteredEmployees = teamEmployees.filter((emp) => {
          const matchRole = employeeRoleFilter === 'ALL' || emp.role === employeeRoleFilter;
          const searchLower = employeeSearch.toLowerCase().trim();
          const matchSearch =
            !searchLower ||
            (emp.fullName && emp.fullName.toLowerCase().includes(searchLower)) ||
            (emp.email && emp.email.toLowerCase().includes(searchLower)) ||
            (emp.department && emp.department.toLowerCase().includes(searchLower)) ||
            (emp.designation && emp.designation.toLowerCase().includes(searchLower)) ||
            (emp.role && emp.role.toLowerCase().includes(searchLower));
          return matchRole && matchSearch;
        });

        return (
          <div id="team-roster-section" className="caflow-card p-6 border border-[#E1E7E2] shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E1E7E2] pb-4 mb-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-[#E8F3EF] text-[#176B57]">
                    <Users className="h-5 w-5" />
                  </div>
                  <h2 className="text-base font-black text-[#202A33] tracking-tight">
                    Practice Employees & Team Overview
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#E8F3EF] text-[#176B57] border border-[#C2DDD4]">
                    {data?.teamMetrics?.totalEmployees || 0} Total Staff ({data?.teamMetrics?.activeCount || 0} Active)
                  </span>
                </div>
                <p className="text-xs text-[#607274] mt-1">
                  Manage firm employee accounts, set/view login credentials, roles, and access status
                </p>
              </div>

              <div className="flex items-center gap-3">
                {/* Search */}
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#607274]" />
                  <input
                    type="text"
                    value={employeeSearch}
                    onChange={(e) => setEmployeeSearch(e.target.value)}
                    placeholder="Search name, email, role..."
                    className="pl-8 pr-7 py-1.5 text-xs rounded-lg border border-[#E1E7E2] bg-white focus:outline-none focus:border-[#176B57] w-48 sm:w-60 shadow-xs"
                  />
                  {employeeSearch && (
                    <button
                      onClick={() => setEmployeeSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#607274] hover:text-[#202A33]"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Add Employee Button */}
                <button
                  onClick={() => {
                    setEmployeeModalSuccess(null);
                    setEmployeeModalError(null);
                    setShowAddEmployeeModal(true);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-[#176B57] hover:bg-[#135847] px-4 py-2 text-xs font-bold text-white shadow-sm transition shrink-0"
                >
                  <UserPlus className="h-4 w-4" />
                  + Add New Employee
                </button>
              </div>
            </div>

            {/* Role Filter Chips */}
            <div className="flex flex-wrap items-center gap-1.5 mb-4 text-xs">
              <span className="text-[#607274] font-medium mr-1 text-[11px]">Filter Role:</span>
              {['ALL', 'FIRM_ADMIN', 'MANAGER', 'TAX_PROFESSIONAL', 'ACCOUNTANT', 'EMPLOYEE'].map((r) => (
                <button
                  key={r}
                  onClick={() => setEmployeeRoleFilter(r)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                    employeeRoleFilter === r
                      ? 'bg-[#176B57] text-white shadow-xs'
                      : 'bg-[#F1F4F1] text-[#607274] hover:bg-[#E8F3EF] hover:text-[#176B57]'
                  }`}
                >
                  {r === 'ALL' ? 'All Roles' : r.replace(/_/g, ' ')}
                </button>
              ))}
            </div>

            {/* Employees Table */}
            <div className="overflow-x-auto rounded-lg border border-[#E1E7E2]">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAFBF9] border-b border-[#E1E7E2] text-[11px] font-bold text-[#607274] uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Employee Details</th>
                    <th className="py-3 px-4">Role & Department</th>
                    <th className="py-3 px-4">Login Username (Email)</th>
                    <th className="py-3 px-4">Mobile / Phone</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Credentials Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F4F1] bg-white">
                  {filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-xs text-[#607274]">
                        No employees found matching the filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map((emp: any) => {
                      const b = roleBadgeMap[emp.role] || { label: emp.role, bg: 'bg-gray-600', text: 'text-white' };
                      return (
                        <tr key={emp.id} className="hover:bg-[#FAFBF9] transition">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-[#E8F3EF] text-[#176B57] font-bold text-xs flex items-center justify-center shrink-0 border border-[#C2DDD4]">
                                {emp.fullName?.slice(0, 2).toUpperCase() || 'EM'}
                              </div>
                              <div>
                                <div className="font-bold text-[#202A33]">{emp.fullName}</div>
                                <div className="text-[11px] text-[#607274]">{emp.designation || 'Staff'}</div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="space-y-1">
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${b.bg} ${b.text}`}>
                                {b.label}
                              </span>
                              <div className="text-[11px] text-[#607274]">{emp.department || 'General Practice'}</div>
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#202A33]">
                              <Mail className="h-3.5 w-3.5 text-[#176B57] shrink-0" />
                              <span>{emp.email}</span>
                              <button
                                title="Copy Login Email"
                                onClick={() => handleCopy(emp.email, `email-${emp.id}`)}
                                className="text-[#607274] hover:text-[#176B57] transition p-0.5"
                              >
                                {copiedKey === `email-${emp.id}` ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </div>
                            <div className="text-[10px] text-[#607274] mt-0.5">Staff Portal: /login</div>
                          </td>

                          <td className="py-3 px-4 text-[#202A33]">
                            {emp.phone ? (
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3 text-[#607274]" />
                                <span>{emp.phone}</span>
                              </div>
                            ) : (
                              <span className="text-[#8C9B90]">-</span>
                            )}
                          </td>

                          <td className="py-3 px-4">
                            <button
                              onClick={() => handleToggleEmployeeStatus(emp.id, emp.isActive)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition ${
                                emp.isActive
                                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                              }`}
                              title={emp.isActive ? 'Click to deactivate' : 'Click to activate'}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${emp.isActive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                              {emp.isActive ? 'Active' : 'Inactive'}
                            </button>
                          </td>

                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => {
                                setSelectedEmployeeForReset(emp);
                                setNewPasswordValue('');
                                setResetModalError(null);
                                setResetModalSuccess(null);
                                setShowResetPasswordModal(true);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-[#E1E7E2] hover:border-[#176B57] hover:bg-[#E8F3EF] text-[#202A33] hover:text-[#176B57] font-semibold text-[11px] rounded-lg shadow-xs transition"
                            >
                              <Key className="h-3.5 w-3.5 text-[#176B57]" />
                              Reset Password
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* =========================================================================
          MODAL: ADD NEW EMPLOYEE WITH CREDENTIALS
      ========================================================================= */}
      {showAddEmployeeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-[#E1E7E2] my-8 animate-in fade-in duration-200">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-[#E1E7E2] pb-4 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-[#E8F3EF] text-[#176B57]">
                    <UserPlus className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-black text-[#202A33]">Add New Employee</h3>
                </div>
                <p className="text-xs text-[#607274] mt-1">
                  Create staff profile and assign login credentials for the practice portal
                </p>
              </div>
              <button
                onClick={() => setShowAddEmployeeModal(false)}
                className="text-[#607274] hover:text-[#202A33] p-1 rounded-lg hover:bg-[#F1F4F1] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {employeeModalSuccess ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
                  <div className="flex items-center gap-2 font-bold text-sm text-emerald-900 mb-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    Employee Created & Credentials Active!
                  </div>
                  <p className="text-xs text-emerald-700">
                    The employee can now log in directly at <span className="font-mono font-semibold">http://localhost:5173/login</span> using the credentials below:
                  </p>
                </div>

                {/* Credentials Card */}
                <div className="rounded-xl border border-[#E1E7E2] bg-[#FAFBF9] p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#607274] font-medium">Employee Name:</span>
                    <span className="font-bold text-[#202A33]">{employeeModalSuccess.fullName}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#607274] font-medium">System Role:</span>
                    <span className="font-bold text-[#176B57]">{employeeModalSuccess.role}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#607274] font-medium">Login Username / Email:</span>
                    <div className="flex items-center gap-1.5 font-mono font-bold text-[#202A33]">
                      <span>{employeeModalSuccess.email}</span>
                      <button
                        onClick={() => handleCopy(employeeModalSuccess.email, 'success-email')}
                        className="text-[#176B57] hover:text-[#135847] p-1"
                      >
                        {copiedKey === 'success-email' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#607274] font-medium">Login Password:</span>
                    <div className="flex items-center gap-1.5 font-mono font-bold text-rose-700">
                      <span>{employeeModalSuccess.password}</span>
                      <button
                        onClick={() => handleCopy(employeeModalSuccess.password, 'success-pwd')}
                        className="text-[#176B57] hover:text-[#135847] p-1"
                      >
                        {copiedKey === 'success-pwd' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => {
                      const msg = `Hi ${employeeModalSuccess.fullName},\nYour login credentials for Manasvi Associates portal:\nLogin URL: http://localhost:5173/login\nEmail / Username: ${employeeModalSuccess.email}\nPassword: ${employeeModalSuccess.password}`;
                      handleCopy(msg, 'all-creds');
                    }}
                    className="flex-1 py-2.5 bg-[#176B57] hover:bg-[#135847] text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center justify-center gap-1.5"
                  >
                    {copiedKey === 'all-creds' ? (
                      <>
                        <Check className="h-4 w-4" />
                        Credentials Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copy All Credentials
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      setEmployeeModalSuccess(null);
                      setEmployeeFormData({
                        fullName: '',
                        email: '',
                        password: '',
                        role: 'EMPLOYEE',
                        designation: 'Audit Assistant',
                        department: 'Audit & Assurance',
                        phone: '',
                      });
                    }}
                    className="py-2.5 px-4 bg-white border border-[#E1E7E2] hover:bg-[#F1F4F1] text-[#202A33] text-xs font-bold rounded-lg transition"
                  >
                    + Add Another
                  </button>

                  <button
                    onClick={() => setShowAddEmployeeModal(false)}
                    className="py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-[#202A33] text-xs font-bold rounded-lg transition"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAddEmployeeSubmit} className="space-y-4">
                {employeeModalError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                    <span>{employeeModalError}</span>
                  </div>
                )}

                {/* Full Name */}
                <div>
                  <label className="block text-xs font-bold text-[#202A33] mb-1">
                    Employee Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={employeeFormData.fullName}
                    onChange={(e) => setEmployeeFormData({ ...employeeFormData, fullName: e.target.value })}
                    placeholder="e.g. Suresh Verma"
                    className="w-full rounded-lg border border-[#E1E7E2] bg-white px-3 py-2 text-xs focus:outline-none focus:border-[#176B57]"
                  />
                </div>

                {/* Email / Username */}
                <div>
                  <label className="block text-xs font-bold text-[#202A33] mb-1">
                    Login Email / Username <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={employeeFormData.email}
                    onChange={(e) => setEmployeeFormData({ ...employeeFormData, email: e.target.value })}
                    placeholder="e.g. suresh@caflow.com"
                    className="w-full rounded-lg border border-[#E1E7E2] bg-white px-3 py-2 text-xs focus:outline-none focus:border-[#176B57]"
                  />
                  <p className="text-[10px] text-[#607274] mt-0.5">This will be used as their login username at /login</p>
                </div>

                {/* Password with Generator */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-[#202A33]">
                      Login Password <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={generateRandomPassword}
                      className="text-[11px] text-[#176B57] font-semibold hover:underline flex items-center gap-1"
                    >
                      <Sparkles className="h-3 w-3" />
                      Auto-Generate
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPasswordText ? 'text' : 'password'}
                      required
                      minLength={4}
                      value={employeeFormData.password}
                      onChange={(e) => setEmployeeFormData({ ...employeeFormData, password: e.target.value })}
                      placeholder="Enter minimum 4 characters"
                      className="w-full rounded-lg border border-[#E1E7E2] bg-white pl-3 pr-10 py-2 text-xs font-mono focus:outline-none focus:border-[#176B57]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswordText(!showPasswordText)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#607274] hover:text-[#202A33]"
                    >
                      {showPasswordText ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                {/* System Role */}
                <div>
                  <label className="block text-xs font-bold text-[#202A33] mb-1">
                    System Role <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={employeeFormData.role}
                    onChange={(e) => setEmployeeFormData({ ...employeeFormData, role: e.target.value })}
                    className="w-full rounded-lg border border-[#E1E7E2] bg-white px-3 py-2 text-xs focus:outline-none focus:border-[#176B57]"
                  >
                    <option value="EMPLOYEE">Audit Assistant (Staff - Default)</option>
                    <option value="TAX_PROFESSIONAL">CA / Tax Consultant (Tax Professional)</option>
                    <option value="ACCOUNTANT">Finance Controller / Accountant</option>
                    <option value="MANAGER">Senior Audit Manager</option>
                    <option value="FIRM_ADMIN">Practice Operations Admin</option>
                  </select>
                </div>

                {/* Designation (Universal CreatableSelect) */}
                <div>
                  <CreatableSelect
                    categoryKey="employee-designation"
                    label="Designation / Title"
                    value={employeeFormData.designation}
                    onChange={(val) => setEmployeeFormData({ ...employeeFormData, designation: val })}
                    options={[
                      'Audit Assistant',
                      'Senior Tax Consultant',
                      'Audit Manager',
                      'Finance Controller',
                      'Accounts Executive',
                      'Articleship Trainee',
                      'Associate Partner',
                    ]}
                  />
                </div>

                {/* Department (Universal CreatableSelect) */}
                <div>
                  <CreatableSelect
                    categoryKey="employee-department"
                    label="Department"
                    value={employeeFormData.department}
                    onChange={(val) => setEmployeeFormData({ ...employeeFormData, department: val })}
                    options={[
                      'Audit & Assurance',
                      'Direct Tax',
                      'Indirect Tax & GST',
                      'Corporate Law & Secretarial',
                      'Accounting & Bookkeeping',
                      'Practice Operations',
                    ]}
                  />
                </div>

                {/* Mobile / Phone */}
                <div>
                  <label className="block text-xs font-bold text-[#202A33] mb-1">
                    Mobile / Phone Number (Optional)
                  </label>
                  <input
                    type="tel"
                    value={employeeFormData.phone}
                    onChange={(e) => setEmployeeFormData({ ...employeeFormData, phone: e.target.value })}
                    placeholder="e.g. 9876543210"
                    className="w-full rounded-lg border border-[#E1E7E2] bg-white px-3 py-2 text-xs focus:outline-none focus:border-[#176B57]"
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E1E7E2]">
                  <button
                    type="button"
                    onClick={() => setShowAddEmployeeModal(false)}
                    className="px-4 py-2 rounded-lg border border-[#E1E7E2] text-xs font-bold text-[#607274] hover:bg-[#F1F4F1] transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={employeeSubmitting}
                    className="px-5 py-2 rounded-lg bg-[#176B57] hover:bg-[#135847] text-xs font-bold text-white shadow-sm transition disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {employeeSubmitting ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-3.5 w-3.5" />
                        Save & Create Credentials
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: RESET EMPLOYEE PASSWORD
      ========================================================================= */}
      {showResetPasswordModal && selectedEmployeeForReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-[#E1E7E2] animate-in fade-in duration-200">
            <div className="flex items-start justify-between border-b border-[#E1E7E2] pb-3 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-50 text-amber-700">
                    <Key className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-black text-[#202A33]">Reset Employee Password</h3>
                </div>
                <p className="text-xs text-[#607274] mt-1">
                  Assign a new password for <span className="font-bold text-[#202A33]">{selectedEmployeeForReset.fullName}</span> ({selectedEmployeeForReset.email})
                </p>
              </div>
              <button
                onClick={() => setShowResetPasswordModal(false)}
                className="text-[#607274] hover:text-[#202A33] p-1 rounded-lg hover:bg-[#F1F4F1] transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {resetModalSuccess ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>{resetModalSuccess}</span>
              </div>
            ) : (
              <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                {resetModalError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                    <span>{resetModalError}</span>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-[#202A33]">
                      New Login Password <span className="text-red-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={generateResetPassword}
                      className="text-[11px] text-[#176B57] font-semibold hover:underline flex items-center gap-1"
                    >
                      <Sparkles className="h-3 w-3" />
                      Auto-Generate
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showResetPasswordText ? 'text' : 'password'}
                      required
                      minLength={4}
                      value={newPasswordValue}
                      onChange={(e) => setNewPasswordValue(e.target.value)}
                      placeholder="Enter new password (min 4 chars)"
                      className="w-full rounded-lg border border-[#E1E7E2] bg-white pl-3 pr-10 py-2 text-xs font-mono focus:outline-none focus:border-[#176B57]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetPasswordText(!showResetPasswordText)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#607274] hover:text-[#202A33]"
                    >
                      {showResetPasswordText ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E1E7E2]">
                  <button
                    type="button"
                    onClick={() => setShowResetPasswordModal(false)}
                    className="px-4 py-2 rounded-lg border border-[#E1E7E2] text-xs font-bold text-[#607274] hover:bg-[#F1F4F1] transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={employeeSubmitting || !newPasswordValue.trim()}
                    className="px-5 py-2 rounded-lg bg-[#176B57] hover:bg-[#135847] text-xs font-bold text-white shadow-sm transition disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {employeeSubmitting ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      <>
                        <Key className="h-3.5 w-3.5" />
                        Update Password
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
