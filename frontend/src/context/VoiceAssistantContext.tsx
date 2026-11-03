import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../services/api';

export interface VoiceMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: Date;
  intent?: string;
  category?: 'READ' | 'WRITE' | 'NAVIGATION' | 'HELP' | 'CLARIFICATION';
  data?: any;
  actionDetails?: any;
  clarificationOptions?: string[];
  requiresConfirmation?: boolean;
  confirmationToken?: string;
}

export type AssistantState = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'CONFIRMING' | 'ERROR';

export type RealTimeStatus =
  | 'Ready'
  | 'Listening…'
  | 'Searching…'
  | 'Working…'
  | 'Speaking…'
  | 'Done'
  | "Couldn't complete the request";

export interface SupportedLanguage {
  code: string;
  label: string;
  nativeLabel: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'en-IN', label: 'English (India)', nativeLabel: 'English' },
  { code: 'te-IN', label: 'Telugu', nativeLabel: 'తెలుగు' },
  { code: 'hi-IN', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'en-US', label: 'English (US)', nativeLabel: 'English (US)' },
];

interface VoiceAssistantContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  assistantState: AssistantState;
  activityStatus: RealTimeStatus;
  transcript: string;
  interimTranscript: string;
  messages: VoiceMessage[];
  selectedLanguage: string;
  setSelectedLanguage: (lang: string) => void;
  isAutoSpeak: boolean;
  setIsAutoSpeak: (auto: boolean) => void;
  isSupported: boolean;
  permissionStatus: 'prompt' | 'granted' | 'denied';
  pendingConfirmation: VoiceMessage | null;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
  sendTextMessage: (text: string) => Promise<void>;
  confirmAction: (token: string) => Promise<void>;
  cancelAction: (token: string) => Promise<void>;
  clearConversation: () => void;
  stopSpeaking: () => void;
}

const VoiceAssistantContext = createContext<VoiceAssistantContextType | undefined>(undefined);

