import React, { useState, useEffect } from 'react';
import {
  Settings,
  Building,
  Users,
  Shield,
  Save,
  CheckCircle,
} from 'lucide-react';
import { api } from '../services/api';

export const SettingsPage: React.FC = () => {
  const [tab, setTab] = useState<'firm' | 'team'>('firm');
  const [org, setOrg] = useState<any>(null);
  const [team, setTeam] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedMsg, setSavedMsg] = useState('');

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    gstin: '',
    pan: '',
    address: '',
    website: '',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [oRes, tRes] = await Promise.all([
        api.getOrganizationSettings(),
        api.getTeam(),
      ]);
      if (oRes.success && oRes.organization) {
        setOrg(oRes.organization);
        setForm({
          name: oRes.organization.name || '',
          email: oRes.organization.email || '',
          phone: oRes.organization.phone || '',
          gstin: oRes.organization.gstin || '',
          pan: oRes.organization.pan || '',
          address: oRes.organization.address || '',
          website: oRes.organization.website || '',
        });
      }
      if (tRes.success) setTeam(tRes.team);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.updateOrganizationSettings(form);
      if (res.success) {
        setSavedMsg('Firm configuration saved successfully!');
        setTimeout(() => setSavedMsg(''), 4000);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to save settings');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[#202A33]">Settings & Firm Administration</h1>
        <p className="text-xs text-[#607274]">Manage firm details, tax identifiers, and staff user access</p>
      </div>

      <div className="flex border-b border-[#E1E7E2] gap-6 text-xs font-semibold text-[#607274]">
        <button
          onClick={() => setTab('firm')}
          className={`pb-2 transition ${tab === 'firm' ? 'border-b-2 border-[#176B57] text-[#176B57]' : 'hover:text-[#202A33]'}`}
        >
          Firm Profile & Tax IDs
        </button>
        <button
          onClick={() => setTab('team')}
          className={`pb-2 transition ${tab === 'team' ? 'border-b-2 border-[#176B57] text-[#176B57]' : 'hover:text-[#202A33]'}`}
        >
          User & Team Management
        </button>
      </div>

      {savedMsg && (
        <div className="rounded-lg bg-[#DEF7EC] border border-[#BCF0DA] p-3 text-xs font-semibold text-[#03543F] flex items-center gap-2">
          <CheckCircle className="h-4 w-4" />
          {savedMsg}
        </div>
      )}

      {tab === 'firm' ? (
        <div className="caflow-card p-6 max-w-2xl bg-white space-y-4">
          <h2 className="text-sm font-bold text-[#202A33] border-b border-[#E1E7E2] pb-2">
            Chartered Accountant Firm Information
          </h2>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#202A33] mb-1">Firm Name</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] p-2 text-xs text-[#202A33] font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">Firm GSTIN</label>
                <input
                  type="text"
                  value={form.gstin}
                  onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                  className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] p-2 text-xs font-mono uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">Firm PAN</label>
                <input
                  type="text"
                  value={form.pan}
                  onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })}
                  className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] p-2 text-xs font-mono uppercase"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">Official Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] p-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">Phone</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] p-2 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#202A33] mb-1">Office Address</label>
              <textarea
                rows={2}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] p-2 text-xs"
              />
            </div>

            <div className="flex justify-end pt-3 border-t">
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 bg-[#176B57] text-white font-bold text-xs rounded-lg shadow hover:bg-[#135847]"
              >
                <Save className="h-4 w-4" />
                Save Changes
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="caflow-card overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b bg-[#FAFBF9] text-[#607274] font-semibold text-[10px] uppercase">
                <th className="p-3">Staff Member</th>
                <th className="p-3">Email</th>
                <th className="p-3">Designation</th>
                <th className="p-3">Role</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F4F1]">
              {team.map((u) => (
                <tr key={u.id} className="hover:bg-[#FAFBF9]">
                  <td className="p-3 font-bold text-[#202A33] flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#176B57] text-white text-[10px] font-bold">
                      {u.fullName.charAt(0)}
                    </div>
                    {u.fullName}
                  </td>
                  <td className="p-3 text-[#607274]">{u.email}</td>
                  <td className="p-3 text-[#4A5568]">{u.designation || 'Staff'}</td>
                  <td className="p-3"><span className="text-[10px] font-bold bg-[#E8F3EF] text-[#176B57] px-2 py-0.5 rounded">{u.role}</span></td>
                  <td className="p-3"><span className="caflow-badge badge-completed">{u.isActive ? 'Active' : 'Inactive'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
