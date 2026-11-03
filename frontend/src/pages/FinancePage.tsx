import React, { useState, useEffect } from 'react';
import {
  IndianRupee,
  Plus,
  RefreshCw,
  Search,
  CheckCircle,
  FileText,
  Download,
  X,
  CreditCard,
  Building,
} from 'lucide-react';
import { api } from '../services/api';

export const FinancePage: React.FC = () => {
  const [tab, setTab] = useState<'invoices' | 'payments' | 'expenses'>('invoices');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // New Invoice Form
  const [invoiceForm, setInvoiceForm] = useState({
    clientId: '',
    invoiceDate: '2026-10-14',
    dueDate: '2026-10-31',
    notes: 'Professional services for CA audit and compliance filings.',
    lineItems: [
      { description: 'GST Monthly Retainer & GSTR-3B Filing', quantity: 1, unitPrice: 4000, taxRate: 18, discount: 0 },
      { description: 'TDS 24Q Quarterly Return Preparation', quantity: 1, unitPrice: 3500, taxRate: 18, discount: 0 },
    ],
  });

  // Record Payment Form
  const [paymentForm, setPaymentForm] = useState({
    clientId: '',
    invoiceId: '',
    amount: 14160,
    paymentMode: 'BANK_TRANSFER',
    referenceNumber: '',
    notes: 'Received via NEFT in current account',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      if (tab === 'invoices') {
        const res = await api.getInvoices();
        if (res.success) setInvoices(res.data);
      } else if (tab === 'payments') {
        const res = await api.getPayments();
        if (res.success) setPayments(res.data);
      } else {
        const res = await api.getExpenses();
        if (res.success) setExpenses(res.data);
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
  }, [tab]);

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceForm.clientId) {
      alert('Please select a client');
      return;
    }
    try {
      const res = await api.createInvoice(invoiceForm);
      if (res.success) {
        setShowInvoiceModal(false);
        fetchData();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to create invoice');
    }
  };

  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentForm.clientId) {
      alert('Please select a client');
      return;
    }
    try {
      const res = await api.createPayment(paymentForm);
      if (res.success) {
        setShowPaymentModal(false);
        fetchData();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to record payment');
    }
  };

  const formatCurrency = (amt: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amt);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#202A33]">Finance & Billing</h1>
          <p className="text-xs text-[#607274]">Manage client billing, GST invoices, payment receipts, and expenses</p>
        </div>

        <div className="flex items-center gap-2">
          {tab === 'invoices' && (
            <button
              onClick={() => setShowInvoiceModal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-[#176B57] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#135847] transition"
            >
              <Plus className="h-3.5 w-3.5" />
              + Create Invoice
            </button>
          )}
          {tab === 'payments' && (
            <button
              onClick={() => setShowPaymentModal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-[#176B57] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#135847] transition"
            >
              <Plus className="h-3.5 w-3.5" />
              + Record Receipt
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#E1E7E2] gap-6 text-xs font-semibold text-[#607274]">
        <button
          onClick={() => setTab('invoices')}
          className={`pb-2 transition ${tab === 'invoices' ? 'border-b-2 border-[#176B57] text-[#176B57]' : 'hover:text-[#202A33]'}`}
        >
          Invoices
        </button>
        <button
          onClick={() => setTab('payments')}
          className={`pb-2 transition ${tab === 'payments' ? 'border-b-2 border-[#176B57] text-[#176B57]' : 'hover:text-[#202A33]'}`}
        >
          Receipts & Payments
        </button>
        <button
          onClick={() => setTab('expenses')}
          className={`pb-2 transition ${tab === 'expenses' ? 'border-b-2 border-[#176B57] text-[#176B57]' : 'hover:text-[#202A33]'}`}
        >
          Office Expenses
        </button>
      </div>

      {/* INVOICES LIST */}
      {tab === 'invoices' && (
        <div className="caflow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E1E7E2] bg-[#FAFBF9] text-[#607274] font-semibold uppercase tracking-wider text-[10px]">
                  <th className="p-3">Invoice No</th>
                  <th className="p-3">Client</th>
                  <th className="p-3">Invoice Date</th>
                  <th className="p-3">Due Date</th>
                  <th className="p-3 text-right">Subtotal</th>
                  <th className="p-3 text-right">Tax (GST)</th>
                  <th className="p-3 text-right">Total Amount</th>
                  <th className="p-3 text-right">Paid</th>
                  <th className="p-3 text-right">Balance</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F4F1]">
                {loading ? (
                  <tr><td colSpan={10} className="py-12 text-center text-[#607274]">Loading invoices...</td></tr>
                ) : invoices.length === 0 ? (
                  <tr><td colSpan={10} className="py-12 text-center text-[#607274]">No invoices found.</td></tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-[#FAFBF9] transition">
                      <td className="p-3 font-mono font-bold text-[#176B57]">{inv.invoiceNumber}</td>
                      <td className="p-3 font-semibold text-[#202A33]">{inv.client?.name}</td>
                      <td className="p-3 font-mono text-[11px] text-[#607274]">{new Date(inv.invoiceDate).toLocaleDateString()}</td>
                      <td className="p-3 font-mono text-[11px] text-[#607274]">{new Date(inv.dueDate).toLocaleDateString()}</td>
                      <td className="p-3 text-right font-mono text-[#607274]">{formatCurrency(inv.subtotal)}</td>
                      <td className="p-3 text-right font-mono text-[#607274]">{formatCurrency(inv.taxTotal)}</td>
                      <td className="p-3 text-right font-mono font-bold text-[#202A33]">{formatCurrency(inv.totalAmount)}</td>
                      <td className="p-3 text-right font-mono text-[#10B981] font-semibold">{formatCurrency(inv.amountPaid)}</td>
                      <td className="p-3 text-right font-mono font-bold text-[#DC2626]">{formatCurrency(inv.balanceDue)}</td>
                      <td className="p-3">
                        <span className={`caflow-badge ${inv.paymentStatus === 'PAID' ? 'badge-completed' : 'badge-pending'}`}>
                          {inv.paymentStatus}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PAYMENTS LIST */}
      {tab === 'payments' && (
        <div className="caflow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E1E7E2] bg-[#FAFBF9] text-[#607274] font-semibold uppercase tracking-wider text-[10px]">
                  <th className="p-3">Receipt No</th>
                  <th className="p-3">Client</th>
                  <th className="p-3">Payment Date</th>
                  <th className="p-3">Mode</th>
                  <th className="p-3">Ref No (UTR)</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3">Recorded By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F4F1]">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-[#FAFBF9] transition">
                    <td className="p-3 font-mono font-bold text-[#176B57]">{p.receiptNumber}</td>
                    <td className="p-3 font-semibold text-[#202A33]">{p.client?.name}</td>
                    <td className="p-3 font-mono text-[11px] text-[#607274]">{new Date(p.paymentDate).toLocaleDateString()}</td>
                    <td className="p-3"><span className="text-[10px] bg-[#E8F3EF] text-[#176B57] px-2 py-0.5 rounded font-bold">{p.paymentMode}</span></td>
                    <td className="p-3 font-mono text-[11px] text-[#607274]">{p.referenceNumber || '-'}</td>
                    <td className="p-3 text-right font-mono font-bold text-[#10B981]">{formatCurrency(p.amount)}</td>
                    <td className="p-3 text-[#607274]">{p.recordedBy?.fullName || 'Finance Controller'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* EXPENSES LIST */}
      {tab === 'expenses' && (
        <div className="caflow-card p-6 text-center text-xs text-[#607274]">
          <IndianRupee className="h-8 w-8 text-[#C4D1C7] mx-auto mb-2" />
          No recent operational expenses logged for this month.
        </div>
      )}

      {/* New Invoice Modal */}
      {showInvoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="caflow-card w-full max-w-lg p-6 bg-white shadow-2xl rounded-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E1E7E2] pb-3 mb-4">
              <h2 className="text-base font-bold text-[#202A33]">Create New Invoice</h2>
              <button onClick={() => setShowInvoiceModal(false)}><X className="h-4 w-4 text-[#607274]" /></button>
            </div>
            <form onSubmit={handleCreateInvoice} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">Client *</label>
                <select
                  required
                  value={invoiceForm.clientId}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, clientId: e.target.value })}
                  className="w-full rounded-md border border-[#E1E7E2] p-2 text-xs"
                >
                  <option value="">Select client...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#202A33] mb-1">Invoice Date</label>
                  <input
                    type="date"
                    value={invoiceForm.invoiceDate}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceDate: e.target.value })}
                    className="w-full rounded-md border border-[#E1E7E2] p-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#202A33] mb-1">Due Date</label>
                  <input
                    type="date"
                    value={invoiceForm.dueDate}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })}
                    className="w-full rounded-md border border-[#E1E7E2] p-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">Line Items</label>
                {invoiceForm.lineItems.map((item, idx) => (
                  <div key={idx} className="flex gap-2 mb-2 items-center">
                    <input
                      type="text"
                      placeholder="Service description"
                      value={item.description}
                      onChange={(e) => {
                        const copy = [...invoiceForm.lineItems];
                        copy[idx].description = e.target.value;
                        setInvoiceForm({ ...invoiceForm, lineItems: copy });
                      }}
                      className="flex-1 rounded-md border border-[#E1E7E2] p-1.5 text-xs"
                    />
                    <input
                      type="number"
                      placeholder="Fee (₹)"
                      value={item.unitPrice}
                      onChange={(e) => {
                        const copy = [...invoiceForm.lineItems];
                        copy[idx].unitPrice = Number(e.target.value);
                        setInvoiceForm({ ...invoiceForm, lineItems: copy });
                      }}
                      className="w-24 rounded-md border border-[#E1E7E2] p-1.5 text-xs font-mono"
                    />
                    <span className="text-[10px] text-[#607274]">+18% GST</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button type="button" onClick={() => setShowInvoiceModal(false)} className="px-4 py-2 text-xs font-semibold border rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold bg-[#176B57] text-white rounded-lg shadow">Generate Invoice</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
