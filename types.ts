
export type NoteType = 'text' | 'voice' | 'image' | 'tracker';

export interface User {
  id: string;
  email: string;
  name: string;
  isPremium: boolean; // Subscription status
  preferences?: {
    theme?: 'light' | 'dark';
  };
}

export interface Subtask {
  id: string;
  text: string;
  completed: boolean;
}

export interface Note {
  id: string;
  userId?: string; // Associated user
  timestamp: number; // Creation date
  content: string;
  rawTranscript?: string;
  type: NoteType;
  audioUrl?: string;
  imageUrl?: string; // New field for tracking images or AI illustrations
  isGeneratingImage?: boolean; // UI state for AI image generation
  formatted?: boolean;
  isReminder?: boolean;
  reminderDate?: number; // Future timestamp
  reminderDismissed?: boolean;
  notificationsSent?: string[]; // Track '1d', '1h', '15m', '5m', 'alarm'
  
  // Advanced AI Features
  subtasks?: Subtask[]; // AI-generated checklist
  
  // Tracker specific
  isTracking?: boolean;
  stepCount?: number;
  caloriesBurned?: number;
}

export interface DayNotes {
  date: string; // ISO string YYYY-MM-DD
  notes: Note[];
}

export enum AppState {
  IDLE = 'idle',
  RECORDING = 'recording',
  PROCESSING = 'processing',
  ERROR = 'error'
}

export interface AIResponse {
  formatted: string;
  transcript?: string;
  reminderDate?: string; // ISO string if detected
  aiSuggestion?: string; // Content suggested by AI based on habits/context
  aiQuestion?: string; // A question to the user
  intent?: 'track_steps_start' | 'track_steps_stop';
  
  // New Capabilities
  visualPrompt?: string; // Description for image generation
  subtasks?: string[]; // List of actionable items
}
