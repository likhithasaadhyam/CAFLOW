import React, { useState, useEffect } from 'react';
import {
  Send,
  Bell,
  Mail,
  MessageCircle,
  Smartphone,
  CheckCircle,
  Users,
  Search,
  Filter,
} from 'lucide-react';
import { api } from '../services/api';

export const NotificationsPage: React.FC = () => {
  const [history, setHistory] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Wizard state
  const [category, setCategory] = useState('TASK');
  const [channel, setChannel] = useState('WHATSAPP');
  const [title, setTitle] = useState('Urgent: TDS 24Q Quarterly Return Details Due');
  const [message, setMessage] = useState(
    'Dear {{client_name}}, please provide your Sept 2026 salary TDS data and challans for timely filing by Oct 31.'
  );
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [hRes, cRes] = await Promise.all([
        api.getNotifications(),
        api.getClients({ limit: '100' }),
      ]);
      if (hRes.success) setHistory(hRes.data);
      if (cRes.success) {
        setClients(cRes.data);
        setSelectedClients(cRes.data.slice(0, 5).map((c: any) => c.id));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSend = async () => {
    if (selectedClients.length === 0) {
      alert('Please select at least one recipient');
      return;
    }
    setSending(true);
    try {
      const res = await api.sendNotification({
        category,
        channel,
        title,
        message,
        clientIds: selectedClients,
      });
      if (res.success) {
        setSuccessMsg(res.message);
        setTimeout(() => setSuccessMsg(''), 5000);
        fetchData();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to dispatch');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#202A33]">Send Notifications & Client Broadcasts</h1>
        <p className="text-xs text-[#607274]">
          Automated payment reminders, filing compliance alerts, and WhatsApp broadcasts
        </p>
      </div>

      {successMsg && (
        <div className="rounded-lg bg-[#DEF7EC] border border-[#BCF0DA] p-3 text-xs font-semibold text-[#03543F] flex items-center gap-2">
          <CheckCircle className="h-4 w-4" />
          {successMsg}
        </div>
      )}

      {/* 2-Column Wizard Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Message Configuration (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="caflow-card p-5 space-y-4">
            <h2 className="text-sm font-bold text-[#202A33] border-b border-[#E1E7E2] pb-2">
              1. Notification Category & Delivery Channel
            </h2>

            {/* Category Selector */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { id: 'TASK', label: 'Task Deadline', icon: Bell },
                { id: 'PAYMENT', label: 'Payment Reminder', icon: Send },
                { id: 'RENEWAL', label: 'License Renewal', icon: Bell },
                { id: 'DOCUMENT', label: 'Document Request', icon: Send },
                { id: 'GENERAL', label: 'Custom Notice', icon: MessageCircle },
              ].map((cat) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setCategory(cat.id);
                      if (cat.id === 'PAYMENT') {
                        setTitle('Payment Reminder: Outstanding Balance');
                        setMessage('Dear {{client_name}}, gentle reminder to settle outstanding professional fees of ₹14,160.');
                      } else if (cat.id === 'RENEWAL') {
                        setTitle('Registration Renewal Notice');
                        setMessage('Dear {{client_name}}, your FSSAI/DSC is due for renewal. Please submit documentation.');
                      }
                    }}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium text-left transition ${
                      category === cat.id
                        ? 'border-[#176B57] bg-[#E8F3EF] text-[#176B57] font-bold'
                        : 'border-[#E1E7E2] bg-white text-[#202A33] hover:bg-[#FAFBF9]'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Channel Selector */}
            <div>
              <label className="block text-xs font-semibold text-[#202A33] mb-1.5">Dispatch Channel</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'WHATSAPP', label: 'WhatsApp', icon: MessageCircle, color: 'text-[#16A34A]' },
                  { id: 'EMAIL', label: 'Email', icon: Mail, color: 'text-[#2563EB]' },
                  { id: 'SMS', label: 'SMS', icon: Smartphone, color: 'text-[#D97706]' },
                  { id: 'IN_APP', label: 'In-App', icon: Bell, color: 'text-[#176B57]' },
                ].map((ch) => {
                  const Icon = ch.icon;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => setChannel(ch.id)}
                      className={`flex flex-col items-center justify-center p-3 rounded-lg border text-xs transition ${
                        channel === ch.id
                          ? 'border-[#176B57] bg-[#FAFBF9] ring-1 ring-[#176B57] font-bold'
                          : 'border-[#E1E7E2] bg-white hover:bg-[#FAFBF9]'
                      }`}
                    >
                      <Icon className={`h-4 w-4 mb-1 ${ch.color}`} />
                      <span>{ch.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Subject and Message Template */}
            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">Subject / Header</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-md border border-[#E1E7E2] p-2 text-xs"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-[#202A33]">Message Template</label>
                  <span className="text-[10px] text-[#607274]">Supports {'{{client_name}}'} tag</span>
                </div>
                <textarea
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full rounded-md border border-[#E1E7E2] p-2 text-xs"
                />
              </div>
            </div>

            {/* Live Message Preview */}
            <div className="rounded-lg bg-[#FAFBF9] border border-[#E1E7E2] p-3 text-xs space-y-1">
              <span className="text-[10px] font-bold uppercase text-[#8C9B90]">Broadcast Preview</span>
              <div className="font-bold text-[#202A33]">{title}</div>
              <div className="text-[#4A5568]">{message.replace('{{client_name}}', 'A M DAIRY PRODUCTS')}</div>
            </div>
          </div>
        </div>

        {/* Right: Recipient Selection & Send (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="caflow-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E1E7E2] pb-2">
              <h2 className="text-sm font-bold text-[#202A33]">2. Recipients ({selectedClients.length})</h2>
              <button
                type="button"
                onClick={() => {
                  if (selectedClients.length === clients.length) setSelectedClients([]);
                  else setSelectedClients(clients.map(c => c.id));
                }}
                className="text-[11px] font-semibold text-[#176B57] hover:underline"
              >
                {selectedClients.length === clients.length ? 'Deselect All' : 'Select All Active'}
              </button>
            </div>

            <div className="space-y-1.5 max-h-80 overflow-y-auto border border-[#E1E7E2] rounded-lg p-2 bg-white">
              {clients.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center justify-between p-2 rounded hover:bg-[#FAFBF9] cursor-pointer text-xs"
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedClients.includes(c.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedClients([...selectedClients, c.id]);
                        else setSelectedClients(selectedClients.filter(id => id !== c.id));
                      }}
                      className="rounded border-[#C4D1C7] text-[#176B57]"
                    />
                    <div>
                      <div className="font-semibold text-[#202A33] truncate max-w-[180px]">{c.name}</div>
                      <div className="text-[10px] text-[#8C9B90]">{c.mobile || c.email || 'No contact'}</div>
                    </div>
                  </div>
                  <span className="text-[10px] bg-[#E8F3EF] text-[#176B57] px-1.5 py-0.5 rounded font-medium">
                    {c.clientType.replace('_', ' ')}
                  </span>
                </label>
              ))}
            </div>

            <button
              onClick={handleSend}
              disabled={sending || selectedClients.length === 0}
              className="w-full py-2.5 px-4 bg-[#176B57] hover:bg-[#135847] text-white font-bold text-xs rounded-lg shadow transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {sending ? 'Dispatching Broadcast...' : `Send to ${selectedClients.length} Clients`}
            </button>
          </div>
        </div>
      </div>

      {/* Broadcast History Table */}
      <div className="caflow-card p-5 space-y-3">
        <h2 className="text-sm font-bold text-[#202A33] border-b border-[#E1E7E2] pb-2">
          Recent Notification Delivery Log
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b text-[#607274] font-semibold text-[10px] uppercase">
                <th className="py-2">Sent At</th>
                <th className="py-2">Subject / Message</th>
                <th className="py-2">Channel</th>
                <th className="py-2">Category</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F4F1]">
              {history.map((h) => (
                <tr key={h.id} className="py-2">
                  <td className="py-2 font-mono text-[11px] text-[#607274]">{new Date(h.createdAt).toLocaleDateString()}</td>
                  <td className="py-2">
                    <div className="font-semibold text-[#202A33]">{h.title}</div>
                    <div className="text-[10px] text-[#8C9B90] truncate max-w-sm">{h.message}</div>
                  </td>
                  <td className="py-2 font-bold text-[10px]">{h.channel}</td>
                  <td className="py-2">{h.type}</td>
                  <td className="py-2"><span className="caflow-badge badge-completed">{h.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
