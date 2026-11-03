import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Search,
  Plus,
  Download,
  Upload,
  RefreshCw,
  Phone,
  MessageCircle,
  MoreVertical,
  X,
  FileText,
  Building,
  Mail,
  MapPin,
  Check,
} from 'lucide-react';
import { api } from '../services/api';
import { ClientDashboard } from '../components/clients/ClientDashboard';
import { ClientForm } from '../components/clients/ClientForm';

export const ClientsPage: React.FC = () => {
  const { id: routeId } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // View mode state: 'list' | 'dashboard' | 'new' | 'edit'
  const [viewMode, setViewMode] = useState<'list' | 'dashboard' | 'new' | 'edit'>('list');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [editingClient, setEditingClient] = useState<any | null>(null);

  const fetchClients = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (typeFilter !== 'ALL') params.type = typeFilter;
      if (statusFilter !== 'ALL') params.status = statusFilter;

      const res = await api.getClients(params);
      if (res.success) {
        setClients(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();

    const handleCreated = () => {
      fetchClients();
    };
    window.addEventListener('caflow:client-created', handleCreated);
    window.addEventListener('caflow:clients-updated', handleCreated);
    return () => {
      window.removeEventListener('caflow:client-created', handleCreated);
      window.removeEventListener('caflow:clients-updated', handleCreated);
    };
  }, [typeFilter, statusFilter]);

  // Synchronize route param with viewMode
  useEffect(() => {
    if (routeId) {
      if (routeId === 'new') {
        setViewMode('new');
        setSelectedClientId(null);
      } else {
        setSelectedClientId(routeId);
        setViewMode('dashboard');
      }
    } else if (searchParams.get('action') === 'new') {
      setViewMode('new');
      setSelectedClientId(null);
    } else {
      if (viewMode !== 'edit') {
        setViewMode('list');
        setSelectedClientId(null);
      }
    }
  }, [routeId, searchParams]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchClients();
  };

  const exportCSV = () => {
    const headers = ['Name', 'Client Type', 'File No', 'Primary Contact', 'Mobile', 'Email', 'PAN', 'GSTIN', 'Status'];
    const rows = clients.map((c) => [
      `"${c.name}"`,
      `"${c.clientType}"`,
      `"${c.fileNo || ''}"`,
      `"${c.primaryContact || ''}"`,
      `"${c.mobile || ''}"`,
      `"${c.email || ''}"`,
      `"${c.pan || ''}"`,
      `"${c.gstin || ''}"`,
      `"${c.status}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `CAFlow_Clients_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 1. RENDER NEW CLIENT FORM (Matching Screenshot 2)
  if (viewMode === 'new') {
    return (
      <ClientForm
        onBack={() => {
          setViewMode('list');
          navigate('/clients');
        }}
        onSuccess={(saved) => {
          fetchClients();
          setSelectedClientId(saved.id);
          setViewMode('dashboard');
          navigate(`/clients/${saved.id}`);
        }}
      />
    );
  }

  // 2. RENDER EDIT CLIENT FORM (Matching Screenshot 2 pre-filled)
  if (viewMode === 'edit' && editingClient) {
    return (
      <ClientForm
        client={editingClient}
        onBack={() => {
          setViewMode('dashboard');
        }}
        onSuccess={(saved) => {
          fetchClients();
          setSelectedClientId(saved.id);
          setViewMode('dashboard');
          navigate(`/clients/${saved.id}`);
        }}
      />
    );
  }

  // 3. RENDER CLIENT DASHBOARD (Matching Screenshot 1)
  if (viewMode === 'dashboard' && selectedClientId) {
    return (
      <ClientDashboard
        clientId={selectedClientId}
        onBack={() => {
          setSelectedClientId(null);
          setViewMode('list');
          navigate('/clients');
        }}
        onEdit={(clientData) => {
          setEditingClient(clientData);
          setViewMode('edit');
        }}
        onDeleted={() => {
          fetchClients();
          setSelectedClientId(null);
          setViewMode('list');
          navigate('/clients');
        }}
      />
    );
  }

  // 4. RENDER CLIENT ROSTER TABLE (Standard list view)
  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#202A33]">Clients</h1>
          <p className="text-xs text-[#607274]">Manage your client roster, registrations, and files</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => alert('Import CSV: Please choose a valid .csv file with columns [Name, Type, Mobile, PAN, GSTIN].')}
            className="flex items-center gap-1.5 rounded-lg border border-[#E1E7E2] bg-white px-3 py-1.5 text-xs font-semibold text-[#202A33] hover:bg-[#FAFBF9] transition"
          >
            <Upload className="h-3.5 w-3.5 text-[#607274]" />
            Import
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 rounded-lg border border-[#E1E7E2] bg-white px-3 py-1.5 text-xs font-semibold text-[#202A33] hover:bg-[#FAFBF9] transition"
          >
            <Download className="h-3.5 w-3.5 text-[#607274]" />
            Export
          </button>
          {/* + New Button: Opens Screenshot 2 Add Client Form */}
          <Link
            to="/clients/new"
            className="flex items-center gap-1.5 rounded-lg bg-[#2563EB] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#1D4ED8] transition cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            + New
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="caflow-card p-4">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Search Input (5 Cols) */}
          <div className="md:col-span-5 relative">
            <label className="block text-[10px] font-semibold text-[#8C9B90] uppercase mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#8C9B90]" />
              <input
                type="text"
                placeholder="Client, File No., Contact Person, Mobile, Email, PAN, GST"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] py-1.5 pl-9 pr-3 text-xs text-[#202A33] placeholder-[#8C9B90] focus:border-[#2563EB] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {/* Recurring Service (3 Cols) */}
          <div className="md:col-span-3">
            <label className="block text-[10px] font-semibold text-[#8C9B90] uppercase mb-1">Recurring Service</label>
            <select className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] py-1.5 px-3 text-xs text-[#202A33] focus:border-[#2563EB] focus:bg-white focus:outline-none">
              <option value="">Select...</option>
              <option value="GST">GST Monthly Return</option>
              <option value="TDS">TDS 24Q Quarterly</option>
              <option value="AUDIT">Statutory Audit</option>
            </select>
          </div>

          {/* Type Filter (3 Cols) */}
          <div className="md:col-span-3">
            <label className="block text-[10px] font-semibold text-[#8C9B90] uppercase mb-1">Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] py-1.5 px-3 text-xs text-[#202A33] focus:border-[#2563EB] focus:bg-white focus:outline-none"
            >
              <option value="ALL">Select...</option>
              <option value="PARTNERSHIP_FIRM">Partnership Firm</option>
              <option value="PRIVATE_LIMITED">Private Limited</option>
              <option value="SOLE_PROPRIETORSHIP">Sole Proprietorship</option>
              <option value="INDIVIDUAL">Individual</option>
              <option value="LLP">LLP</option>
            </select>
          </div>

          {/* Action Icons (1 Col) */}
          <div className="md:col-span-1 flex items-center justify-end gap-1.5 pt-4">
            <button
              type="button"
              onClick={fetchClients}
              className="p-1.5 rounded text-[#607274] hover:bg-[#F1F4F1] border border-[#E1E7E2]"
              title="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              type="submit"
              className="p-1.5 rounded bg-[#2563EB] text-white hover:bg-[#1D4ED8] shadow-xs"
              title="Filter"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
      </div>

      {/* Clients Data Table */}
      <div className="caflow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#E1E7E2] bg-[#FAFBF9] text-[#607274] font-semibold uppercase tracking-wider text-[10px]">
                <th className="p-3 w-10 text-center">
                  <input type="checkbox" className="rounded border-[#C4D1C7] text-[#2563EB]" />
                </th>
                <th className="p-3 w-12 text-center">Photo</th>
                <th className="p-3">File No</th>
                <th className="p-3">Name</th>
                <th className="p-3">Type</th>
                <th className="p-3">Mobile</th>
                <th className="p-3">Group</th>
                <th className="p-3">Tags</th>
                <th className="p-3">Status</th>
                <th className="p-3">Users</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F4F1]">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-[#607274]">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#2563EB] border-t-transparent" />
                      <span>Loading clients...</span>
                    </div>
                  </td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-[#607274]">
                    No clients found. Click "+ New" to add your first client.
                  </td>
                </tr>
              ) : (
                clients.map((c) => (
                  <tr key={c.id} className="hover:bg-[#FAFBF9] transition group">
                    <td className="p-3 text-center">
                      <input type="checkbox" className="rounded border-[#C4D1C7] text-[#2563EB]" />
                    </td>
                    <td className="p-3 text-center">
                      <div className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-[#EFF6FF] text-[#2563EB] font-bold text-[10px]">
                        {c.name.charAt(0)}
                      </div>
                    </td>
                    <td className="p-3 font-mono text-[11px] text-[#607274]">{c.fileNo || '-'}</td>
                    <td className="p-3">
                      {/* Clicking on client name opens Screenshot 1 Client Dashboard! */}
                      <Link
                        to={`/clients/${c.id}`}
                        className="font-bold text-[#2563EB] hover:underline text-left inline-block"
                      >
                        {c.name}
                      </Link>
                      {c.primaryContact && (
                        <div className="text-[10px] text-[#8C9B90]">{c.primaryContact}</div>
                      )}
                    </td>
                    <td className="p-3 text-[#4A5568]">
                      {c.clientType ? c.clientType.replace(/_/g, ' ') : '-'}
                    </td>
                    <td className="p-3">
                      {c.mobile ? (
                        <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#202A33]">
                          <span>{c.mobile}</span>
                          <a
                            href={`https://wa.me/91${c.mobile}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#16A34A] hover:text-[#15803D]"
                            title="Open WhatsApp"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                          </a>
                          <a
                            href={`tel:${c.mobile}`}
                            className="text-[#607274] hover:text-[#202A33]"
                            title="Call"
                          >
                            <Phone className="h-3 w-3" />
                          </a>
                        </div>
                      ) : (
                        <span className="text-[#C4D1C7]">-</span>
                      )}
                    </td>
                    <td className="p-3 text-[#607274]">
                      {c.clientGroup?.name || '-'}
                    </td>
                    <td className="p-3">
                      <span className="text-[10px] bg-[#F1F5F2] text-[#202A33] font-medium px-2 py-0.5 rounded">
                        {c.tags || 'Active Client'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="caflow-badge badge-completed">
                        {c.status}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex -space-x-1.5">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2563EB] text-white text-[9px] font-bold ring-1 ring-white">
                          K
                        </div>
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0284C7] text-white text-[9px] font-bold ring-1 ring-white">
                          N
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <Link
                        to={`/clients/${c.id}`}
                        className="p-1 rounded text-[#8C9B90] hover:text-[#202A33] hover:bg-[#F1F4F1] inline-block"
                        title="View Client Dashboard"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
