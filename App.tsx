
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Note, AppState, AIResponse, Subtask, NoteType, User } from './types';
import { processAudioNote, formatTextNote, analyzeImageNote, streamSpeech, transcribeAudio, generateIllustration } from './services/geminiService';
import { blobToBase64, formatDateLabel, getLocalDateKey, AudioStreamPlayer, resizeImage } from './utils/audioUtils';
import { StepTracker } from './utils/stepTracker';
import { LiveManager } from './services/liveManager';
import { authService } from './services/authService';
import VoiceRecorder from './components/VoiceRecorder';
import NoteCard from './components/NoteCard';
import CalendarView from './components/CalendarView';
import AuthScreen from './components/AuthScreen';

const ALARM_SOUND = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';
const TICK_SOUND = 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3';
const WEEKLY_LIMIT = 5;

const App: React.FC = () => {
  // --- AUTH STATE ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'auth' | 'premium'>('auth');

  // --- APP STATE ---
  const [notes, setNotes] = useState<Note[]>([]);
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  
  // Draft State (Persisted)
  const [inputText, setInputText] = useState('');
  const [draftImage, setDraftImage] = useState<string | null>(null); // Base64
  const [draftImagePreview, setDraftImagePreview] = useState<string | null>(null); // Blob URL for display

  const [isRecording, setIsRecording] = useState(false); // For Footer Voice Note (Long form processing)
  const [searchQuery, setSearchQuery] = useState('');
  const [activeAlarms, setActiveAlarms] = useState<Note[]>([]);
  const [isInputModalOpen, setIsInputModalOpen] = useState(false);
  
  // Shortcuts Menu State
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  // Toast Notification State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Camera State
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // TTS State - Track which note is currently being read
  const [readingNoteId, setReadingNoteId] = useState<string | null>(null);
  
  // New Dictation State (Audio Recording Based)
  const [dictationStatus, setDictationStatus] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const dictationRecorderRef = useRef<MediaRecorder | null>(null);
  const dictationChunksRef = useRef<Blob[]>([]);

  // Live Chat State
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [activeDiscussNoteId, setActiveDiscussNoteId] = useState<string | null>(null);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const speakingTimeout = useRef<number | null>(null);

  // AI Interaction State
  const [aiAssistant, setAiAssistant] = useState<{
    question: string;
    suggestion: string;
    pendingNoteId: string;
  } | null>(null);

  // View State
  const [activeView, setActiveView] = useState<'timeline' | 'calendar'>('timeline');

  // References
  const alarmAudio = useRef<HTMLAudioElement | null>(null);
  const ttsAudioContext = useRef<AudioContext | null>(null);
  const audioStreamer = useRef<AudioStreamPlayer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stepTracker = useRef<StepTracker | null>(null);
  const activeTrackerNoteId = useRef<string | null>(null);
  const liveManager = useRef<LiveManager | null>(null);
  
  // Navigation Refs
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const timelineListRef = useRef<HTMLDivElement>(null);

  // Track speech generation requests to cancel pending ones if user interrupts
  const speechGenerationId = useRef(0);

  // --- INITIALIZATION ---

  // Check Auth on Mount (Subscribe to Real Backend)
  useEffect(() => {
    const unsubscribe = authService.subscribe((user) => {
        setCurrentUser(user);
        setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Request notification permissions
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // RESTORE DRAFTS & NOTES
  useEffect(() => {
    // If guest, use 'guest' as ID suffix.
    const storageId = currentUser ? currentUser.id : 'guest';

    // Restore Drafts
    const savedText = localStorage.getItem(`chronos_draft_text_${storageId}`);
    const savedImage = localStorage.getItem(`chronos_draft_image_${storageId}`);
    
    if (savedText) setInputText(savedText);
    if (savedImage) {
        setDraftImage(savedImage);
        setDraftImagePreview(`data:image/jpeg;base64,${savedImage}`);
    }

    // Restore Notes
    const savedNotes = localStorage.getItem(`chronos_notes_v5_${storageId}`);
    if (savedNotes) {
      try {
        const parsedNotes = JSON.parse(savedNotes);
        setNotes(parsedNotes);
        
        // Resume Tracker
        const activeTracker = parsedNotes.find((n: Note) => n.type === 'tracker' && n.isTracking);
        if (activeTracker) {
             activeTrackerNoteId.current = activeTracker.id;
             // Ensure tracker initialized before starting
             if (!stepTracker.current) {
                 stepTracker.current = new StepTracker((steps) => {
                     if (activeTrackerNoteId.current) {
                        setNotes(prev => prev.map(n => 
                            n.id === activeTrackerNoteId.current ? { ...n, stepCount: steps } : n
                        ));
                     }
                 });
             }
             stepTracker.current.start();
        }
      } catch (e) {
        console.error("Failed to parse notes", e);
      }
    } else {
        setNotes([]); // Clear notes if switching user and no notes found
    }
  }, [currentUser]);

  // ONBOARDING LOGIC
  useEffect(() => {
      const storageId = currentUser ? currentUser.id : 'guest';
      const key = `chronos_onboarding_${storageId}`;
      const shownCount = parseInt(localStorage.getItem(key) || '0');
      if (shownCount < 3) {
          const timer = setTimeout(() => {
              showToast("Swipe left to view Calendar →");
              localStorage.setItem(key, (shownCount + 1).toString());
          }, 1500);
          return () => clearTimeout(timer);
      }
  }, [currentUser]);

  // SAVE TEXT DRAFT AUTOMATICALLY
  useEffect(() => {
    const storageId = currentUser ? currentUser.id : 'guest';
    localStorage.setItem(`chronos_draft_text_${storageId}`, inputText);
  }, [inputText, currentUser]);

  // Save to local storage
  useEffect(() => {
    const storageId = currentUser ? currentUser.id : 'guest';
    localStorage.setItem(`chronos_notes_v5_${storageId}`, JSON.stringify(notes));
  }, [notes, currentUser]);


  // Initialize Alarm & Step Tracker (Audio Context is lazy loaded)
  useEffect(() => {
    alarmAudio.current = new Audio(ALARM_SOUND);
    alarmAudio.current.loop = true;
    alarmAudio.current.volume = 0.5;

    // Initialize Step Tracker
    stepTracker.current = new StepTracker((steps) => {
        if (activeTrackerNoteId.current) {
            setNotes(prev => prev.map(n => {
                if (n.id === activeTrackerNoteId.current) {
                    return { ...n, stepCount: steps };
                }
                return n;
            }));
        }
    });

    return () => {
      if (alarmAudio.current) {
        alarmAudio.current.pause();
        alarmAudio.current = null;
      }
      if (ttsAudioContext.current) {
        ttsAudioContext.current.close();
      }
      if (audioStreamer.current) {
        audioStreamer.current.stop();
      }
      if (stepTracker.current) {
          stepTracker.current.stop();
      }
      if (liveManager.current) {
          liveManager.current.disconnect();
      }
      stopCamera();
    };
  }, []);

  // --- FEATURE ACCESS LOGIC ---
  const checkFeatureAccess = () => {
      // 1. Premium Users have unlimited access
      if (currentUser?.isPremium) return true;

      // 2. Determine Storage Key for Usage Data
      const usageKey = currentUser ? `chronos_usage_${currentUser.id}` : 'chronos_usage_guest';
      const rawUsage = localStorage.getItem(usageKey);
      let usageData = rawUsage 
        ? JSON.parse(rawUsage) 
        : { count: 0, weekStart: Date.now() };

      // 3. Check for Weekly Reset (7 days = 604800000 ms)
      const now = Date.now();
      if (now - usageData.weekStart > 604800000) {
          usageData = { count: 0, weekStart: now };
      }

      // 4. Check Limits
      if (usageData.count >= WEEKLY_LIMIT) {
          if (!currentUser) {
              setAuthModalMode('auth'); // Guest -> Needs to signup (to get free plan or pay)
          } else {
              setAuthModalMode('premium'); // Free User -> Needs to pay
          }
          setShowAuthModal(true);
          return false;
      }

      // 5. Increment Usage
      usageData.count++;
      localStorage.setItem(usageKey, JSON.stringify(usageData));
      return true;
  };

  // Audio Context Helper - Lazy Initialization & Resumption
  const ensureAudioContext = useCallback(async () => {
    if (!ttsAudioContext.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        ttsAudioContext.current = new AudioContextClass({ latencyHint: 'interactive' }); 
        audioStreamer.current = new AudioStreamPlayer(ttsAudioContext.current);
        audioStreamer.current.setPlayStateCallback((isPlaying) => {
            if (!isPlaying && !isLiveActive) {
                setReadingNoteId(null);
            }
        });
    }
    
    if (ttsAudioContext.current.state === 'suspended') {
      try {
        await ttsAudioContext.current.resume();
      } catch (e) {
        console.error("Audio Context resume failed", e);
      }
    }
    return ttsAudioContext.current;
  }, [isLiveActive]);

  // Speech Helper
  const stopSpeaking = useCallback(() => {
    speechGenerationId.current += 1; // Invalidate previous requests
    setReadingNoteId(null);

    if (audioStreamer.current) {
      audioStreamer.current.stop();
    }
    
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const speakResponse = useCallback(async (text: string, isAlarm = false, noteId?: string) => {
    if (!text || isLiveActive) return; // Don't speak if live chat is active
    
    stopSpeaking();
    const myId = speechGenerationId.current;

    const streamPromise = streamSpeech(text).catch(e => {
        console.warn("Gemini TTS stream init failed", e);
        return null;
    });

    const contextPromise = ensureAudioContext().catch(e => {
        console.error("Could not init audio context", e);
        return null;
    });

    if (alarmAudio.current && isAlarm) alarmAudio.current.volume = 0.1;

    let streamedAnyAudio = false;

    try {
      const [stream, context] = await Promise.all([streamPromise, contextPromise]);
      
      if (!stream || !context || speechGenerationId.current !== myId) {
          return;
      }
      
      if (noteId) setReadingNoteId(noteId);

      for await (const chunk of stream) {
        if (speechGenerationId.current !== myId) {
          console.log("Speech interrupted");
          break;
        }

        const base64Audio = chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio && audioStreamer.current) {
           streamedAnyAudio = true;
           audioStreamer.current.scheduleChunk(base64Audio);
        }
      }
    } catch (e) {
      console.warn("Gemini TTS stream loop error", e);
    } finally {
      if (speechGenerationId.current === myId && !streamedAnyAudio) {
        console.log("Using Browser TTS Fallback");
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 0.9;
          utterance.text = text.replace(/[*_#`]/g, ''); 
          
          utterance.onstart = () => { if (noteId) setReadingNoteId(noteId); };
          utterance.onend = () => setReadingNoteId(null);
          utterance.onerror = () => setReadingNoteId(null);

          window.speechSynthesis.speak(utterance);
        }
      }

      if (speechGenerationId.current === myId && alarmAudio.current && isAlarm) {
        alarmAudio.current.volume = 0.5;
      }
    }
  }, [ensureAudioContext, stopSpeaking, isLiveActive]);

  const showToast = (message: string) => {
      setToastMessage(message);
      setTimeout(() => setToastMessage(null), 4000);
  };

  // TRACKER LOGIC
  const startTrackingSteps = useCallback((initialContent: string = "Tracking Steps...") => {
    if (activeTrackerNoteId.current) {
        setNotes(prev => prev.map(n => {
            if (n.id === activeTrackerNoteId.current) {
                return { ...n, isTracking: false, content: `Walked ${n.stepCount || 0} steps` };
            }
            return n;
        }));
    }

    const newId = crypto.randomUUID();
    const newNote: Note = {
        id: newId,
        userId: currentUser?.id,
        timestamp: Date.now(),
        content: initialContent,
        type: 'tracker',
        isTracking: true,
        stepCount: 0,
        formatted: true
    };
    
    setNotes(prev => [newNote, ...prev]);
    activeTrackerNoteId.current = newId;
    stepTracker.current?.start();
    
    if (!isLiveActive) {
        speakResponse("Starting step tracker.", false, newId);
    }
    showToast("Step tracker active!");
  }, [isLiveActive, speakResponse, currentUser]);

  const stopTrackingSteps = useCallback((noteId?: string) => {
    const targetId = noteId || activeTrackerNoteId.current;
    if (!targetId) return;
    
    if (targetId === activeTrackerNoteId.current) {
        const finalSteps = stepTracker.current?.stop() || 0;
        const calories = Math.floor(finalSteps * 0.04); 
        
        setNotes(prev => prev.map(n => {
            if (n.id === targetId) {
                return {
                    ...n,
                    isTracking: false,
                    stepCount: finalSteps,
                    caloriesBurned: calories,
                    content: `Walked ${finalSteps} steps`,
                    type: n.type // Keep original type unless changed elsewhere
                };
            }
            return n;
        }));
        activeTrackerNoteId.current = null;
        
        if (!isLiveActive) {
            speakResponse(`Workout complete.`, false, targetId);
        }
        showToast("Tracking stopped.");
    } else {
        setNotes(prev => prev.map(n => {
            if (n.id === targetId) {
                return { ...n, isTracking: false };
            }
            return n;
        }));
    }
  }, [isLiveActive, speakResponse]);


  // Live Chat Handlers
  const toggleLiveChat = (context?: string) => {
    if (isLiveActive && !context) {
      liveManager.current?.disconnect();
      liveManager.current = null;
      setIsLiveActive(false);
      setIsLiveConnected(false);
      setActiveDiscussNoteId(null);
    } else {
      if (!context) {
          // Check access if just toggling via button
          if (!checkFeatureAccess()) return;
      }
    
      if (isLiveActive) {
          liveManager.current?.disconnect();
      }

      stopSpeaking();
      setIsLiveActive(true);
      
      const sortedNotes = [...notes].sort((a, b) => {
         const timeA = a.reminderDate || a.timestamp;
         const timeB = b.reminderDate || b.timestamp;
         return timeA - timeB;
      });
      
      const now = Date.now();
      const relevantNotes = sortedNotes.filter(n => {
         const t = n.reminderDate || n.timestamp;
         return t > now - 172800000; 
      }).slice(0, 50);

      const timelineContext = relevantNotes.map(n => {
         const time = n.reminderDate || n.timestamp;
         const dateStr = new Date(time).toLocaleString();
         let extra = '';
         if (n.type === 'tracker') {
             extra = n.isTracking ? ' [TRACKING ACTIVE]' : ` [Steps: ${n.stepCount}]`;
         }
         return `[${dateStr}] (ID: ${n.id}) [Type: ${n.type}] ${n.content}${extra}`;
      }).join('\n');
      
      liveManager.current = new LiveManager({
        onStatusChange: (connected) => setIsLiveConnected(connected),
        onError: (err) => {
            console.error(err);
            setIsLiveConnected(false);
            setIsLiveActive(false);
            setActiveDiscussNoteId(null);
        },
        onNoteCreate: (data) => {
            if (data.type === 'tracker') {
                startTrackingSteps(data.content);
                return;
            }

            const reminderTime = data.reminderTime ? new Date(data.reminderTime).getTime() : undefined;
            const newId = crypto.randomUUID();
            const newNote: Note = {
                id: newId,
                userId: currentUser?.id,
                timestamp: Date.now(),
                content: data.content,
                type: data.type || 'text',
                formatted: true,
                isReminder: data.isReminder || !!reminderTime,
                reminderDate: reminderTime,
                reminderDismissed: false,
                notificationsSent: [],
                isGeneratingImage: !!data.visualPrompt
            };
            setNotes(prev => [newNote, ...prev]);
            new Audio(TICK_SOUND).play().catch(() => {});
            showToast("Note created by Chronos.");

            if (data.visualPrompt) {
               generateIllustration(data.visualPrompt).then(url => {
                   if (url) {
                       setNotes(prev => prev.map(n => 
                           n.id === newId ? { ...n, imageUrl: url, isGeneratingImage: false } : n
                       ));
                   } else {
                       setNotes(prev => prev.map(n => 
                           n.id === newId ? { ...n, isGeneratingImage: false } : n
                       ));
                   }
               });
            }
        },
        onNoteUpdate: (noteId, updates) => {
            let finalSteps: number | null = null;

            // Side Effect: Stop Hardware Tracking if needed
            if (activeTrackerNoteId.current === noteId) {
                 const shouldStop = (updates.isTracking === false) || (updates.type && updates.type !== 'tracker');
                 if (shouldStop) {
                     finalSteps = stepTracker.current?.stop() || 0;
                     activeTrackerNoteId.current = null;
                 }
            }

            setNotes(prev => prev.map(n => {
                if (n.id === noteId) {
                    const u = { ...n };
                    
                    // Apply Updates
                    if (updates.content) u.content = updates.content;
                    if (updates.type) u.type = updates.type;
                    if (updates.isTracking !== undefined) u.isTracking = updates.isTracking;
                    
                    // Apply Side Effect Result (Tracker Stop)
                    if (finalSteps !== null) {
                        u.isTracking = false;
                        u.stepCount = finalSteps;
                        // If converted to text, append steps context
                        if (u.type === 'text') {
                            u.content = `${u.content} \n(Final Count: ${finalSteps} steps)`;
                        }
                    }

                    // Reminder Logic
                    if (updates.reminderTime) {
                        const t = new Date(updates.reminderTime).getTime();
                        if (!isNaN(t)) {
                            u.reminderDate = t;
                            u.isReminder = true;
                            u.reminderDismissed = false;
                            u.notificationsSent = [];
                        }
                    }
                    if (updates.isReminder !== undefined) {
                        u.isReminder = updates.isReminder;
                        if (!u.isReminder) u.reminderDate = undefined;
                    }

                    // Image Logic
                    if (updates.visualPrompt) {
                        if (updates.visualPrompt === 'REMOVE_IMAGE') {
                             u.imageUrl = undefined;
                             u.isGeneratingImage = false;
                        } else {
                             u.isGeneratingImage = true;
                        }
                    }

                    return u;
                }
                return n;
            }));

            // Async Image Gen Side Effect
            if (updates.visualPrompt && updates.visualPrompt !== 'REMOVE_IMAGE') {
                generateIllustration(updates.visualPrompt).then(url => {
                    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, imageUrl: url || n.imageUrl, isGeneratingImage: false } : n));
                });
            }

            new Audio(TICK_SOUND).play().catch(() => {});
            showToast("Updated.");
        },
        onAudioOutput: () => {
          setIsAiSpeaking(true);
          if (speakingTimeout.current) clearTimeout(speakingTimeout.current);
          speakingTimeout.current = window.setTimeout(() => setIsAiSpeaking(false), 500);
        }
      });
      liveManager.current.connect(context, timelineContext);
    }
  };

  const handleDiscussSuggestion = () => {
    if (!aiAssistant) return;
    const note = notes.find(n => n.id === aiAssistant.pendingNoteId);
    const context = `I just added a note: "${note?.content}". You asked: "${aiAssistant.question}". You suggested: "${aiAssistant.suggestion}". I want to discuss this.`;
    toggleLiveChat(context);
  };

  const handleDiscussNote = (note: Note) => {
     if (isLiveActive && activeDiscussNoteId === note.id) {
         toggleLiveChat();
         return;
     }

     if (!checkFeatureAccess()) return;

     setActiveDiscussNoteId(note.id);
     
     let context = `CURRENT FOCUS: Note ID "${note.id}". Content: "${note.content}". Type: "${note.type}".
     User Intent: Discuss or Modify this note.
     `;
     
     if (note.type === 'tracker') {
         context += ` Status: ${note.isTracking ? 'TRACKING' : 'STOPPED'}. Steps: ${note.stepCount || 0}.`;
     }
     
     toggleLiveChat(context);
  };

  
  // --- NEW DICTATION LOGIC (Server-Side Transcription) ---
  const toggleDictation = useCallback(async () => {
    if (dictationStatus === 'recording') {
        if (dictationRecorderRef.current && dictationRecorderRef.current.state !== 'inactive') {
            dictationRecorderRef.current.stop();
        }
        return;
    }

    if (dictationStatus === 'idle') {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            dictationRecorderRef.current = recorder;
            dictationChunksRef.current = [];

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    dictationChunksRef.current.push(event.data);
                }
            };

            recorder.onstop = async () => {
                 stream.getTracks().forEach(track => track.stop());
                 const audioBlob = new Blob(dictationChunksRef.current, { type: 'audio/webm' });
                 
                 setDictationStatus('transcribing');
                 try {
                     const base64 = await blobToBase64(audioBlob);
                     const text = await transcribeAudio(base64, audioBlob.type);
                     if (text) {
                         setInputText(prev => {
                             const prefix = prev.trim() ? prev.trim() + ' ' : '';
                             return prefix + text;
                         });
                     }
                 } catch (error) {
                     console.error("Dictation transcription failed", error);
                     alert("Could not transcribe audio. Please try again.");
                 } finally {
                     setDictationStatus('idle');
                 }
            };

            recorder.start();
            setDictationStatus('recording');
        } catch (err) {
            console.error("Mic permission denied", err);
            alert("Microphone access is required for dictation.");
        }
    }
  }, [dictationStatus]);

  // Smart Reminder Logic
  useEffect(() => {
    const checkReminders = () => {
      const now = Date.now();
      let updated = false;
      const newNotes = [...notes];
      const alarms: Note[] = [];

      newNotes.forEach((note, idx) => {
        if (!note.isReminder || !note.reminderDate || note.reminderDismissed) return;

        const diff = note.reminderDate - now;
        const sent = note.notificationsSent || [];

        if (diff <= 0) {
          alarms.push(note);
          if (!sent.includes('alarm')) {
            triggerNotification('ALARM: ' + note.content.slice(0, 50), true);
            speakResponse(`Time for: ${note.content}`, true, note.id);
            newNotes[idx] = { ...note, notificationsSent: [...sent, 'alarm'] };
            updated = true;
          }
        } else {
          const thresholds = [
            { label: '1h', ms: 3600000 },
            { label: '30m', ms: 1800000 },
            { label: '15m', ms: 900000 },
            { label: '5m', ms: 300000 }
          ];

          for (const t of thresholds) {
            if (diff <= t.ms && !sent.includes(t.label)) {
              triggerNotification(`Reminder: ${t.label} until ${note.content.slice(0, 30)}...`, false);
              newNotes[idx] = { ...note, notificationsSent: [...sent, t.label] };
              updated = true;
              break;
            }
          }
        }
      });

      if (updated) setNotes(newNotes);
      setActiveAlarms(alarms);
      
      if (alarms.length > 0) {
        if (alarmAudio.current && alarmAudio.current.paused) {
          alarmAudio.current.play().catch(e => console.log("Audio play blocked", e));
        }
      } else {
        if (alarmAudio.current && !alarmAudio.current.paused) {
          alarmAudio.current.pause();
          alarmAudio.current.currentTime = 0;
        }
      }
    };

    const interval = setInterval(checkReminders, 1000);
    checkReminders();
    return () => clearInterval(interval);
  }, [notes, speakResponse]);

  const triggerNotification = (body: string, critical: boolean) => {
    if (Notification.permission === 'granted') {
      new Notification('Chronos Timeline', {
        body,
        icon: '/favicon.ico',
        tag: critical ? 'alarm' : undefined,
        requireInteraction: critical
      });
    }
    if (!critical) {
      new Audio(TICK_SOUND).play().catch(() => {});
    }
  };

  // Main Note Creator (Updated for Advanced Features)
  const addNote = async (aiRes: AIResponse, type: 'text' | 'voice' | 'image', audioUrl?: string, imageUrl?: string) => {
    // Handle Intent
    if (aiRes.intent === 'track_steps_start') {
        startTrackingSteps();
        return;
    }
    if (aiRes.intent === 'track_steps_stop') {
        stopTrackingSteps();
        return;
    }

    const reminderTime = aiRes.reminderDate ? new Date(aiRes.reminderDate).getTime() : undefined;
    const newId = crypto.randomUUID();

    // Map subtasks
    const subtasks: Subtask[] | undefined = aiRes.subtasks?.map((text, i) => ({
      id: `${newId}-task-${i}`,
      text,
      completed: false
    }));

    const newNote: Note = {
      id: newId,
      userId: currentUser?.id,
      timestamp: Date.now(),
      content: aiRes.formatted || 'New Note',
      rawTranscript: aiRes.transcript,
      type,
      audioUrl,
      imageUrl,
      isGeneratingImage: !!aiRes.visualPrompt, // Set loading state if we are generating
      formatted: true,
      isReminder: !!reminderTime,
      reminderDate: reminderTime,
      reminderDismissed: false,
      notificationsSent: [],
      subtasks: subtasks
    };
    
    setNotes(prev => [newNote, ...prev]);
    showToast("Note added.");

    // Trigger Side Effects (Visual Generation)
    if (aiRes.visualPrompt) {
      try {
        const generatedImage = await generateIllustration(aiRes.visualPrompt);
        if (generatedImage) {
          setNotes(prev => prev.map(n => 
            n.id === newId ? { ...n, imageUrl: generatedImage, isGeneratingImage: false } : n
          ));
        } else {
           // Clear loading state if failed
           setNotes(prev => prev.map(n => 
            n.id === newId ? { ...n, isGeneratingImage: false } : n
          ));
        }
      } catch(e) {
         console.error("Async visual generation failed", e);
      }
    }

    // Handle AI Proactivity
    if (aiRes.aiQuestion && aiRes.aiSuggestion) {
      setAiAssistant({
        question: aiRes.aiQuestion,
        suggestion: aiRes.aiSuggestion,
        pendingNoteId: newId
      });
      new Audio(TICK_SOUND).play().catch(() => {});
      
      speakResponse(aiRes.aiQuestion, false, newId);
    } else {
      setAiAssistant(null);
    }
  };

  // CLEANUP HELPER
  const clearDrafts = () => {
    setInputText('');
    setDraftImage(null);
    setDraftImagePreview(null);
    const storageId = currentUser ? currentUser.id : 'guest';
    localStorage.removeItem(`chronos_draft_text_${storageId}`);
    localStorage.removeItem(`chronos_draft_image_${storageId}`);
  };

  const toggleAlarm = (id: string) => {
    stopSpeaking();
    setNotes(prev => prev.map(n => {
        if (n.id === id) {
            return { ...n, reminderDismissed: !n.reminderDismissed };
        }
        return n;
    }));
  };

  // UNIFIED SUBMIT HANDLER
  const handleTextSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (appState === AppState.PROCESSING) return;
    if (!inputText.trim() && !draftImage) return;

    const rawText = inputText;
    const rawImage = draftImage;

    setIsInputModalOpen(false);
    clearDrafts();
    setAppState(AppState.PROCESSING); // Show processing indicator on main screen
    stopSpeaking();

    await ensureAudioContext();

    try {
        let aiRes: AIResponse;
        
        if (rawImage) {
             aiRes = await analyzeImageNote(rawImage, 'image/jpeg', rawText, notes);
             const persistentUrl = `data:image/jpeg;base64,${rawImage}`;
             addNote(aiRes, 'image', undefined, persistentUrl);
        } else {
             aiRes = await formatTextNote(rawText, notes);
             addNote(aiRes, 'text');
        }

        setAppState(AppState.IDLE);

    } catch (err) {
        console.error(err);
        setAppState(AppState.ERROR);
        setTimeout(() => setAppState(AppState.IDLE), 3000);
    }
  };

  const handleVoiceStop = async (blob: Blob) => {
    setAppState(AppState.PROCESSING);
    setIsRecording(false);
    setIsInputModalOpen(false); // Close modal
    stopSpeaking();
    await ensureAudioContext();
    
    try {
      const base64 = await blobToBase64(blob);
      const audioUrl = URL.createObjectURL(blob);
      const aiRes = await processAudioNote(base64, blob.type, notes);
      addNote(aiRes, 'voice', audioUrl);
      setAppState(AppState.IDLE);
    } catch (err) {
      console.error(err);
      setAppState(AppState.ERROR);
      setTimeout(() => setAppState(AppState.IDLE), 3000);
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!checkFeatureAccess()) {
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
    }

    setAppState(AppState.PROCESSING);
    stopSpeaking();
    
    try {
      const resizedBlob = await resizeImage(file);
      const base64 = await blobToBase64(resizedBlob);
      const storageId = currentUser ? currentUser.id : 'guest';
      localStorage.setItem(`chronos_draft_image_${storageId}`, base64);

      setDraftImage(base64);
      setDraftImagePreview(URL.createObjectURL(resizedBlob));
      setIsInputModalOpen(true);
      if (isCameraOpen) stopCamera();
      
    } catch (err) {
      console.error("Image processing failed", err);
    } finally {
      setAppState(AppState.IDLE);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const startCamera = async () => {
    if (!checkFeatureAccess()) return;

    setIsCameraOpen(true);
    setIsInputModalOpen(true);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      streamRef.current = stream;
      
    } catch (err) {
      console.error("Camera failed", err);
      setIsCameraOpen(false);
      alert("Could not access camera. Please allow permissions.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  const capturePhoto = async () => {
    if (!videoRef.current) return;
    
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(video, 0, 0);
    
    canvas.toBlob(async (blob) => {
      if (blob) {
         const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
         const resizedBlob = await resizeImage(file);
         const base64 = await blobToBase64(resizedBlob);
         
         setDraftImage(base64);
         setDraftImagePreview(URL.createObjectURL(resizedBlob));
         const storageId = currentUser ? currentUser.id : 'guest';
         localStorage.setItem(`chronos_draft_image_${storageId}`, base64);
         
         stopCamera();
      }
    }, 'image/jpeg', 0.8);
  };

  useEffect(() => {
    if (isCameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [isCameraOpen, streamRef.current]);

  const triggerGallery = () => {
      fileInputRef.current?.click();
  };

  const dismissReminder = (id: string) => {
    stopSpeaking();
    setNotes(prev => prev.map(n => n.id === id ? { ...n, reminderDismissed: true } : n));
  };

  const deleteNote = (id: string) => {
    if (activeTrackerNoteId.current === id) {
        stepTracker.current?.stop();
        activeTrackerNoteId.current = null;
    }
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  const updateNote = (id: string, newContent: string) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, content: newContent } : n));
  };
  
  const toggleSubtask = (noteId: string, taskId: string) => {
      setNotes(prev => prev.map(n => {
          if (n.id === noteId && n.subtasks) {
              return {
                  ...n,
                  subtasks: n.subtasks.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t)
              }
          }
          return n;
      }));
  };

  // Shortcut Handlers
  const handleFoodShortcut = () => {
      setIsShortcutsOpen(false);
      // Food needs camera access
      startCamera();
  };

  const handleWalkShortcut = () => {
      setIsShortcutsOpen(false);
      if (!checkFeatureAccess()) return;

      const label = window.prompt("What kind of workout?", "Outdoor Walk") || "Step Session";
      startTrackingSteps(label);
  };
  
  const handleAlarmShortcut = () => {
      setIsShortcutsOpen(false);
      if (!checkFeatureAccess()) return;
      
      setIsInputModalOpen(true);
      setInputText("Remind me to ");
  };

  const handleLiveShortcut = () => {
      setIsShortcutsOpen(false);
      toggleLiveChat();
  };

  // Group and Sort Logic
  const groupedNotes = React.useMemo(() => {
    const groups: { [key: string]: Note[] } = {};

    notes
      .filter(note => 
        (note.content || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
        (note.rawTranscript || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
      .forEach(note => {
        const displayDate = note.reminderDate || note.timestamp;
        const key = getLocalDateKey(displayDate);
        if (!groups[key]) groups[key] = [];
        groups[key].push(note);
      });

    const sortedDays = Object.keys(groups).sort((a, b) => a.localeCompare(b));

    return sortedDays.map(date => {
      const dayNotes = groups[date].sort((a, b) => {
        const timeA = a.reminderDate || a.timestamp;
        const timeB = b.reminderDate || b.timestamp;
        return timeA - timeB;
      });
      return { date, notes: dayNotes };
    });
  }, [notes, searchQuery]);

  // SCROLL & NAVIGATION HANDLER
  const handleMainScroll = () => {
      if (mainScrollRef.current) {
          const { scrollLeft, clientWidth } = mainScrollRef.current;
          if (scrollLeft > clientWidth * 0.5) {
              if (activeView !== 'calendar') setActiveView('calendar');
          } else {
              if (activeView !== 'timeline') setActiveView('timeline');
          }
      }
  };

  const navigateToView = (view: 'timeline' | 'calendar') => {
      if (!mainScrollRef.current) return;
      const width = mainScrollRef.current.clientWidth;
      mainScrollRef.current.scrollTo({
          left: view === 'timeline' ? 0 : width,
          behavior: 'smooth'
      });
  };

  const handleDateSelect = (dateStr: string) => {
    if (mainScrollRef.current) {
        mainScrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }

    setTimeout(() => {
        const element = document.getElementById(`date-header-${dateStr}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            element.classList.add('bg-indigo-50');
            setTimeout(() => element.classList.remove('bg-indigo-50'), 1000);
        } else {
           showToast(`No notes found for ${dateStr}`);
        }
    }, 300);
  };
  
  // LOGOUT
  const handleLogout = () => {
      authService.logout().then(() => {
          setNotes([]);
          setCurrentUser(null);
      });
  };

  if (isAuthLoading) {
      return (
          <div className="h-screen bg-slate-50 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          </div>
      );
  }

  // --- RENDERING ---

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden relative">
      
      {/* AUTH / PREMIUM MODAL OVERLAY */}
      {showAuthModal && (
          <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200">
              <div className="w-full h-full max-w-md max-h-[800px]">
                  <AuthScreen 
                      mode={authModalMode}
                      user={currentUser}
                      onLogin={(user) => {
                          setCurrentUser(user);
                          setShowAuthModal(false);
                      }}
                      onClose={() => setShowAuthModal(false)}
                  />
              </div>
          </div>
      )}

      <input 
        type="file" 
        accept="image/*" 
        ref={fileInputRef}
        onChange={handleImageSelect}
        className="hidden"
      />

      <div className="px-6 pt-6 pb-2 bg-slate-50 z-50 flex items-center justify-between gap-4">
          <div className="flex-1 relative">
             <svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
             <input 
               type="text" 
               placeholder={currentUser ? `Search ${currentUser.name.split(' ')[0]}'s timeline...` : "Search your timeline..."}
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="w-full bg-slate-100/50 border-none rounded-2xl py-3 pl-10 pr-4 text-sm font-medium text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition-all shadow-sm"
             />
          </div>
          
          <div className="flex items-center gap-2">
            {currentUser ? (
                <div className="flex items-center gap-2">
                    {currentUser.isPremium && (
                        <div className="px-2 py-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-[10px] font-bold rounded-lg uppercase tracking-wider shadow-sm">
                            Pro
                        </div>
                    )}
                    <button 
                        onClick={handleLogout}
                        className="p-3 rounded-2xl bg-white text-slate-400 border border-slate-100 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Logout"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    </button>
                </div>
            ) : (
                <button 
                    onClick={() => {
                        setAuthModalMode('auth');
                        setShowAuthModal(true);
                    }}
                    className="px-4 py-3 rounded-2xl bg-indigo-600 text-white font-bold text-sm shadow-md shadow-indigo-200 hover:bg-indigo-700 transition-colors"
                >
                    Sign In
                </button>
            )}

            <button 
                onClick={() => toggleLiveChat()}
                className={`p-3 rounded-2xl transition-all shadow-sm flex items-center gap-2 font-bold text-sm ${
                    isLiveActive 
                    ? 'bg-slate-900 text-white shadow-indigo-200 shadow-md ring-2 ring-indigo-500 ring-offset-2' 
                    : 'bg-white text-slate-500 hover:bg-slate-50 hover:text-indigo-600 border border-slate-100'
                }`}
            >
                {isLiveActive ? (
                    <>
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                    <span>Live</span>
                    </>
                ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                )}
            </button>
          </div>
      </div>

      <div className="bg-slate-50 z-40 shrink-0 px-6 pb-4 flex items-center justify-center gap-12 select-none">
         <button 
            onClick={() => navigateToView('timeline')}
            className={`text-lg font-medium tracking-wide pb-1 transition-all ${
                activeView === 'timeline' 
                ? 'text-slate-800 border-b-2 border-slate-800' 
                : 'text-slate-300 border-b-2 border-transparent hover:text-slate-500'
            }`}
         >
            Timeline
         </button>
         <button 
            onClick={() => navigateToView('calendar')}
            className={`text-lg font-medium tracking-wide pb-1 transition-all ${
                activeView === 'calendar' 
                ? 'text-slate-800 border-b-2 border-slate-800' 
                : 'text-slate-300 border-b-2 border-transparent hover:text-slate-500'
            }`}
         >
            Calendar
         </button>
      </div>

      <div 
        ref={mainScrollRef}
        onScroll={handleMainScroll}
        className="flex-1 flex overflow-x-auto snap-x snap-mandatory no-scrollbar" 
        style={{ scrollBehavior: 'smooth' }}
      >
        
        <div className="min-w-full w-full h-full flex flex-col relative snap-center z-0">
            <div ref={timelineListRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-8 scroll-smooth">
              {appState === AppState.PROCESSING && (
                <div className="relative mx-2 animate-in slide-in-from-top-4 fade-in duration-500 z-10">
                   <div className="absolute -left-[27px] top-6 w-4 h-4 rounded-full border-4 border-slate-50 bg-indigo-300 animate-pulse shadow-sm"></div>
                   <div className="bg-white p-8 rounded-2xl shadow-sm border border-indigo-100 flex flex-col items-center justify-center gap-4">
                      <div className="flex gap-3">
                        <div className="w-3 h-3 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                        <div className="w-3 h-3 bg-indigo-600 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                        <div className="w-3 h-3 bg-indigo-600 rounded-full animate-bounce"></div>
                      </div>
                      <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest animate-pulse">Chronos is thinking...</p>
                   </div>
                </div>
              )}

              {groupedNotes.length === 0 && appState !== AppState.PROCESSING ? (
                 <div className="flex flex-col items-center justify-center h-full text-slate-300 gap-4 opacity-60">
                    <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                    <p className="font-medium">Swipe left for Calendar</p>
                 </div>
              ) : (
                 groupedNotes.map((group) => (
                    <div key={group.date} id={`date-header-${group.date}`} className="relative transition-colors duration-500 rounded-lg">
                       <div className="sticky top-0 z-10 py-2 mb-4 bg-slate-50/95 backdrop-blur-sm w-fit pr-4 rounded-br-2xl border-b border-r border-slate-100">
                          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest pl-1">
                             {formatDateLabel(group.date)}
                          </h3>
                       </div>
                       <div className="space-y-4 pl-2 border-l-2 border-slate-200 ml-2">
                          {group.notes.map(note => (
                             <NoteCard 
                                key={note.id}
                                note={note}
                                onDelete={deleteNote}
                                onDismiss={dismissReminder}
                                onUpdate={updateNote}
                                onDiscuss={handleDiscussNote}
                                onStopTracking={stopTrackingSteps}
                                onToggleAlarm={toggleAlarm}
                                onToggleSubtask={toggleSubtask}
                                isActive={isLiveActive && activeDiscussNoteId === note.id}
                                isLiveConnected={isLiveConnected}
                                isAiSpeaking={isAiSpeaking}
                                isReading={readingNoteId === note.id}
                                onStopReading={readingNoteId === note.id ? stopSpeaking : undefined}
                                isGuest={!currentUser}
                                onRequestLogin={() => {
                                    setAuthModalMode('auth');
                                    setShowAuthModal(true);
                                }}
                             />
                          ))}
                       </div>
                    </div>
                 ))
              )}
              <div className="h-24"></div> 
            </div>

            <div className="absolute bottom-8 right-6 flex flex-col items-center gap-3 z-30 pointer-events-none">
                 <div className={`flex flex-col-reverse gap-3 items-center transition-all duration-300 transform pointer-events-auto ${
                     isShortcutsOpen 
                     ? 'opacity-100 translate-y-0 scale-100' 
                     : 'opacity-0 translate-y-8 scale-90 pointer-events-none'
                 }`}>
                    <button 
                      onClick={handleLiveShortcut}
                      className="w-12 h-12 bg-white text-indigo-600 rounded-full shadow-lg hover:bg-indigo-50 border border-indigo-100 flex items-center justify-center transition-transform hover:scale-110"
                      title="Talk to Chronos"
                    >
                       <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                    </button>

                    <button 
                       onClick={handleAlarmShortcut}
                       className="w-12 h-12 bg-white text-amber-500 rounded-full shadow-lg hover:bg-amber-50 border border-amber-100 flex items-center justify-center transition-transform hover:scale-110"
                       title="Set Alarm"
                    >
                       <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </button>

                    <button 
                      onClick={handleFoodShortcut}
                      className="w-12 h-12 bg-white text-emerald-600 rounded-full shadow-lg hover:bg-emerald-50 border border-emerald-100 flex items-center justify-center transition-transform hover:scale-110"
                      title="Log Food"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </button>

                    <button 
                      onClick={handleWalkShortcut}
                      className="w-12 h-12 bg-white text-orange-500 rounded-full shadow-lg hover:bg-orange-50 border border-orange-100 flex items-center justify-center transition-transform hover:scale-110"
                      title="Start Walking"
                    >
                       <span className="text-2xl leading-none">🚶</span>
                    </button>
                 </div>

                 <button 
                   onClick={() => setIsShortcutsOpen(!isShortcutsOpen)}
                   className={`w-12 h-12 bg-slate-700 text-white rounded-2xl shadow-lg shadow-slate-300/50 flex items-center justify-center transition-all duration-300 pointer-events-auto hover:bg-slate-600 ${
                       isShortcutsOpen ? 'rotate-180' : 'rotate-0'
                   }`}
                 >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7-7" /></svg>
                 </button>

                 <button 
                   onClick={() => setIsInputModalOpen(true)}
                   className="w-12 h-12 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:scale-105 hover:rotate-3 transition-all flex items-center justify-center group pointer-events-auto"
                 >
                    <svg className="w-6 h-6 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                 </button>
            </div>
        </div>

        <div className="min-w-full w-full h-full bg-white snap-center overflow-y-auto">
            <CalendarView notes={notes} onSelectDate={handleDateSelect} />
        </div>

      </div>

      {toastMessage && (
            <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-2 fade-in duration-300 pointer-events-none w-max">
                <div className="px-4 py-3 bg-slate-800/90 backdrop-blur-md text-white text-sm font-medium rounded-2xl shadow-xl border border-slate-700/50 flex items-center gap-3">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
                    {toastMessage}
                </div>
            </div>
      )}

      {isInputModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-[#fdfbf7] rounded-3xl shadow-2xl overflow-hidden relative flex flex-col h-[80vh] min-h-[500px] animate-in slide-in-from-bottom-8 zoom-in-95 border border-stone-200">
            
            {!isCameraOpen && (
               <div className="absolute top-0 left-0 w-full h-16 border-b border-red-100/50 z-0 pointer-events-none"></div>
            )}
            
            <div className={`flex justify-between items-center px-6 py-4 z-10 shrink-0 ${isCameraOpen ? 'bg-black text-white' : 'bg-[#fdfbf7]/90 backdrop-blur-sm'}`}>
               <h3 className={`font-medium tracking-wide uppercase text-xs ${isCameraOpen ? 'text-white' : 'text-stone-400'}`}>
                   {isCameraOpen ? 'Capture' : 'New Entry'}
               </h3>
               <button 
                onClick={() => {
                  if (isCameraOpen) {
                      stopCamera(); 
                  } else {
                      clearDrafts(); 
                      setIsInputModalOpen(false);
                      if (dictationStatus === 'recording') toggleDictation();
                  }
                }}
                className={`${isCameraOpen ? 'text-white hover:text-gray-300' : 'text-stone-400 hover:text-stone-600'} transition-colors`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 relative w-full h-full flex flex-col overflow-hidden">
                
                {isCameraOpen ? (
                   <div className="absolute inset-0 bg-black flex flex-col">
                       <div className="flex-1 relative overflow-hidden flex items-center justify-center">
                           <video 
                              ref={videoRef} 
                              autoPlay 
                              playsInline 
                              muted
                              className="w-full h-full object-cover"
                           />
                       </div>
                       <div className="h-32 bg-black/80 backdrop-blur-sm flex items-center justify-around pb-6 pt-4 px-6">
                           <button 
                             onClick={triggerGallery}
                             className="w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-all backdrop-blur-md"
                           >
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                           </button>

                           <button 
                             onClick={capturePhoto}
                             className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                           >
                              <div className="w-16 h-16 bg-white rounded-full"></div>
                           </button>

                           <div className="w-12 h-12"></div>
                       </div>
                   </div>
                ) : (
                    <>
                        {draftImagePreview && (
                        <div className="px-8 pt-4 z-10 animate-in fade-in slide-in-from-top-4 duration-300">
                            <div className="relative w-full h-48 bg-slate-100 rounded-xl overflow-hidden border border-stone-200 shadow-inner group shrink-0">
                                <img src={draftImagePreview} alt="Draft" className="w-full h-full object-cover" />
                                <button 
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        setDraftImage(null); 
                                        setDraftImagePreview(null); 
                                        const storageId = currentUser ? currentUser.id : 'guest';
                                        localStorage.removeItem(`chronos_draft_image_${storageId}`);
                                    }}
                                    className="absolute top-2 right-2 p-1 bg-black/50 hover:bg-red-500 text-white rounded-full transition-colors backdrop-blur-sm"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                        )}

                        <textarea 
                        autoFocus
                        placeholder={dictationStatus === 'recording' ? "Listening..." : "Write your thoughts..."}
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        disabled={dictationStatus !== 'idle' || appState === AppState.PROCESSING}
                        className={`w-full flex-1 bg-transparent appearance-none border-none outline-none focus:outline-none focus:ring-0 px-8 py-0 pb-32 text-xl text-slate-700 leading-[3rem] resize-none placeholder:text-stone-300 font-medium
                            ${dictationStatus !== 'idle' ? 'text-indigo-600' : ''}
                        `}
                        style={{
                            backgroundImage: 'linear-gradient(transparent 2.95rem, #e7e5e4 3rem)',
                            backgroundSize: '100% 3rem',
                            backgroundAttachment: 'local',
                            lineHeight: '3rem',
                            boxShadow: 'none'
                        }}
                        spellCheck={false}
                        />
                        {dictationStatus === 'transcribing' && (
                            <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/50 backdrop-blur-[1px]">
                                <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-lg text-indigo-600 font-bold animate-pulse border border-indigo-50">
                                    <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    <span>Transcribing...</span>
                                </div>
                            </div>
                        )}

                        <div className="absolute bottom-6 right-6 flex items-center gap-3 z-30 pointer-events-auto">
                            <button 
                                onClick={startCamera}
                                disabled={dictationStatus !== 'idle'}
                                className="w-12 h-12 rounded-full bg-white border border-stone-200 text-stone-400 hover:text-emerald-600 hover:border-emerald-200 hover:shadow-md transition-all flex items-center justify-center"
                                title="Attach Image"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </button>

                            <div className="relative">
                                {dictationStatus === 'recording' && (
                                    <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-20"></div>
                                )}
                                <button
                                    onClick={toggleDictation}
                                    disabled={dictationStatus === 'transcribing'}
                                    className={`w-12 h-12 rounded-full border flex items-center justify-center transition-all ${
                                        dictationStatus === 'recording'
                                        ? 'bg-red-500 text-white border-red-500 shadow-lg scale-110' 
                                        : 'bg-white border-stone-200 text-stone-400 hover:text-indigo-600 hover:border-indigo-200 hover:shadow-md'
                                    }`}
                                >
                                    {dictationStatus === 'recording' ? (
                                        <div className="w-4 h-4 bg-white rounded-sm"></div>
                                    ) : (
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                    </svg>
                                    )}
                                </button>
                            </div>

                            <button
                                onClick={handleTextSubmit}
                                disabled={(!inputText.trim() && !draftImage) || dictationStatus !== 'idle' || appState === AppState.PROCESSING}
                                className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all shadow-lg ${
                                    (inputText.trim() || draftImage) && dictationStatus === 'idle' && appState !== AppState.PROCESSING
                                    ? 'bg-slate-900 text-white hover:bg-slate-800 hover:scale-105' 
                                    : 'bg-stone-100 text-stone-300 cursor-not-allowed'
                                }`}
                                title="Save Note"
                            >
                                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                                </svg>
                            </button>
                        </div>
                    </>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
