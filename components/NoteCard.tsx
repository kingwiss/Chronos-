
import React, { useState, useEffect, useRef } from 'react';
import { Note } from '../types';
import { formatTime, blobToBase64, resizeImage } from '../utils/audioUtils';
import VoiceRecorder from './VoiceRecorder';
import { transcribeAudio } from '../services/geminiService';

interface NoteCardProps {
  note: Note;
  onDelete: (id: string) => void;
  onDismiss?: (id: string) => void;
  onUpdate: (id: string, newContent: string) => void;
  onDiscuss: (note: Note) => void;
  onStopTracking?: (id: string) => void;
  onToggleAlarm?: (id: string) => void;
  onToggleSubtask?: (noteId: string, taskId: string) => void;
  isActive?: boolean;
  isLiveConnected?: boolean;
  isAiSpeaking?: boolean;
  isReading?: boolean;
  onStopReading?: () => void;
  isGuest?: boolean;
  onRequestLogin?: () => void;
}

const NoteCard: React.FC<NoteCardProps> = ({ 
  note, 
  onDelete, 
  onDismiss, 
  onUpdate, 
  onDiscuss, 
  onStopTracking,
  onToggleAlarm,
  onToggleSubtask,
  isActive = false,
  isLiveConnected = false,
  isAiSpeaking = false,
  isReading = false,
  onStopReading,
  isGuest = false,
  onRequestLogin
}) => {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(note.content);
  
  // Delete Confirmation State
  const [isDeleting, setIsDeleting] = useState(false);

  // Voice Edit State
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);

  // Edit Mode Camera
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  const now = Date.now();
  const isFuture = note.reminderDate && note.reminderDate > now;
  const isImminent = note.reminderDate && isFuture && (note.reminderDate - now < 3600000); // within 1 hour
  const isPassedReminder = note.reminderDate && note.reminderDate <= now && !note.reminderDismissed;

  useEffect(() => {
    if (!isFuture || !note.reminderDate) return;

    const updateTimer = () => {
      const diff = (note.reminderDate as number) - Date.now();
      if (diff <= 0) {
        setTimeLeft('');
        return;
      }

      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);

      if (hours > 0) setTimeLeft(`${hours}h ${mins}m`);
      else if (mins > 0) setTimeLeft(`${mins}m ${secs}s`);
      else setTimeLeft(`${secs}s`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [note.reminderDate, isFuture]);

  const handleSave = () => {
    onUpdate(note.id, editContent);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditContent(note.content);
    setIsEditing(false);
  };

  const handleVoiceAppendStop = async (blob: Blob) => {
    setIsRecording(false);
    setIsProcessingVoice(true);
    try {
      const base64 = await blobToBase64(blob);
      const text = await transcribeAudio(base64, blob.type);
      if (text) {
        setEditContent(prev => prev ? `${prev} ${text}` : text);
      }
    } catch (e) {
      console.error("Voice append failed", e);
    } finally {
      setIsProcessingVoice(false);
    }
  };

  const handleImageAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingImage(true);
    try {
        // Just simulate attachment for edit mode as placeholder
        await resizeImage(file); // Compress
        setEditContent(prev => prev + " [Image Attachment Placeholder]");
    } catch (err) {
        console.error("Image attach failed", err);
    } finally {
        setIsProcessingImage(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Re-designed Chronos Live Button
  const renderDiscussButton = () => {
    // STATE 1: IDLE / OFF
    if (!isActive) {
        return (
            <div className="relative group/chronos">
                {/* Tooltip for Chat Invitation */}
                <div 
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 bg-indigo-600 text-white text-[10px] font-medium rounded shadow-lg pointer-events-none z-10"
                  style={{ animation: 'tooltip-pulse 10s ease-in-out 3 forwards 2s' }}
                >
                    Chat with AI
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-indigo-600"></div>
                </div>

                <button 
                    onClick={() => onDiscuss(note)}
                    className="p-2 rounded-xl text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 transition-all group-hover/chronos:text-indigo-500"
                    title="Discuss with Chronos Live"
                >
                    <div className="w-5 h-5 flex items-center justify-center gap-[2px]">
                    <div className="w-[3px] h-3 bg-current rounded-full transition-all group-hover/chronos:h-4"></div>
                    <div className="w-[3px] h-5 bg-current rounded-full"></div>
                    <div className="w-[3px] h-3 bg-current rounded-full transition-all group-hover/chronos:h-4"></div>
                    </div>
                </button>
            </div>
        );
    }

    // STATE 2: CONNECTING / LOADING
    if (!isLiveConnected) {
        return (
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-400 cursor-wait">
                <div className="w-5 h-5 flex items-center justify-center gap-[2px] animate-pulse">
                   <div className="w-[3px] h-2 bg-current rounded-full"></div>
                   <div className="w-[3px] h-3 bg-current rounded-full"></div>
                   <div className="w-[3px] h-2 bg-current rounded-full"></div>
                </div>
            </div>
        );
    }

    // STATE 3: AI SPEAKING
    if (isAiSpeaking) {
        return (
            <button 
                onClick={() => onDiscuss(note)}
                className="p-2 rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-200 transition-all hover:bg-red-500 hover:shadow-red-200"
                title="AI Speaking (Tap to Stop)"
            >
               <div className="w-5 h-5 flex items-center justify-center gap-[2px]">
                   {/* Animated Waveform */}
                   <div className="w-[3px] bg-white rounded-full animate-[bounce_0.8s_infinite]"></div>
                   <div className="w-[3px] bg-white rounded-full animate-[bounce_0.8s_infinite_0.2s]"></div>
                   <div className="w-[3px] bg-white rounded-full animate-[bounce_0.8s_infinite_0.4s]"></div>
                </div>
            </button>
        );
    }

    // STATE 4: LISTENING (Connected, waiting for user)
    return (
        <button 
            onClick={() => onDiscuss(note)}
            className="p-2 rounded-xl bg-indigo-100 text-indigo-600 transition-all hover:bg-red-50 hover:text-red-500 hover:shadow-sm"
            title="Listening... (Tap to Disconnect)"
        >
            <div className="w-5 h-5 flex items-center justify-center gap-[2px]">
               {/* Gentle Listening Pulse */}
               <div className="w-[3px] h-3 bg-current rounded-full animate-[pulse_1.5s_infinite]"></div>
               <div className="w-[3px] h-5 bg-current rounded-full animate-[pulse_1.5s_infinite_0.5s]"></div>
               <div className="w-[3px] h-3 bg-current rounded-full animate-[pulse_1.5s_infinite]"></div>
            </div>
        </button>
    );
  };

  return (
    <div className={`group relative flex gap-4 pl-4 pb-8 border-l-2 transition-colors ${
      isPassedReminder ? 'border-red-400' : isImminent ? 'border-amber-400' : isFuture ? 'border-indigo-300' : 'border-slate-200'
    } last:pb-0 animate-in fade-in slide-in-from-left-4 duration-500`}>
      <style>{`
        @keyframes tooltip-pulse {
          0%, 80% { opacity: 0; transform: translate(-50%, 8px); visibility: hidden; }
          85%, 95% { opacity: 1; transform: translate(-50%, 0); visibility: visible; }
          100% { opacity: 0; transform: translate(-50%, 8px); visibility: hidden; }
        }
        .shimmer {
          background: linear-gradient(90deg, #f0fdf4 25%, #dcfce7 50%, #f0fdf4 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite linear;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* Timeline Dot */}
      <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-4 border-slate-50 shadow-sm transition-all duration-500 ${
        note.isTracking ? 'bg-orange-500 animate-pulse scale-125' : 
        (note.type === 'tracker' && !note.isTracking) ? 'bg-emerald-500' :
        isPassedReminder ? 'bg-red-500 animate-ping scale-110' : 
        isImminent ? 'bg-amber-400 animate-pulse' : 
        isFuture ? 'bg-amber-400' : 
        'bg-indigo-500'
      }`}></div>
      
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              {formatTime(note.reminderDate || note.timestamp)}
            </span>
            {note.isReminder && (
              <div className="flex items-center gap-2">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter ${
                  note.reminderDismissed ? 'bg-slate-100 text-slate-400' :
                  isPassedReminder ? 'bg-red-600 text-white' : 
                  isImminent ? 'bg-amber-100 text-amber-700' : 
                  'bg-indigo-50 text-indigo-700'
                }`}>
                  {note.reminderDismissed ? 'Muted' : isPassedReminder ? 'Alarm Active' : isFuture ? 'Scheduled' : 'Past'}
                </span>
                {timeLeft && !note.reminderDismissed && (
                  <span className="text-[10px] font-mono font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    in {timeLeft}
                  </span>
                )}
              </div>
            )}
            {note.isTracking && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter bg-orange-100 text-orange-600 animate-pulse">
                Tracking Active
              </span>
            )}
            {note.type === 'tracker' && !note.isTracking && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter bg-emerald-100 text-emerald-600">
                Workout Complete
              </span>
            )}
            {/* Tag for AI Magic */}
            {(note.subtasks || note.imageUrl || note.isGeneratingImage) && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter bg-purple-100 text-purple-600">
                ✨ Magic
              </span>
            )}
          </div>
          <div className={`flex items-center gap-1 transition-opacity ${isDeleting ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            {isPassedReminder && onDismiss && (
              <button 
                onClick={() => onDismiss(note.id)}
                className="text-xs font-bold text-red-600 hover:bg-red-50 px-2 py-1 rounded"
              >
                Dismiss
              </button>
            )}
            
            {isDeleting ? (
                <div className="flex items-center gap-2 bg-red-50 px-2 py-1 rounded-lg animate-in fade-in slide-in-from-right-2">
                    <span className="text-[10px] font-bold text-red-600 uppercase">Delete?</span>
                    <button 
                        onClick={() => onDelete(note.id)}
                        className="text-xs font-bold text-red-600 hover:underline hover:text-red-700"
                    >
                        Yes
                    </button>
                    <button 
                        onClick={() => setIsDeleting(false)}
                        className="text-xs font-bold text-slate-500 hover:text-slate-700 hover:underline"
                    >
                        No
                    </button>
                </div>
            ) : (
                <button 
                onClick={() => setIsDeleting(true)}
                className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                title="Delete Note"
                >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                </button>
            )}
          </div>
        </div>

        <div className={`bg-white p-4 rounded-2xl shadow-sm border transition-all duration-300 ${
          note.isTracking ? 'border-orange-300 ring-2 ring-orange-50 shadow-md' : 
          (note.type === 'tracker' && !note.isTracking) ? 'border-emerald-200 ring-1 ring-emerald-50' :
          isPassedReminder ? 'border-red-300 ring-4 ring-red-50 shadow-xl translate-x-1' : 
          isImminent ? 'border-amber-200' : 
          'border-slate-100'
        } hover:shadow-md`}>
          <div className="flex items-start gap-3">
            <div className="flex-1">
              {note.type === 'voice' && !isEditing && (
                <div className="mb-3 flex items-center gap-2 text-indigo-600 bg-indigo-50 w-fit px-2 py-1 rounded-lg text-xs font-bold uppercase tracking-tighter">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"/></svg>
                  Voice Capture
                </div>
              )}

              {note.type === 'image' && !isEditing && (
                <div className="mb-3 flex items-center gap-2 text-emerald-600 bg-emerald-50 w-fit px-2 py-1 rounded-lg text-xs font-bold uppercase tracking-tighter">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  Visual Tracker
                </div>
              )}

              {note.type === 'tracker' && !isEditing && (
                 <div className="flex items-center gap-4 mb-2">
                     {note.isTracking ? (
                         <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center animate-pulse">
                             <span className="text-2xl">🚶</span>
                         </div>
                     ) : (
                         <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                             <span className="text-xl">🏁</span>
                         </div>
                     )}
                     <div className="flex-1">
                         <p className="text-2xl font-black text-slate-800 tabular-nums">
                            {note.stepCount || 0} <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">steps</span>
                         </p>
                         {note.caloriesBurned !== undefined && (
                             <p className="text-xs font-bold text-orange-500 uppercase tracking-wide">
                                 🔥 {note.caloriesBurned} kcal
                             </p>
                         )}
                     </div>
                     
                     {note.isTracking && onStopTracking && (
                       <button 
                         onClick={() => onStopTracking(note.id)}
                         className="px-4 py-2 bg-orange-100 text-orange-700 font-bold rounded-lg hover:bg-orange-200 transition-colors text-xs uppercase tracking-wider"
                       >
                         Stop
                       </button>
                     )}
                 </div>
              )}
              
              {isEditing ? (
                <div className="space-y-3">
                  <textarea 
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm text-slate-700 resize-none"
                    rows={4}
                    autoFocus
                    disabled={isProcessingVoice || isRecording || isProcessingImage}
                  />
                  
                  {isProcessingVoice && (
                     <div className="text-xs text-indigo-600 font-semibold animate-pulse">Transcribing audio...</div>
                  )}
                  {isProcessingImage && (
                     <div className="text-xs text-emerald-600 font-semibold animate-pulse">Compressing image...</div>
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       {/* Reusing VoiceRecorder for UI state */}
                       <VoiceRecorder isRecording={isRecording} setIsRecording={setIsRecording} onStop={handleVoiceAppendStop} />
                       
                       <button 
                         onClick={() => setIsRecording(!isRecording)}
                         disabled={isProcessingVoice || isProcessingImage}
                         className={`p-2 rounded-full transition-all ${
                           isRecording 
                           ? 'bg-red-500 text-white shadow-md' 
                           : 'bg-slate-100 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600'
                         }`}
                         title="Append with Voice"
                         type="button"
                       >
                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                         </svg>
                       </button>

                       {/* Edit Mode Camera */}
                       <button 
                         onClick={() => fileInputRef.current?.click()}
                         disabled={isProcessingVoice || isProcessingImage}
                         className="p-2 rounded-full bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 transition-all"
                         title="Attach Image"
                         type="button"
                       >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                       </button>
                       <input 
                            type="file" 
                            accept="image/*" 
                            capture="environment" 
                            ref={fileInputRef} 
                            onChange={handleImageAttach} 
                            className="hidden" 
                       />
                    </div>

                    <div className="flex gap-2">
                      <button 
                        onClick={handleCancel}
                        disabled={isProcessingVoice || isRecording || isProcessingImage}
                        className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={handleSave}
                        disabled={isProcessingVoice || isRecording || isProcessingImage}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm shadow-indigo-200"
                      >
                        Save Changes
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {note.content}
                  </div>
                  
                  {/* AI Subtasks Checklist */}
                  {note.subtasks && note.subtasks.length > 0 && (
                      <div className="mt-3 space-y-2">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">AI Breakdown</p>
                          {note.subtasks.map(task => (
                              <div key={task.id} className="flex items-start gap-2 group/task">
                                  <input 
                                    type="checkbox" 
                                    checked={task.completed}
                                    onChange={() => onToggleSubtask?.(note.id, task.id)}
                                    className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                                  />
                                  <span className={`text-sm transition-all ${task.completed ? 'text-slate-400 line-through' : 'text-slate-600'}`}>
                                      {task.text}
                                  </span>
                              </div>
                          ))}
                      </div>
                  )}

                  {/* AI Illustration or Image */}
                  {note.imageUrl && (
                    <div className="mt-3 relative group/image">
                       <img 
                         src={note.imageUrl} 
                         alt="Visual" 
                         className="w-full max-w-sm rounded-lg shadow-sm border border-slate-100 transition-transform hover:scale-[1.02]" 
                       />
                    </div>
                  )}

                  {/* Loading State for AI Generation */}
                  {note.isGeneratingImage && !note.imageUrl && (
                      <div className="mt-3 w-full max-w-sm h-48 rounded-lg shimmer flex items-center justify-center border border-emerald-100">
                          <div className="flex flex-col items-center gap-2">
                             <span className="text-2xl animate-bounce">🎨</span>
                             <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Painting...</span>
                          </div>
                      </div>
                  )}
                </>
              )}

              {note.audioUrl && !isEditing && (
                <div className="mt-4 pt-4 border-t border-slate-50">
                  <audio controls src={note.audioUrl} className="w-full h-8 opacity-70 hover:opacity-100 transition-opacity" />
                </div>
              )}
            </div>
            
            {!isEditing && (
              <div className="flex items-center gap-1 flex-none">
                {/* Stop Reading Button */}
                {isReading && onStopReading ? (
                   <button 
                     onClick={onStopReading}
                     className="p-2 text-white bg-slate-800 rounded-xl transition-all shadow-md animate-in zoom-in duration-200"
                     title="Stop Reading"
                   >
                     <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                     </svg>
                   </button>
                ) : (
                    renderDiscussButton()
                )}
                
                <button 
                  onClick={() => {
                      if (isGuest && onRequestLogin) {
                          onRequestLogin();
                      } else {
                          setIsEditing(true);
                      }
                  }}
                  className="p-2 text-slate-400 hover:bg-slate-50 hover:text-indigo-600 rounded-xl transition-all"
                  title={isGuest ? "Sign in to Edit" : "Edit Note"}
                >
                  {isGuest ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                  )}
                </button>
                
                {note.isReminder && (
                  <div className="relative group/bell">
                     {/* Periodic Popup Tooltip */}
                     {!note.reminderDismissed && (
                         <div 
                           className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 bg-slate-800 text-white text-[10px] font-medium rounded shadow-lg pointer-events-none z-10"
                           style={{ animation: 'tooltip-pulse 8s ease-in-out 3 forwards 1s' }}
                         >
                            Tap to mute
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                         </div>
                     )}
                     
                     <button 
                       onClick={() => onToggleAlarm?.(note.id)}
                       className={`p-2 rounded-xl transition-all relative ${
                         note.reminderDismissed 
                            ? 'bg-slate-100 text-slate-300 hover:bg-slate-200' 
                            : isPassedReminder 
                                ? 'bg-red-500 text-white animate-bounce shadow-red-200 shadow-lg' 
                                : isFuture 
                                    ? 'bg-amber-50 text-amber-500 hover:bg-amber-100' 
                                    : 'bg-slate-50 text-slate-400'
                       }`}
                       title={note.reminderDismissed ? "Unmute Alarm" : "Mute Alarm"}
                     >
                        {note.reminderDismissed && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="w-3/4 h-0.5 bg-slate-400 rotate-45 rounded-full"></div>
                            </div>
                        )}
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                     </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NoteCard;
