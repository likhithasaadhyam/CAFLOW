import React, { useState, useEffect } from 'react';
import {
  Timer,
  Plus,
  RefreshCw,
  Search,
  CheckCircle,
  Clock,
  X,
  FileCheck,
} from 'lucide-react';
import { api } from '../services/api';

export const TimesheetPage: React.FC = () => {
  const [entries, setEntries] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({ totalHoursFormatted: '0 hrs', billableHoursFormatted: '0 hrs' });
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLogModal, setShowLogModal] = useState(false);

  const [formData, setFormData] = useState({
    clientId: '',
    workDate: '2026-10-14',
    durationMinutes: 120,
    description: '',
    isBillable: true,
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.getTimesheets();
      if (res.success) {
        setEntries(res.data);
        if (res.summary) setSummary(res.summary);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.getClients({ limit: '100' }).then(r => { if (r.success) setClients(r.data); });
    fetchData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.description) return;
    try {
      const res = await api.createTimesheet(formData);
      if (res.success) {
        setShowLogModal(false);
        setFormData({
          clientId: '',
          workDate: '2026-10-14',
          durationMinutes: 120,
          description: '',
          isBillable: true,
        });
        fetchData();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to log timesheet');
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await api.approveTimesheet(id, 'APPROVED');
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#202A33]">Timesheet Management</h1>
          <p className="text-xs text-[#607274]">Log weekly professional billable hours, task durations, and manager approvals</p>
        </div>

        <button
          onClick={() => setShowLogModal(true)}
          className="flex items-center gap-1.5 rounded-lg bg-[#176B57] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#135847] transition"
        >
          <Plus className="h-3.5 w-3.5" />
          + Log Time Entry
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="caflow-card p-4">
          <div className="text-[11px] font-semibold text-[#607274] uppercase">Total Hours Logged</div>
          <div className="text-2xl font-bold text-[#202A33] mt-1">{summary.totalHoursFormatted}</div>
        </div>
        <div className="caflow-card p-4">
          <div className="text-[11px] font-semibold text-[#607274] uppercase">Billable Hours</div>
          <div className="text-2xl font-bold text-[#176B57] mt-1">{summary.billableHoursFormatted}</div>
        </div>
        <div className="caflow-card p-4">
          <div className="text-[11px] font-semibold text-[#607274] uppercase">Current Week</div>
          <div className="text-sm font-bold text-[#202A33] mt-1">Oct 12 - Oct 18, 2026</div>
        </div>
        <div className="caflow-card p-4">
          <div className="text-[11px] font-semibold text-[#607274] uppercase">Approval Status</div>
          <div className="text-sm font-bold text-[#10B981] mt-1">Submitted for Review</div>
        </div>
      </div>

      {/* Entries Table */}
      <div className="caflow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#E1E7E2] bg-[#FAFBF9] text-[#607274] font-semibold uppercase tracking-wider text-[10px]">
                <th className="p-3">Work Date</th>
                <th className="p-3">Staff / User</th>
                <th className="p-3">Client</th>
                <th className="p-3">Description</th>
                <th className="p-3 text-right">Duration</th>
                <th className="p-3">Classification</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F4F1]">
              {loading ? (
                <tr><td colSpan={8} className="py-12 text-center text-[#607274]">Loading timesheet entries...</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-[#607274]">No timesheet entries logged.</td></tr>
              ) : (
                entries.map((e) => (
                  <tr key={e.id} className="hover:bg-[#FAFBF9] transition">
                    <td className="p-3 font-mono text-[11px] text-[#607274]">{new Date(e.workDate).toLocaleDateString()}</td>
                    <td className="p-3 font-semibold text-[#202A33]">{e.user?.fullName}</td>
                    <td className="p-3 font-semibold text-[#0369A1]">{e.client?.name || 'Firm Internal'}</td>
                    <td className="p-3 text-[#4A5568]">{e.description}</td>
                    <td className="p-3 text-right font-mono font-bold text-[#202A33]">
                      {Math.floor(e.durationMinutes / 60)}h {e.durationMinutes % 60}m
                    </td>
                    <td className="p-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${e.isBillable ? 'bg-[#DCFCE7] text-[#16A34A]' : 'bg-[#F1F5F9] text-[#64748B]'}`}>
                        {e.isBillable ? 'Billable' : 'Non-Billable'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`caflow-badge ${e.status === 'APPROVED' ? 'badge-completed' : 'badge-pending'}`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {e.status !== 'APPROVED' ? (
                        <button
                          onClick={() => handleApprove(e.id)}
                          className="px-2.5 py-1 bg-[#176B57] text-white rounded text-[11px] font-semibold hover:bg-[#135847]"
                        >
                          Approve
                        </button>
                      ) : (
                        <span className="text-[#10B981] font-semibold flex items-center justify-center gap-1">
                          <CheckCircle className="h-3.5 w-3.5" /> Approved
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

      {/* Log Time Modal */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="caflow-card w-full max-w-md p-6 bg-white shadow-2xl rounded-xl">
            <div className="flex items-center justify-between border-b border-[#E1E7E2] pb-3 mb-4">
              <h2 className="text-base font-bold text-[#202A33]">Log Work Timesheet</h2>
              <button onClick={() => setShowLogModal(false)}><X className="h-4 w-4 text-[#607274]" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">Client (Optional)</label>
                <select
                  value={formData.clientId}
                  onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                  className="w-full rounded-md border border-[#E1E7E2] p-2 text-xs"
                >
                  <option value="">Internal firm work</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#202A33] mb-1">Work Date</label>
                  <input
                    type="date"
                    value={formData.workDate}
                    onChange={(e) => setFormData({ ...formData, workDate: e.target.value })}
                    className="w-full rounded-md border border-[#E1E7E2] p-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#202A33] mb-1">Duration (Minutes)</label>
                  <input
                    type="number"
                    min="15"
                    step="15"
                    value={formData.durationMinutes}
                    onChange={(e) => setFormData({ ...formData, durationMinutes: Number(e.target.value) })}
                    className="w-full rounded-md border border-[#E1E7E2] p-2 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">Description of Work *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="e.g. Reconciliation of input tax credits with purchase invoices..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full rounded-md border border-[#E1E7E2] p-2 text-xs"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="billable"
                  checked={formData.isBillable}
                  onChange={(e) => setFormData({ ...formData, isBillable: e.target.checked })}
                  className="rounded border-[#C4D1C7] text-[#176B57]"
                />
                <label htmlFor="billable" className="text-xs font-semibold text-[#202A33] cursor-pointer">
                  This work is billable to the client
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowLogModal(false)} className="px-4 py-2 text-xs font-semibold border rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold bg-[#176B57] text-white rounded-lg shadow">Submit Time Entry</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
