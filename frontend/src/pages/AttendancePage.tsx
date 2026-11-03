import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Play,
  Square,
  ArrowRight,
  UserCheck,
  CheckCircle,
  AlertCircle,
  Coffee,
} from 'lucide-react';
import { api } from '../services/api';

export const AttendancePage: React.FC = () => {
  const [tab, setTab] = useState<'Daily' | 'Monthly'>('Daily');
  const [date, setDate] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('date') || new Date().toISOString().split('T')[0];
  });
  const [attendanceData, setAttendanceData] = useState<any[]>([]);
  const [dayOfWeek, setDayOfWeek] = useState(() => {
    return new Date().toLocaleDateString('en-US', { weekday: 'long' });
  });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const res = await api.getDailyAttendance(date);
      if (res.success) {
        setAttendanceData(res.data);
        if (res.dayOfWeek) setDayOfWeek(res.dayOfWeek);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, [date]);

  // Synchronize with Voice Assistant date filter change events
  useEffect(() => {
    const handleVoiceDateChange = (e: any) => {
      const newDate = e.detail?.date;
      if (newDate && typeof newDate === 'string') {
        setDate(newDate);
      }
    };
    window.addEventListener('caflow:attendance-date-change', handleVoiceDateChange);
    return () => {
      window.removeEventListener('caflow:attendance-date-change', handleVoiceDateChange);
    };
  }, []);

  const handleSelfCheckIn = async () => {
    setActionLoading(true);
    try {
      await api.checkIn();
      fetchAttendance();
    } catch (err: any) {
      alert(err.message || 'Check-in failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSelfCheckOut = async () => {
    setActionLoading(true);
    try {
      await api.checkOut();
      fetchAttendance();
    } catch (err: any) {
      alert(err.message || 'Check-out failed');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Page Header */}
      <div>
        <h1 className="text-xl font-bold text-[#202A33]">Attendance</h1>
        <p className="text-xs text-[#607274]">Real-time employee check-in logs, shifts, and working hours calculation</p>
      </div>

      {/* Tabs: Daily | Monthly (Matching Screenshot) */}
      <div className="flex border-b border-[#E1E7E2] gap-6 text-xs font-semibold text-[#607274]">
        <button
          onClick={() => setTab('Daily')}
          className={`pb-2 transition ${
            tab === 'Daily' ? 'border-b-2 border-[#176B57] text-[#176B57]' : 'hover:text-[#202A33]'
          }`}
        >
          Daily
        </button>
        <button
          onClick={() => setTab('Monthly')}
          className={`pb-2 transition ${
            tab === 'Monthly' ? 'border-b-2 border-[#176B57] text-[#176B57]' : 'hover:text-[#202A33]'
          }`}
        >
          Monthly
        </button>
      </div>

      {/* Date Filter Bar (Matching Screenshot) */}
      <div className="caflow-card p-4">
        <div className="flex items-center gap-3 max-w-sm">
          <div className="flex-1">
            <label className="block text-[10px] font-semibold text-[#8C9B90] uppercase mb-1">Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#8C9B90]" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-md border border-[#E1E7E2] bg-[#FAFBF9] py-1.5 pl-9 pr-3 text-xs text-[#202A33] font-mono focus:border-[#176B57] focus:outline-none"
              />
            </div>
          </div>
          <button
            onClick={fetchAttendance}
            className="mt-5 p-2 rounded-lg bg-[#176B57] text-white hover:bg-[#135847] shadow-sm"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Day Badge (Matching Screenshot) */}
      <div className="inline-block rounded-md bg-[#0284C7] px-3 py-1 text-xs font-bold text-white shadow-xs">
        {dayOfWeek}
      </div>

      {/* Attendance List (Matching Screenshot) */}
      <div className="caflow-card divide-y divide-[#F1F4F1] overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-[#607274] text-xs">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#176B57] border-t-transparent mx-auto mb-2" />
            Loading attendance records...
          </div>
        ) : attendanceData.length === 0 ? (
          <div className="py-12 text-center text-[#607274] text-xs">No employees found.</div>
        ) : (
          attendanceData.map((item) => (
            <div
              key={item.user.id}
              className="flex items-center justify-between p-4 hover:bg-[#FAFBF9] transition"
            >
              {/* Left: Avatar & Name */}
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#64748B] text-white font-bold text-xs shadow-xs">
                  {item.user.fullName.charAt(0)}
                </div>
                <div>
                  <div className="font-bold text-xs text-[#202A33]">{item.user.fullName}</div>
                  <div className="text-[11px] text-[#607274]">
                    {item.user.designation || 'Staff'} • {item.user.department || 'Audit'}
                  </div>
                </div>
              </div>

              {/* Middle: Work Duration and Timestamps */}
              <div className="hidden sm:flex items-center gap-4 text-xs">
                {item.checkInTime && (
                  <div className="text-[#607274]">
                    In: <strong className="text-[#202A33]">{new Date(item.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
                  </div>
                )}
                {item.checkOutTime && (
                  <div className="text-[#607274]">
                    Out: <strong className="text-[#202A33]">{new Date(item.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
                  </div>
                )}
                {item.totalWorkingMinutes > 0 && (
                  <div className="rounded bg-[#E8F3EF] px-2 py-0.5 text-[11px] font-bold text-[#176B57]">
                    {item.formattedWorkingTime}
                  </div>
                )}
              </div>

              {/* Right: Status Pill & Action Button (Matching Screenshot) */}
              <div className="flex items-center gap-3">
                {item.status === 'NOT_MARKED' ? (
                  <span className="text-xs font-semibold text-[#DC2626] bg-[#FEE2E2] px-2.5 py-0.5 rounded">
                    Not Marked
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-[#16A34A] bg-[#DCFCE7] px-2.5 py-0.5 rounded">
                    {item.status}
                  </span>
                )}

                {item.isCheckedIn ? (
                  <button
                    onClick={handleSelfCheckOut}
                    disabled={actionLoading}
                    className="flex items-center gap-1.5 rounded-lg bg-[#DC2626] px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#B91C1C] transition"
                  >
                    <Square className="h-3.5 w-3.5" />
                    Check Out
                  </button>
                ) : (
                  <button
                    onClick={handleSelfCheckIn}
                    disabled={actionLoading}
                    className="flex items-center gap-1.5 rounded-lg bg-[#0284C7] px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#0369A1] transition"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Check In
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
