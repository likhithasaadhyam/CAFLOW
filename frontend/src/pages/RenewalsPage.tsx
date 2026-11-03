import React, { useState, useEffect } from 'react';
import {
  Clock,
  Plus,
  RefreshCw,
  Search,
  CheckCircle,
  AlertTriangle,
  X,
  FileCheck,
} from 'lucide-react';
import { api } from '../services/api';

export const RenewalsPage: React.FC = () => {
  const [renewals, setRenewals] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);

  const [formData, setFormData] = useState({
    clientId: '',
    renewalType: 'FSSAI Food License',
    licenseNumber: '',
    expiryDate: '2026-11-15',
    reminderDays: 30,
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchRenewals = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (search) params.search = search;

      const res = await api.getRenewals(params);
      if (res.success) {
        setRenewals(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.getClients({ limit: '100' }).then(r => { if (r.success) setClients(r.data); });
    fetchRenewals();

    const handleCreated = () => {
      fetchRenewals();
    };
    window.addEventListener('caflow:renewal-created', handleCreated);
    return () => window.removeEventListener('caflow:renewal-created', handleCreated);
  }, [statusFilter]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientId) {
      alert('Please select a client');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.createRenewal(formData);
      if (res.success) {
        setShowNewModal(false);
        setFormData({
          clientId: '',
          renewalType: 'FSSAI Food License',
          licenseNumber: '',
          expiryDate: '2026-11-15',
          reminderDays: 30,
          notes: '',
        });
        fetchRenewals();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to create renewal');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await api.updateRenewalStatus(id, status);
      fetchRenewals();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#202A33]">Renewals & Registrations</h1>
          <p className="text-xs text-[#607274]">Track expiring DSCs, FSSAI licenses, Trademarks, and statutory certificates</p>
        </div>

        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-1.5 rounded-lg bg-[#176B57] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#135847] transition"
        >
          <Plus className="h-3.5 w-3.5" />
          + New Renewal
        </button>
      </div>

      {/* Filter Bar */}
      <div className="caflow-card p-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          <div className="md:col-span-6 relative">
            <label className="block text-[10px] font-semibold text-[#8C9B90] uppercase mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#8C9B90]" />
              <input
                type="text"
                placeholder="Search renewal type, license no, client name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] py-1.5 pl-9 pr-3 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none"
              />
            </div>
          </div>

          <div className="md:col-span-4">
            <label className="block text-[10px] font-semibold text-[#8C9B90] uppercase mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] py-1.5 px-3 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="EXPIRING_SOON">Expiring Soon</option>
              <option value="EXPIRED">Expired</option>
              <option value="ACTIVE">Active</option>
              <option value="RENEWED">Renewed</option>
            </select>
          </div>

          <div className="md:col-span-2 flex items-center justify-end gap-1.5 pt-4">
            <button
              onClick={fetchRenewals}
              className="p-1.5 rounded text-[#607274] hover:bg-[#F1F4F1] border border-[#E1E7E2]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={fetchRenewals}
              className="p-1.5 rounded bg-[#176B57] text-white hover:bg-[#135847] shadow-sm"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="caflow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#E1E7E2] bg-[#FAFBF9] text-[#607274] font-semibold uppercase tracking-wider text-[10px]">
                <th className="p-3">Renewal Type</th>
                <th className="p-3">Client</th>
                <th className="p-3">License / Reg No</th>
                <th className="p-3">Expiry Date</th>
                <th className="p-3">Reminder</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F4F1]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#607274]">
                    Loading renewals...
                  </td>
                </tr>
              ) : renewals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#607274]">
                    No renewal records found.
                  </td>
                </tr>
              ) : (
                renewals.map((r) => (
                  <tr key={r.id} className="hover:bg-[#FAFBF9] transition">
                    <td className="p-3">
                      <div className="font-bold text-[#202A33]">{r.renewalType}</div>
                      {r.notes && <div className="text-[11px] text-[#607274] truncate max-w-xs">{r.notes}</div>}
                    </td>
                    <td className="p-3 font-semibold text-[#0369A1]">{r.client?.name}</td>
                    <td className="p-3 font-mono text-[11px] text-[#607274]">{r.licenseNumber || '-'}</td>
                    <td className="p-3 font-mono text-[11px]">
                      <span className={r.status === 'EXPIRED' ? 'text-[#DC2626] font-bold' : 'text-[#202A33]'}>
                        {new Date(r.expiryDate).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="p-3 text-[#607274]">{r.reminderDays} days prior</td>
                    <td className="p-3">
                      <span
                        className={`caflow-badge ${
                          r.status === 'EXPIRED'
                            ? 'badge-urgent'
                            : r.status === 'EXPIRING_SOON'
                            ? 'badge-pending'
                            : 'badge-completed'
                        }`}
                      >
                        {r.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {r.status !== 'RENEWED' ? (
                        <button
                          onClick={() => handleUpdateStatus(r.id, 'RENEWED')}
                          className="px-2.5 py-1 bg-[#176B57] text-white rounded text-[11px] font-semibold hover:bg-[#135847]"
                        >
                          Mark Renewed
                        </button>
                      ) : (
                        <span className="text-[11px] text-[#16A34A] font-semibold flex items-center justify-center gap-1">
                          <CheckCircle className="h-3.5 w-3.5" /> Renewed
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

      {/* New Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="caflow-card w-full max-w-md p-6 bg-white shadow-2xl rounded-xl">
            <div className="flex items-center justify-between border-b border-[#E1E7E2] pb-3 mb-4">
              <h2 className="text-base font-bold text-[#202A33]">Add Renewal Record</h2>
              <button onClick={() => setShowNewModal(false)} className="text-[#607274] hover:text-[#202A33]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">Client *</label>
                <select
                  required
                  value={formData.clientId}
                  onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                  className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] p-2 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none"
                >
                  <option value="">Select client...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">Renewal / License Type *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Class 3 Combo DSC, FSSAI Food License"
                  value={formData.renewalType}
                  onChange={(e) => setFormData({ ...formData, renewalType: e.target.value })}
                  className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] p-2 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#202A33] mb-1">License / Reg Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 10019047001234"
                    value={formData.licenseNumber}
                    onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                    className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] p-2 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#202A33] mb-1">Expiry Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.expiryDate}
                    onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                    className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] p-2 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">Notes</label>
                <textarea
                  rows={2}
                  placeholder="Additional reminder instructions..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] p-2 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E1E7E2]">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="rounded-lg border border-[#E1E7E2] px-4 py-2 text-xs font-semibold text-[#607274] hover:bg-[#FAFBF9]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-[#176B57] px-4 py-2 text-xs font-semibold text-white shadow hover:bg-[#135847] disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Renewal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
