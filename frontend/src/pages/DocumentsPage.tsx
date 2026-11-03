import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FolderLock,
  Plus,
  RefreshCw,
  Search,
  CheckCircle,
  FileText,
  Download,
  Upload,
  Clock,
  ArrowRightLeft,
  X,
  FileCheck,
  FolderOpen,
  Building2,
  AlertCircle,
  Filter,
  Eye,
} from 'lucide-react';
import { api } from '../services/api';

export const DocumentsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const validTabs: Array<'in-out' | 'vault' | 'requests'> = ['in-out', 'vault', 'requests'];
  const tab: 'in-out' | 'vault' | 'requests' = validTabs.includes(urlTab as any)
    ? (urlTab as 'in-out' | 'vault' | 'requests')
    : 'in-out';

  const [inOutRecords, setInOutRecords] = useState<any[]>([]);
  const [vaultDocs, setVaultDocs] = useState<any[]>([]);
  const [docRequests, setDocRequests] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters for In-Out Register
  const [inOutCategory, setInOutCategory] = useState('ALL');
  const [inOutSearch, setInOutSearch] = useState('');

  // Filters for Client Document Vault
  const [vaultCategory, setVaultCategory] = useState('ALL');
  const [vaultClientId, setVaultClientId] = useState('ALL');
  const [vaultSearch, setVaultSearch] = useState('');

  // Modals
  const [showInOutModal, setShowInOutModal] = useState(false);
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);

  // In-Out Form
  const [inOutForm, setInOutForm] = useState({
    clientId: '',
    docType: 'Physical USB DSC Token',
    category: 'RECEIVED',
    isReturnable: true,
    physicalLocation: 'Locker 3 - Key Box A',
    receiverName: '',
    expectedReturnDate: '2026-10-21',
    notes: '',
  });

  // Vault Form & File State
  const [vaultForm, setVaultForm] = useState({
    clientId: '',
    name: '',
    category: 'GST',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Request Form
  const [requestForm, setRequestForm] = useState({
    clientId: '',
    title: 'Q2 Bank Statement & Sales Invoices Request',
    dueDate: '2026-10-25',
    items: 'Bank Statement Sept 2026, Purchase Bills, Sales Register',
  });

  const handleTabChange = (newTab: 'in-out' | 'vault' | 'requests') => {
    setSearchParams({ tab: newTab });
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'in-out') {
        const params: Record<string, string> = {};
        if (inOutCategory !== 'ALL') params.category = inOutCategory;
        if (inOutSearch) params.search = inOutSearch;
        const res = await api.getInOutRecords(params);
        if (res && res.success) {
          setInOutRecords(res.data || []);
        } else {
          setInOutRecords([]);
        }
      } else if (tab === 'vault') {
        const params: Record<string, string> = {};
        if (vaultCategory !== 'ALL') params.category = vaultCategory;
        if (vaultClientId !== 'ALL') params.clientId = vaultClientId;
        if (vaultSearch) params.search = vaultSearch;
        const res = await api.getVaultDocuments(params);
        if (res && res.success) {
          setVaultDocs(res.data || []);
        } else {
          setVaultDocs([]);
        }
      } else {
        const res = await api.getDocumentRequests();
        if (res && res.success) {
          setDocRequests(res.data || []);
        } else {
          setDocRequests([]);
        }
      }
    } catch (err: any) {
      console.error('[DocumentsPage] Fetch error:', err);
      setError(err?.message || 'Failed to fetch document records. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Load latest authorized clients from backend
  const loadClients = async () => {
    setLoadingClients(true);
    setClientsError(null);
    try {
      const res = await api.getClients({ limit: '100' });
      if (res && res.success) {
        const rawList: any[] = res.data || [];
        // Deduplicate clients by unique ID to prevent duplicate dropdown entries
        const uniqueClients = Array.from(
          new Map(rawList.filter((c) => c && c.id).map((c) => [c.id, c])).values()
        );
        setClients(uniqueClients);

        // Preserve selected client if it still exists in refreshed client list
        setVaultForm((prev) => {
          if (!prev.clientId) return prev;
          const stillExists = uniqueClients.some((c) => c.id === prev.clientId);
          return stillExists ? prev : { ...prev, clientId: '' };
        });
      } else {
        setClientsError(res?.message || 'Failed to load authorized clients');
      }
    } catch (err: any) {
      console.warn('[DocumentsPage] Failed to fetch clients:', err);
      setClientsError(err?.message || 'Failed to load authorized clients. Please try again.');
    } finally {
      setLoadingClients(false);
    }
  };

  // Initial client load
  useEffect(() => {
    loadClients();
  }, []);

  // Requirement 1 & 3: Re-fetch latest authorized clients every time the Upload to Vault modal opens
  useEffect(() => {
    if (showVaultModal) {
      loadClients();
    }
  }, [showVaultModal]);

  // Requirement 2: Auto-refresh client list when a new client is created elsewhere in app or another tab
  useEffect(() => {
    const handleClientUpdate = () => {
      loadClients();
    };

    const handleStorageUpdate = (e: StorageEvent) => {
      if (e.key === 'caflow:last_client_update') {
        loadClients();
      }
    };

    window.addEventListener('caflow:client-created', handleClientUpdate);
    window.addEventListener('caflow:clients-updated', handleClientUpdate);
    window.addEventListener('storage', handleStorageUpdate);

    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel('caflow_client_events');
        bc.onmessage = () => {
          loadClients();
        };
      }
    } catch {}

    return () => {
      window.removeEventListener('caflow:client-created', handleClientUpdate);
      window.removeEventListener('caflow:clients-updated', handleClientUpdate);
      window.removeEventListener('storage', handleStorageUpdate);
      if (bc) {
        try {
          bc.close();
        } catch {}
      }
    };
  }, []);

  useEffect(() => {
    fetchData();
  }, [tab, inOutCategory, vaultCategory, vaultClientId]);

  const handleCreateInOut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inOutForm.clientId) {
      alert('Please select a client');
      return;
    }
    try {
      const res = await api.createInOutRecord(inOutForm);
      if (res && res.success) {
        setShowInOutModal(false);
        fetchData();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to save entry');
    }
  };

  const handleMarkReturned = async (id: string) => {
    try {
      await api.returnDocument(id);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const ALLOWED_FILE_EXTENSIONS = ['.pdf', '.xls', '.xlsx', '.png', '.jpg', '.jpeg', '.webp'];
  const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

  const validateAndSetFile = (file: File) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_FILE_EXTENSIONS.includes(ext)) {
      setFileError(`Unsupported format "${ext}". Supported formats are PDF (.pdf), Excel (.xls, .xlsx), and Images (.png, .jpg, .jpeg, .webp).`);
      setSelectedFile(null);
      return false;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError(`File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the maximum limit of 25MB.`);
      setSelectedFile(null);
      return false;
    }

    setFileError(null);
    setSelectedFile(file);

    // If document title is empty, pre-populate from clean filename
    if (!vaultForm.name || vaultForm.name.trim() === '') {
      const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
      setVaultForm((prev) => ({ ...prev, name: cleanTitle }));
    }
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const handleClearSelectedFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFile(null);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUploadVault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaultForm.clientId) {
      alert('Please select an authorized client');
      return;
    }
    if (!vaultForm.name || !vaultForm.name.trim()) {
      alert('Please specify a document title');
      return;
    }
    if (!selectedFile) {
      setFileError('Please select a file to upload (PDF, Excel, or Image)');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('clientId', vaultForm.clientId);
      formData.append('name', vaultForm.name.trim());
      formData.append('category', vaultForm.category);

      const res = await api.uploadVaultDocument(formData);
      if (res && (res.success || res.document)) {
        setShowVaultModal(false);
        setVaultForm({ clientId: '', name: '', category: 'GST' });
        setSelectedFile(null);
        setFileError(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        await fetchData();
      } else {
        alert(res?.message || 'Failed to upload document');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to upload document to vault');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadDocument = async (doc: any) => {
    setDownloadingDocId(doc.id);
    try {
      const blob = await api.downloadVaultDocument(doc.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      let ext = '';
      if (doc.fileType === 'application/pdf') ext = '.pdf';
      else if (doc.fileType?.includes('sheet') || doc.fileType?.includes('excel')) ext = '.xlsx';
      else if (doc.fileType?.includes('png')) ext = '.png';
      else if (doc.fileType?.includes('jpeg') || doc.fileType?.includes('jpg')) ext = '.jpg';
      else if (doc.fileType?.includes('webp')) ext = '.webp';
      const cleanName = doc.name.toLowerCase().endsWith(ext) ? doc.name : `${doc.name}${ext}`;
      a.download = cleanName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      alert(err?.message || 'Failed to download document');
    } finally {
      setDownloadingDocId(null);
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestForm.clientId) {
      alert('Please select a client');
      return;
    }
    try {
      const itemsArr = requestForm.items.split(',').map(s => s.trim()).filter(Boolean);
      const res = await api.createDocumentRequest({
        clientId: requestForm.clientId,
        title: requestForm.title,
        dueDate: requestForm.dueDate,
        items: itemsArr,
      });
      if (res && res.success) {
        setShowRequestModal(false);
        fetchData();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to create request');
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '150 KB';
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
  };

  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case 'GST':
        return 'bg-[#E0F2FE] text-[#0369A1] border-[#BAE6FD]';
      case 'INCOME_TAX':
        return 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]';
      case 'AUDIT':
        return 'bg-[#F3E8FF] text-[#6B21A8] border-[#E9D5FF]';
      case 'ROC':
        return 'bg-[#DCFCE7] text-[#166534] border-[#BBF7D0]';
      case 'COMPLIANCE':
        return 'bg-[#FEE2E2] text-[#991B1B] border-[#FECACA]';
      default:
        return 'bg-[#FAFBF9] text-[#607274] border-[#E1E7E2]';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#202A33]">Document Management</h1>
          <p className="text-xs text-[#607274]">
            Physical custody registers, encrypted digital vault, and client collection requests
          </p>
        </div>

        <div className="flex items-center gap-2">
          {tab === 'in-out' && (
            <button
              onClick={() => setShowInOutModal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-[#176B57] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#135847] transition"
            >
              <Plus className="h-3.5 w-3.5" />
              + New Register Entry
            </button>
          )}
          {tab === 'vault' && (
            <button
              id="upload-vault-doc-btn"
              onClick={() => setShowVaultModal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-[#176B57] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#135847] transition cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload Document
            </button>
          )}
          {tab === 'requests' && (
            <button
              onClick={() => setShowRequestModal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-[#176B57] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#135847] transition"
            >
              <Plus className="h-3.5 w-3.5" />
              + Request Client Files
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#E1E7E2] gap-6 text-xs font-semibold text-[#607274]">
        <button
          onClick={() => handleTabChange('in-out')}
          className={`pb-2.5 transition flex items-center gap-1.5 ${
            tab === 'in-out'
              ? 'border-b-2 border-[#176B57] text-[#176B57] font-bold'
              : 'hover:text-[#202A33]'
          }`}
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
          Document In-Out Register
        </button>
        <button
          onClick={() => handleTabChange('vault')}
          className={`pb-2.5 transition flex items-center gap-1.5 ${
            tab === 'vault'
              ? 'border-b-2 border-[#176B57] text-[#176B57] font-bold'
              : 'hover:text-[#202A33]'
          }`}
        >
          <FolderLock className="h-3.5 w-3.5" />
          Client Document Vault
        </button>
        <button
          onClick={() => handleTabChange('requests')}
          className={`pb-2.5 transition flex items-center gap-1.5 ${
            tab === 'requests'
              ? 'border-b-2 border-[#176B57] text-[#176B57] font-bold'
              : 'hover:text-[#202A33]'
          }`}
        >
          <FileCheck className="h-3.5 w-3.5" />
          Collection Requests
        </button>
      </div>

      {/* Error Alert State */}
      {error && (
        <div className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] p-3 text-xs text-[#DC2626] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-1 font-bold text-[#991B1B] hover:underline ml-4"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: IN-OUT REGISTER */}
      {/* ========================================================================= */}
      {tab === 'in-out' && (
        <div className="space-y-4">
          <div className="caflow-card p-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              <div className="md:col-span-6 relative">
                <label className="block text-[10px] font-semibold text-[#8C9B90] uppercase mb-1">
                  Search Register
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#8C9B90]" />
                  <input
                    type="text"
                    placeholder="Search document type, client, receiver, location..."
                    value={inOutSearch}
                    onChange={(e) => setInOutSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fetchData()}
                    className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] py-1.5 pl-9 pr-3 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none"
                  />
                </div>
              </div>

              <div className="md:col-span-4">
                <label className="block text-[10px] font-semibold text-[#8C9B90] uppercase mb-1">
                  Category
                </label>
                <select
                  value={inOutCategory}
                  onChange={(e) => setInOutCategory(e.target.value)}
                  className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] py-1.5 px-3 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none"
                >
                  <option value="ALL">All Categories</option>
                  <option value="RECEIVED">Received from Client</option>
                  <option value="GIVEN">Given to Client</option>
                </select>
              </div>

              <div className="md:col-span-2 flex items-center justify-end gap-1.5 pt-4">
                <button
                  onClick={fetchData}
                  title="Refresh"
                  className="p-1.5 rounded text-[#607274] hover:bg-[#F1F4F1] border border-[#E1E7E2]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={fetchData}
                  title="Search"
                  className="p-1.5 rounded bg-[#176B57] text-white hover:bg-[#135847] shadow-sm"
                >
                  <Search className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="caflow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#E1E7E2] bg-[#FAFBF9] text-[#607274] font-semibold uppercase tracking-wider text-[10px]">
                    <th className="p-3">Date</th>
                    <th className="p-3">Document Type</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Client</th>
                    <th className="p-3">Physical Location</th>
                    <th className="p-3">Receiver / Holder</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F4F1]">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-[#607274]">
                        <div className="flex items-center justify-center gap-2">
                          <RefreshCw className="h-4 w-4 animate-spin text-[#176B57]" />
                          <span>Loading register records...</span>
                        </div>
                      </td>
                    </tr>
                  ) : inOutRecords.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-[#607274]">
                        No register records found.
                      </td>
                    </tr>
                  ) : (
                    inOutRecords.map((r) => (
                      <tr key={r.id} className="hover:bg-[#FAFBF9] transition">
                        <td className="p-3 font-mono text-[11px] text-[#607274]">
                          {new Date(r.date).toLocaleDateString()}
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-[#202A33]">{r.docType}</div>
                          {r.notes && (
                            <div className="text-[10px] text-[#607274] truncate max-w-xs">{r.notes}</div>
                          )}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              r.category === 'RECEIVED'
                                ? 'bg-[#E0F2FE] text-[#0369A1]'
                                : 'bg-[#FEF3C7] text-[#92400E]'
                            }`}
                          >
                            {r.category}
                          </span>
                        </td>
                        <td className="p-3 font-semibold text-[#0369A1]">{r.client?.name}</td>
                        <td className="p-3 text-[#4A5568]">{r.physicalLocation || 'Main Office Desk'}</td>
                        <td className="p-3 text-[#202A33] font-medium">
                          {r.receiverName || r.responsibleUser?.fullName || '-'}
                        </td>
                        <td className="p-3">
                          <span
                            className={`caflow-badge ${
                              r.status === 'IN_CUSTODY' ? 'badge-progress' : 'badge-completed'
                            }`}
                          >
                            {r.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {r.status === 'IN_CUSTODY' ? (
                            <button
                              onClick={() => handleMarkReturned(r.id)}
                              className="px-2.5 py-1 bg-[#176B57] text-white rounded text-[10px] font-semibold hover:bg-[#135847] transition shadow-xs"
                            >
                              Mark Returned
                            </button>
                          ) : (
                            <span className="text-[#16A34A] text-[11px] font-semibold flex items-center justify-center gap-1">
                              <CheckCircle className="h-3.5 w-3.5" /> Returned
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CLIENT DOCUMENT VAULT */}
      {/* ========================================================================= */}
      {tab === 'vault' && (
        <div className="space-y-4">
          {/* Vault Filter Bar */}
          <div className="caflow-card p-4">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
              <div className="sm:col-span-5 relative">
                <label className="block text-[10px] font-semibold text-[#8C9B90] uppercase mb-1">
                  Search Vault Documents
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#8C9B90]" />
                  <input
                    type="text"
                    placeholder="Search by file name or document type..."
                    value={vaultSearch}
                    onChange={(e) => setVaultSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fetchData()}
                    className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] py-1.5 pl-9 pr-3 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none"
                  />
                </div>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[10px] font-semibold text-[#8C9B90] uppercase mb-1">
                  Client Filter
                </label>
                <select
                  value={vaultClientId}
                  onChange={(e) => setVaultClientId(e.target.value)}
                  className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] py-1.5 px-3 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none"
                >
                  <option value="ALL">All Clients ({clients.length})</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[10px] font-semibold text-[#8C9B90] uppercase mb-1">
                  Category
                </label>
                <select
                  value={vaultCategory}
                  onChange={(e) => setVaultCategory(e.target.value)}
                  className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] py-1.5 px-3 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none"
                >
                  <option value="ALL">All Categories</option>
                  <option value="GST">GST Returns & Reg</option>
                  <option value="INCOME_TAX">Income Tax & 26AS</option>
                  <option value="AUDIT">Financial Audit Reports</option>
                  <option value="ROC">ROC & Incorporation</option>
                  <option value="COMPLIANCE">Statutory Compliance</option>
                  <option value="INVOICE">Invoices & Bills</option>
                  <option value="OTHER">Other Documents</option>
                </select>
              </div>

              <div className="sm:col-span-2 flex items-center justify-end gap-1.5 pt-4">
                <button
                  onClick={fetchData}
                  title="Refresh Vault"
                  className="p-1.5 rounded text-[#607274] hover:bg-[#F1F4F1] border border-[#E1E7E2] transition"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-[#176B57]' : ''}`} />
                </button>
                <button
                  onClick={fetchData}
                  title="Apply Search"
                  className="p-1.5 rounded bg-[#176B57] text-white hover:bg-[#135847] shadow-sm transition"
                >
                  <Search className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Loading Indicator */}
          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="caflow-card p-4 space-y-3 animate-pulse border border-[#E1E7E2] bg-white"
                >
                  <div className="flex items-center justify-between">
                    <div className="h-9 w-9 rounded-lg bg-[#E1E7E2]" />
                    <div className="h-5 w-16 rounded bg-[#E1E7E2]" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-4 w-3/4 rounded bg-[#E1E7E2]" />
                    <div className="h-3 w-1/2 rounded bg-[#F1F4F1]" />
                  </div>
                  <div className="border-t border-[#F1F4F1] pt-2 flex justify-between">
                    <div className="h-3 w-12 rounded bg-[#F1F4F1]" />
                    <div className="h-3 w-16 rounded bg-[#F1F4F1]" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && vaultDocs.length === 0 && (
            <div className="caflow-card p-12 text-center border border-dashed border-[#C5D1C8] bg-[#FAFBF9] rounded-xl space-y-3">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#E8F3EF] text-[#176B57]">
                <FolderLock className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-[#202A33]">No Vault Documents Found</h3>
              <p className="text-xs text-[#607274] max-w-md mx-auto">
                {vaultSearch || vaultCategory !== 'ALL' || vaultClientId !== 'ALL'
                  ? 'No documents match the specified filters. Try adjusting your search query, client selection, or category filter.'
                  : 'There are currently no permanent client files uploaded to the encrypted digital vault. Upload incorporation certificates, audit reports, and filings to store them securely.'}
              </p>
              <div className="pt-2 flex items-center justify-center gap-2">
                {(vaultSearch || vaultCategory !== 'ALL' || vaultClientId !== 'ALL') && (
                  <button
                    onClick={() => {
                      setVaultSearch('');
                      setVaultCategory('ALL');
                      setVaultClientId('ALL');
                    }}
                    className="px-3.5 py-1.5 rounded-lg border border-[#E1E7E2] text-xs font-semibold text-[#607274] hover:bg-[#F1F4F1] transition"
                  >
                    Clear Filters
                  </button>
                )}
                <button
                  onClick={() => setShowVaultModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#176B57] text-xs font-semibold text-white hover:bg-[#135847] shadow-sm transition"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload First Document
                </button>
              </div>
            </div>
          )}

          {/* Document Cards Grid */}
          {!loading && vaultDocs.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {vaultDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="caflow-card p-4 hover:border-[#176B57] hover:shadow-md transition space-y-3 bg-white"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#E8F3EF] text-[#176B57]">
                      <FileText className="h-5 w-5" />
                    </div>
                    <span
                      className={`text-[10px] font-bold border px-2 py-0.5 rounded uppercase tracking-wider ${getCategoryBadgeClass(
                        doc.category
                      )}`}
                    >
                      {doc.category?.replace('_', ' ') || 'OTHER'}
                    </span>
                  </div>

                  <div>
                    <div className="font-bold text-xs text-[#202A33] truncate" title={doc.name}>
                      {doc.name}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-[#0369A1] font-semibold mt-1 truncate">
                      <Building2 className="h-3 w-3 shrink-0 text-[#8C9B90]" />
                      <span className="truncate">{doc.client?.name || 'General Client'}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-[#F1F4F1] pt-2 text-[10px] text-[#8C9B90]">
                    <span>
                      {formatFileSize(doc.fileSize)} • {new Date(doc.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      id={`download-doc-${doc.id}`}
                      disabled={downloadingDocId === doc.id}
                      onClick={() => handleDownloadDocument(doc)}
                      className="flex items-center gap-1 text-[#176B57] font-semibold hover:underline disabled:opacity-50"
                    >
                      <Download className={`h-3 w-3 ${downloadingDocId === doc.id ? 'animate-bounce' : ''}`} />
                      {downloadingDocId === doc.id ? 'Downloading...' : 'Download'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: DOCUMENT COLLECTION REQUESTS */}
      {/* ========================================================================= */}
      {tab === 'requests' && (
        <div className="space-y-4">
          {loading ? (
            <div className="caflow-card p-12 text-center text-[#607274]">
              <div className="flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-[#176B57]" />
                <span>Loading collection requests...</span>
              </div>
            </div>
          ) : docRequests.length === 0 ? (
            <div className="caflow-card p-12 text-center border border-dashed border-[#C5D1C8] bg-[#FAFBF9] rounded-xl space-y-2">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#E8F3EF] text-[#176B57]">
                <FileCheck className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-[#202A33]">No Active Collection Requests</h3>
              <p className="text-xs text-[#607274]">
                There are no open client document collection requests. Create a request to collect bank statements, invoices, and vouchers from clients.
              </p>
              <div className="pt-2">
                <button
                  onClick={() => setShowRequestModal(true)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#176B57] text-xs font-semibold text-white hover:bg-[#135847] shadow-sm transition"
                >
                  + Create First Request
                </button>
              </div>
            </div>
          ) : (
            <div className="caflow-card divide-y divide-[#F1F4F1]">
              {docRequests.map((req) => (
                <div key={req.id} className="p-4 space-y-2 hover:bg-[#FAFBF9] transition">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-xs text-[#202A33]">{req.title}</h3>
                      <div className="text-[11px] text-[#607274]">
                        Client: <strong className="text-[#0369A1]">{req.client?.name}</strong> • Due:{' '}
                        {new Date(req.dueDate).toLocaleDateString()}
                      </div>
                    </div>
                    <span
                      className={`caflow-badge ${
                        req.status === 'COMPLETED' ? 'badge-completed' : 'badge-pending'
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(req.items || []).map((it: any) => (
                      <span
                        key={it.id}
                        className="text-[10px] bg-[#FAFBF9] border border-[#E1E7E2] px-2 py-1 rounded text-[#202A33] flex items-center gap-1"
                      >
                        <FileText className="h-3 w-3 text-[#176B57]" />
                        {it.title} ({it.status})
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ADD IN-OUT REGISTER ENTRY */}
      {/* ========================================================================= */}
      {showInOutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="caflow-card w-full max-w-md p-6 bg-white shadow-2xl rounded-xl">
            <div className="flex items-center justify-between border-b border-[#E1E7E2] pb-3 mb-4">
              <h2 className="text-base font-bold text-[#202A33]">Add In-Out Register Entry</h2>
              <button onClick={() => setShowInOutModal(false)}>
                <X className="h-4 w-4 text-[#607274] hover:text-[#202A33]" />
              </button>
            </div>
            <form onSubmit={handleCreateInOut} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">Client *</label>
                <select
                  required
                  value={inOutForm.clientId}
                  onChange={(e) => setInOutForm({ ...inOutForm, clientId: e.target.value })}
                  className="w-full rounded-md border border-[#E1E7E2] p-2 text-xs"
                >
                  <option value="">Select client...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">
                  Document Type *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Physical DSC Token, Original Title Deed"
                  value={inOutForm.docType}
                  onChange={(e) => setInOutForm({ ...inOutForm, docType: e.target.value })}
                  className="w-full rounded-md border border-[#E1E7E2] p-2 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#202A33] mb-1">Category</label>
                  <select
                    value={inOutForm.category}
                    onChange={(e) => setInOutForm({ ...inOutForm, category: e.target.value })}
                    className="w-full rounded-md border border-[#E1E7E2] p-2 text-xs"
                  >
                    <option value="RECEIVED">Received from Client</option>
                    <option value="GIVEN">Given to Client</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#202A33] mb-1">
                    Physical Location
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Cabinet 2, Locker A"
                    value={inOutForm.physicalLocation}
                    onChange={(e) => setInOutForm({ ...inOutForm, physicalLocation: e.target.value })}
                    className="w-full rounded-md border border-[#E1E7E2] p-2 text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">
                  Receiver / Courier Contact
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh (Driver), BlueDart AWB#12938"
                  value={inOutForm.receiverName}
                  onChange={(e) => setInOutForm({ ...inOutForm, receiverName: e.target.value })}
                  className="w-full rounded-md border border-[#E1E7E2] p-2 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowInOutModal(false)}
                  className="px-4 py-2 text-xs font-semibold border rounded-lg hover:bg-[#F1F4F1]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-[#176B57] text-white rounded-lg shadow hover:bg-[#135847]"
                >
                  Save Register Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: UPLOAD VAULT DOCUMENT */}
      {/* ========================================================================= */}
      {showVaultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="caflow-card w-full max-w-md p-6 bg-white shadow-2xl rounded-xl">
            <div className="flex items-center justify-between border-b border-[#E1E7E2] pb-3 mb-4">
              <div className="flex items-center gap-2">
                <FolderLock className="h-5 w-5 text-[#176B57]" />
                <h2 className="text-base font-bold text-[#202A33]">Upload to Client Vault</h2>
              </div>
              <button
                id="close-vault-modal-btn"
                onClick={() => {
                  setShowVaultModal(false);
                  setSelectedFile(null);
                  setFileError(null);
                }}
              >
                <X className="h-4 w-4 text-[#607274] hover:text-[#202A33]" />
              </button>
            </div>
            <form onSubmit={handleUploadVault} className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-[#202A33]">Client *</label>
                  {loadingClients ? (
                    <span className="text-[10px] text-[#176B57] flex items-center gap-1 font-medium">
                      <RefreshCw className="h-3 w-3 animate-spin" /> Loading clients...
                    </span>
                  ) : clientsError ? (
                    <button
                      type="button"
                      onClick={() => loadClients()}
                      className="text-[10px] text-[#DC2626] font-semibold hover:underline flex items-center gap-1"
                    >
                      <RefreshCw className="h-2.5 w-2.5" /> Retry
                    </button>
                  ) : (
                    <span className="text-[10px] text-[#8C9B90]">
                      {clients.length} {clients.length === 1 ? 'client' : 'clients'} authorized
                    </span>
                  )}
                </div>

                {clientsError && (
                  <div className="mb-2 p-2 rounded bg-[#FEE2E2] border border-[#FCA5A5] text-[11px] text-[#DC2626] flex items-center justify-between">
                    <span>{clientsError}</span>
                    <button
                      type="button"
                      onClick={() => loadClients()}
                      className="text-xs font-bold underline ml-2"
                    >
                      Retry
                    </button>
                  </div>
                )}

                <select
                  id="vault-client-select"
                  required
                  disabled={loadingClients}
                  value={vaultForm.clientId}
                  onChange={(e) => setVaultForm({ ...vaultForm, clientId: e.target.value })}
                  className="w-full rounded-md border border-[#E1E7E2] p-2 text-xs focus:border-[#176B57] focus:outline-none disabled:bg-[#F1F4F1] disabled:text-[#8C9B90]"
                >
                  {loadingClients ? (
                    <option value="" disabled>Loading authorized clients...</option>
                  ) : clientsError ? (
                    <option value="" disabled>Failed to load clients. Click Retry.</option>
                  ) : clients.length === 0 ? (
                    <option value="" disabled>No authorized clients found. Please create a client first.</option>
                  ) : (
                    <>
                      <option value="">Select client ({clients.length} available)...</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.pan ? `(${c.pan})` : ''}
                        </option>
                      ))}
                    </>
                  )}
                </select>
                {!loadingClients && !clientsError && clients.length === 0 && (
                  <p className="text-[10px] text-[#DC2626] mt-1">
                    No authorized clients found for your practice. Please add a client first.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">
                  Document Title / File Name *
                </label>
                <input
                  id="vault-doc-name-input"
                  type="text"
                  required
                  placeholder="e.g. Form 26AS Tax Credit Statement FY 2025-26"
                  value={vaultForm.name}
                  onChange={(e) => setVaultForm({ ...vaultForm, name: e.target.value })}
                  className="w-full rounded-md border border-[#E1E7E2] p-2 text-xs focus:border-[#176B57] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">
                  Compliance Category
                </label>
                <select
                  id="vault-category-select"
                  value={vaultForm.category}
                  onChange={(e) => setVaultForm({ ...vaultForm, category: e.target.value })}
                  className="w-full rounded-md border border-[#E1E7E2] p-2 text-xs focus:border-[#176B57] focus:outline-none"
                >
                  <option value="GST">GST Returns & Registration</option>
                  <option value="INCOME_TAX">Income Tax & Tax Audits</option>
                  <option value="AUDIT">Financial Audit Reports</option>
                  <option value="ROC">ROC & Incorporation Documents</option>
                  <option value="COMPLIANCE">Statutory Compliance</option>
                  <option value="INVOICE">Invoices & Billing Records</option>
                  <option value="OTHER">Other Documents</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">
                  Select File (PDF / Excel / Image) *
                </label>
                <input
                  ref={fileInputRef}
                  id="vault-file-input"
                  type="file"
                  accept=".pdf,.xls,.xlsx,.png,.jpg,.jpeg,.webp,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {!selectedFile ? (
                  <div
                    id="vault-dropzone"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition ${
                      isDragging
                        ? 'border-[#176B57] bg-[#E8F3EF]'
                        : 'border-[#C5D1C8] bg-[#FAFBF9] hover:border-[#176B57] hover:bg-[#F4F8F5]'
                    }`}
                  >
                    <Upload className="h-6 w-6 mx-auto text-[#176B57] mb-1.5" />
                    <p className="text-xs font-semibold text-[#202A33]">
                      Click to choose file or drag & drop here
                    </p>
                    <p className="text-[11px] text-[#607274] mt-0.5">
                      Supports PDF (.pdf), Excel (.xls, .xlsx), or Images (.png, .jpg, .webp) up to 25MB
                    </p>
                  </div>
                ) : (
                  <div className="border border-[#176B57] rounded-lg p-3 bg-[#E8F3EF]/40 flex items-center justify-between">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <div className="h-8 w-8 rounded-lg bg-[#176B57] text-white flex items-center justify-center shrink-0">
                        <FileCheck className="h-4 w-4" />
                      </div>
                      <div className="overflow-hidden">
                        <p id="vault-selected-file-name" className="text-xs font-bold text-[#202A33] truncate" title={selectedFile.name}>
                          {selectedFile.name}
                        </p>
                        <p className="text-[10px] text-[#607274]">
                          {formatFileSize(selectedFile.size)} • {selectedFile.type || 'Document'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-[11px] text-[#176B57] font-semibold hover:underline px-1.5 py-0.5"
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        onClick={handleClearSelectedFile}
                        className="p-1 rounded text-[#DC2626] hover:bg-[#FEE2E2] transition"
                        title="Remove file"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {fileError && (
                  <div className="mt-1.5 p-2 rounded bg-[#FEE2E2] border border-[#FCA5A5] text-[11px] text-[#DC2626] flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>{fileError}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E1E7E2]">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => {
                    setShowVaultModal(false);
                    setSelectedFile(null);
                    setFileError(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold border rounded-lg hover:bg-[#F1F4F1] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  id="vault-save-submit-btn"
                  type="submit"
                  disabled={uploading || loadingClients || !selectedFile}
                  className="px-4 py-2 text-xs font-semibold bg-[#176B57] text-white rounded-lg shadow hover:bg-[#135847] transition flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Saving to Vault...
                    </>
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5" />
                      Save to Vault
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CREATE DOCUMENT REQUEST */}
      {/* ========================================================================= */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="caflow-card w-full max-w-md p-6 bg-white shadow-2xl rounded-xl">
            <div className="flex items-center justify-between border-b border-[#E1E7E2] pb-3 mb-4">
              <div className="flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-[#176B57]" />
                <h2 className="text-base font-bold text-[#202A33]">Create Document Request</h2>
              </div>
              <button onClick={() => setShowRequestModal(false)}>
                <X className="h-4 w-4 text-[#607274] hover:text-[#202A33]" />
              </button>
            </div>
            <form onSubmit={handleCreateRequest} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">Client *</label>
                <select
                  required
                  value={requestForm.clientId}
                  onChange={(e) => setRequestForm({ ...requestForm, clientId: e.target.value })}
                  className="w-full rounded-md border border-[#E1E7E2] p-2 text-xs focus:border-[#176B57] focus:outline-none"
                >
                  <option value="">Select client...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">
                  Request Subject / Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Q3 Bank Statement & Purchase Bills Request"
                  value={requestForm.title}
                  onChange={(e) => setRequestForm({ ...requestForm, title: e.target.value })}
                  className="w-full rounded-md border border-[#E1E7E2] p-2 text-xs focus:border-[#176B57] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">Due Date</label>
                <input
                  type="date"
                  required
                  value={requestForm.dueDate}
                  onChange={(e) => setRequestForm({ ...requestForm, dueDate: e.target.value })}
                  className="w-full rounded-md border border-[#E1E7E2] p-2 text-xs focus:border-[#176B57] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">
                  Requested Items (comma separated)
                </label>
                <textarea
                  rows={3}
                  placeholder="Bank Statement Oct 2026, Purchase Register, Electricity Bill"
                  value={requestForm.items}
                  onChange={(e) => setRequestForm({ ...requestForm, items: e.target.value })}
                  className="w-full rounded-md border border-[#E1E7E2] p-2 text-xs focus:border-[#176B57] focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E1E7E2]">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="px-4 py-2 text-xs font-semibold border rounded-lg hover:bg-[#F1F4F1]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-[#176B57] text-white rounded-lg shadow hover:bg-[#135847] transition"
                >
                  Send Collection Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
