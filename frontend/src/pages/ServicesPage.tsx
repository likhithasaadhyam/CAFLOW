import React, { useState, useEffect } from 'react';
import {
  Repeat,
  Plus,
  RefreshCw,
  Search,
  CheckCircle,
  FileText,
  IndianRupee,
  Calendar,
  X,
} from 'lucide-react';
import { api } from '../services/api';

export const ServicesPage: React.FC = () => {
  const [tab, setTab] = useState<'services' | 'retainers'>('services');
  const [services, setServices] = useState<any[]>([]);
  const [retainers, setRetainers] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showRetainerModal, setShowRetainerModal] = useState(false);

  const [serviceForm, setServiceForm] = useState({
    name: '',
    category: 'Direct Tax',
    standardFee: 5000,
    defaultDueDays: 15,
    billingFrequency: 'ONE_TIME',
  });

  const [retainerForm, setRetainerForm] = useState({
    clientId: '',
    serviceId: '',
    agreementNo: 'RET-2026-005',
    fee: 4500,
    billingFrequency: 'MONTHLY',
    startDate: '2026-10-01',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      if (tab === 'services') {
        const res = await api.getServices();
        if (res.success) setServices(res.data);
      } else {
        const res = await api.getRetainers();
        if (res.success) setRetainers(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.getClients({ limit: '100' }).then(r => { if (r.success) setClients(r.data); });
    api.getServices().then(r => { if (r.success) setServices(r.data); });
    fetchData();
  }, [tab]);

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.createService(serviceForm);
      if (res.success) {
        setShowServiceModal(false);
        fetchData();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to create service');
    }
  };

  const handleCreateRetainer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!retainerForm.clientId || !retainerForm.serviceId) return;
    try {
      const res = await api.createRetainer(retainerForm);
      if (res.success) {
        setShowRetainerModal(false);
        fetchData();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to create retainer');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#202A33]">Services & Retainers</h1>
          <p className="text-xs text-[#607274]">Manage firm service offerings, standard pricing, and recurring retainership agreements</p>
        </div>

        <div className="flex items-center gap-2">
          {tab === 'services' ? (
            <button
              onClick={() => setShowServiceModal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-[#176B57] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#135847] transition"
            >
              <Plus className="h-3.5 w-3.5" />
              + New Service
            </button>
          ) : (
            <button
              onClick={() => setShowRetainerModal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-[#176B57] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#135847] transition"
            >
              <Plus className="h-3.5 w-3.5" />
              + New Retainer
            </button>
          )}
        </div>
      </div>

      <div className="flex border-b border-[#E1E7E2] gap-6 text-xs font-semibold text-[#607274]">
        <button
          onClick={() => setTab('services')}
          className={`pb-2 transition ${tab === 'services' ? 'border-b-2 border-[#176B57] text-[#176B57]' : 'hover:text-[#202A33]'}`}
        >
          Service Catalogue
        </button>
        <button
          onClick={() => setTab('retainers')}
          className={`pb-2 transition ${tab === 'retainers' ? 'border-b-2 border-[#176B57] text-[#176B57]' : 'hover:text-[#202A33]'}`}
        >
          Active Retainer Contracts
        </button>
      </div>

      {tab === 'services' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map((s) => (
            <div key={s.id} className="caflow-card p-5 space-y-3 hover:border-[#176B57] transition">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold bg-[#E8F3EF] text-[#176B57] px-2 py-0.5 rounded">
                    {s.category}
                  </span>
                  <h3 className="font-bold text-xs text-[#202A33] mt-2">{s.name}</h3>
                </div>
                <span className="text-xs font-bold text-[#176B57]">
                  ₹{s.standardFee.toLocaleString('en-IN')}
                </span>
              </div>

              <div className="text-[11px] text-[#607274]">
                Default Turnaround: <strong>{s.defaultDueDays} Days</strong> • Frequency: {s.billingFrequency}
              </div>

              <div className="flex items-center justify-between border-t border-[#F1F4F1] pt-3 text-[11px] text-[#8C9B90]">
                <span>Active Tasks: {s._count?.tasks || 0}</span>
                <span className="text-[#16A34A] font-semibold flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Active
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="caflow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E1E7E2] bg-[#FAFBF9] text-[#607274] font-semibold uppercase tracking-wider text-[10px]">
                  <th className="p-3">Agreement No</th>
                  <th className="p-3">Client</th>
                  <th className="p-3">Service</th>
                  <th className="p-3">Monthly Fee</th>
                  <th className="p-3">Start Date</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F4F1]">
                {retainers.map((r) => (
                  <tr key={r.id} className="hover:bg-[#FAFBF9] transition">
                    <td className="p-3 font-mono font-bold text-[#176B57]">{r.agreementNo || 'RET-2026-004'}</td>
                    <td className="p-3 font-semibold text-[#202A33]">{r.client?.name}</td>
                    <td className="p-3">{r.service?.name}</td>
                    <td className="p-3 font-mono font-bold text-[#202A33]">₹{r.fee.toLocaleString('en-IN')} / mo</td>
                    <td className="p-3 font-mono text-[#607274]">{new Date(r.startDate).toLocaleDateString()}</td>
                    <td className="p-3"><span className="caflow-badge badge-completed">{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Service Modal */}
      {showServiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="caflow-card w-full max-w-md p-6 bg-white shadow-2xl rounded-xl">
            <div className="flex items-center justify-between border-b border-[#E1E7E2] pb-3 mb-4">
              <h2 className="text-base font-bold text-[#202A33]">Add New Service</h2>
              <button onClick={() => setShowServiceModal(false)}><X className="h-4 w-4 text-[#607274]" /></button>
            </div>
            <form onSubmit={handleCreateService} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">Service Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. GST Annual Audit Form 9C"
                  value={serviceForm.name}
                  onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
                  className="w-full rounded-md border border-[#E1E7E2] p-2 text-xs"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#202A33] mb-1">Category</label>
                  <select
                    value={serviceForm.category}
                    onChange={(e) => setServiceForm({ ...serviceForm, category: e.target.value })}
                    className="w-full rounded-md border border-[#E1E7E2] p-2 text-xs"
                  >
                    <option value="Direct Tax">Direct Tax</option>
                    <option value="Indirect Tax">Indirect Tax (GST)</option>
                    <option value="Audit">Statutory Audit</option>
                    <option value="ROC & MCA">ROC & MCA</option>
                    <option value="Registrations">Registrations & Licensing</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#202A33] mb-1">Standard Fee (₹)</label>
                  <input
                    type="number"
                    value={serviceForm.standardFee}
                    onChange={(e) => setServiceForm({ ...serviceForm, standardFee: Number(e.target.value) })}
                    className="w-full rounded-md border border-[#E1E7E2] p-2 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowServiceModal(false)} className="px-4 py-2 text-xs font-semibold border rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold bg-[#176B57] text-white rounded-lg shadow">Create Service</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
