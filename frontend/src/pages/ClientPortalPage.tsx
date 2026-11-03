import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  FileText,
  Upload,
  CheckCircle2,
  Clock,
  IndianRupee,
  Building2,
  Lock,
  LogOut,
  User,
  Phone,
  Mail,
  AlertTriangle,
  Calendar,
  Layers,
  CreditCard,
  Briefcase,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  Sparkles,
  X,
  FileUp,
} from 'lucide-react';
import { api, removeAuthToken, getCurrentUser } from '../services/api';
import { CreatableSelect } from '../components/common/CreatableSelect';

export const ClientPortalPage: React.FC = () => {
  const navigate = useNavigate();

  const [portalData, setPortalData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'documents' | 'invoices' | 'payments' | 'support'>('overview');
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Document direct upload states
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [docCategory, setDocCategory] = useState('OTHER');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string>('');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadFileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!docTitle) {
        setDocTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
      const reader = new FileReader();
      reader.onload = () => {
        setFileBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDocumentUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docTitle.trim()) {
      setUploadError('Please specify a document name or title.');
      return;
    }
    if (!selectedFile && !fileBase64) {
      setUploadError('Please select a file to upload from your device.');
      return;
    }

    setUploadLoading(true);
    setUploadError(null);
    try {
      const res = await api.uploadClientPortalDocument({
        name: docTitle.trim(),
        category: docCategory || 'OTHER',
        fileUrl: fileBase64 || '/uploads/client_doc.pdf',
        fileSize: selectedFile?.size || 102400,
        fileType: selectedFile?.type || 'application/pdf',
      });

      if (res && res.success) {
        setUploadSuccess(`Document "${docTitle.trim()}" successfully uploaded to your account!`);
        setIsUploadModalOpen(false);
        setDocTitle('');
        setSelectedFile(null);
        setFileBase64('');
        fetchPortalData();
        setTimeout(() => setUploadSuccess(null), 5000);
      } else {
        throw new Error(res?.message || 'Failed to upload document');
      }
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed. Please try again.');
    } finally {
      setUploadLoading(false);
    }
  };

  // Load client-scoped data strictly through the authenticated portal endpoint
  const fetchPortalData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getClientPortalDashboard();
      if (res && res.success) {
        setPortalData(res.data);
      } else {
        throw new Error(res?.message || 'Failed to authenticate client session');
      }
    } catch (err: any) {
      console.error('Failed to load client portal dashboard:', err);
      setError(err.message || 'Unauthorized or expired session');
      if (err.message?.toLowerCase().includes('unauthorized') || err.message?.toLowerCase().includes('session')) {
        removeAuthToken();
        navigate('/portal/login');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPortalData();
  }, []);

  const handleLogout = async () => {
    try {
      await api.logoutClientPortal();
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      removeAuthToken();
      window.dispatchEvent(new Event('caflow_auth_changed'));
      navigate('/portal/login');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-full border-4 border-[#176B57] border-t-transparent animate-spin mb-3" />
        <p className="text-sm font-semibold text-slate-700">Loading your secure client portal...</p>
        <p className="text-xs text-slate-400 mt-1">Authenticating encrypted token</p>
      </div>
    );
  }

  if (error || !portalData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-slate-200">
          <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
          <p className="text-sm text-slate-600 mt-2">{error || 'Session expired or invalid credentials.'}</p>
          <button
            onClick={() => {
              removeAuthToken();
              navigate('/portal/login');
            }}
            className="mt-6 w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-[#176B57] hover:bg-[#135847] transition-all cursor-pointer shadow-md"
          >
            Return to Client Login
          </button>
        </div>
      </div>
    );
  }

  const { client, metrics, tasks, services, retainers, documents, documentRequests, invoices, payments, renewals, supportContact } = portalData;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-16">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Firm Brand */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#176B57] to-[#0F3D32] flex items-center justify-center text-white shadow-md">
                <ShieldCheck className="w-6 h-6 text-[#A0D4C5]" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-sm sm:text-base text-slate-900 tracking-tight">MANAVI ASSOCIATES</span>
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-sm bg-emerald-100 text-emerald-800">
                    Client Portal
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 hidden sm:block">Chartered Accountants & Legal Compliance</p>
              </div>
            </div>

            {/* Authenticated Client Identity & Logout */}
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-slate-800">{client.name}</p>
                <p className="text-[11px] text-slate-500 font-mono">
                  ID: {client.fileNo || client.id.slice(0, 8)} • +91 {client.mobile}
                </p>
              </div>

              <button
                onClick={handleLogout}
                title="Securely Logout"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors cursor-pointer border border-red-100"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Upload Success Alert */}
        {uploadSuccess && (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center justify-between shadow-xs animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span className="font-semibold">{uploadSuccess}</span>
            </div>
            <button
              onClick={() => setUploadSuccess(null)}
              className="text-emerald-600 hover:text-emerald-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Welcome Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#176B57] via-[#135847] to-[#0D3B30] p-6 sm:p-8 text-white shadow-lg">
          <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 backdrop-blur-md text-[11px] font-semibold text-[#A0D4C5] mb-2 border border-white/10">
                <Sparkles className="w-3.5 h-3.5" />
                Authenticated Client Dashboard
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
                Welcome back, {client.name}
              </h1>
              <p className="text-xs sm:text-sm text-[#D4EDE4] mt-1 max-w-2xl">
                Real-time compliance tracker, pending tasks, tax invoices, and verified documents managed by Manavi Associates.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setUploadError(null);
                    setIsUploadModalOpen(true);
                  }}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white text-[#176B57] hover:bg-emerald-50 text-xs font-bold shadow-md transition-all cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  + Upload Document
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('documents')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur-xs transition-colors cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-[#A0D4C5]" />
                  View Vault ({documents.length})
                </button>
              </div>
            </div>

            {/* Client Metadata Pills */}
            <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 bg-black/20 p-3.5 rounded-xl border border-white/10 text-xs backdrop-blur-xs min-w-[260px]">
              <div>
                <p className="text-[10px] text-[#A0D4C5] uppercase font-bold">Client ID</p>
                <p className="font-mono font-bold text-white">{client.fileNo || 'MA-CL-1001'}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#A0D4C5] uppercase font-bold">PAN</p>
                <p className="font-mono font-bold text-white">{client.pan || 'N/A'}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#A0D4C5] uppercase font-bold">GSTIN</p>
                <p className="font-mono font-bold text-white truncate max-w-[120px]" title={client.gstin || 'Not Registered'}>
                  {client.gstin || 'Not Registered'}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-[#A0D4C5] uppercase font-bold">Verified Phone</p>
                <p className="font-mono font-bold text-[#A0D4C5]">+91 {client.mobile}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Financial & Status Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Billed */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Billed</p>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 mt-1 font-mono">
                ₹{metrics.totalBilled.toLocaleString('en-IN')}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">{invoices.length} Invoices Issued</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <FileText className="w-6 h-6" />
            </div>
          </div>

          {/* Total Paid */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Paid</p>
              <h3 className="text-xl sm:text-2xl font-black text-emerald-600 mt-1 font-mono">
                ₹{metrics.totalPaid.toLocaleString('en-IN')}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">{payments.length} Receipts Recorded</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>

          {/* Pending Balance */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Balance</p>
              <h3 className={`text-xl sm:text-2xl font-black mt-1 font-mono ${metrics.pendingBalance > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
                ₹{metrics.pendingBalance.toLocaleString('en-IN')}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {metrics.pendingBalance > 0 ? 'Action Recommended' : 'All Dues Cleared'}
              </p>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${metrics.pendingBalance > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
              <IndianRupee className="w-6 h-6" />
            </div>
          </div>

          {/* Active Tasks */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Services / Tasks</p>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
                {metrics.pendingTasks}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">{metrics.completedTasks} Completed to date</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Briefcase className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-slate-200 bg-white rounded-xl shadow-xs px-2 flex items-center overflow-x-auto">
          {[
            { id: 'overview', label: 'Overview & Services', icon: Layers },
            { id: 'tasks', label: `Compliance & Tasks (${tasks.length})`, icon: Clock },
            { id: 'documents', label: `Documents & Vault (${documents.length})`, icon: FileText },
            { id: 'invoices', label: `Invoices (${invoices.length})`, icon: CreditCard },
            { id: 'payments', label: `Payment History (${payments.length})`, icon: CheckCircle2 },
            { id: 'support', label: 'Support & Advisory', icon: HelpCircle },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-3.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'border-[#176B57] text-[#176B57] bg-emerald-50/40'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#176B57]' : 'text-slate-400'}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* TAB CONTENT: Overview & Assigned Services */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Assigned Services & Retainers */}
            <div className="lg:col-span-2 space-y-6">
              {/* Retainers & Recurring Plans */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Active Retainer Agreements</h3>
                    <p className="text-xs text-slate-500">Recurring advisory and compliance services</p>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-emerald-100 text-emerald-800">
                    {retainers.length} Active
                  </span>
                </div>

                {retainers.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-100">
                    No active recurring retainers configured. Contact your partner to set up a monthly advisory retainer.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {retainers.map((ret: any) => (
                      <div key={ret.id} className="py-3 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-slate-800">{ret.service?.name || 'General CA Advisory'}</p>
                          <p className="text-[11px] text-slate-500">Billing: {ret.billingFrequency || 'MONTHLY'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-slate-900 font-mono">₹{ret.fee?.toLocaleString('en-IN')}</p>
                          <span className="text-[10px] text-emerald-600 font-semibold uppercase">Active</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Assigned Practice Services */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Assigned Services</h3>
                    <p className="text-xs text-slate-500">Statutory audits, GST filings, and company secretarial work</p>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-blue-100 text-blue-800">
                    {services.length} Services
                  </span>
                </div>

                {services.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-100">
                    No custom services explicitly mapped.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {services.map((srv: any) => (
                      <div key={srv.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#176B57]">
                            {srv.service?.category || 'COMPLIANCE'}
                          </span>
                          <h4 className="text-xs font-bold text-slate-900 mt-1">{srv.service?.name}</h4>
                        </div>
                        <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">Agreed Fee:</span>
                          <span className="font-bold text-slate-900 font-mono">
                            {srv.customFee ? `₹${srv.customFee.toLocaleString('en-IN')}` : 'As Per Milestone'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Col: Client Profile & Account Info */}
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <User className="w-4 h-4 text-[#176B57]" />
                    Business & Compliance Profile
                  </h3>
                  <button
                    onClick={() => {
                      setUploadError(null);
                      setIsUploadModalOpen(true);
                    }}
                    className="text-[11px] font-bold text-[#176B57] bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Upload className="w-3 h-3" />
                    + Upload File
                  </button>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Business Name</span>
                    <span className="font-bold text-slate-900 text-sm">{client.name}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Legal Entity</span>
                      <span className="font-semibold text-slate-700">{client.clientType || 'INDIVIDUAL'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Client / File ID</span>
                      <span className="font-mono font-semibold text-slate-800">{client.fileNo || 'MA-CL-1001'}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">PAN</span>
                      <span className="font-mono font-bold text-slate-900">{client.pan || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">TAN</span>
                      <span className="font-mono font-semibold text-slate-800">{client.tan || 'N/A'}</span>
                    </div>
                  </div>

                  <div className="pt-1 border-t border-slate-100">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">GSTIN</span>
                    <span className="font-mono font-bold text-[#176B57]">{client.gstin || 'Not Registered'}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Contact Person</span>
                      <span className="font-medium text-slate-800">{client.primaryContact || 'Designated Signatory'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Registered Mobile</span>
                      <span className="font-mono text-slate-900 font-bold">+91 {client.mobile}</span>
                    </div>
                  </div>

                  <div className="pt-1 border-t border-slate-100">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Registered Email</span>
                    <span className="text-slate-700">{client.email || 'N/A'}</span>
                  </div>

                  <div className="pt-1 border-t border-slate-100">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Banking Details</span>
                    <div className="mt-0.5 bg-slate-50 p-2 rounded-lg border border-slate-100 text-[11px] font-mono">
                      <p className="text-slate-700">A/C: <span className="font-bold text-slate-900">{client.bankAccountNo || 'Recorded in books'}</span></p>
                      <p className="text-slate-500">IFSC: <span className="font-semibold text-slate-800">{client.ifscCode || 'Verified'}</span></p>
                    </div>
                  </div>

                  <div className="pt-1 border-t border-slate-100">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Registered Address</span>
                    <span className="text-slate-700 block mt-0.5 leading-relaxed">{client.address || 'Address on record with Manavi Associates'}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Portal Authentication:</span>
                  </div>
                  <span className="font-bold text-emerald-600 uppercase bg-emerald-50 px-2 py-0.5 rounded-full">ACTIVE</span>
                </div>
              </div>

              {/* Renewals / DSC / Licenses */}
              {renewals.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
                  <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-purple-600" />
                    Statutory Renewals
                  </h3>
                  <div className="space-y-2.5">
                    {renewals.map((ren: any) => (
                      <div key={ren.id} className="p-3 bg-purple-50/50 rounded-xl border border-purple-100 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-purple-900">{ren.renewalType}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-200 text-purple-800 font-bold">
                            {ren.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-purple-700 mt-1">
                          Expiry: {new Date(ren.expiryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB CONTENT: Compliance & Tasks */}
        {activeTab === 'tasks' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-slate-900">Compliance & Milestone Tracker</h3>
                <p className="text-xs text-slate-500">Live operational tasks being handled by your designated team</p>
              </div>
            </div>

            {tasks.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No active tasks currently assigned to this client record.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {tasks.map((task: any) => (
                  <div key={task.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            task.status === 'COMPLETED'
                              ? 'bg-emerald-500'
                              : task.status === 'IN_PROGRESS'
                              ? 'bg-blue-500'
                              : 'bg-amber-500'
                          }`}
                        />
                        <h4 className="text-xs sm:text-sm font-bold text-slate-800">{task.title}</h4>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                        <span>Category: {task.service?.name || task.service?.category || 'Statutory Compliance'}</span>
                        <span>•</span>
                        <span>Due: {task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-IN') : 'Scheduled'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                        {task.priority || 'NORMAL'}
                      </span>
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                          task.status === 'COMPLETED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : task.status === 'IN_PROGRESS'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {task.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB CONTENT: Documents & Vault */}
        {activeTab === 'documents' && (
          <div className="space-y-6">
            {/* Document Requests from Firm */}
            {documentRequests.length > 0 && (
              <div className="bg-amber-50/60 rounded-2xl border border-amber-200 p-5">
                <h3 className="text-sm font-bold text-amber-900 mb-1 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  Documents Requested by Manavi Associates
                </h3>
                <p className="text-xs text-amber-700 mb-4">Please submit the following files to prevent filing delays.</p>

                <div className="space-y-3">
                  {documentRequests.map((req: any) => (
                    <div key={req.id} className="bg-white p-4 rounded-xl border border-amber-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">{req.title}</h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">{req.description || 'Mandatory compliance documentation'}</p>
                        <p className="text-[11px] text-amber-700 font-semibold mt-1">
                          Due Date: {new Date(req.dueDate).toLocaleDateString('en-IN')}
                        </p>
                      </div>
                      <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-100 text-amber-800 self-start sm:self-auto">
                        {req.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Document Vault */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Secure Document Vault</h3>
                  <p className="text-xs text-slate-500">Filed tax returns, audit reports, GST challans, and uploaded client documents</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setUploadError(null);
                    setIsUploadModalOpen(true);
                  }}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-white bg-[#176B57] hover:bg-[#135847] rounded-xl shadow-xs transition-all cursor-pointer self-start sm:self-auto"
                >
                  <Upload className="w-3.5 h-3.5" />
                  + Upload Document
                </button>
              </div>

              {documents.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No documents currently uploaded for this client account.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {documents.map((doc: any) => (
                    <div key={doc.id} className="py-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-emerald-50 text-[#176B57] flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs sm:text-sm font-bold text-slate-800">{doc.name}</p>
                          <p className="text-[11px] text-slate-400">
                            Category: {doc.category} • Uploaded:{' '}
                            {new Date(doc.createdAt).toLocaleDateString('en-IN')}
                          </p>
                        </div>
                      </div>

                      {doc.fileUrl && (
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#176B57] bg-emerald-50 hover:bg-emerald-100 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          View
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB CONTENT: Invoices */}
        {activeTab === 'invoices' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-slate-900">Tax Invoices & Billing</h3>
                <p className="text-xs text-slate-500">Official GST compliance invoices issued by Manavi Associates</p>
              </div>
            </div>

            {invoices.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No invoices recorded under this account.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {invoices.map((inv: any) => (
                  <div key={inv.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs sm:text-sm font-bold text-slate-900">{inv.invoiceNumber}</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            inv.paymentStatus === 'PAID'
                              ? 'bg-emerald-100 text-emerald-800'
                              : inv.paymentStatus === 'PARTIALLY_PAID'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {inv.paymentStatus}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Date: {new Date(inv.invoiceDate).toLocaleDateString('en-IN')} • Due: {new Date(inv.dueDate).toLocaleDateString('en-IN')}
                      </p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-6">
                      <div className="text-left sm:text-right">
                        <p className="text-xs sm:text-sm font-bold text-slate-900 font-mono">
                          ₹{inv.totalAmount?.toLocaleString('en-IN')}
                        </p>
                        {inv.balanceDue > 0 && (
                          <p className="text-[11px] font-semibold text-amber-600 font-mono">
                            Balance Due: ₹{inv.balanceDue?.toLocaleString('en-IN')}
                          </p>
                        )}
                      </div>

                      <button
                        onClick={() => setSelectedInvoice(inv)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        View Breakdown
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB CONTENT: Payment History */}
        {activeTab === 'payments' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-slate-900">Payment Receipts</h3>
                <p className="text-xs text-slate-500">Verified receipts recorded against bank transfers, UPI, or cheques</p>
              </div>
            </div>

            {payments.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No payment receipts on record yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {payments.map((pay: any) => (
                  <div key={pay.id} className="py-3.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs sm:text-sm font-bold text-slate-800">
                        Receipt: {pay.receiptNumber}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {pay.paymentMode} • Ref: {pay.referenceNumber || 'Direct Transfer'} •{' '}
                        {new Date(pay.paymentDate).toLocaleDateString('en-IN')}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs sm:text-sm font-bold text-emerald-600 font-mono">
                        +₹{pay.amount?.toLocaleString('en-IN')}
                      </p>
                      <span className="text-[10px] uppercase font-bold text-slate-400">Verified</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB CONTENT: Support & Advisory */}
        {activeTab === 'support' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
            <h3 className="text-base font-bold text-slate-900 mb-2">Firm Contact & Professional Support</h3>
            <p className="text-xs text-slate-500 mb-6">
              Reach your assigned Chartered Accountant and compliance team directly.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2 mb-2 text-[#176B57]">
                  <Phone className="w-4 h-4" />
                  <h4 className="text-xs font-bold text-slate-800">Managing Partner Direct Line</h4>
                </div>
                <p className="text-sm font-bold text-slate-900">{supportContact.managingPartner}</p>
                <p className="text-xs font-mono text-slate-600 mt-1">{supportContact.phone}</p>
                <p className="text-[11px] text-slate-400 mt-2">Available Mon - Sat, 10:00 AM - 7:00 PM</p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2 mb-2 text-[#176B57]">
                  <Mail className="w-4 h-4" />
                  <h4 className="text-xs font-bold text-slate-800">Official Correspondence</h4>
                </div>
                <p className="text-sm font-bold text-slate-900">{supportContact.firmName}</p>
                <p className="text-xs text-slate-600 mt-1">{supportContact.email}</p>
                <p className="text-[11px] text-slate-400 mt-2">Response guaranteed within 4 business hours</p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Invoice Breakdown Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                Invoice Breakdown: {selectedInvoice.invoiceNumber}
              </h3>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                {(selectedInvoice.lineItems || []).map((item: any) => (
                  <div key={item.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-slate-800">{item.description}</p>
                      <p className="text-[10px] text-slate-400">Qty: {item.quantity} × ₹{item.unitPrice}</p>
                    </div>
                    <span className="font-mono font-bold text-slate-900">₹{item.amount?.toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-slate-200 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Total Amount</span>
                  <span className="font-bold text-slate-900 font-mono">₹{selectedInvoice.totalAmount?.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-emerald-600">
                  <span>Amount Paid</span>
                  <span className="font-bold font-mono">₹{selectedInvoice.amountPaid?.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-amber-600 font-bold">
                  <span>Balance Due</span>
                  <span className="font-mono">₹{selectedInvoice.balanceDue?.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={() => setSelectedInvoice(null)}
                className="w-full py-2.5 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Document Modal with CreatableSelect Category & Native File Picker */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#176B57] flex items-center justify-center">
                  <FileUp className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Upload Document to Vault</h3>
                  <p className="text-[11px] text-slate-500">Directly submit records to Manavi Associates</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {uploadError && (
              <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            <form onSubmit={handleDocumentUploadSubmit} className="mt-4 space-y-4">
              {/* Native File Input Picker Box */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Choose File <span className="text-red-500">*</span>
                </label>
                <input
                  type="file"
                  ref={uploadFileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                  id="client-portal-doc-input"
                />
                <div
                  onClick={() => uploadFileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition ${
                    selectedFile
                      ? 'border-emerald-500 bg-emerald-50/30'
                      : 'border-slate-300 hover:border-[#176B57] bg-slate-50/60'
                  }`}
                >
                  {selectedFile ? (
                    <div className="space-y-1">
                      <FileText className="w-8 h-8 text-emerald-600 mx-auto" />
                      <p className="text-xs font-bold text-slate-800 truncate max-w-xs mx-auto">
                        {selectedFile.name}
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.type || 'Document'}
                      </p>
                      <span className="inline-block text-[10px] text-[#176B57] font-semibold mt-1 hover:underline">
                        Click to choose another file
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Upload className="w-8 h-8 text-slate-400 mx-auto" />
                      <p className="text-xs font-semibold text-slate-700">Click to browse your device files</p>
                      <p className="text-[10px] text-slate-400">PDF, JPG, PNG, DOCX, XLSX (Up to 25MB)</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Document Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Document Title / Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bank Statement Q3 2026 or Sale Deeds"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#176B57] focus:outline-none"
                />
              </div>

              {/* Document Category with CreatableSelect */}
              <div>
                <CreatableSelect
                  label="Document Category"
                  categoryKey="document-category"
                  value={docCategory}
                  onChange={setDocCategory}
                  options={[
                    { value: 'GST', label: 'GST Returns & Challans' },
                    { value: 'INCOME_TAX', label: 'Income Tax & Form 16/26AS' },
                    { value: 'BANKING', label: 'Bank Statements & Financials' },
                    { value: 'ROC', label: 'ROC / MCA Filings & Resolutions' },
                    { value: 'AUDIT', label: 'Audit Working Papers & Reports' },
                    { value: 'KYC', label: 'KYC & Identity Documents' },
                    { value: 'LEGAL', label: 'Agreements, Deeds & Contracts' },
                    { value: 'OTHER', label: 'General / Miscellaneous' },
                  ]}
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={uploadLoading}
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadLoading}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#176B57] hover:bg-[#135847] disabled:opacity-50 transition-all cursor-pointer shadow-md"
                >
                  {uploadLoading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      Submit & Save
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
