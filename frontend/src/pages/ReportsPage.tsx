import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  Download,
  IndianRupee,
  Clock,
  CheckCircle2,
  Users,
  FileText,
} from 'lucide-react';
import { api } from '../services/api';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

export const ReportsPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getReportsSummary().then((r) => {
      if (r.success) setData(r.data);
      setLoading(false);
    });
  }, []);

  const formatCurrency = (amt: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amt || 0);
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#176B57] border-t-transparent" />
      </div>
    );
  }

  const kpis = data?.kpis || {};
  const workload = data?.workload || [];
  const invoiceData = [
    { name: 'Paid', value: data?.invoiceBreakdown?.paid ?? 0, color: '#10B981' },
    { name: 'Issued', value: data?.invoiceBreakdown?.issued ?? 0, color: '#0EA5E9' },
    { name: 'Partially Paid', value: data?.invoiceBreakdown?.partiallyPaid ?? 0, color: '#F59E0B' },
    { name: 'Overdue', value: data?.invoiceBreakdown?.overdue ?? 0, color: '#DC2626' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#202A33]">Reports & Financial Analytics</h1>
          <p className="text-xs text-[#607274]">Firm performance indicators, receivables ageing, and compliance statistics</p>
        </div>

        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-lg border border-[#E1E7E2] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#202A33] hover:bg-[#FAFBF9]"
        >
          <Download className="h-3.5 w-3.5 text-[#607274]" />
          Export PDF Summary
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="caflow-card p-4 space-y-1">
          <div className="text-[11px] font-semibold text-[#607274] uppercase">Task Completion Rate</div>
          <div className="text-2xl font-bold text-[#176B57]">{kpis.completionRate}%</div>
          <div className="text-[11px] text-[#8C9B90]">{kpis.completedTasks} completed / {kpis.activeTasks + kpis.completedTasks} total</div>
        </div>

        <div className="caflow-card p-4 space-y-1">
          <div className="text-[11px] font-semibold text-[#607274] uppercase">Total Fees Billed</div>
          <div className="text-2xl font-bold text-[#202A33]">{formatCurrency(kpis.totalBilled)}</div>
          <div className="text-[11px] text-[#10B981] font-semibold">Collected: {formatCurrency(kpis.totalCollected)}</div>
        </div>

        <div className="caflow-card p-4 space-y-1">
          <div className="text-[11px] font-semibold text-[#607274] uppercase">Outstanding Balance</div>
          <div className="text-2xl font-bold text-[#DC2626]">{formatCurrency(kpis.totalOutstanding)}</div>
          <div className="text-[11px] text-[#8C9B90]">Receivable from active clients</div>
        </div>

        <div className="caflow-card p-4 space-y-1">
          <div className="text-[11px] font-semibold text-[#607274] uppercase">Billable Ratio</div>
          <div className="text-2xl font-bold text-[#0284C7]">{kpis.billableRate}%</div>
          <div className="text-[11px] text-[#8C9B90]">{kpis.billableHours} hrs billable of {kpis.totalHours} hrs</div>
        </div>
      </div>

      {/* Analytics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Service Workload Bar Chart (8 Cols) */}
        <div className="lg:col-span-8 caflow-card p-5 space-y-4">
          <h2 className="text-sm font-bold text-[#202A33] border-b border-[#E1E7E2] pb-2">
            Workload Distribution by Compliance Service
          </h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workload} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <XAxis type="number" stroke="#94A3B8" fontSize={11} />
                <YAxis dataKey="service" type="category" stroke="#94A3B8" fontSize={10} width={120} tickFormatter={(val) => val.length > 18 ? `${val.substring(0, 18)}...` : val} />
                <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E1E7E2', fontSize: '11px' }} />
                <Bar dataKey="tasks" fill="#176B57" radius={[0, 4, 4, 0]} name="Assigned Tasks" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Invoice Aging Donut (4 Cols) */}
        <div className="lg:col-span-4 caflow-card p-5 space-y-4 flex flex-col justify-between">
          <h2 className="text-sm font-bold text-[#202A33] border-b border-[#E1E7E2] pb-2">
            Invoice Ageing & Status
          </h2>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={invoiceData} innerRadius={45} outerRadius={65} paddingAngle={4} dataKey="value">
                  {invoiceData.map((e, idx) => (
                    <Cell key={idx} fill={e.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5 border-t border-[#F1F4F1] pt-3 text-xs">
            {invoiceData.map((it, idx) => (
              <div key={idx} className="flex justify-between items-center">
                <span className="flex items-center gap-1.5 text-[#607274]">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: it.color }} />
                  {it.name}
                </span>
                <span className="font-bold text-[#202A33]">{it.value} Invoices</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