export const VoiceAssistantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [isOpen, setIsOpen] = useState(false);
  const [assistantState, setAssistantState] = useState<AssistantState>('IDLE');
  const [activityStatus, setActivityStatus] = useState<RealTimeStatus>('Ready');
  const statusTimerRef = useRef<any>(null);

  const setStatusWithTimeout = useCallback((newStatus: RealTimeStatus, resetDelayMs?: number) => {
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }
    setActivityStatus(newStatus);
    if (resetDelayMs) {
      statusTimerRef.current = setTimeout(() => {
        setActivityStatus('Ready');
        statusTimerRef.current = null;
      }, resetDelayMs);
    }
  }, []);

  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [messages, setMessages] = useState<VoiceMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Hello! I am CAFlow AI, your professional office assistant. Ask me to show clients, review pending tasks, find unpaid invoices, check attendance, list upcoming renewals, or open any module.',
      timestamp: new Date(),
    },
  ]);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('en-IN');
  const [isAutoSpeak, setIsAutoSpeak] = useState<boolean>(true);
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [pendingConfirmation, setPendingConfirmation] = useState<VoiceMessage | null>(null);

  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef<boolean>(false);
  const pendingConfirmationRef = useRef<VoiceMessage | null>(null);

  // Keep ref synced for event handlers
  useEffect(() => {
    pendingConfirmationRef.current = pendingConfirmation;
  }, [pendingConfirmation]);

  // Check Web Speech API availability
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
    }

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'microphone' as any }).then(res => {
        setPermissionStatus(res.state as any);
        res.onchange = () => setPermissionStatus(res.state as any);
      }).catch(() => {});
    }
  }, []);

  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Text-To-Speech function with high-fidelity speech synthesis and browser fallback
  const speakText = useCallback(
    async (text: string, forceLanguage?: string) => {
      if (!isAutoSpeak) return;

      // Stop any existing playback
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }

      setAssistantState('SPEAKING');
      setStatusWithTimeout('Speaking…');

      // Auto-detect Telugu Unicode characters
      const isTelugu = /[\u0C00-\u0C7F]/.test(text);
      const effectiveLang = forceLanguage || (isTelugu ? 'te-IN' : selectedLanguage);

      // 1. Try high-fidelity TTS synthesis first
      try {
        const res = await api.synthesizeVoiceAudio(text, effectiveLang);
        if (res.success && res.audioBase64) {
          const mimeType = (res as any).mimeType || 'audio/mpeg';
          const audio = new Audio(`data:${mimeType};base64,${res.audioBase64}`);
          currentAudioRef.current = audio;

          audio.onended = () => {
            currentAudioRef.current = null;
            setAssistantState(prev => (prev === 'SPEAKING' ? 'IDLE' : prev));
            setStatusWithTimeout('Done', 1800);
          };

          audio.onerror = () => {
            currentAudioRef.current = null;
            fallbackBrowserTTS(text, effectiveLang);
          };

          await audio.play();
          return;
        }
      } catch (err) {
        console.warn('[TTS Fallback to WebSpeech]', err);
      }

      // 2. Fallback to Browser SpeechSynthesis
      fallbackBrowserTTS(text, effectiveLang);
    },
    [isAutoSpeak, selectedLanguage, setStatusWithTimeout]
  );

  const fallbackBrowserTTS = (text: string, langToUse?: string) => {
    if (!window.speechSynthesis) {
      setAssistantState('IDLE');
      setStatusWithTimeout('Done', 1500);
      return;
    }

    const targetLang = langToUse || selectedLanguage;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = targetLang;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const matchedVoice = voices.find(v => v.lang.startsWith(targetLang.split('-')[0]));
    if (matchedVoice) utterance.voice = matchedVoice;

    utterance.onend = () => {
      setAssistantState(prev => (prev === 'SPEAKING' ? 'IDLE' : prev));
      setStatusWithTimeout('Done', 1800);
    };

    utterance.onerror = () => {
      setAssistantState(prev => (prev === 'SPEAKING' ? 'IDLE' : prev));
      setStatusWithTimeout('Done', 1500);
    };

    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (assistantState === 'SPEAKING') {
      setAssistantState('IDLE');
      setStatusWithTimeout('Done', 1000);
    }
  }, [assistantState, setStatusWithTimeout]);

  // Handle incoming parsed voice commands
  const handleCommandResult = useCallback(
    (result: any, userSpeech: string) => {
      setTranscript('');
      setInterimTranscript('');

      // Add user message to transcript
      const userMsg: VoiceMessage = {
        id: `user-${Date.now()}`,
        sender: 'user',
        text: userSpeech,
        timestamp: new Date(),
      };

      if (!result.success) {
        const errorMsg: VoiceMessage = {
          id: `asst-${Date.now()}`,
          sender: 'assistant',
          text: result.message || "Couldn't complete the request. Please try again.",
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, userMsg, errorMsg]);
        setAssistantState('IDLE');
        setStatusWithTimeout("Couldn't complete the request", 3000);
        speakText(errorMsg.text);
        return;
      }

      // Check for Navigation
      if (result.suggestedRoute) {
        navigate(result.suggestedRoute);
      }

      // Check for Attendance Date Filter synchronization
      const targetDate = result.data?.dateFilter || result.data?.selectedDate;
      if (targetDate && typeof targetDate === 'string') {
        window.dispatchEvent(
          new CustomEvent('caflow:attendance-date-change', { detail: { date: targetDate } })
        );
      }

      const asstMsg: VoiceMessage = {
        id: `asst-${Date.now()}`,
        sender: 'assistant',
        text: result.summary,
        timestamp: new Date(),
        intent: result.intent,
        category: result.category,
        data: result.data,
        actionDetails: result.actionDetails,
        clarificationOptions: result.clarificationOptions,
        requiresConfirmation: result.requiresConfirmation,
        confirmationToken: result.confirmationToken,
      };

      setMessages(prev => [...prev, userMsg, asstMsg]);

      if (result.requiresConfirmation && result.confirmationToken) {
        setPendingConfirmation(asstMsg);
        setAssistantState('CONFIRMING');
        setStatusWithTimeout('Working…');
      } else {
        setAssistantState('IDLE');
        if (!isAutoSpeak || !result.speechText) {
          setStatusWithTimeout('Completed', 1800);
        }
      }

      // Speak response
      if (result.speechText) {
        speakText(result.speechText, result.language);
      }
    },
    [navigate, speakText, isAutoSpeak, setStatusWithTimeout]
  );

  // Send Text / Spoken command to backend
  const sendTextMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      // Check if user is confirming or cancelling an active pending action via voice/text
      const pending = pendingConfirmationRef.current;
      const lower = text.toLowerCase().trim();

      if (pending && pending.confirmationToken) {
        if (
          lower === 'confirm' ||
          lower === 'yes' ||
          lower === 'proceed' ||
          lower === 'cheyi' ||
          lower === 'cheyyi' ||
          lower === 'avunu' ||
          lower === 'karo' ||
          lower === 'ha'
        ) {
          await confirmAction(pending.confirmationToken);
          return;
        }

        if (
          lower === 'cancel' ||
          lower === 'no' ||
          lower === 'stop' ||
          lower === 'vaddhu' ||
          lower === 'vaddu' ||
          lower === 'mat karo'
        ) {
          await cancelAction(pending.confirmationToken);
          return;
        }
      }

      const isNavigation =
        lower.startsWith('open ') ||
        lower.startsWith('go to ') ||
        lower.startsWith('navigate to ') ||
        lower.startsWith('take me to ') ||
        lower.endsWith('open cheyi') ||
        lower.endsWith('open cheyyi') ||
        lower.endsWith('open karo') ||
        text.includes('ఓపెన్ చేయి') ||
        lower === 'dashboard' ||
        lower === 'finance' ||
        lower === 'attendance' ||
        lower === 'reports' ||
        lower === 'settings' ||
        lower === 'clients' ||
        lower === 'renewals' ||
        lower === 'todo' ||
        lower === 'to-do' ||
        lower === 'to do';

      // Check whether command is retrieving records vs general conversation/action
      const isSearch =
        ((lower.includes('todo') || lower.includes('to-do') || lower.includes('to do')) && (lower.includes('show') || lower.includes('list') || lower.includes('my') || lower.includes('pending') || lower.includes('today') || lower.includes('chupinchu'))) ||
        (lower.includes('client') && (lower.includes('show') || lower.includes('find') || lower.includes('list') || lower.includes('get') || lower.includes('search') || lower.includes('give me'))) ||
        (lower.includes('task') && (lower.includes('show') || lower.includes('pending') || lower.includes('overdue') || lower.includes('my') || lower.includes('today') || lower.includes('tomorrow'))) ||
        (lower.includes('invoice') && (lower.includes('unpaid') || lower.includes('show') || lower.includes('find') || lower.includes('pending') || lower.includes('balance') || lower.includes('due'))) ||
        lower.includes('unpaid') ||
        lower.includes('balance due') ||
        (lower.includes('attendance') && (lower.includes('check') || lower.includes('show') || lower.includes('today') || lower.includes('tomorrow') || lower.includes('my'))) ||
        (lower.includes('renewal') && (lower.includes('show') || lower.includes('upcoming') || lower.includes('list') || lower.includes('due'))) ||
        text.includes('చూపించు') ||
        text.includes('లిస్ట్') ||
        text.includes('దिखाओ') ||
        text.includes('लिस्ट');

      if (isNavigation) {
        setStatusWithTimeout('Opening…');
      } else if (isSearch) {
        setStatusWithTimeout('Searching…');
      } else {
        setStatusWithTimeout('Working…');
      }

      setAssistantState('PROCESSING');
      stopSpeaking();

      try {
        const pageContext = {
          activePath: location.pathname,
          currentDate: new Date().toISOString().split('T')[0],
        };
        const historyPayload = messages.slice(-8).map(m => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.text,
        }));
        const res = await api.processVoiceCommand(text, selectedLanguage, pageContext, historyPayload);
        handleCommandResult(res, text);
      } catch (err: any) {
        const errorMsg: VoiceMessage = {
          id: `asst-${Date.now()}`,
          sender: 'assistant',
          text: err?.message || "Couldn't complete the request. Please check your network.",
          timestamp: new Date(),
        };
        setMessages(prev => [
          ...prev,
          { id: `user-${Date.now()}`, sender: 'user', text, timestamp: new Date() },
          errorMsg,
        ]);
        setAssistantState('IDLE');
        setStatusWithTimeout("Couldn't complete the request", 3000);
        speakText("Couldn't complete the request.");
      }
    },
    [handleCommandResult, selectedLanguage, speakText, stopSpeaking, location.pathname, setStatusWithTimeout]
  );

  // Confirm pending action
  const confirmAction = useCallback(
    async (token: string) => {
      setAssistantState('PROCESSING');
      setStatusWithTimeout('Working…');
      setPendingConfirmation(null);
      stopSpeaking();

      try {
        const res = await api.confirmVoiceAction(token, 'CONFIRM');

        // Dispatch targeted custom events to trigger real-time UI data refreshes
        if (res.data) {
          if (res.data.clientType || res.data.pan || res.data.gstin) {
            window.dispatchEvent(new CustomEvent('caflow:client-created', { detail: res.data }));
          }
          if (res.data.renewalType) {
            window.dispatchEvent(new CustomEvent('caflow:renewal-created', { detail: res.data }));
          }
          if (res.data.priority && res.data.dueDate) {
            window.dispatchEvent(new CustomEvent('caflow:task-created', { detail: res.data }));
          }
          if (res.data.title && !res.data.dueDate) {
            window.dispatchEvent(new CustomEvent('caflow:todo-created', { detail: res.data }));
          }
          if (res.data.checkInTime !== undefined) {
            window.dispatchEvent(new CustomEvent('caflow:attendance-updated', { detail: res.data }));
          }
        }

        const confirmMsg: VoiceMessage = {
          id: `asst-${Date.now()}`,
          sender: 'assistant',
          text: res.summary,
          timestamp: new Date(),
          data: res.data,
        };
        setMessages(prev => [
          ...prev,
          { id: `user-${Date.now()}`, sender: 'user', text: 'Confirm', timestamp: new Date() },
          confirmMsg,
        ]);
        setAssistantState('IDLE');
        if (!isAutoSpeak || !res.speechText) {
          setStatusWithTimeout('Done', 1800);
        }
        speakText(res.speechText || 'Action executed successfully.', res.language);
      } catch (err: any) {
        const errMsg: VoiceMessage = {
          id: `asst-${Date.now()}`,
          sender: 'assistant',
          text: err?.message || "Couldn't complete the action.",
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errMsg]);
        setAssistantState('IDLE');
        setStatusWithTimeout("Couldn't complete the request", 3000);
        speakText("Couldn't complete the action.");
      }
    },
    [speakText, stopSpeaking, isAutoSpeak, setStatusWithTimeout]
  );

  // Cancel pending action
  const cancelAction = useCallback(
    async (token: string) => {
      setAssistantState('PROCESSING');
      setStatusWithTimeout('Working…');
      setPendingConfirmation(null);
      stopSpeaking();

      let cancelSpeech = 'Action cancelled.';
      let cancelSummary = 'Action cancelled. How else can I help you?';
      let cancelLang = selectedLanguage;

      try {
        const res = await api.confirmVoiceAction(token, 'CANCEL');
        if (res.speechText) cancelSpeech = res.speechText;
        if (res.summary) cancelSummary = res.summary;
        if (res.language) cancelLang = res.language;
      } catch {}

      const cancelMsg: VoiceMessage = {
        id: `asst-${Date.now()}`,
        sender: 'assistant',
        text: cancelSummary,
        timestamp: new Date(),
      };
      setMessages(prev => [
        ...prev,
        { id: `user-${Date.now()}`, sender: 'user', text: 'Cancel', timestamp: new Date() },
        cancelMsg,
      ]);
      setAssistantState('IDLE');
      if (!isAutoSpeak || !cancelSpeech) {
        setStatusWithTimeout('Done', 1500);
      }
      speakText(cancelSpeech, cancelLang);
    },
    [selectedLanguage, speakText, stopSpeaking, isAutoSpeak, setStatusWithTimeout]
  );

  // Start Speech Recognition
  const startListening = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      setAssistantState('ERROR');
      setStatusWithTimeout("Couldn't complete the request", 3000);
      return;
    }

    stopSpeaking();

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }

      const recognition = new SpeechRecognition();
      recognition.lang = selectedLanguage;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        isListeningRef.current = true;
        setAssistantState('LISTENING');
        setStatusWithTimeout('Listening…');
        setTranscript('');
        setInterimTranscript('');
      };

      recognition.onresult = (event: any) => {
        let currentInterim = '';
        let currentFinal = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i];
          if (item.isFinal) {
            currentFinal += item[0].transcript;
          } else {
            currentInterim += item[0].transcript;
          }
        }

        if (currentInterim) {
          setInterimTranscript(currentInterim);
        }

        if (currentFinal) {
          setTranscript(currentFinal);
          setInterimTranscript('');
          sendTextMessage(currentFinal);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('[Voice Recognition Error]', event.error);
        if (event.error === 'not-allowed') {
          setPermissionStatus('denied');
        }
        setAssistantState('IDLE');
        setStatusWithTimeout("Couldn't complete the request", 2500);
        isListeningRef.current = false;
      };

      recognition.onend = () => {
        isListeningRef.current = false;
        setAssistantState(prev => (prev === 'LISTENING' ? 'IDLE' : prev));
        setActivityStatus(prev => (prev === 'Listening…' ? 'Ready' : prev));
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('[Voice Assistant Start Error]', err);
      setAssistantState('IDLE');
      setStatusWithTimeout("Couldn't complete the request", 2500);
    }
  }, [selectedLanguage, sendTextMessage, stopSpeaking, setStatusWithTimeout]);

  // Stop Speech Recognition
  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListeningRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      isListeningRef.current = false;
    }
    setAssistantState(prev => (prev === 'LISTENING' ? 'IDLE' : prev));
    setActivityStatus(prev => (prev === 'Listening…' ? 'Ready' : prev));
  }, []);

  // Toggle listening
  const toggleListening = useCallback(() => {
    if (assistantState === 'LISTENING') {
      stopListening();
    } else {
      startListening();
    }
  }, [assistantState, startListening, stopListening]);

  // Global Keyboard shortcut: Alt+V to toggle assistant
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const clearConversation = useCallback(() => {
    stopSpeaking();
    setMessages([
      {
        id: 'welcome-reset',
        sender: 'assistant',
        text: 'Conversation cleared. How can I assist you with your CA practice today?',
        timestamp: new Date(),
      },
    ]);
    setPendingConfirmation(null);
    setTranscript('');
    setInterimTranscript('');
    setAssistantState('IDLE');
    setStatusWithTimeout('Ready');
  }, [setStatusWithTimeout, stopSpeaking]);

  return (
    <VoiceAssistantContext.Provider
      value={{
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
      }}
    >
      {children}
    </VoiceAssistantContext.Provider>
  );
};

export const useVoiceAssistant = (): VoiceAssistantContextType => {
  const context = useContext(VoiceAssistantContext);
  if (!context) {
    throw new Error('useVoiceAssistant must be used within a VoiceAssistantProvider');
  }
  return context;
};
