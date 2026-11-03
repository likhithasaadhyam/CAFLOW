import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  X,
  Send,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Calendar,
  FileText,
  User,
  Sparkles,
  RefreshCw,
  Loader2,
  ArrowUpRight,
  Bot,
  Radio,
  CornerDownLeft,
} from 'lucide-react';
import { useVoiceAssistant, SUPPORTED_LANGUAGES } from '../../context/VoiceAssistantContext';
import { useAuth } from '../../context/AuthContext';

export const VoiceAssistantWidget: React.FC = () => {
  const { user } = useAuth();
  const {
    isOpen,
    setIsOpen,
    assistantState,
    activityStatus,
    transcript,
    interimTranscript,
    messages,
    selectedLanguage,
    setSelectedLanguage,
    isAutoSpeak,
    setIsAutoSpeak,
    isSupported,
    permissionStatus,
    pendingConfirmation,
    startListening,
    stopListening,
    toggleListening,
    sendTextMessage,
    confirmAction,
    cancelAction,
    clearConversation,
    stopSpeaking,
  } = useVoiceAssistant();

  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll messages to bottom
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, interimTranscript, activityStatus, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const handleTextSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;
    if (activityStatus === 'Searching…' || activityStatus === 'Working…') return;
    const text = inputText.trim();
    setInputText('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    sendTextMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleTextSubmit();
    }
  };

  const handleQuickPromptClick = (prompt: string) => {
    if (activityStatus === 'Searching…' || activityStatus === 'Working…') return;
    sendTextMessage(prompt);
  };

  // Helper to render bold text, bullet points, and clean paragraphs
  const renderFormattedContent = (content: string) => {
    const lines = content.split('\n');
    return (
      <div className="space-y-1.5 leading-relaxed text-xs">
        {lines.map((line, lineIdx) => {
          const trimmed = line.trim();
          if (!trimmed) return <div key={lineIdx} className="h-1" />;

          const isBullet = trimmed.startsWith('• ') || trimmed.startsWith('- ') || trimmed.startsWith('* ');
          const cleanLine = isBullet ? trimmed.replace(/^[•\-\*]\s*/, '') : trimmed;

          const parts = cleanLine.split(/(\*\*[^*]+\*\*)/g);
          const parsedLine = parts.map((part, partIdx) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return (
                <strong key={partIdx} className="font-semibold text-purple-100">
                  {part.slice(2, -2)}
                </strong>
              );
            }
            return part;
          });

          if (isBullet) {
            return (
              <div key={lineIdx} className="flex items-start gap-1.5 pl-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 shrink-0 shadow-[0_0_6px_rgba(192,132,252,0.8)]" />
                <span>{parsedLine}</span>
              </div>
            );
          }

          return <p key={lineIdx}>{parsedLine}</p>;
        })}
      </div>
    );
  };

  // Quick Action Suggestions (Mandatory 7 actions with native localization)
  const quickActions = React.useMemo(() => {
    if (selectedLanguage === 'te-IN') {
      return [
        { label: '10 మంది క్లయింట్ల లిస్ట్', prompt: '10 మంది క్లయింట్ల లిస్ట్ చూపించు', icon: User },
        { label: 'ఈ రోజు పెండింగ్ పనులు', prompt: 'ఈ రోజు పెండింగ్ పనులను చూపించు', icon: CheckCircle2 },
        { label: 'చెల్లించని ఇన్‌వాయిస్‌లు', prompt: 'చెల్లించని ఇన్‌వాయిస్‌లు చూపించు', icon: FileText },
        { label: 'చెల్లించిన ఇన్‌వాయిస్‌లు', prompt: 'చెల్లించిన ఇన్‌వాయిస్‌లు చూపించు', icon: CheckCircle2 },
        { label: 'నా హాజరును చెక్ చేయి', prompt: 'నా హాజరును చెక్ చేయి', icon: Clock },
        { label: 'ఈ నెల రెన్యూవల్స్', prompt: 'ఈ నెల రెన్యూవల్స్ చూపించు', icon: Calendar },
        { label: 'ఫైనాన్స్ ఓపెన్ చేయి', prompt: 'ఫైనాన్స్ పేజీని ఓపెన్ చేయి', icon: ArrowUpRight },
      ];
    }

    if (selectedLanguage === 'hi-IN') {
      return [
        { label: '10 क्लाइंट्स की लिस्ट', prompt: '10 क्लाइंट्स की लिस्ट दिखाओ', icon: User },
        { label: 'आज के पेंडिंग काम', prompt: 'आज के पेंडिंग काम दिखाओ', icon: CheckCircle2 },
        { label: 'अनपेड इनवॉइस', prompt: 'अनपेड इनवॉइस दिखाओ', icon: FileText },
        { label: 'पेड इनवॉइस', prompt: 'पेड इनवॉइस दिखाओ', icon: CheckCircle2 },
        { label: 'मेरी हाजिरी चेक करो', prompt: 'मेरी हाजिरी चेक करो', icon: Clock },
        { label: 'इस महीने के रिन्यूअल', prompt: 'इस महीने के रिन्यूअल दिखाओ', icon: Calendar },
        { label: 'फाइनेंस खोलो', prompt: 'फाइनेंस पेज खोलो', icon: ArrowUpRight },
      ];
    }

    // Default: English
    return [
      { label: 'Show my clients', prompt: 'Show my clients', icon: User },
      { label: "Show today's pending tasks", prompt: "Show today's pending tasks", icon: CheckCircle2 },
      { label: 'Find unpaid invoices', prompt: 'Find unpaid invoices', icon: FileText },
      { label: 'Find paid invoices', prompt: 'Give me the list of paid invoices', icon: CheckCircle2 },
      { label: "Check today's attendance", prompt: "Check today's attendance for today", icon: Clock },
      { label: 'List upcoming renewals', prompt: 'List upcoming renewals', icon: Calendar },
      { label: 'Open Finance', prompt: 'Open Finance', icon: ArrowUpRight },
    ];
  }, [selectedLanguage]);

  // Professional real-time activity status badge with futuristic glowing purple accents
  const renderStatusBadge = () => {
    switch (activityStatus) {
      case 'Listening…':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-rose-500/15 text-rose-200 border border-rose-500/40 shadow-[0_0_8px_rgba(244,63,94,0.25)] whitespace-nowrap shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
            Listening…
          </span>
        );
      case 'Searching…':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-amber-500/15 text-amber-200 border border-amber-500/40 shadow-[0_0_8px_rgba(245,158,11,0.25)] whitespace-nowrap shrink-0">
            <Loader2 className="w-3 h-3 text-amber-300 animate-spin" />
            Searching…
          </span>
        );
      case 'Working…':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-purple-900/60 text-purple-200 border border-purple-400/50 shadow-[0_0_8px_rgba(192,132,252,0.25)] whitespace-nowrap shrink-0">
            <Loader2 className="w-3 h-3 text-purple-300 animate-spin" />
            Working…
          </span>
        );
      case 'Speaking…':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-fuchsia-950/70 text-fuchsia-200 border border-fuchsia-500/40 shadow-[0_0_8px_rgba(232,121,249,0.25)] whitespace-nowrap shrink-0">
            <span className="flex items-center gap-0.5">
              <span className="w-0.5 h-2 bg-fuchsia-400 animate-pulse" />
              <span className="w-0.5 h-3 bg-fuchsia-300 animate-pulse delay-75" />
              <span className="w-0.5 h-1.5 bg-fuchsia-400 animate-pulse delay-150" />
            </span>
            Speaking…
          </span>
        );
      case 'Done':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 shadow-[0_0_8px_rgba(52,211,153,0.2)] whitespace-nowrap shrink-0">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            Done
          </span>
        );
      case "Couldn't complete the request":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-rose-500/15 text-rose-300 border border-rose-500/40 shadow-[0_0_8px_rgba(244,63,94,0.25)] whitespace-nowrap shrink-0">
            <AlertTriangle className="w-3 h-3 text-rose-400" />
            Failed
          </span>
        );
      case 'Ready':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-purple-950/70 text-purple-200 border border-purple-500/40 shadow-[0_0_8px_rgba(168,85,247,0.2)] whitespace-nowrap shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            Ready
          </span>
        );
    }
  };

  return (
    <>
      {/* Floating Microphone Trigger Button with Futuristic Purple AI Styling */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Toggle CAFlow AI Assistant"
          title="CAFlow AI Assistant (Alt+V)"
          className={`relative group flex items-center justify-center w-14 h-14 rounded-full shadow-2xl transition-all duration-300 border ${
            activityStatus === 'Listening…'
              ? 'bg-rose-600 text-white border-rose-400 shadow-rose-500/40 scale-105'
              : activityStatus === 'Searching…'
              ? 'bg-amber-600 text-white border-amber-400 shadow-amber-500/40 animate-pulse'
              : activityStatus === 'Working…'
              ? 'bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 text-white border-purple-300 shadow-purple-500/50 animate-pulse'
              : activityStatus === 'Speaking…'
              ? 'bg-fuchsia-600 text-white border-fuchsia-400 shadow-fuchsia-500/40 scale-105'
              : 'bg-gradient-to-br from-violet-600 via-purple-700 to-indigo-800 text-white border-purple-400/50 shadow-xl shadow-purple-950/70 hover:shadow-purple-600/50 hover:scale-105 hover:border-purple-300'
          }`}
        >
          {/* Animated pulse rings when listening */}
          {activityStatus === 'Listening…' && (
            <>
              <span className="absolute inset-0 rounded-full bg-rose-500/30 animate-ping" />
              <span className="absolute -inset-1 rounded-full bg-rose-500/20 animate-pulse" />
            </>
          )}

          {activityStatus === 'Listening…' ? (
            <Mic className="w-6 h-6 animate-pulse" />
          ) : activityStatus === 'Searching…' || activityStatus === 'Working…' ? (
            <Loader2 className="w-6 h-6 animate-spin text-white" />
          ) : activityStatus === 'Speaking…' ? (
            <Volume2 className="w-6 h-6 animate-bounce text-white" />
          ) : (
            <div className="relative flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-purple-100 transition-transform group-hover:scale-110" />
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            </div>
          )}

          {/* Quick status badge */}
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                activityStatus === 'Listening…'
                  ? 'bg-rose-400'
                  : activityStatus === 'Searching…'
                  ? 'bg-amber-400'
                  : activityStatus === 'Working…'
                  ? 'bg-purple-400'
                  : activityStatus === 'Speaking…'
                  ? 'bg-fuchsia-400'
                  : 'bg-emerald-400'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-3.5 w-3.5 ${
                activityStatus === 'Listening…'
                  ? 'bg-rose-500'
                  : activityStatus === 'Searching…'
                  ? 'bg-amber-500'
                  : activityStatus === 'Working…'
                  ? 'bg-purple-500'
                  : activityStatus === 'Speaking…'
                  ? 'bg-fuchsia-500'
                  : 'bg-emerald-500'
              }`}
            />
          </span>
        </button>
      </div>

      {/* Slide-over CAFlow AI Assistant Drawer with Futuristic Purple Theme */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="CAFlow AI Assistant"
          className="fixed inset-y-0 right-0 z-50 w-full sm:w-[460px] md:w-[490px] bg-gradient-to-b from-[#180b2d] via-[#110620] to-[#0a0314] text-purple-100 border-l border-purple-800/40 shadow-2xl shadow-purple-950/80 flex flex-col transition-all duration-300 backdrop-blur-xl"
        >
          {/* Header with Deep Plum / Violet Gradient and Glowing Orb */}
          <div className="px-3.5 py-3 border-b border-purple-800/50 flex items-center justify-between bg-gradient-to-r from-[#200f3c] via-[#28134a] to-[#1c0c36] gap-2 shadow-sm shrink-0 overflow-hidden">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-700 border border-purple-400/50 flex items-center justify-center shadow-[0_0_15px_rgba(168,85,247,0.4)] shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-nowrap">
                  <h2 className="text-sm font-bold text-white tracking-wide shrink-0">
                    CAFlow AI
                  </h2>
                  {renderStatusBadge()}
                </div>
                <p className="text-[11px] text-purple-300/75 truncate mt-0.5 max-w-[170px] sm:max-w-[210px]">
                  Office Intelligence & Workflow Assistant
                </p>
              </div>
            </div>

            {/* Header Controls with Refined Purple Styling */}
            <div className="flex items-center space-x-1 shrink-0">
              {/* Language Selector */}
              <select
                value={selectedLanguage}
                onChange={e => setSelectedLanguage(e.target.value)}
                aria-label="Select voice assistant language"
                className="bg-[#241344] text-purple-200 text-xs rounded-lg px-2 py-1.5 border border-purple-700/60 focus:outline-none focus:border-purple-400 transition-colors cursor-pointer hover:border-purple-500/60 max-w-[82px] sm:max-w-[92px] truncate font-medium"
                title="Language selection"
              >
                {SUPPORTED_LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code} className="bg-[#1b0d33] text-purple-100">
                    {lang.nativeLabel}
                  </option>
                ))}
              </select>

              {/* TTS Audio Toggle */}
              <button
                type="button"
                onClick={() => {
                  if (assistantState === 'SPEAKING') stopSpeaking();
                  setIsAutoSpeak(!isAutoSpeak);
                }}
                aria-label={isAutoSpeak ? 'Mute voice response' : 'Enable voice response'}
                className={`p-1.5 rounded-lg border transition-colors ${
                  isAutoSpeak
                    ? 'bg-purple-900/60 text-purple-200 border-purple-500/50 hover:bg-purple-800/60 hover:border-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.2)]'
                    : 'bg-[#241344] text-purple-400/60 border-purple-800/60 hover:text-purple-300 hover:border-purple-700'
                }`}
                title={isAutoSpeak ? 'Voice response enabled' : 'Voice response muted'}
              >
                {isAutoSpeak ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>

              {/* Reset Conversation */}
              <button
                type="button"
                onClick={clearConversation}
                aria-label="Reset conversation"
                className="p-1.5 rounded-lg border border-purple-800/60 bg-[#241344] text-purple-300 hover:text-white hover:bg-purple-900/70 hover:border-purple-500/60 transition-colors"
                title="Reset conversation"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => {
                  stopSpeaking();
                  stopListening();
                  setIsOpen(false);
                }}
                aria-label="Close assistant"
                className="p-1.5 rounded-lg border border-purple-800/60 bg-[#241344] text-purple-300 hover:text-white hover:bg-purple-900/70 hover:border-purple-500/60 transition-colors"
                title="Close assistant"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Browser / Microphone Permission Warnings */}
          {!isSupported && (
            <div className="px-4 py-2.5 bg-amber-500/15 border-b border-amber-500/30 flex items-center gap-2 text-xs text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Web Speech recognition is not supported in this browser. You can type commands in the box below.
              </span>
            </div>
          )}

          {permissionStatus === 'denied' && (
            <div className="px-4 py-2.5 bg-rose-500/15 border-b border-rose-500/30 flex items-center gap-2 text-xs text-rose-200">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Microphone access was denied. Please allow microphone permissions or type commands below.
              </span>
            </div>
          )}

          {/* Listening Waveform Bar with Futuristic Violet Pulse */}
          {activityStatus === 'Listening…' && (
            <div className="px-4 py-3 bg-gradient-to-r from-[#281144] to-[#1d0b34] border-b border-purple-800/40 flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs text-rose-200 font-medium">
                <span className="flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                  Listening... speak naturally
                </span>
                <span className="text-[11px] text-purple-300">
                  {selectedLanguage === 'te-IN'
                    ? 'Telugu'
                    : selectedLanguage === 'hi-IN'
                    ? 'Hindi'
                    : 'English'}
                </span>
              </div>

              {/* Clean Waveform Bars */}
              <div className="flex items-center justify-center gap-1.5 h-6">
                {[35, 70, 45, 95, 60, 85, 40, 100, 75, 50, 80, 55].map((h, i) => (
                  <span
                    key={i}
                    style={{ height: `${h}%` }}
                    className="w-1 bg-gradient-to-t from-violet-600 via-purple-500 to-fuchsia-400 rounded-full animate-pulse"
                  />
                ))}
              </div>

              {/* Live Interim Transcript */}
              {interimTranscript && (
                <div className="text-xs text-purple-100 italic font-mono bg-[#2f1552]/80 px-2.5 py-1 rounded border border-purple-600/40">
                  "{interimTranscript}..."
                </div>
              )}
            </div>
          )}

          {/* Message History Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 va-dark-scroll" tabIndex={0} aria-label="Conversation history">
            {/* Messages with Sophisticated Violet Gradient for User & Soft Plum for Assistant */}
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-md ${
                    msg.sender === 'user'
                      ? 'bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 text-white border border-purple-400/30 rounded-br-none shadow-purple-950/40'
                      : 'bg-[#190c30]/95 text-purple-100 border border-purple-800/50 rounded-bl-none shadow-purple-950/50'
                  }`}
                >
                  {renderFormattedContent(msg.text)}

                  {/* Clarification Chips */}
                  {msg.clarificationOptions && msg.clarificationOptions.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-purple-800/40 flex flex-wrap gap-1.5">
                      <span className="text-[10px] text-purple-400 w-full">Select an option:</span>
                      {msg.clarificationOptions.map((opt, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleQuickPromptClick(opt)}
                          className="px-2.5 py-1 rounded-md bg-[#251244] hover:bg-[#32175c] text-[11px] text-purple-200 hover:text-white border border-purple-700/60 transition-colors"
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Render Data Cards for Clients / Tasks / Invoices / Renewals / Attendance */}
                  {(() => {
                    const dataItems: any[] = Array.isArray(msg.data)
                      ? msg.data
                      : Array.isArray(msg.data?.items)
                      ? msg.data.items
                      : msg.data &&
                        typeof msg.data === 'object' &&
                        (msg.data.name ||
                          msg.data.title ||
                          msg.data.invoiceNumber ||
                          msg.data.renewalType ||
                          msg.data.id)
                      ? [msg.data]
                      : [];

                    if (dataItems.length === 0) return null;

                    const totalRecords =
                      typeof msg.data?.totalCount === 'number'
                        ? msg.data.totalCount
                        : dataItems.length;
                    const displayedRecords =
                      typeof msg.data?.displayedCount === 'number'
                        ? msg.data.displayedCount
                        : dataItems.length;
                    const hasMoreRecords =
                      msg.data?.hasMore ?? totalRecords > displayedRecords;
                    const isClientList =
                      msg.intent === 'SHOW_CLIENTS' ||
                      msg.intent === 'CLIENT_ORDINAL' ||
                      msg.intent === 'CLIENT_RANGE' ||
                      dataItems.some(
                        i =>
                          i.pan ||
                          i.gstin ||
                          (i.name && !i.title && !i.invoiceNumber && !i.renewalType)
                      );

                    return (
                      <div className="mt-2.5 pt-2 border-t border-purple-800/40 space-y-2">
                        {/* Header for Ordinal or Range queries */}
                        {msg.data?.isOrdinal && (
                          <div className="flex items-center justify-between text-[10px] font-medium text-purple-200 bg-[#220f3e] px-2 py-1 rounded border border-purple-800/60">
                            <span>Record #{msg.data.targetPosition} of {totalRecords}</span>
                            <span className="text-purple-400 font-normal text-[9px]">Alphabetical Order</span>
                          </div>
                        )}
                        {msg.data?.isRange && (
                          <div className="flex items-center justify-between text-[10px] font-medium text-purple-200 bg-[#220f3e] px-2 py-1 rounded border border-purple-800/60">
                            <span>Range #{msg.data.rangeStart} to #{msg.data.rangeEnd}</span>
                            <span className="text-purple-400 font-normal text-[9px]">
                              {displayedRecords} of {totalRecords} Records
                            </span>
                          </div>
                        )}

                        {/* Scrollable container for cards */}
                        <div
                          className="space-y-1.5 max-h-72 overflow-y-auto pr-1"
                          style={{ scrollbarWidth: 'thin' }}
                        >
                          {dataItems.map((item: any, idx: number) => {
                            // Client Card with Futuristic Violet Theme
                            if (item.pan || item.gstin || isClientList) {
                              return (
                                <div
                                  key={item.id || idx}
                                  className="p-2.5 rounded-xl bg-[#190c30]/95 border border-purple-800/40 hover:border-purple-500/50 text-[11px] transition-all space-y-1 shadow-sm"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5">
                                        {item.position !== undefined ? (
                                          <span className="px-1.5 py-0.2 rounded font-mono font-bold text-[10px] bg-purple-950 text-purple-200 border border-purple-700/60 shrink-0">
                                            #{item.position}
                                          </span>
                                        ) : (
                                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shadow-[0_0_6px_rgba(192,132,252,0.8)] shrink-0" />
                                        )}
                                        <p className="font-semibold text-white truncate text-xs">
                                          {item.name}
                                        </p>
                                      </div>
                                      <p className="text-[10px] text-purple-300/70 truncate pl-3">
                                        {item.primaryContact
                                          ? `Contact: ${item.primaryContact}`
                                          : item.mobile
                                          ? `Mobile: ${item.mobile}`
                                          : 'Registered Client'}
                                      </p>
                                    </div>
                                    {item.status && (
                                      <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 uppercase shrink-0">
                                        {item.status}
                                      </span>
                                    )}
                                  </div>

                                  {(item.pan || item.gstin) && (
                                    <div className="flex flex-wrap gap-1.5 pl-3 pt-0.5 text-[10px]">
                                      {item.pan && (
                                        <span className="font-mono text-purple-200 bg-purple-950/80 px-1.5 py-0.5 rounded border border-purple-700/60">
                                          PAN: {item.pan}
                                        </span>
                                      )}
                                      {item.gstin && (
                                        <span className="font-mono text-purple-200 bg-purple-950/80 px-1.5 py-0.5 rounded border border-purple-700/60">
                                          GST: {item.gstin}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            }

                            // Dedicated Invoice Card with Futuristic Violet Theme
                            if (item.invoiceNumber || msg.intent === 'SHOW_INVOICES') {
                              const isPaid = item.paymentStatus === 'PAID' || item.balanceDue === 0;
                              const isOverdue =
                                item.paymentStatus === 'OVERDUE' ||
                                (!isPaid && item.dueDate && new Date(item.dueDate).getTime() < Date.now());
                              const isPartial = item.paymentStatus === 'PARTIALLY_PAID';

                              return (
                                <div
                                  key={item.id || idx}
                                  className="p-2.5 rounded-xl bg-[#190c30]/95 border border-purple-800/40 hover:border-purple-500/50 text-[11px] transition-all space-y-1.5 shadow-sm"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-mono font-semibold text-[11px] text-purple-100 bg-purple-950/90 px-1.5 py-0.5 rounded border border-purple-700/60 shrink-0">
                                          {item.invoiceNumber}
                                        </span>
                                        {item.invoiceDate && (
                                          <span className="text-[10px] text-purple-300/70">
                                            {new Date(item.invoiceDate).toLocaleDateString('en-IN')}
                                          </span>
                                        )}
                                      </div>
                                      <p className="font-medium text-white text-xs mt-1 break-words">
                                        {item.client?.name || item.name || 'Client'}
                                      </p>
                                    </div>

                                    {/* Status Badge */}
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase shrink-0 border ${
                                        isPaid
                                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                          : isOverdue
                                          ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                          : isPartial
                                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                          : 'bg-violet-500/15 text-violet-300 border-violet-500/30'
                                      }`}
                                    >
                                      {item.paymentStatus || (isPaid ? 'PAID' : 'ISSUED')}
                                    </span>
                                  </div>

                                  {/* Financial Details Row */}
                                  <div className="flex items-center justify-between pt-1 border-t border-purple-900/50 text-[10px]">
                                    <div className="flex items-center gap-2 text-purple-300/80">
                                      <span>
                                        Total: <strong className="text-purple-100">₹{Number(item.totalAmount || item.amount || 0).toLocaleString('en-IN')}</strong>
                                      </span>
                                      {item.dueDate && (
                                        <span className="flex items-center gap-1 text-purple-300/80">
                                          <Calendar className="w-3 h-3 text-purple-400" />
                                          Due: {new Date(item.dueDate).toLocaleDateString('en-IN')}
                                        </span>
                                      )}
                                    </div>

                                    {isPaid ? (
                                      <span className="font-mono font-semibold text-emerald-300 bg-emerald-500/15 px-1.5 py-0.5 rounded border border-emerald-500/30">
                                        Settled (₹{Number(item.amountPaid || item.totalAmount || 0).toLocaleString('en-IN')})
                                      </span>
                                    ) : (
                                      <span className="font-mono font-semibold text-amber-300 bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-500/30">
                                        Balance: ₹{Number(item.balanceDue || 0).toLocaleString('en-IN')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            }

                            // Standard Item (Task / Renewal / Attendance)
                            return (
                              <div
                                key={item.id || idx}
                                className="p-2.5 rounded-xl bg-[#190c30]/95 border border-purple-800/40 hover:border-purple-500/50 text-[11px] flex items-center justify-between gap-2 shadow-sm"
                              >
                                <div className="truncate flex-1 min-w-0">
                                  <p className="font-medium text-white truncate text-xs">
                                    {item.title || item.renewalType || item.name}
                                  </p>
                                  <p className="text-[10px] text-purple-300/70 truncate mt-0.5">
                                    {item.category
                                      ? `Category: ${item.category}`
                                      : item.client?.name || item.primaryContact || item.fileNo || 'General'}
                                    {item.dueDate
                                      ? ` • Due: ${new Date(item.dueDate).toLocaleDateString('en-IN')}`
                                      : ''}
                                  </p>
                                </div>
                                {item.balanceDue !== undefined && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono text-[10px] shrink-0 border border-amber-500/30">
                                    ₹{Number(item.balanceDue).toLocaleString('en-IN')}
                                  </span>
                                )}
                                {item.status && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-950/80 text-purple-200 border border-purple-700/60 uppercase shrink-0">
                                    {item.status}
                                  </span>
                                )}
                                {item.priority && (
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 border ${
                                    item.priority === 'URGENT' || item.priority === 'HIGH'
                                      ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                      : item.priority === 'MEDIUM'
                                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                      : 'bg-purple-950 text-purple-300 border-purple-700/60'
                                  }`}>
                                    {item.priority}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Database Count & Pagination Bar */}
                        <div className="pt-1.5 flex items-center justify-between text-[10px] text-purple-300/70 border-t border-purple-900/50">
                          <span>
                            {msg.data?.isOrdinal
                              ? `Record #${msg.data.targetPosition} of ${totalRecords}`
                              : msg.data?.isRange
                              ? `Showing #${msg.data.rangeStart}–#${msg.data.rangeEnd} (${displayedRecords} of ${totalRecords})`
                              : `Showing ${displayedRecords} of ${totalRecords} ${
                                  isClientList
                                    ? 'clients'
                                    : msg.intent === 'SHOW_TODOS'
                                    ? 'to-dos'
                                    : msg.intent === 'SHOW_TASKS'
                                    ? 'tasks'
                                    : 'records'
                                }`}
                          </span>
                          {hasMoreRecords && !msg.data?.isOrdinal && (
                            <button
                              type="button"
                              onClick={() =>
                                handleQuickPromptClick(
                                  isClientList
                                    ? 'Show all clients'
                                    : msg.intent === 'SHOW_TODOS'
                                    ? 'Show all to-dos'
                                    : msg.intent === 'SHOW_TASKS'
                                    ? 'Show all tasks'
                                    : 'Show all'
                                )
                              }
                              className="text-purple-300 hover:text-white underline font-medium flex items-center gap-1 transition-colors"
                            >
                              Load All ({totalRecords - displayedRecords} more)
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <span className="text-[10px] text-purple-400/60 mt-1 px-1">
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}

            {/* Pending Confirmation Card with Futuristic Purple Styling */}
            {pendingConfirmation && (
              <div className="p-3.5 rounded-2xl bg-[#200e3d] border border-purple-700/70 shadow-2xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                  <AlertTriangle className="w-4 h-4 text-amber-300" />
                  <span>Human Confirmation Required</span>
                </div>

                <div className="p-2.5 rounded-xl bg-[#140727] border border-purple-800/60 text-xs space-y-1.5">
                  {pendingConfirmation.actionDetails &&
                    Object.entries(pendingConfirmation.actionDetails).map(([key, val]) => (
                      <div key={key} className="flex justify-between items-center text-[11px]">
                        <span className="text-purple-300/70 capitalize">{key}:</span>
                        <span className="font-medium text-purple-100">{String(val)}</span>
                      </div>
                    ))}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      pendingConfirmation.confirmationToken &&
                      confirmAction(pendingConfirmation.confirmationToken)
                    }
                    className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950/40 transition-all"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Confirm & Execute
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      pendingConfirmation.confirmationToken &&
                      cancelAction(pendingConfirmation.confirmationToken)
                    }
                    className="py-2 px-3 rounded-xl bg-[#281349] hover:bg-[#34185f] text-purple-200 text-xs border border-purple-700/60 transition-colors"
                  >
                    Cancel
                  </button>
                </div>

                <p className="text-[10px] text-center text-purple-400/70 italic">
                  Tip: You can also say "Confirm" or "Cancel" into your microphone.
                </p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Action Suggestions Section with Coordinated Purple Theme */}
          <div className="px-4 py-2.5 bg-[#170a2b] border-t border-purple-900/50">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[10px] text-purple-400 shrink-0 font-medium">Quick:</span>
              {quickActions.map((action, idx) => {
                const Icon = action.icon;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleQuickPromptClick(action.prompt)}
                    disabled={activityStatus === 'Searching…' || activityStatus === 'Working…'}
                    className="whitespace-nowrap px-2.5 py-1 rounded-full bg-[#251144]/80 hover:bg-[#32175c] text-[11px] text-purple-200 hover:text-white border border-purple-700/50 hover:border-purple-400/60 transition-all flex items-center gap-1 disabled:opacity-50 shadow-sm"
                  >
                    <Icon className="w-3 h-3 text-purple-300" />
                    <span>{action.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bottom Command Input Bar with Futuristic Purple Surfaces */}
          <div className="p-3.5 bg-[#170a2b] border-t border-purple-900/50 flex items-center gap-2">
            {/* Mic Toggle Button */}
            <button
              type="button"
              onClick={toggleListening}
              aria-label={activityStatus === 'Listening…' ? 'Stop listening' : 'Start voice input'}
              className={`p-2.5 rounded-xl transition-all duration-300 flex items-center justify-center shadow-md ${
                activityStatus === 'Listening…'
                  ? 'bg-rose-600 text-white ring-2 ring-rose-400 animate-pulse'
                  : 'bg-gradient-to-br from-violet-600 to-purple-700 hover:from-violet-500 hover:to-purple-600 text-white border border-purple-400/40 shadow-md shadow-purple-950/40 hover:scale-105'
              }`}
              title={activityStatus === 'Listening…' ? 'Stop listening' : 'Start voice input'}
            >
              {activityStatus === 'Listening…' ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>

            {/* Textarea Input with Form Submit */}
            <form onSubmit={handleTextSubmit} className="flex-1 flex items-center gap-1.5">
              <textarea
                ref={inputRef}
                rows={1}
                value={inputText}
                onChange={e => {
                  setInputText(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`;
                }}
                onKeyDown={handleKeyDown}
                placeholder={
                  selectedLanguage === 'te-IN'
                    ? 'సందేశం లేదా ఆదేశాన్ని టైప్ చేయండి...'
                    : selectedLanguage === 'hi-IN'
                    ? 'यहाँ संदेश टाइप करें...'
                    : 'Ask CAFlow AI or type a command...'
                }
                aria-label="Ask CAFlow AI"
                disabled={activityStatus === 'Searching…' || activityStatus === 'Working…'}
                className="flex-1 bg-[#1c0d35]/95 text-purple-100 text-xs px-3.5 py-2.5 rounded-xl border border-purple-800/60 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400/40 placeholder-purple-400/60 transition-colors disabled:opacity-60 resize-none min-h-[42px] max-h-24 leading-normal shadow-inner va-dark-scroll"
              />

              <button
                type="submit"
                disabled={!inputText.trim() || activityStatus === 'Searching…' || activityStatus === 'Working…'}
                className="p-2.5 rounded-xl bg-gradient-to-br from-purple-600 to-violet-700 hover:from-purple-500 hover:to-violet-600 disabled:opacity-30 text-white transition-all border border-purple-400/40 shadow-md shadow-purple-950/40 shrink-0 self-center disabled:cursor-not-allowed hover:border-purple-300"
                title="Send message (Enter)"
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
