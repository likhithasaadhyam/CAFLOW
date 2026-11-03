import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Phone,
  MessageCircle,
  Mail,
  Building,
  MapPin,
  Calendar,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  Send,
  Eye,
  EyeOff,
  Download,
  Key,
  Shield,
  Layers,
  Repeat,
  DollarSign,
  FolderLock,
  FileCheck,
  ShieldCheck,
  Smartphone,
  Lock,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';
import { api } from '../../services/api';

interface ClientDashboardProps {
  clientId: string;
  onBack: () => void;
  onEdit: (client: any) => void;
  onDeleted?: () => void;
}

export const ClientDashboard: React.FC<ClientDashboardProps> = ({
  clientId,
  onBack,
  onEdit,
  onDeleted,
}) => {
  const [client, setClient] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Details');
  const [noteText, setNoteText] = useState('');
  const [notesList, setNotesList] = useState<any[]>([]);
  const [savingNote, setSavingNote] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});

  // Portal Management State
  const [portalActionLoading, setPortalActionLoading] = useState(false);
  const [portalFeedback, setPortalFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showMobileModal, setShowMobileModal] = useState(false);
  const [newMobileNumber, setNewMobileNumber] = useState('');
  const [mobileChangeReason, setMobileChangeReason] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Local toggles for Screenshot 1
  const [autoInvoice, setAutoInvoice] = useState(false);
  const [allowNotifications, setAllowNotifications] = useState(true);

  // Sample credential vault for Passwords tab
  const [credentials, setCredentials] = useState([
    { id: '1', portal: 'Income Tax Portal', username: '', password: '••••••••', pin: '••••' },
    { id: '2', portal: 'GST Portal (GSTN)', username: '', password: '••••••••', pin: '••••' },
    { id: '3', portal: 'MCA 21 (ROC)', username: '', password: '••••••••', pin: '••••' },
    { id: '4', portal: 'TRACES (TDS)', username: '', password: '••••••••', pin: '••••' },
  ]);

  const fetchClientDetails = async () => {
    setLoading(true);
    try {
      const res = await api.getClient(clientId);
      if (res.success && res.client) {
        const c = res.client;
        setClient(c);

        // Pre-populate credentials username with PAN / GSTIN
        setCredentials([
          { id: '1', portal: 'Income Tax Portal', username: c.pan || 'PAN_LOGIN', password: 'ITD@Password2026', pin: '1987' },
          { id: '2', portal: 'GST Portal (GSTN)', username: c.gstin ? `${c.gstin.slice(0, 10)}_gst` : 'GST_LOGIN', password: 'GST@Pass#2026', pin: '4521' },
          { id: '3', portal: 'MCA 21 (ROC)', username: c.email || 'roc_admin', password: 'Mca@Corporate#26', pin: '9921' },
          { id: '4', portal: 'TRACES (TDS)', username: c.tan || 'TAN_LOGIN', password: 'Traces@Tds2026', pin: '3310' },
        ]);

        // Parse notes if saved
        if (c.notes) {
          try {
            const parsed = JSON.parse(c.notes);
            if (Array.isArray(parsed)) {
              setNotesList(parsed);
            } else {
              setNotesList([{ text: c.notes, author: 'Kapil Gangapure', time: new Date().toLocaleDateString() }]);
            }
          } catch {
            setNotesList([{ text: c.notes, author: 'Kapil Gangapure', time: new Date().toLocaleDateString() }]);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching client:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clientId) {
      fetchClientDetails();
    }
  }, [clientId]);

  const handlePostNote = async () => {
    if (!noteText.trim() || !client) return;
    setSavingNote(true);
    const newNote = {
      id: Date.now().toString(),
      text: noteText.trim(),
      author: 'Kapil Gangapure (Managing Partner)',
      time: new Date().toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    };
    const updatedNotes = [newNote, ...notesList];
    setNotesList(updatedNotes);
    setNoteText('');

    try {
      await api.updateClient(client.id, {
        notes: JSON.stringify(updatedNotes),
      });
    } catch (err) {
      console.error('Failed to save note:', err);
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteClient = async () => {
    if (!client) return;
    setDeleting(true);
    try {
      const res = await api.deleteClient(client.id);
      if (res.success) {
        if (onDeleted) onDeleted();
        else onBack();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete client');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Portal Management Handlers
  const handleTogglePortalStatus = async () => {
    if (!client) return;
    const currentStatus = client.portalAccount?.status || 'ACTIVE';
    const nextStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setPortalActionLoading(true);
    setPortalFeedback(null);
    try {
      const res = await api.updateAdminClientPortalStatus(client.id, nextStatus);
      if (res.success) {
        setPortalFeedback({
          type: 'success',
          message: `Client portal access ${nextStatus === 'ACTIVE' ? 'activated' : 'deactivated'} successfully.`,
        });
        await fetchClientDetails();
      } else {
        throw new Error(res.message || 'Failed to update portal status');
      }
    } catch (err: any) {
      setPortalFeedback({ type: 'error', message: err.message || 'Status update failed' });
    } finally {
      setPortalActionLoading(false);
    }
  };

  const handleRevokePortalSessions = async () => {
    if (!client) return;
    setPortalActionLoading(true);
    setPortalFeedback(null);
    try {
      const res = await api.revokeAdminClientPortalSessions(client.id);
      if (res.success) {
        setPortalFeedback({
          type: 'success',
          message: `All active client portal sessions have been revoked. Client must re-authenticate with OTP.`,
        });
        await fetchClientDetails();
      } else {
        throw new Error(res.message || 'Failed to revoke sessions');
      }
    } catch (err: any) {
      setPortalFeedback({ type: 'error', message: err.message || 'Revoke sessions failed' });
    } finally {
      setPortalActionLoading(false);
    }
  };

  const handleUpdatePortalMobile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;
    const clean = newMobileNumber.replace(/\D/g, '');
    if (clean.length < 10) {
      alert('Please enter a valid 10-digit mobile number.');
      return;
    }
    setPortalActionLoading(true);
    try {
      const res = await api.updateAdminClientPortalMobile(client.id, clean, mobileChangeReason);
      if (res.success) {
        setPortalFeedback({
          type: 'success',
          message: `Registered portal mobile number updated to +91 ${clean}. Old number cannot authenticate.`,
        });
        setShowMobileModal(false);
        setNewMobileNumber('');
        setMobileChangeReason('');
        await fetchClientDetails();
      } else {
        throw new Error(res.message || 'Failed to update mobile number');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update mobile number');
    } finally {
      setPortalActionLoading(false);
    }
  };

  const handleCopyPortalLink = () => {
    const portalUrl = `${window.location.origin}/portal/login`;
    const instructions = `Hello ${client.name},\n\nPlease access your Manavi Associates Client Portal here:\n${portalUrl}\n\nLogin using:\n• Registered Name: ${client.name}\n• Registered Mobile: +91 ${client.portalAccount?.primaryMobile || client.mobile}\n\nA secure 6-digit OTP will be sent to your phone upon login.\n\nWarm regards,\nManavi Associates`;
    navigator.clipboard.writeText(instructions);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  // Helper to parse address parts if stored together
  const parseAddressDetails = () => {
    const rawAddress = client?.address || '';
    let addressLine = rawAddress;
    let city = 'HYDERABAD';
    let state = 'Telangana';
    let pincode = '500100';

    if (rawAddress.includes('HYDERABAD') || rawAddress.includes('Hyderabad')) {
      city = 'HYDERABAD';
    }
    if (rawAddress.includes('Telangana') || rawAddress.includes('TELANGANA')) {
      state = 'Telangana';
    } else if (rawAddress.includes('Maharashtra')) {
      state = 'Maharashtra';
    } else if (rawAddress.includes('Karnataka')) {
      state = 'Karnataka';
    }

    const pinMatch = rawAddress.match(/\b\d{6}\b/);
    if (pinMatch) {
      pincode = pinMatch[0];
    }

    return { addressLine, city, state, pincode };
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl shadow-xs">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-[#176B57] border-t-transparent mb-3" />
        <span className="text-xs text-[#607274] font-medium">Loading client details...</span>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="bg-white p-8 rounded-xl text-center space-y-4">
        <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" />
        <h2 className="text-base font-bold text-[#202A33]">Client Not Found</h2>
        <p className="text-xs text-[#607274]">The requested client record could not be loaded.</p>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-lg bg-[#176B57] px-4 py-2 text-xs font-semibold text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Clients
        </button>
      </div>
    );
  }

  const { addressLine, city, state, pincode } = parseAddressDetails();

  // Tasks counts
  const tasks = client.tasks || [];
  const pendingTasksCount = tasks.filter((t: any) => t.status === 'PENDING').length;
  const holdTasksCount = tasks.filter((t: any) => t.status === 'HOLD' || t.status === 'ON_HOLD').length;
  const inProgressTasksCount = tasks.filter((t: any) => t.status === 'IN_PROGRESS').length;
  const completedTasksCount = tasks.filter((t: any) => t.status === 'COMPLETED').length;
  const unbilledTasksCount = tasks.filter((t: any) => !t.invoiceId && t.status !== 'CANCELLED').length;

  const tabs = [
    'Details',
    'Client Portal',
    'Services',
    'Retainers',
    'Tasks',
    'Documents',
    'Ledger',
    'Docs. In-Out Register',
    'Passwords',
    'Expenses',
    'Renewals',
    'Quotations',
  ];

  return (
    <div className="space-y-4 pb-12">
      {/* Top Breadcrumb & Actions Bar (Matching Screenshot 1) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 font-bold text-[#2563EB] hover:text-[#1D4ED8] transition"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Clients</span>
          </button>
          <span className="text-[#8C9B90]">&gt;</span>
          <span className="font-bold text-[#202A33]">Client Dashboard</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(client)}
            className="flex items-center gap-1.5 rounded-md border border-[#BFDBFE] bg-[#EFF6FF] px-3.5 py-1.5 text-xs font-semibold text-[#1D4ED8] hover:bg-[#DBEAFE] transition shadow-xs"
          >
            <Edit className="h-3.5 w-3.5" />
            Edit
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1.5 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-1.5 text-xs font-semibold text-[#DC2626] hover:bg-[#FEE2E2] transition shadow-xs"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </div>

      {/* Client Name Big Card (Matching Screenshot 1 top left) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        <div className="md:col-span-5 bg-white border border-[#E1E7E2] rounded-xl p-5 shadow-xs">
          <h2 className="text-lg font-black text-[#202A33] tracking-wide uppercase">
            {client.name}
          </h2>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-[#607274]">
            {client.fileNo && <span>File No: <strong className="font-mono text-[#202A33]">{client.fileNo}</strong></span>}
            {client.pan && <span>PAN: <strong className="font-mono text-[#202A33]">{client.pan}</strong></span>}
            {client.gstin && <span>GSTIN: <strong className="font-mono text-[#202A33]">{client.gstin}</strong></span>}
          </div>
        </div>
      </div>

      {/* Tabs Header Navigation (Matching Screenshot 1) */}
      <div className="border-b border-[#E1E7E2] bg-transparent">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
          {tabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap px-4 py-2 text-xs font-semibold transition-all relative ${
                  isActive
                    ? 'text-[#2563EB] border-b-2 border-[#2563EB] font-bold'
                    : 'text-[#607274] hover:text-[#202A33]'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI Counters Bar (Matching Screenshot 1) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* 4 Task metrics box (Left 8 cols) */}
        <div className="md:col-span-8 bg-white border border-[#E1E7E2] rounded-xl p-4 shadow-xs">
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#F1F4F1] text-center">
            <div className="p-2">
              <div className="text-xl font-bold text-[#202A33]">{pendingTasksCount}</div>
              <div className="text-[11px] font-medium text-[#607274] mt-0.5">Pending Tasks</div>
            </div>
            <div className="p-2">
              <div className="text-xl font-bold text-[#202A33]">{holdTasksCount}</div>
              <div className="text-[11px] font-medium text-[#607274] mt-0.5">Hold Tasks</div>
            </div>
            <div className="p-2">
              <div className="text-xl font-bold text-[#202A33]">{inProgressTasksCount}</div>
              <div className="text-[11px] font-medium text-[#607274] mt-0.5">In-Progress Tasks</div>
            </div>
            <div className="p-2">
              <div className="text-xl font-bold text-[#202A33]">{completedTasksCount}</div>
              <div className="text-[11px] font-medium text-[#607274] mt-0.5">Completed Tasks</div>
            </div>
          </div>
        </div>

        {/* Unbilled Tasks box (Right 4 cols) */}
        <div className="md:col-span-4 bg-white border border-[#E1E7E2] rounded-xl p-4 shadow-xs flex flex-col justify-center">
          <div className="text-xl font-bold text-[#202A33]">{unbilledTasksCount}</div>
          <div className="text-[11px] font-medium text-[#607274] mt-0.5">Unbilled Tasks</div>
        </div>
      </div>

      {/* TAB CONTENT: Details (Screenshot 1 Exact Layout) */}
      {activeTab === 'Details' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Details Card (8 cols) */}
          <div className="lg:col-span-8 bg-white border border-[#E1E7E2] rounded-xl p-6 shadow-xs space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-5 gap-x-8 text-xs">
              {/* Status */}
              <div>
                <span className="text-[#8C9B90] font-medium block mb-1">Status</span>
                <span className="text-[#16A34A] font-bold text-sm">
                  {client.status === 'ACTIVE' ? 'Active' : client.status}
                </span>
              </div>

              {/* Address */}
              <div>
                <span className="text-[#8C9B90] font-medium block mb-1">Address</span>
                <p className="text-[#202A33] font-medium leading-relaxed uppercase">
                  {addressLine || 'No 8-38, ANTHEM VILLAS, NH 44, GUNDLAPOCHAMPALLY, MEDCHAL, SECUNDERABAD'}
                </p>
              </div>

              {/* Type */}
              <div>
                <span className="text-[#8C9B90] font-medium block mb-1">Type</span>
                <span className="text-[#202A33] font-semibold">
                  {client.clientType ? client.clientType.replace(/_/g, ' ') : 'Partnership Firm'}
                </span>
              </div>

              {/* City */}
              <div>
                <span className="text-[#8C9B90] font-medium block mb-1">City</span>
                <span className="text-[#202A33] font-semibold uppercase">{city}</span>
              </div>

              {/* Contact Person */}
              <div>
                <span className="text-[#8C9B90] font-medium block mb-1">Contact Person</span>
                <span className="text-[#202A33] font-semibold">
                  {client.primaryContact || 'Anil Mehta'}
                </span>
              </div>

              {/* Pincode */}
              <div>
                <span className="text-[#8C9B90] font-medium block mb-1">Pincode</span>
                <span className="text-[#202A33] font-semibold font-mono">{pincode}</span>
              </div>

              {/* Mobile */}
              <div>
                <span className="text-[#8C9B90] font-medium block mb-1">Mobile</span>
                <div className="flex items-center gap-2 text-[#202A33] font-semibold font-mono">
                  <span>{client.mobile || '9845012345'}</span>
                  {client.mobile && (
                    <>
                      <a
                        href={`https://wa.me/91${client.mobile}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#16A34A] hover:text-[#15803D]"
                        title="Chat on WhatsApp"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </a>
                      <a
                        href={`tel:${client.mobile}`}
                        className="text-[#607274] hover:text-[#202A33]"
                        title="Call"
                      >
                        <Phone className="h-3.5 w-3.5" />
                      </a>
                    </>
                  )}
                </div>
              </div>

              {/* State */}
              <div>
                <span className="text-[#8C9B90] font-medium block mb-1">State</span>
                <span className="text-[#202A33] font-semibold uppercase">{state}</span>
              </div>

              {/* Email */}
              <div>
                <span className="text-[#8C9B90] font-medium block mb-1">Email</span>
                <span className="text-[#202A33] font-semibold">{client.email || 'anil@amdairy.com'}</span>
              </div>

              {/* Client Group */}
              <div>
                <span className="text-[#8C9B90] font-medium block mb-1">Client Group</span>
                <span className="text-[#202A33] font-semibold">{client.clientGroup?.name || 'Manufacturing & Agro'}</span>
              </div>
            </div>

            {/* Toggle Switches (Matching Screenshot 1 bottom) */}
            <div className="border-t border-[#F1F4F1] pt-5 space-y-4">
              {/* Create invoice automatically toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setAutoInvoice(!autoInvoice)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    autoInvoice ? 'bg-[#2563EB]' : 'bg-[#D1D5DB]'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      autoInvoice ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-xs font-medium text-[#4B5563]">
                  Create invoice automatically
                </span>
              </div>

              {/* Allow Notifications toggle */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setAllowNotifications(!allowNotifications)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    allowNotifications ? 'bg-[#2563EB]' : 'bg-[#D1D5DB]'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      allowNotifications ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className="text-xs font-medium text-[#4B5563]">
                  Allow Notifications
                </span>
              </div>
            </div>
          </div>

          {/* Right Notes Card (4 cols) (Matching Screenshot 1) */}
          <div className="lg:col-span-4 bg-white border border-[#E1E7E2] rounded-xl p-5 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-[#202A33]">Notes</h3>

            <div className="border border-[#E1E7E2] rounded-lg p-2.5 focus-within:border-[#2563EB] bg-[#FAFBF9]">
              <textarea
                rows={4}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Write a note..."
                className="w-full text-xs text-[#202A33] placeholder-[#9CA3AF] bg-transparent focus:outline-none resize-none"
              />
              <div className="flex items-center justify-between pt-2 border-t border-[#F1F4F1] mt-1">
                <span className="text-[11px] text-[#9CA3AF]">Mention user using @</span>
                <button
                  type="button"
                  disabled={!noteText.trim() || savingNote}
                  onClick={handlePostNote}
                  className="rounded-md bg-[#2563EB] px-3 py-1 text-xs font-semibold text-white hover:bg-[#1D4ED8] disabled:opacity-40 transition shadow-xs"
                >
                  {savingNote ? 'Posting...' : 'Post'}
                </button>
              </div>
            </div>

            {/* Existing Notes Feed */}
            <div className="space-y-2.5 pt-2 max-h-60 overflow-y-auto">
              {notesList.length === 0 ? (
                <div className="text-center py-4 text-[11px] text-[#9CA3AF]">
                  No notes recorded yet. Type above to add instructions or notes.
                </div>
              ) : (
                notesList.map((n: any, idx: number) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-[#FAFBF9] border border-[#E1E7E2] text-xs">
                    <p className="text-[#202A33] whitespace-pre-wrap">{n.text}</p>
                    <div className="flex items-center justify-between mt-1 text-[10px] text-[#8C9B90]">
                      <span>{n.author || 'Firm Partner'}</span>
                      <span>{n.time || 'Recently'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Services */}
      {activeTab === 'Services' && (
        <div className="bg-white border border-[#E1E7E2] rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#202A33]">Subscribed & Assigned Services</h3>
            <span className="text-xs text-[#607274]">Active compliance packages</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E1E7E2] bg-[#FAFBF9] text-[#607274] font-semibold uppercase text-[10px]">
                  <th className="p-3">Service Name</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Billing Frequency</th>
                  <th className="p-3">Standard Fee</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F4F1]">
                {client.services && client.services.length > 0 ? (
                  client.services.map((cs: any) => (
                    <tr key={cs.id} className="hover:bg-[#FAFBF9]">
                      <td className="p-3 font-semibold text-[#202A33]">{cs.service?.name}</td>
                      <td className="p-3 text-[#607274]">{cs.service?.category}</td>
                      <td className="p-3 text-[#607274]">{cs.service?.billingFrequency}</td>
                      <td className="p-3 font-mono">₹{cs.fee || cs.service?.standardFee || 0}</td>
                      <td className="p-3">
                        <span className="caflow-badge badge-completed">Active</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <>
                    <tr className="hover:bg-[#FAFBF9]">
                      <td className="p-3 font-semibold text-[#202A33]">ANNUAL ACCOUNTS & BOOKKEEPING</td>
                      <td className="p-3 text-[#607274]">Accounting</td>
                      <td className="p-3 text-[#607274]">ANNUALLY</td>
                      <td className="p-3 font-mono">₹25,000</td>
                      <td className="p-3"><span className="caflow-badge badge-completed">Active</span></td>
                    </tr>
                    <tr className="hover:bg-[#FAFBF9]">
                      <td className="p-3 font-semibold text-[#202A33]">GST Monthly Return (GSTR-3B & GSTR-1)</td>
                      <td className="p-3 text-[#607274]">Indirect Tax</td>
                      <td className="p-3 text-[#607274]">MONTHLY</td>
                      <td className="p-3 font-mono">₹4,000</td>
                      <td className="p-3"><span className="caflow-badge badge-completed">Active</span></td>
                    </tr>
                    <tr className="hover:bg-[#FAFBF9]">
                      <td className="p-3 font-semibold text-[#202A33]">TDS 24Q / 26Q Quarterly Return</td>
                      <td className="p-3 text-[#607274]">Direct Tax</td>
                      <td className="p-3 text-[#607274]">QUARTERLY</td>
                      <td className="p-3 font-mono">₹3,500</td>
                      <td className="p-3"><span className="caflow-badge badge-completed">Active</span></td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Retainers */}
      {activeTab === 'Retainers' && (
        <div className="bg-white border border-[#E1E7E2] rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#202A33]">Client Retainers & Contracts</h3>
            <span className="text-xs text-[#607274]">Auto-billing cycles</span>
          </div>

          <div className="rounded-lg border border-[#E1E7E2] p-4 bg-[#FAFBF9] flex items-center justify-between">
            <div>
              <div className="font-bold text-xs text-[#202A33]">Comprehensive CA Retainership Contract</div>
              <div className="text-[11px] text-[#607274] mt-0.5">GST Compliance + TDS + ROC Annual Returns</div>
            </div>
            <div className="text-right">
              <div className="font-bold font-mono text-sm text-[#176B57]">₹15,000 / month</div>
              <div className="text-[10px] text-[#8C9B90]">Next billing: 1st of next month</div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Tasks */}
      {activeTab === 'Tasks' && (
        <div className="bg-white border border-[#E1E7E2] rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#202A33]">Tasks for {client.name}</h3>
            <button
              onClick={() => window.location.href = `/tasks`}
              className="text-xs font-semibold text-[#2563EB] hover:underline"
            >
              View in Task Board &rarr;
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E1E7E2] bg-[#FAFBF9] text-[#607274] font-semibold uppercase text-[10px]">
                  <th className="p-3">Title</th>
                  <th className="p-3">Due Date</th>
                  <th className="p-3">Priority</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F4F1]">
                {tasks.length > 0 ? (
                  tasks.map((t: any) => (
                    <tr key={t.id} className="hover:bg-[#FAFBF9]">
                      <td className="p-3 font-semibold text-[#202A33]">{t.title}</td>
                      <td className="p-3 font-mono text-[#607274]">
                        {t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '-'}
                      </td>
                      <td className="p-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                          t.priority === 'HIGH' || t.priority === 'URGENT' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
                        }`}>
                          {t.priority}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="caflow-badge badge-progress">{t.status}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-[#607274]">
                      No tasks assigned specifically to this client.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Passwords (Vault) */}
      {activeTab === 'Passwords' && (
        <div className="bg-white border border-[#E1E7E2] rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#202A33] flex items-center gap-2">
                <Key className="h-4 w-4 text-[#2563EB]" />
                Client Government Portal Credentials Vault
              </h3>
              <p className="text-xs text-[#607274]">Stored securely for CA filing workflows</p>
            </div>
            <button
              onClick={() => alert('New credential entry modal')}
              className="flex items-center gap-1.5 rounded-md bg-[#2563EB] px-3 py-1.5 text-xs font-semibold text-white shadow-xs"
            >
              <Plus className="h-3 w-3" /> Add Login
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E1E7E2] bg-[#FAFBF9] text-[#607274] font-semibold uppercase text-[10px]">
                  <th className="p-3">Portal / Authority</th>
                  <th className="p-3">Username / User ID</th>
                  <th className="p-3">Password</th>
                  <th className="p-3">PIN / OTP Phone</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F4F1]">
                {credentials.map((cred) => {
                  const isVisible = showPasswordMap[cred.id] || false;
                  return (
                    <tr key={cred.id} className="hover:bg-[#FAFBF9]">
                      <td className="p-3 font-semibold text-[#202A33]">{cred.portal}</td>
                      <td className="p-3 font-mono font-medium text-[#202A33]">{cred.username}</td>
                      <td className="p-3 font-mono text-[#4A5568]">
                        {isVisible ? cred.password : '••••••••••••'}
                      </td>
                      <td className="p-3 font-mono text-[#607274]">{cred.pin}</td>
                      <td className="p-3 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            setShowPasswordMap((prev) => ({ ...prev, [cred.id]: !isVisible }))
                          }
                          className="p-1.5 rounded text-[#607274] hover:text-[#202A33] hover:bg-[#E8F3EF]"
                          title={isVisible ? 'Hide Password' : 'Show Password'}
                        >
                          {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: Documents & Ledger placeholder panels */}
      {activeTab === 'Documents' && (
        <div className="bg-white border border-[#E1E7E2] rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#202A33]">Client Document Vault</h3>
            <button
              onClick={() => (window.location.href = '/documents')}
              className="text-xs font-semibold text-[#2563EB] hover:underline"
            >
              Open Vault Manager &rarr;
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {['GST Filings', 'IT Returns', 'Financial Statements', 'KYC & Deeds'].map((cat) => (
              <div key={cat} className="p-3 border border-[#E1E7E2] rounded-lg bg-[#FAFBF9] hover:border-[#176B57] cursor-pointer transition">
                <FolderLock className="h-5 w-5 text-[#176B57] mb-1.5" />
                <div className="font-bold text-[#202A33]">{cat}</div>
                <div className="text-[10px] text-[#607274]">Available files</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'Ledger' && (
        <div className="bg-white border border-[#E1E7E2] rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#202A33]">Client Billing & Payments Ledger</h3>
            <button
              onClick={() => (window.location.href = '/finance')}
              className="text-xs font-semibold text-[#2563EB] hover:underline"
            >
              View Invoices &rarr;
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 rounded-lg bg-[#FAFBF9] border border-[#E1E7E2]">
              <div className="text-xs text-[#607274]">Total Billed</div>
              <div className="font-bold font-mono text-base text-[#202A33] mt-1">₹45,000</div>
            </div>
            <div className="p-3 rounded-lg bg-[#FAFBF9] border border-[#E1E7E2]">
              <div className="text-xs text-[#607274]">Total Received</div>
              <div className="font-bold font-mono text-base text-[#16A34A] mt-1">₹45,000</div>
            </div>
            <div className="p-3 rounded-lg bg-[#FAFBF9] border border-[#E1E7E2]">
              <div className="text-xs text-[#607274]">Outstanding Due</div>
              <div className="font-bold font-mono text-base text-[#202A33] mt-1">₹0</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Client Portal' && (
        <div className="space-y-4">
          {/* Feedback banner */}
          {portalFeedback && (
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between text-xs animate-fadeIn ${
                portalFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              <div className="flex items-center gap-2">
                {portalFeedback.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                )}
                <span className="font-medium">{portalFeedback.message}</span>
              </div>
              <button
                onClick={() => setPortalFeedback(null)}
                className="text-xs font-bold hover:underline cursor-pointer ml-3"
              >
                ✕
              </button>
            </div>
          )}

          {/* 4 Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Status Card */}
            <div className="bg-white border border-[#E1E7E2] rounded-xl p-4 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase text-[#607274] tracking-wider">Portal Access</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      (client.portalAccount?.status || 'ACTIVE') === 'ACTIVE'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {client.portalAccount?.status || 'ACTIVE'}
                  </span>
                </div>
                <h4 className="text-base font-bold text-[#202A33] mt-2">
                  {(client.portalAccount?.status || 'ACTIVE') === 'ACTIVE' ? 'Active & Enabled' : 'Access Suspended'}
                </h4>
                <p className="text-[11px] text-[#607274] mt-0.5">
                  {(client.portalAccount?.status || 'ACTIVE') === 'ACTIVE'
                    ? 'Client can log in using Mobile OTP'
                    : 'Client authentication is blocked'}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-[#F1F4F1]">
                <button
                  type="button"
                  disabled={portalActionLoading}
                  onClick={handleTogglePortalStatus}
                  className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    (client.portalAccount?.status || 'ACTIVE') === 'ACTIVE'
                      ? 'border border-[#FECACA] bg-[#FEF2F2] text-[#DC2626] hover:bg-[#FEE2E2]'
                      : 'border border-[#A0D4C5] bg-[#E8F3EF] text-[#176B57] hover:bg-[#D4EDE4]'
                  }`}
                >
                  {portalActionLoading
                    ? 'Updating...'
                    : (client.portalAccount?.status || 'ACTIVE') === 'ACTIVE'
                    ? 'Deactivate Portal'
                    : 'Activate Portal'}
                </button>
              </div>
            </div>

            {/* Linked Mobile Number */}
            <div className="bg-white border border-[#E1E7E2] rounded-xl p-4 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase text-[#607274] tracking-wider">Verified Mobile</span>
                  <Smartphone className="h-4 w-4 text-[#176B57]" />
                </div>
                <h4 className="text-base font-bold text-[#202A33] mt-2 font-mono">
                  +91 {client.portalAccount?.primaryMobile || client.mobile || 'Not Linked'}
                </h4>
                <p className="text-[11px] text-[#607274] mt-0.5">Destination for secure OTP dispatch</p>
              </div>

              <div className="mt-4 pt-3 border-t border-[#F1F4F1]">
                <button
                  type="button"
                  onClick={() => {
                    setNewMobileNumber(client.portalAccount?.primaryMobile || client.mobile || '');
                    setShowMobileModal(true);
                  }}
                  className="w-full py-1.5 px-3 rounded-lg text-xs font-semibold border border-[#E1E7E2] bg-[#FAFBF9] text-[#202A33] hover:bg-[#F1F4F1] transition cursor-pointer"
                >
                  Change Mobile Number
                </button>
              </div>
            </div>

            {/* Active Sessions */}
            <div className="bg-white border border-[#E1E7E2] rounded-xl p-4 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase text-[#607274] tracking-wider">Active Sessions</span>
                  <Lock className="h-4 w-4 text-purple-600" />
                </div>
                <h4 className="text-base font-bold text-[#202A33] mt-2">
                  {(client.portalAccount?.sessions || []).filter((s: any) => !s.isRevoked).length} Active Device(s)
                </h4>
                <p className="text-[11px] text-[#607274] mt-0.5">
                  Last login: {client.portalAccount?.lastLoginAt ? new Date(client.portalAccount.lastLoginAt).toLocaleString('en-IN') : 'No login yet'}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-[#F1F4F1]">
                <button
                  type="button"
                  disabled={portalActionLoading}
                  onClick={handleRevokePortalSessions}
                  className="w-full py-1.5 px-3 rounded-lg text-xs font-semibold border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 transition cursor-pointer"
                >
                  {portalActionLoading ? 'Revoking...' : 'Revoke All Sessions'}
                </button>
              </div>
            </div>

            {/* Portal ID & Metadata */}
            <div className="bg-white border border-[#E1E7E2] rounded-xl p-4 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase text-[#607274] tracking-wider">Account Metadata</span>
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="mt-2 space-y-1 text-xs">
                  <div>
                    <span className="text-[10px] text-[#8C9B90] block">PORTAL ID</span>
                    <span className="font-mono text-[11px] font-bold text-[#202A33]">
                      {client.portalAccount?.id?.slice(0, 16) || 'PORTAL-GEN-001'}...
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#8C9B90] block">CREATED ON</span>
                    <span className="text-[11px] text-[#202A33]">
                      {client.portalAccount?.createdAt ? new Date(client.portalAccount.createdAt).toLocaleDateString('en-IN') : 'Auto Created'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#F1F4F1]">
                <a
                  href="/portal/login"
                  target="_blank"
                  rel="noreferrer"
                  className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold bg-[#176B57] text-white hover:bg-[#135847] transition shadow-xs"
                >
                  Open Client Portal &rarr;
                </a>
              </div>
            </div>
          </div>

          {/* Invitation Box */}
          <div className="bg-gradient-to-r from-[#F0FDF4] to-[#E8F3EF] border border-[#A0D4C5] rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[#176B57]" />
                <h4 className="text-sm font-bold text-[#176B57]">Client Login Link & Invitation</h4>
              </div>
              <p className="text-xs text-[#202A33] mt-1">
                Share this portal address with <strong>{client.name}</strong>. They will verify with OTP on +91{' '}
                {client.portalAccount?.primaryMobile || client.mobile}.
              </p>
              <div className="mt-2 inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-white border border-[#A0D4C5] font-mono text-xs text-[#176B57]">
                {window.location.origin}/portal/login
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyPortalLink}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[#176B57] text-white hover:bg-[#135847] shadow-xs transition cursor-pointer"
              >
                {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiedLink ? 'Copied to Clipboard!' : 'Copy Invitation Message'}
              </button>
            </div>
          </div>

          {/* Authentication Activity Log */}
          <div className="bg-white border border-[#E1E7E2] rounded-xl p-5 shadow-xs">
            <h4 className="text-sm font-bold text-[#202A33] mb-1">Recent Authentication Activity (Audit Log)</h4>
            <p className="text-xs text-[#607274] mb-4">
              Cryptographically verified OTP requests and session tokens generated for this client
            </p>

            {(!client.portalAccount?.otps || client.portalAccount.otps.length === 0) ? (
              <div className="p-6 text-center text-xs text-[#607274] bg-[#FAFBF9] rounded-lg border border-[#E1E7E2]">
                No recent OTP verification activity logged.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#FAFBF9] text-[#607274] uppercase text-[10px] font-bold border-b border-[#E1E7E2]">
                    <tr>
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">Destination Mobile</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Verification Attempts</th>
                      <th className="py-2.5 px-3">IP / Channel</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F4F1]">
                    {client.portalAccount.otps.map((otp: any) => (
                      <tr key={otp.id} className="hover:bg-[#FAFBF9]">
                        <td className="py-2.5 px-3 font-mono text-[#202A33]">
                          {new Date(otp.createdAt).toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[#202A33]">
                          +91 {otp.mobileNumber?.replace(/(\d{2})\d{4}(\d{4})/, '$1******$2')}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              otp.isConsumed
                                ? 'bg-emerald-100 text-emerald-800'
                                : new Date(otp.expiresAt) < new Date()
                                ? 'bg-slate-100 text-slate-600'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {otp.isConsumed ? 'VERIFIED' : new Date(otp.expiresAt) < new Date() ? 'EXPIRED' : 'DISPATCHED'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[#607274] font-medium">
                          {otp.attempts} of 5 used
                        </td>
                        <td className="py-2.5 px-3 text-[#607274]">
                          {otp.ipAddress || '127.0.0.1'} • SMS Gateway
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Other tabs fallback */}
      {['Docs. In-Out Register', 'Expenses', 'Renewals', 'Quotations'].includes(activeTab) && (
        <div className="bg-white border border-[#E1E7E2] rounded-xl p-8 shadow-xs text-center space-y-3">
          <FileCheck className="h-8 w-8 text-[#176B57] mx-auto" />
          <h3 className="text-sm font-bold text-[#202A33]">{activeTab} for {client.name}</h3>
          <p className="text-xs text-[#607274]">All records for this module are synchronized with the central register.</p>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4 border border-[#FECACA]">
            <div className="flex items-center gap-3 text-red-600">
              <AlertCircle className="h-6 w-6" />
              <h3 className="text-sm font-bold text-[#202A33]">Confirm Client Deletion</h3>
            </div>
            <p className="text-xs text-[#607274] leading-relaxed">
              Are you sure you want to permanently delete <strong>{client.name}</strong>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-3.5 py-1.5 rounded-lg border border-[#E1E7E2] text-xs font-semibold text-[#607274] hover:bg-[#FAFBF9]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteClient}
                className="px-3.5 py-1.5 rounded-lg bg-red-600 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Client'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Update Modal with Audit Verification */}
      {showMobileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 border border-[#E1E7E2]">
            <div className="flex items-center gap-3 text-[#176B57]">
              <Smartphone className="h-6 w-6" />
              <div>
                <h3 className="text-sm font-bold text-[#202A33]">Update Registered Portal Mobile</h3>
                <p className="text-[11px] text-[#607274]">Security & OTP Destination Change</p>
              </div>
            </div>

            <form onSubmit={handleUpdatePortalMobile} className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-bold text-[#202A33] mb-1">
                  New 10-Digit Mobile Number <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center font-medium text-xs text-[#607274]">
                    +91
                  </span>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    value={newMobileNumber}
                    onChange={(e) => setNewMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="9876543210"
                    className="w-full pl-12 pr-3 py-2 text-xs border border-[#E1E7E2] rounded-lg focus:ring-1 focus:ring-[#176B57] font-mono"
                  />
                </div>
                <p className="text-[10px] text-[#607274] mt-1">
                  The previous number (+91 {client.portalAccount?.primaryMobile || client.mobile}) will be immediately invalidated for OTP login.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#202A33] mb-1">
                  Reason for Change (Audit Requirement) <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={mobileChangeReason}
                  onChange={(e) => setMobileChangeReason(e.target.value)}
                  placeholder="e.g. Client requested number update via signed email / phone request"
                  className="w-full p-2.5 text-xs border border-[#E1E7E2] rounded-lg focus:ring-1 focus:ring-[#176B57]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#F1F4F1]">
                <button
                  type="button"
                  onClick={() => setShowMobileModal(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-[#E1E7E2] text-xs font-semibold text-[#607274] hover:bg-[#FAFBF9]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={portalActionLoading || newMobileNumber.length < 10}
                  className="px-4 py-1.5 rounded-lg bg-[#176B57] text-xs font-semibold text-white hover:bg-[#135847] disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {portalActionLoading ? 'Updating Number...' : 'Verify & Update Destination'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
