import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Clock,
  Bell,
  HelpCircle,
  ChevronDown,
  Sparkles,
  Building2,
  User,
  LogOut,
  Briefcase,
  Calendar,
  IndianRupee,
  Shield,
  FileText,
  CheckCheck,
  CheckSquare,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';

interface NavbarProps {
  onToggleSidebar: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [filterTab, setFilterTab] = useState<'ALL' | 'UNREAD'>('ALL');
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}-${month}-${d.getFullYear()}`;
  });

  const fetchInAppNotifications = async () => {
    try {
      const res = await api.getInAppNotifications();
      if (res && res.success) {
        setNotifications(res.data || []);
        setUnreadCount(res.unreadCount || 0);
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  };

  useEffect(() => {
    fetchInAppNotifications();
    const interval = setInterval(fetchInAppNotifications, 20000);
    return () => clearInterval(interval);
  }, []);

  const handleNotificationClick = async (notif: any) => {
    try {
      if (notif.status === 'UNREAD') {
        api.markNotificationRead(notif.id).catch(() => {});
        setNotifications(prev =>
          prev.map(n => (n.id === notif.id ? { ...n, status: 'READ' } : n))
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch {}

    setShowNotifications(false);
    if (notif.link) {
      navigate(notif.link);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, status: 'READ' })));
      setUnreadCount(0);
    } catch (err) {
      console.error(err);
    }
  };

  const getCategoryMeta = (cat: string) => {
    switch (cat?.toUpperCase()) {
      case 'TASK':
        return { icon: Briefcase, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', label: 'Task' };
      case 'ATTENDANCE':
        return { icon: Clock, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Attendance' };
      case 'TODO':
        return { icon: CheckSquare, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', label: 'To-Do' };
      case 'PAYMENT':
        return { icon: IndianRupee, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', label: 'Finance' };
      case 'RENEWAL':
        return { icon: Shield, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200', label: 'Renewal' };
      case 'DOCUMENT':
        return { icon: FileText, color: 'text-cyan-600', bg: 'bg-cyan-50', border: 'border-cyan-200', label: 'Document' };
      default:
        return { icon: Bell, color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200', label: 'Update' };
    }
  };

  const displayedNotifications = filterTab === 'UNREAD'
    ? notifications.filter(n => n.status === 'UNREAD')
    : notifications;

  useEffect(() => {
    const updateDate = () => {
      const d = new Date();
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      setCurrentDate(`${day}-${month}-${d.getFullYear()}`);
    };
    const timer = setInterval(updateDate, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await api.getClients({ search: searchQuery, limit: '5' });
        if (res.success) {
          setSearchResults(res.data);
          setShowResults(true);
        }
      } catch (err) {
        console.error(err);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-[#E1E7E2] bg-white px-4 shadow-sm">
      {/* Left: Brand & Search */}
      <div className="flex items-center gap-4 flex-1 max-w-2xl">
        <button
          onClick={onToggleSidebar}
          className="rounded-lg p-2 text-[#202A33] hover:bg-[#F7F8F5] transition"
          aria-label="Toggle Navigation"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Brand */}
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/dashboard')}>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#176B57] text-white font-bold text-lg shadow-sm">
            CF
          </div>
          <div className="hidden sm:block">
            <div className="font-bold text-[#202A33] text-lg leading-tight tracking-tight flex items-center gap-1">
              CAFlow
              <span className="text-[10px] font-semibold bg-[#E8F3EF] text-[#176B57] px-1.5 py-0.5 rounded uppercase">PRO</span>
            </div>
            <div className="text-[10px] text-[#607274] font-medium leading-none">Office Management</div>
          </div>
        </div>

        {/* Global Client Search */}
        <div className="relative flex-1 ml-4 hidden md:block">
          <div className="relative flex items-center">
            <Search className="absolute left-3 h-4 w-4 text-[#8C9B90]" />
            <input
              type="text"
              placeholder="Search Clients (Name, File No, Mobile, Email, PAN, GST)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchQuery.trim() && setShowResults(true)}
              className="w-full rounded-md border border-[#D5DED7] bg-[#FAFBF9] py-1.5 pl-9 pr-4 text-xs text-[#263238] placeholder-[#8C9B90] focus:border-[#176B57] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#176B57]"
            />
          </div>

          {/* Search Dropdown */}
          {showResults && searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-10 mt-1 max-h-72 overflow-y-auto rounded-lg border border-[#E1E7E2] bg-white py-1 shadow-lg z-50">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-[#8C9B90] uppercase tracking-wider">
                Matching Clients
              </div>
              {searchResults.map((client) => (
                <div
                  key={client.id}
                  onClick={() => {
                    navigate(`/clients/${client.id}`);
                    setShowResults(false);
                    setSearchQuery('');
                  }}
                  className="flex items-center justify-between px-3 py-2 text-xs hover:bg-[#F7F8F5] cursor-pointer border-b border-[#F1F4F1] last:border-none"
                >
                  <div>
                    <div className="font-semibold text-[#202A33]">{client.name}</div>
                    <div className="text-[11px] text-[#607274]">
                      {client.fileNo || 'No File'} • {client.clientType} • {client.pan || 'No PAN'}
                    </div>
                  </div>
                  <span className="text-[10px] font-medium bg-[#E8F3EF] text-[#176B57] px-2 py-0.5 rounded-full">
                    {client.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Firm Organization, Alerts, Profile */}
      <div className="flex items-center gap-3">
        {/* Organization Name */}
        <div className="hidden lg:flex items-center gap-2 rounded-md bg-[#F1F5F2] px-3 py-1 text-xs font-semibold text-[#202A33]">
          <Building2 className="h-3.5 w-3.5 text-[#176B57]" />
          <span>{user?.organization?.name || 'MANAVI ASSOCIATES'}</span>
        </div>

        {/* What's New Pill */}
        <button
          onClick={() => navigate('/renewals')}
          className="hidden sm:flex items-center gap-1 rounded-full bg-[#E0F2FE] px-2.5 py-1 text-[11px] font-semibold text-[#0369A1] hover:bg-[#BAE6FD] transition"
        >
          <Sparkles className="h-3 w-3 text-[#0284C7]" />
          What's new
        </button>

        {/* Clock/Date Indicator */}
        <div className="flex items-center text-xs text-[#607274] bg-[#FAFBF9] px-2.5 py-1 rounded border border-[#E1E7E2]" title="Current Financial Date">
          <Clock className="h-3.5 w-3.5 mr-1 text-[#176B57]" />
          <span className="font-medium text-[#202A33]">{currentDate}</span>
        </div>

        {/* Notifications Icon with Dynamic Badge */}
        <div className="relative">
          <button
            id="navbar-notification-btn"
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative rounded-lg p-2 text-[#607274] hover:bg-[#F7F8F5] transition"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#EF4444] px-1 text-[9px] font-bold text-white shadow-sm">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowNotifications(false)}
              />
              <div
                id="navbar-notification-dropdown"
                className="absolute right-0 top-11 mt-1 w-80 sm:w-96 rounded-xl border border-[#E1E7E2] bg-white p-3 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-100"
              >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#F1F4F1] pb-2.5 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#202A33]">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="text-[10px] bg-[#E8F3EF] text-[#176B57] font-bold px-1.5 py-0.5 rounded-full">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-[10px] text-[#176B57] hover:underline font-semibold flex items-center gap-1"
                    >
                      <CheckCheck className="w-3 h-3" />
                      Mark all read
                    </button>
                  )}
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex gap-1.5 mb-2 border-b border-[#F1F4F1] pb-2 text-[11px]">
                <button
                  onClick={() => setFilterTab('ALL')}
                  className={`px-2 py-0.5 rounded font-medium transition ${
                    filterTab === 'ALL'
                      ? 'bg-[#176B57] text-white'
                      : 'text-[#607274] hover:bg-[#F7F8F5]'
                  }`}
                >
                  All ({notifications.length})
                </button>
                <button
                  onClick={() => setFilterTab('UNREAD')}
                  className={`px-2 py-0.5 rounded font-medium transition ${
                    filterTab === 'UNREAD'
                      ? 'bg-[#176B57] text-white'
                      : 'text-[#607274] hover:bg-[#F7F8F5]'
                  }`}
                >
                  Unread ({unreadCount})
                </button>
              </div>

              {/* Notifications List */}
              <div className="divide-y divide-[#F1F4F1] max-h-80 overflow-y-auto">
                {displayedNotifications.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#607274]">
                    <Bell className="w-7 h-7 mx-auto text-[#C2C9C3] mb-2 opacity-60" />
                    No notifications to show. You're all caught up!
                  </div>
                ) : (
                  displayedNotifications.map((notif) => {
                    const meta = getCategoryMeta(notif.category);
                    const IconComponent = meta.icon;
                    const isUnread = notif.status === 'UNREAD';

                    return (
                      <div
                        key={notif.id}
                        onClick={() => handleNotificationClick(notif)}
                        className={`py-2.5 px-2 rounded-lg flex items-start gap-2.5 cursor-pointer transition relative group ${
                          isUnread
                            ? 'bg-[#F9FCFA] hover:bg-[#F0F7F4]'
                            : 'hover:bg-[#FAFBF9]'
                        }`}
                      >
                        {/* Icon Badge */}
                        <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${meta.bg} ${meta.color} border ${meta.border}`}>
                          <IconComponent className="w-3.5 h-3.5" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 text-xs">
                          <div className="flex items-center justify-between gap-1">
                            <span className={`truncate ${isUnread ? 'font-bold text-[#202A33]' : 'font-medium text-[#4B5563]'}`}>
                              {notif.title}
                            </span>
                            <span className="text-[10px] text-[#8C9B90] shrink-0 font-medium">
                              {notif.relativeTime}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#607274] line-clamp-2 mt-0.5 leading-snug">
                            {notif.message}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${meta.bg} ${meta.color}`}>
                              {meta.label}
                            </span>
                            <span className="text-[10px] text-[#176B57] font-semibold opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5">
                              Open <ArrowRight className="w-2.5 h-2.5" />
                            </span>
                          </div>
                        </div>

                        {/* Unread indicator dot */}
                        {isUnread && (
                          <div className="w-1.5 h-1.5 rounded-full bg-[#176B57] mt-1.5 shrink-0" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}
      </div>

        {/* Help Center */}
        <button
          onClick={() => alert('CAFlow CA Office Assistant: Need help? Contact 1800-CA-FLOW or explore User Guide.')}
          className="rounded-lg p-2 text-[#607274] hover:bg-[#F7F8F5] transition"
          aria-label="Help"
        >
          <HelpCircle className="h-4 w-4" />
        </button>

        {/* Profile Avatar & Menu */}
        <div className="relative">
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2 rounded-lg p-1 hover:bg-[#F7F8F5] transition"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#176B57] text-white font-bold text-xs shadow-sm">
              {user?.fullName?.charAt(0) || 'M'}
            </div>
            <div className="hidden xl:block text-left leading-tight">
              <div className="text-xs font-semibold text-[#202A33]">{user?.fullName || 'Managing Partner'}</div>
              <div className="text-[10px] text-[#607274]">{user?.designation || 'Managing Partner'}</div>
            </div>
            <ChevronDown className="h-3 w-3 text-[#607274]" />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 top-11 mt-1 w-52 rounded-lg border border-[#E1E7E2] bg-white py-1 shadow-xl z-50">
              <div className="border-b border-[#F1F4F1] px-4 py-2">
                <div className="text-xs font-bold text-[#202A33]">{user?.fullName}</div>
                <div className="text-[11px] text-[#607274]">{user?.email}</div>
                <div className="mt-1 inline-block text-[9px] font-bold bg-[#E8F3EF] text-[#176B57] px-1.5 py-0.5 rounded">
                  {user?.role}
                </div>
              </div>

              <button
                onClick={() => {
                  navigate('/settings');
                  setShowProfileMenu(false);
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-xs text-[#202A33] hover:bg-[#F7F8F5]"
              >
                <User className="h-3.5 w-3.5 text-[#176B57]" />
                Profile & Firm Settings
              </button>

              <button
                onClick={() => {
                  logout();
                  setShowProfileMenu(false);
                  navigate('/login');
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-xs text-[#DC2626] hover:bg-[#FEE2E2]"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
