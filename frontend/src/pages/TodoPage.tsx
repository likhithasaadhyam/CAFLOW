import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  Trash2,
  X,
  FileCheck,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { api } from '../services/api';

export const TodoPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlView = searchParams.get('view') || 'all';
  const urlStatus = searchParams.get('status') || 'ALL';

  const [todos, setTodos] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState(urlStatus);
  const [viewTab, setViewTab] = useState<'all' | 'today' | 'upcoming' | 'completed' | 'overdue'>(
    ['all', 'today', 'upcoming', 'completed', 'overdue'].includes(urlView) ? (urlView as any) : 'all'
  );
  const [showNewModal, setShowNewModal] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    category: 'General',
    priority: 'MEDIUM',
    dueDate: '2026-10-14',
    description: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchTodos = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (categoryFilter !== 'ALL') params.category = categoryFilter;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (viewTab !== 'all') params.view = viewTab;

      const res = await api.getTodos(params);
      if (res.success) {
        setTodos(res.data);
        if (res.categories) setCategories(res.categories);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const v = searchParams.get('view');
    if (v && ['all', 'today', 'upcoming', 'completed', 'overdue'].includes(v)) {
      setViewTab(v as any);
    }
    const s = searchParams.get('status');
    if (s) {
      setStatusFilter(s);
    }
  }, [searchParams]);

  useEffect(() => {
    const handleTodoCreated = () => {
      fetchTodos();
    };
    window.addEventListener('caflow:todo-created', handleTodoCreated);
    window.addEventListener('caflow:todo-updated', handleTodoCreated);
    return () => {
      window.removeEventListener('caflow:todo-created', handleTodoCreated);
      window.removeEventListener('caflow:todo-updated', handleTodoCreated);
    };
  }, []);

  useEffect(() => {
    fetchTodos();
  }, [categoryFilter, statusFilter, viewTab]);

  const handleToggle = async (id: string) => {
    try {
      await api.toggleTodo(id);
      fetchTodos();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this item?')) return;
    try {
      await api.deleteTodo(id);
      fetchTodos();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.createTodo(formData);
      if (res.success) {
        setShowNewModal(false);
        setFormData({
          title: '',
          category: 'General',
          priority: 'MEDIUM',
          dueDate: '2026-10-14',
          description: '',
        });
        fetchTodos();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to create todo');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#202A33]">To-Do</h1>
          <p className="text-xs text-[#607274]">Manage daily personal and team reminders, calls, and follow-ups</p>
        </div>

        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-1.5 rounded-lg bg-[#176B57] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#135847] transition"
        >
          <Plus className="h-3.5 w-3.5" />
          + New
        </button>
      </div>

      {/* Filter Bar (Matching Screenshot) */}
      <div className="caflow-card p-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Creation Date (3 Cols) */}
          <div className="md:col-span-3">
            <label className="block text-[10px] font-semibold text-[#8C9B90] uppercase mb-1">Creation Date</label>
            <select className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] py-1.5 px-3 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none">
              <option>All Time</option>
              <option>Today</option>
              <option>This Week</option>
            </select>
          </div>

          {/* Due Date (3 Cols) */}
          <div className="md:col-span-3">
            <label className="block text-[10px] font-semibold text-[#8C9B90] uppercase mb-1">Due Date</label>
            <select
              value={viewTab}
              onChange={(e: any) => {
                const nextVal = e.target.value;
                setViewTab(nextVal);
                setSearchParams((prev) => {
                  const p = new URLSearchParams(prev);
                  if (nextVal === 'all') p.delete('view');
                  else p.set('view', nextVal);
                  return p;
                });
              }}
              className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] py-1.5 px-3 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="upcoming">Upcoming</option>
              <option value="overdue">Overdue</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Category Filter (4 Cols) */}
          <div className="md:col-span-4">
            <label className="block text-[10px] font-semibold text-[#8C9B90] uppercase mb-1">Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] py-1.5 px-3 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none"
            >
              <option value="ALL">All Categories</option>
              <option value="Calls">Calls</option>
              <option value="Review">Review</option>
              <option value="Follow-up">Follow-up</option>
              <option value="Admin">Admin</option>
              <option value="General">General</option>
            </select>
          </div>

          {/* Action icons (2 Cols) */}
          <div className="md:col-span-2 flex items-center justify-end gap-1.5 pt-4">
            <button
              onClick={() => setShowNewModal(true)}
              className="p-1.5 rounded text-[#607274] hover:bg-[#F1F4F1] border border-[#E1E7E2]"
              title="Add"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={fetchTodos}
              className="p-1.5 rounded text-[#607274] hover:bg-[#F1F4F1] border border-[#E1E7E2]"
              title="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={fetchTodos}
              className="p-1.5 rounded bg-[#176B57] text-white hover:bg-[#135847] shadow-sm"
              title="Filter"
            >
              <Search className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main List Area */}
      <div className="caflow-card min-h-[300px] p-6">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#176B57] border-t-transparent" />
          </div>
        ) : todos.length === 0 ? (
          /* Empty state matching Screenshot */
          <div className="flex flex-col items-center justify-center py-16 text-center text-[#8C9B90]">
            <FileCheck className="h-10 w-10 text-[#C4D1C7] mb-2 stroke-1" />
            <div className="text-xs font-medium">There are no To-Do</div>
          </div>
        ) : (
          <div className="divide-y divide-[#F1F4F1]">
            {todos.map((todo) => (
              <div
                key={todo.id}
                className="flex items-center justify-between py-3 px-2 hover:bg-[#FAFBF9] rounded-lg transition group"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={todo.status === 'COMPLETED'}
                    onChange={() => handleToggle(todo.id)}
                    className="h-4 w-4 rounded border-[#C4D1C7] text-[#176B57] focus:ring-[#176B57]"
                  />
                  <div>
                    <div
                      className={`text-xs font-semibold ${
                        todo.status === 'COMPLETED' ? 'line-through text-[#94A3B8]' : 'text-[#202A33]'
                      }`}
                    >
                      {todo.title}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-[#607274]">
                      <span className="bg-[#E8F3EF] text-[#176B57] px-2 py-0.2 rounded font-medium text-[10px]">
                        {todo.category}
                      </span>
                      {todo.dueDate && (
                        <span className="flex items-center gap-1 font-mono text-[10px]">
                          <Calendar className="h-3 w-3" />
                          {new Date(todo.dueDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      todo.priority === 'HIGH'
                        ? 'bg-[#FEE2E2] text-[#DC2626]'
                        : todo.priority === 'MEDIUM'
                        ? 'bg-[#FEF3C7] text-[#D97706]'
                        : 'bg-[#F1F5F9] text-[#64748B]'
                    }`}
                  >
                    {todo.priority}
                  </span>
                  <button
                    onClick={() => handleDelete(todo.id)}
                    className="p-1 text-[#C4D1C7] hover:text-[#DC2626] opacity-0 group-hover:opacity-100 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New To-Do Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="caflow-card w-full max-w-md p-6 bg-white shadow-2xl rounded-xl">
            <div className="flex items-center justify-between border-b border-[#E1E7E2] pb-3 mb-4">
              <h2 className="text-base font-bold text-[#202A33]">Add To-Do Item</h2>
              <button onClick={() => setShowNewModal(false)} className="text-[#607274] hover:text-[#202A33]">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">To-Do Description *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Call client regarding signature on form 3CD"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] p-2 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#202A33] mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] p-2 text-xs text-[#202A33] focus:border-[#176B57] focus:outline-none"
                  >
                    <option value="Calls">Calls</option>
                    <option value="Review">Review</option>
                    <option value="Follow-up">Follow-up</option>
                    <option value="Admin">Admin</option>
                    <option value="General">General</option>
                  </select>
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
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#202A33] mb-1">Due Date</label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
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
                  {submitting ? 'Adding...' : 'Add To-Do'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
