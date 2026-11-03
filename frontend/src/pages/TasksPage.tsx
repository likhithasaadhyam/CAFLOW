import React, { useState, useEffect } from 'react';
import {
  Plus,
  Download,
  RefreshCw,
  Search,
  MoreVertical,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  MessageSquare,
  CheckSquare,
} from 'lucide-react';
import { api } from '../services/api';

export const TasksPage: React.FC = () => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  // Filters
  const [dateFilter, setDateFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  // Modals
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [newComment, setNewComment] = useState('');

  // New Task form
  const [formData, setFormData] = useState({
    title: '',
    clientId: '',
    serviceId: '',
    dueDate: '2026-10-20',
    targetDate: '2026-10-20',
    priority: 'MEDIUM',
    description: '',
    assignedUserIds: [] as string[],
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (dateFilter !== 'all') params.dateRange = dateFilter;
      if (serviceFilter !== 'ALL') params.serviceId = serviceFilter;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (search) params.search = search;

      const res = await api.getTasks(params);
      if (res.success) {
        setTasks(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadMetadata = async () => {
    try {
      const [cRes, sRes, uRes] = await Promise.all([
        api.getClients({ limit: '100' }),
        api.getServices(),
        api.getUsers(),
      ]);
      if (cRes.success) setClients(cRes.data);
      if (sRes.success) setServices(sRes.data);
      if (uRes.success) setUsers(uRes.users);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadMetadata();
    // Check url search params for date
    const urlParams = new URLSearchParams(window.location.search);
    const dateParam = urlParams.get('date');
    if (dateParam) {
      setDateFilter(dateParam);
    }
    fetchTasks();
  }, [dateFilter, serviceFilter, statusFilter]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientId) {
      alert('Please select a client');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.createTask({
        ...formData,
        serviceId: formData.serviceId || null,
        checklistItems: [
          'Verify input vouchers & bank statement',
          'Prepare statutory computation working paper',
          'Perform manager review and filing',
        ],
      });
      if (res.success) {
        setShowNewModal(false);
        setFormData({
          title: '',
          clientId: '',
          serviceId: '',
          dueDate: '2026-10-20',
          targetDate: '2026-10-20',
          priority: 'MEDIUM',
          description: '',
          assignedUserIds: [],
        });
        fetchTasks();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to create task');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (taskId: string, newStatus: string) => {
    try {
      await api.updateTaskStatus(taskId, newStatus);
      fetchTasks();
      if (selectedTask && selectedTask.id === taskId) {
        const updated = await api.getTask(taskId);
        if (updated.success) setSelectedTask(updated.task);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleChecklist = async (taskId: string, itemId: string, isCompleted: boolean) => {
    try {
      await api.toggleChecklist(taskId, itemId, isCompleted);
      const updated = await api.getTask(taskId);
      if (updated.success) setSelectedTask(updated.task);
      fetchTasks();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !selectedTask) return;
    try {
      await api.addTaskComment(selectedTask.id, newComment);
      setNewComment('');
      const updated = await api.getTask(selectedTask.id);
      if (updated.success) setSelectedTask(updated.task);
    } catch (err) {
      console.error(err);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#202A33]">Tasks</h1>
          <p className="text-xs text-[#607274]">Track compliance workflows, filing deadlines, and client deliverables</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const headers = ['Date', 'Task', 'Client', 'Due Date', 'Status'];
              const rows = tasks.map(t => [formatDate(t.createdDate), `"${t.title}"`, `"${t.client?.name}"`, formatDate(t.dueDate), t.status]);
              const csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
              const link = document.createElement('a');
              link.href = encodeURI(csv);
              link.download = `Tasks_${new Date().toISOString().split('T')[0]}.csv`;
              link.click();
            }}
            className="flex items-center gap-1.5 rounded-lg border border-[#E1E7E2] bg-white px-3 py-1.5 text-xs font-semibold text-[#202A33] hover:bg-[#FAFBF9] transition"
          >
            <Download className="h-3.5 w-3.5 text-[#607274]" />
            Export
          </button>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[#176B57] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#135847] transition"
          >
            <Plus className="h-3.5 w-3.5" />
            + New
          </button>
        </div>
      </div>

      {/* Filter Bar (Matching Screenshot) */}
      <div className="caflow-card p-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Date Filter (3 Cols) */}
          <div className="md:col-span-3">
            <label className="block text-[10px] font-semibold text-[#8C9B90] uppercase mb-1">Date</label>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] py-1.5 px-3 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none"
            >
              <option value="all">All Time</option>
              <option value="today">Due Today</option>
              <option value="tomorrow">Due Tomorrow</option>
              <option value="7days">Due in 7 Days</option>
              <option value="overdue">Overdue Tasks</option>
            </select>
          </div>

          {/* Service Filter (3 Cols) */}
          <div className="md:col-span-3">
            <label className="block text-[10px] font-semibold text-[#8C9B90] uppercase mb-1">Service</label>
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] py-1.5 px-3 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none"
            >
              <option value="ALL">Select...</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Status Filter (3 Cols) */}
          <div className="md:col-span-3">
            <label className="block text-[10px] font-semibold text-[#8C9B90] uppercase mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] py-1.5 px-3 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none"
            >
              <option value="ALL">Select...</option>
              <option value="PENDING">Pending</option>
              <option value="IN_PROGRESS">In-Progress</option>
              <option value="ON_HOLD">Hold</option>
              <option value="SUBMITTED_FOR_REVIEW">Submitted for Review</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>

          {/* Action icons (3 Cols) */}
          <div className="md:col-span-3 flex items-center justify-end gap-1.5 pt-4">
            <button
              onClick={() => setShowNewModal(true)}
              className="p-1.5 rounded text-[#607274] hover:bg-[#F1F4F1] border border-[#E1E7E2]"
              title="Add"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={fetchTasks}
              className="p-1.5 rounded text-[#607274] hover:bg-[#F1F4F1] border border-[#E1E7E2]"
              title="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={fetchTasks}
              className="p-1.5 rounded bg-[#176B57] text-white hover:bg-[#135847] shadow-sm"
              title="Execute Filter"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Tasks Table (Matching Screenshot Columns) */}
      <div className="caflow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#E1E7E2] bg-[#FAFBF9] text-[#607274] font-semibold uppercase tracking-wider text-[10px]">
                <th className="p-3 w-10 text-center">
                  <input type="checkbox" className="rounded border-[#C4D1C7] text-[#176B57]" />
                </th>
                <th className="p-3">Date</th>
                <th className="p-3">Task</th>
                <th className="p-3">Client</th>
                <th className="p-3">Due Date</th>
                <th className="p-3">Target Date</th>
                <th className="p-3">Completed On</th>
                <th className="p-3">Users</th>
                <th className="p-3">Tags</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F4F1]">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-[#607274]">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#176B57] border-t-transparent" />
                      <span>Loading tasks...</span>
                    </div>
                  </td>
                </tr>
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-[#607274]">
                    No tasks found matching current filters. Click "+ New" to create a task.
                  </td>
                </tr>
              ) : (
                tasks.map((t) => (
                  <tr key={t.id} className="hover:bg-[#FAFBF9] transition group">
                    <td className="p-3 text-center">
                      <input type="checkbox" className="rounded border-[#C4D1C7] text-[#176B57]" />
                    </td>
                    <td className="p-3 font-mono text-[11px] text-[#607274]">
                      {formatDate(t.createdDate)}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => setSelectedTask(t)}
                        className="font-bold text-[#0369A1] hover:underline text-left block"
                      >
                        {t.title}
                      </button>
                      {t.reportingPeriod && (
                        <div className="text-[10px] text-[#8C9B90]">{t.reportingPeriod}</div>
                      )}
                    </td>
                    <td className="p-3 font-semibold text-[#202A33] uppercase text-[11px]">
                      {t.client?.name || '-'}
                    </td>
                    <td className="p-3 font-mono text-[11px]">
                      <span className={t.status !== 'COMPLETED' && new Date(t.dueDate) < new Date('2026-10-14') ? 'text-[#DC2626] font-bold' : 'text-[#607274]'}>
                        {formatDate(t.dueDate)}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-[11px] text-[#607274]">
                      {formatDate(t.targetDate || t.dueDate)}
                    </td>
                    <td className="p-3 font-mono text-[11px] text-[#10B981]">
                      {t.completedDate ? formatDate(t.completedDate) : '-'}
                    </td>
                    <td className="p-3">
                      <div className="flex -space-x-1.5">
                        {(t.assignments || []).length === 0 ? (
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#E2E8F0] text-[#607274] text-[9px] font-bold">
                            -
                          </div>
                        ) : (
                          t.assignments.map((a: any, i: number) => (
                            <div
                              key={i}
                              title={a.user?.fullName}
                              className={`flex h-5 w-5 items-center justify-center rounded-full text-white text-[9px] font-bold ring-1 ring-white ${
                                i % 2 === 0 ? 'bg-[#176B57]' : 'bg-[#0369A1]'
                              }`}
                            >
                              {a.user?.fullName?.charAt(0) || 'U'}
                            </div>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="text-[10px] bg-[#F1F4F1] text-[#607274] font-medium px-2 py-0.5 rounded">
                        {t.priority}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`caflow-badge ${
                          t.status === 'COMPLETED'
                            ? 'badge-completed'
                            : t.status === 'IN_PROGRESS'
                            ? 'badge-progress'
                            : t.status === 'ON_HOLD'
                            ? 'badge-hold'
                            : 'badge-pending'
                        }`}
                      >
                        {t.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="relative inline-block text-left group/action">
                        <button
                          onClick={() => setSelectedTask(t)}
                          className="p-1 rounded text-[#8C9B90] hover:text-[#202A33] hover:bg-[#F1F4F1]"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Task Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="caflow-card w-full max-w-lg p-6 bg-white shadow-2xl rounded-xl">
            <div className="flex items-center justify-between border-b border-[#E1E7E2] pb-3 mb-4">
              <h2 className="text-base font-bold text-[#202A33]">Create New Task</h2>
              <button onClick={() => setShowNewModal(false)} className="text-[#607274] hover:text-[#202A33]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. TDS 24Q Quarterly Return Preparation"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] p-2 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                  <label className="block text-xs font-semibold text-[#202A33] mb-1">Service Category</label>
                  <select
                    value={formData.serviceId}
                    onChange={(e) => setFormData({ ...formData, serviceId: e.target.value })}
                    className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] p-2 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none"
                  >
                    <option value="">Select service...</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#202A33] mb-1">Due Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value, targetDate: e.target.value })}
                    className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] p-2 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#202A33] mb-1">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] p-2 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">Assign Employees</label>
                <div className="grid grid-cols-2 gap-2 border border-[#E1E7E2] rounded-lg p-2 max-h-32 overflow-y-auto">
                  {users.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 text-xs text-[#202A33] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.assignedUserIds.includes(u.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({ ...formData, assignedUserIds: [...formData.assignedUserIds, u.id] });
                          } else {
                            setFormData({
                              ...formData,
                              assignedUserIds: formData.assignedUserIds.filter(id => id !== u.id),
                            });
                          }
                        }}
                        className="rounded border-[#C4D1C7] text-[#176B57]"
                      />
                      <span>{u.fullName}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">Workflow Notes & Scope</label>
                <textarea
                  rows={2}
                  placeholder="Add compliance notes, statutory requirements, or instructions..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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
                  {submitting ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Detail Modal with Workflow Transitions & Checklists */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="caflow-card w-full max-w-2xl bg-white shadow-2xl rounded-xl p-6 max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-start justify-between border-b border-[#E1E7E2] pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-[#E8F3EF] text-[#176B57] px-2 py-0.5 rounded">
                  {selectedTask.service?.name || 'Compliance Task'}
                </span>
                <h2 className="text-lg font-bold text-[#202A33] mt-1">{selectedTask.title}</h2>
                <div className="text-xs text-[#607274]">
                  Client: <strong className="text-[#202A33]">{selectedTask.client?.name}</strong> • Due: {formatDate(selectedTask.dueDate)}
                </div>
              </div>
              <button onClick={() => setSelectedTask(null)} className="text-[#607274] hover:text-[#202A33]">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Workflow Status Actions */}
            <div className="rounded-lg bg-[#FAFBF9] border border-[#E1E7E2] p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs">
                <span className="text-[#607274]">Current Status:</span>{' '}
                <strong className="text-[#176B57] font-bold">{selectedTask.status}</strong>
              </div>
              <div className="flex items-center gap-2">
                {selectedTask.status !== 'IN_PROGRESS' && selectedTask.status !== 'COMPLETED' && (
                  <button
                    onClick={() => handleUpdateStatus(selectedTask.id, 'IN_PROGRESS')}
                    className="px-3 py-1 bg-[#0EA5E9] text-white rounded text-xs font-semibold hover:bg-[#0284C7]"
                  >
                    Start Work
                  </button>
                )}
                {selectedTask.status === 'IN_PROGRESS' && (
                  <button
                    onClick={() => handleUpdateStatus(selectedTask.id, 'SUBMITTED_FOR_REVIEW')}
                    className="px-3 py-1 bg-[#F59E0B] text-white rounded text-xs font-semibold hover:bg-[#D97706]"
                  >
                    Submit for Review
                  </button>
                )}
                {selectedTask.status !== 'COMPLETED' && (
                  <button
                    onClick={() => handleUpdateStatus(selectedTask.id, 'COMPLETED')}
                    className="px-3 py-1 bg-[#10B981] text-white rounded text-xs font-semibold hover:bg-[#059669]"
                  >
                    Mark Approved & Completed
                  </button>
                )}
              </div>
            </div>

            {/* Checklist */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-[#202A33] flex items-center gap-1.5 uppercase tracking-wider">
                <CheckSquare className="h-3.5 w-3.5 text-[#176B57]" />
                Compliance Checklist
              </h3>
              <div className="space-y-1.5 border border-[#E1E7E2] rounded-lg p-3 bg-white">
                {(selectedTask.checklists || []).length === 0 ? (
                  <div className="text-xs text-[#8C9B90]">No checklist items configured for this task.</div>
                ) : (
                  selectedTask.checklists.map((item: any) => (
                    <label key={item.id} className="flex items-center gap-2 text-xs text-[#202A33] cursor-pointer hover:bg-[#FAFBF9] p-1 rounded">
                      <input
                        type="checkbox"
                        checked={item.isCompleted}
                        onChange={(e) => handleToggleChecklist(selectedTask.id, item.id, e.target.checked)}
                        className="rounded border-[#C4D1C7] text-[#176B57]"
                      />
                      <span className={item.isCompleted ? 'line-through text-[#94A3B8]' : 'font-medium'}>
                        {item.title}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* Comments Thread */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-[#202A33] flex items-center gap-1.5 uppercase tracking-wider">
                <MessageSquare className="h-3.5 w-3.5 text-[#176B57]" />
                Audit Comments & Discussion
              </h3>
              <div className="space-y-2 max-h-40 overflow-y-auto border border-[#E1E7E2] rounded-lg p-3 bg-[#FAFBF9]">
                {(selectedTask.comments || []).length === 0 ? (
                  <div className="text-xs text-[#8C9B90]">No comments yet.</div>
                ) : (
                  selectedTask.comments.map((comm: any) => (
                    <div key={comm.id} className="text-xs bg-white p-2 rounded border border-[#E1E7E2]">
                      <div className="flex justify-between font-bold text-[#202A33] text-[11px] mb-0.5">
                        <span>{comm.user?.fullName}</span>
                        <span className="text-[#8C9B90] font-normal">{new Date(comm.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="text-[#4A5568]">{comm.comment}</div>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleAddComment} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Write a comment or compliance note..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="flex-1 rounded-md border border-[#E1E7E2] bg-white p-2 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-[#176B57] text-white font-semibold text-xs rounded-lg hover:bg-[#135847]"
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
