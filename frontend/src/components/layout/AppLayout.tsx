import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { VoiceAssistantProvider } from '../../context/VoiceAssistantContext';
import { VoiceAssistantWidget } from '../voice/VoiceAssistantWidget';

export const AppLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <VoiceAssistantProvider>
      <div className="h-screen bg-[#F7F8F5] text-[#263238] flex flex-col relative overflow-hidden">
        <Navbar onToggleSidebar={() => setCollapsed(!collapsed)} />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar collapsed={collapsed} />
          <main className="flex-1 min-w-0 overflow-y-auto p-4 md:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
        {/* Global Floating AI Voice Assistant Widget */}
        <VoiceAssistantWidget />
      </div>
    </VoiceAssistantProvider>
  );
};
