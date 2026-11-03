import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CheckSquare,
  ListTodo,
  Users,
  Repeat,
  IndianRupee,
  CalendarCheck,
  Clock,
  Timer,
  FolderLock,
  Send,
  BarChart3,
  Settings,
  Plus,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  collapsed: boolean;
  onOpenNewTaskModal?: () => void;
  onOpenNewClientModal?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ collapsed, onOpenNewTaskModal, onOpenNewClientModal }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [financeOpen, setFinanceOpen] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);

  const role = user?.role || 'EMPLOYEE';
  const isOwnerOrAdmin = role === 'FIRM_OWNER' || role === 'FIRM_ADMIN';
  const isManager = role === 'MANAGER';
  const isAccountant = role === 'ACCOUNTANT';
  const isTaxPro = role === 'TAX_PROFESSIONAL';
  const isEmployee = role === 'EMPLOYEE';
  const isClient = role === 'CLIENT';

  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all ${
      isActive
        ? 'bg-[#E8F3EF] text-[#176B57] font-semibold shadow-xs'
        : 'text-[#4A5568] hover:bg-[#F3F6F4] hover:text-[#1A202C]'
    } ${collapsed ? 'justify-center px-2 py-2.5' : ''}`;

  // If role is CLIENT, they only see their portal access
  if (isClient) {
    return (
      <aside
        className={`h-[calc(100vh-4rem)] border-r border-[#E1E7E2] bg-white transition-all duration-300 z-20 flex flex-col justify-between shrink-0 ${
          collapsed ? 'w-16 min-w-[4rem]' : 'w-64 min-w-[16rem]'
        }`}
      >
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
          <div className="px-3 py-1.5 text-[11px] font-bold text-[#8C9B90] uppercase tracking-wider">
            {!collapsed && 'Client Account'}
          </div>
          <NavLink to="/portal" className={navItemClass} title="My Client Portal">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 shrink-0 text-[#176B57]" />
              {!collapsed && <span className="font-semibold">Client Portal</span>}
            </div>
          </NavLink>
        </div>
        <div className="p-3 border-t border-[#E1E7E2] text-center text-xs text-[#607274]">
          {!collapsed && `${user?.clientName || 'Client Access'} Mode`}
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={`h-[calc(100vh-4rem)] border-r border-[#E1E7E2] bg-white transition-all duration-300 z-20 flex flex-col shrink-0 ${
        collapsed ? 'w-16 min-w-[4rem]' : 'w-64 min-w-[16rem]'
      }`}
    >
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1 scrollbar-thin">
        {/* Dashboard - All staff */}
        <NavLink to="/dashboard" className={navItemClass} title="Dashboard">
          <div className="flex items-center gap-3">
            <LayoutDashboard className="h-5 w-5 shrink-0 text-[#176B57]" />
            {!collapsed && <span className="truncate">Dashboard</span>}
          </div>
        </NavLink>

        {/* Tasks - Staff roles (Owner, Admin, Manager, Tax Pro, Employee) */}
        {!isAccountant && (
          <div className="group flex items-center justify-between">
            <NavLink to="/tasks" className={({ isActive }) => `flex-1 ${navItemClass({ isActive })}`} title="Tasks">
              <div className="flex items-center gap-3">
                <CheckSquare className="h-5 w-5 shrink-0 text-[#176B57]" />
                {!collapsed && <span className="truncate">{isEmployee ? 'My Tasks' : 'Tasks'}</span>}
              </div>
            </NavLink>
            {!collapsed && !isEmployee && (
              <button
                onClick={() => {
                  if (onOpenNewTaskModal) onOpenNewTaskModal();
                  else navigate('/tasks?action=new');
                }}
                title="Add New Task"
                className="p-1 mr-1 text-[#607274] hover:text-[#176B57] hover:bg-[#E8F3EF] rounded-lg transition"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* To-Do - All staff */}
        <NavLink to="/todo" className={navItemClass} title="To-Do">
          <div className="flex items-center gap-3">
            <ListTodo className="h-5 w-5 shrink-0 text-[#176B57]" />
            {!collapsed && <span className="truncate">To-Do</span>}
          </div>
        </NavLink>

        {/* Clients - Owner, Admin, Manager, Accountant, Tax Pro */}
        {!isEmployee && (
          <div className="group flex items-center justify-between">
            <NavLink to="/clients" className={({ isActive }) => `flex-1 ${navItemClass({ isActive })}`} title="Clients">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 shrink-0 text-[#176B57]" />
                {!collapsed && <span className="truncate">Clients</span>}
              </div>
            </NavLink>
            {!collapsed && (isOwnerOrAdmin || isManager || isTaxPro) && (
              <button
                onClick={() => {
                  if (onOpenNewClientModal) onOpenNewClientModal();
                  else navigate('/clients/new');
                }}
                title="Add New Client"
                className="p-1 mr-1 text-[#607274] hover:text-[#176B57] hover:bg-[#E8F3EF] rounded-lg transition"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* Retainers & Services - Owner, Admin, Manager, Accountant, Tax Pro */}
        {!isEmployee && (
          <NavLink to="/services" className={navItemClass} title="Retainers & Services">
            <div className="flex items-center gap-3">
              <Repeat className="h-5 w-5 shrink-0 text-[#176B57]" />
              {!collapsed && <span className="truncate">Retainers & Services</span>}
            </div>
          </NavLink>
        )}

        {/* Finance with Submenu - Owner, Admin, Accountant, Manager */}
        {(isOwnerOrAdmin || isAccountant || isManager) && (
          <div>
            <button
              onClick={() => setFinanceOpen(!financeOpen)}
              className={`w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium text-[#4A5568] hover:bg-[#F3F6F4] hover:text-[#1A202C] transition ${
                collapsed ? 'justify-center px-2 py-2.5' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <IndianRupee className="h-5 w-5 shrink-0 text-[#176B57]" />
                {!collapsed && <span className="truncate">Finance</span>}
              </div>
              {!collapsed && (financeOpen ? <ChevronDown className="h-4 w-4 text-[#607274]" /> : <ChevronRight className="h-4 w-4 text-[#607274]" />)}
            </button>

            {!collapsed && financeOpen && (
              <div className="ml-8 mt-1 space-y-1 border-l-2 border-[#E1E7E2] pl-3 py-1">
                <NavLink
                  to="/finance"
                  end
                  className={({ isActive }) =>
                    `block py-1.5 text-xs font-medium rounded px-2 transition ${
                      isActive ? 'text-[#176B57] font-semibold bg-[#E8F3EF]' : 'text-[#607274] hover:text-[#1A202C] hover:bg-[#F3F6F4]'
                    }`
                  }
                >
                  Invoices & Billing
                </NavLink>
                <NavLink
                  to="/finance?tab=payments"
                  className={({ isActive }) =>
                    `block py-1.5 text-xs font-medium rounded px-2 transition ${
                      isActive ? 'text-[#176B57] font-semibold bg-[#E8F3EF]' : 'text-[#607274] hover:text-[#1A202C] hover:bg-[#F3F6F4]'
                    }`
                  }
                >
                  Receipts & Payments
                </NavLink>
                <NavLink
                  to="/finance?tab=expenses"
                  className={({ isActive }) =>
                    `block py-1.5 text-xs font-medium rounded px-2 transition ${
                      isActive ? 'text-[#176B57] font-semibold bg-[#E8F3EF]' : 'text-[#607274] hover:text-[#1A202C] hover:bg-[#F3F6F4]'
                    }`
                  }
                >
                  Office Expenses
                </NavLink>
              </div>
            )}
          </div>
        )}

        {/* Attendance - All staff */}
        <NavLink to="/attendance" className={navItemClass} title="Attendance">
          <div className="flex items-center gap-3">
            <CalendarCheck className="h-5 w-5 shrink-0 text-[#176B57]" />
            {!collapsed && <span className="truncate">Attendance</span>}
          </div>
        </NavLink>

        {/* Renewals - Owner, Admin, Manager, Tax Pro, Employee */}
        {!isAccountant && (
          <NavLink to="/renewals" className={navItemClass} title="Renewals">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 shrink-0 text-[#176B57]" />
              {!collapsed && <span className="truncate">Renewals</span>}
            </div>
          </NavLink>
        )}

        {/* Timesheet - All staff */}
        <NavLink to="/timesheet" className={navItemClass} title="Timesheet">
          <div className="flex items-center gap-3">
            <Timer className="h-5 w-5 shrink-0 text-[#176B57]" />
            {!collapsed && <span className="truncate">Timesheet</span>}
          </div>
          {!collapsed && (
            <span className="rounded bg-[#F59E0B] px-1.5 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider">
              Live
            </span>
          )}
        </NavLink>

        {/* Documents with Submenu - All staff */}
        <div>
          <button
            onClick={() => setDocumentsOpen(!documentsOpen)}
            className={`w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium text-[#4A5568] hover:bg-[#F3F6F4] hover:text-[#1A202C] transition ${
              collapsed ? 'justify-center px-2 py-2.5' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <FolderLock className="h-5 w-5 shrink-0 text-[#176B57]" />
              {!collapsed && <span className="truncate">Documents</span>}
            </div>
            {!collapsed && (documentsOpen ? <ChevronDown className="h-4 w-4 text-[#607274]" /> : <ChevronRight className="h-4 w-4 text-[#607274]" />)}
          </button>

          {!collapsed && documentsOpen && (
            <div className="ml-8 mt-1 space-y-1 border-l-2 border-[#E1E7E2] pl-3 py-1">
              <NavLink
                to="/documents"
                end
                className={({ isActive }) =>
                  `block py-1.5 text-xs font-medium rounded px-2 transition ${
                    isActive ? 'text-[#176B57] font-semibold bg-[#E8F3EF]' : 'text-[#607274] hover:text-[#1A202C] hover:bg-[#F3F6F4]'
                  }`
                }
              >
                In-Out Register
              </NavLink>
              <NavLink
                to="/documents?tab=vault"
                className={({ isActive }) =>
                  `block py-1.5 text-xs font-medium rounded px-2 transition ${
                    isActive ? 'text-[#176B57] font-semibold bg-[#E8F3EF]' : 'text-[#607274] hover:text-[#1A202C] hover:bg-[#F3F6F4]'
                  }`
                }
              >
                Client Document Vault
              </NavLink>
              <NavLink
                to="/documents?tab=requests"
                className={({ isActive }) =>
                  `block py-1.5 text-xs font-medium rounded px-2 transition ${
                    isActive ? 'text-[#176B57] font-semibold bg-[#E8F3EF]' : 'text-[#607274] hover:text-[#1A202C] hover:bg-[#F3F6F4]'
                  }`
                }
              >
                Document Requests
              </NavLink>
            </div>
          )}
        </div>

        {/* Send Notifications - Owner, Admin, Manager, Accountant */}
        {(isOwnerOrAdmin || isManager || isAccountant) && (
          <NavLink to="/notifications" className={navItemClass} title="Send Notifications">
            <div className="flex items-center gap-3">
              <Send className="h-5 w-5 shrink-0 text-[#176B57]" />
              {!collapsed && <span className="truncate">Send Notifications</span>}
            </div>
          </NavLink>
        )}

        {/* Reports & Analytics - Owner, Admin, Manager, Accountant */}
        {(isOwnerOrAdmin || isManager || isAccountant) && (
          <NavLink to="/reports" className={navItemClass} title="Reports & Analytics">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-5 w-5 shrink-0 text-[#176B57]" />
              {!collapsed && <span className="truncate">Reports & Analytics</span>}
            </div>
          </NavLink>
        )}

        {/* Settings - Owner & Admin only */}
        {isOwnerOrAdmin && (
          <NavLink to="/settings" className={navItemClass} title="Settings">
            <div className="flex items-center gap-3">
              <Settings className="h-5 w-5 shrink-0 text-[#176B57]" />
              {!collapsed && <span className="truncate">Settings</span>}
            </div>
          </NavLink>
        )}
      </div>
    </aside>
  );
};
