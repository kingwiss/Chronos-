
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from "@google/genai";
import { AudioStreamPlayer, float32ToInt16PCM, arrayBufferToBase64 } from "../utils/audioUtils";
import { NoteType } from "../types";

// --- CONFIGURATION ---
// REPLACE THIS WITH YOUR GEMINI API KEY
const GEMINI_API_KEY = "REPLACE_WITH_YOUR_GEMINI_API_KEY";

const getAiClient = () => {
    if (GEMINI_API_KEY.includes("REPLACE_WITH")) {
        console.error("Gemini API Key is missing. Please update services/liveManager.ts");
        throw new Error("Gemini API Key missing");
    }
    return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
};

// Define the function for the AI to update notes - EXPANDED FOR TOTAL CONTROL
const updateNoteTool: FunctionDeclaration = {
  name: "updateNote",
  description: "The MASTER tool for timeline control. Use this to change ANY aspect of a note. You can transform a tracker into a reminder, run a text adventure game by updating content turn-by-turn, or reschedule items.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      noteId: { 
        type: Type.STRING, 
        description: "The ID of the note to update." 
      },
      newContent: { 
        type: Type.STRING, 
        description: "The new text content. Use this to update game state, step summaries, or reminder text." 
      },
      type: {
        type: Type.STRING,
        enum: ["text", "voice", "image", "tracker"],
        description: "Change the fundamental type of the note. E.g. switch 'tracker' to 'text' to stop tracking and keep it as a log."
      },
      isTracking: {
        type: Type.BOOLEAN,
        description: "Explicitly set to FALSE to stop a step tracker. Set TRUE to start."
      },
      isReminder: { 
        type: Type.BOOLEAN, 
        description: "True/False to enable or disable reminder." 
      },
      reminderTime: { 
        type: Type.STRING, 
        description: "New ISO 8601 time for the reminder." 
      },
      visualPrompt: {
        type: Type.STRING,
        description: "Description to generate a NEW image. Use 'REMOVE_IMAGE' to delete."
      }
    },
    required: ["noteId"]
  }
};

// Define the function for the AI to create notes
const createNoteTool: FunctionDeclaration = {
  name: "createNote",
  description: "Create a NEW note of ANY type. Use this for new ideas, new games, new reminders, or starting a NEW tracker.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      content: { 
        type: Type.STRING, 
        description: "The content of the note." 
      },
      type: {
        type: Type.STRING,
        enum: ["text", "tracker", "voice", "image"],
        description: "The type of note. Use 'tracker' for step/fitness tracking."
      },
      isReminder: { 
        type: Type.BOOLEAN,
        description: "True if this note should have a reminder alarm."
      },
      reminderTime: { 
        type: Type.STRING, 
        description: "ISO 8601 format date time for the reminder." 
      },
      visualPrompt: {
        type: Type.STRING,
        description: "Optional description for an initial AI illustration."
      }
    },
    required: ["content"]
  }
};

interface LiveManagerCallbacks {
  onNoteCreate: (noteData: { 
      content: string, 
      type?: NoteType, 
      isReminder?: boolean, 
      reminderTime?: string, 
      visualPrompt?: string
  }) => void;
  onNoteUpdate: (noteId: string, updates: { 
      content?: string, 
      type?: NoteType,
      isTracking?: boolean,
      isReminder?: boolean, 
      reminderTime?: string, 
      visualPrompt?: string
  }) => void;
  onStatusChange: (isconnected: boolean) => void;
  onError: (error: Error) => void;
  onAudioOutput?: () => void;
}

export class LiveManager {
  private sessionPromise: Promise<any> | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private audioStreamPlayer: AudioStreamPlayer | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private callbacks: LiveManagerCallbacks;

  constructor(callbacks: LiveManagerCallbacks) {
    this.callbacks = callbacks;
  }

  public async connect(context?: string, timeline?: string) {
    try {
      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ 
        sampleRate: 16000,
        latencyHint: 'interactive' 
      });
      this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ 
        sampleRate: 24000, // Model output is 24k
        latencyHint: 'interactive'
      }); 
      this.audioStreamPlayer = new AudioStreamPlayer(this.outputAudioContext);

      // Start Microphone
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }});

      const model = 'gemini-2.5-flash-native-audio-preview-12-2025';
      
      const now = new Date();
      const timeInfo = `Current System Time: ${now.toLocaleString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric', 
        hour: 'numeric', 
        minute: 'numeric',
        second: 'numeric',
        timeZoneName: 'short'
      })}
      (ISO Reference: ${now.toISOString()})
      `;

      let systemInstruction = `You are Chronos Live, an omnipotent timeline manager.
${timeInfo}

=== EXISTING TIMELINE (Context) ===
${timeline || "No existing notes."}
===================================

=== "GOD MODE" INSTRUCTIONS ===
You have full control over the user's notes. You can morph any note into anything else.

1. **Flexible Updates**: 
   - If a user says "Stop tracking and remind me to eat", you must update the specific tracker note: set 'isTracking' to false, change 'type' to 'text', and set 'isReminder' to true with the 'reminderTime'.
   - If a user says "Play a game", create a note (or update the current one) with the game intro. Then, as the user speaks, UPDATE that same note with the new game state/story.
   - If a user says "Change this to a reminder", set 'isReminder' to true and ask for time if not provided, or infer it.

2. **Note Creation - VERBATIM RULE**:
   - If the user simply dictates a note (e.g., "Door code 1234", "Grocery list: milk"), pass it VERBATIM to the 'createNote' tool. Do not summarize, rephrase, or add commentary unless explicitly asked.
   - Only use visualPrompt if the user ASKS for a picture.

3. **Time Manipulation**:
   - Always calculate future ISO 8601 timestamps relative to the Current System Time.

4. **Interaction Style**: 
   - Be extremely responsive. If you update a note, just say "Done" or continue the game narrative. Do not be verbose about the mechanics.

`;

      if (context) {
        systemInstruction += `\n=== CURRENT FOCUS ===\n${context}\nIMPORTANT: The user is looking at or discussing THIS specific note. Apply changes to it directly using 'updateNote'.`;
      }

      const ai = getAiClient();

      const config = {
        model,
        callbacks: {
          onopen: this.handleOpen,
          onmessage: this.handleMessage,
          onclose: this.handleClose,
          onerror: this.handleError,
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
             voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          // updateNoteTool allows full control now
          tools: [{ functionDeclarations: [updateNoteTool, createNoteTool] }],
          systemInstruction: systemInstruction,
        }
      };

      this.sessionPromise = ai.live.connect(config);
      await this.sessionPromise;
      
    } catch (e) {
      this.callbacks.onError(e as Error);
    }
  }

  private handleOpen = () => {
    console.log("Live Session Connected");
    this.callbacks.onStatusChange(true);
    this.startAudioInput();
  };

  private startAudioInput = () => {
    if (!this.inputAudioContext || !this.mediaStream) return;

    const source = this.inputAudioContext.createMediaStreamSource(this.mediaStream);
    this.processor = this.inputAudioContext.createScriptProcessor(2048, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = float32ToInt16PCM(inputData);
      const base64Data = arrayBufferToBase64(pcm16.buffer);

      this.sessionPromise?.then(session => {
        session.sendRealtimeInput({
          media: {
            mimeType: "audio/pcm;rate=16000",
            data: base64Data
          }
        });
      });
    };

    source.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  };

  private handleMessage = async (message: LiveServerMessage) => {
    // 1. Handle Audio
    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      this.callbacks.onAudioOutput?.();
      if (this.audioStreamPlayer) {
        this.audioStreamPlayer.scheduleChunk(base64Audio);
      }
    }

    // 2. Handle Tool Calls
    if (message.toolCall) {
      for (const fc of message.toolCall.functionCalls) {
        let result = "Success";
        const args = fc.args as any;
        console.log(`Tool Call (${fc.name}):`, args);

        if (fc.name === 'createNote') {
            this.callbacks.onNoteCreate({
                content: args.content,
                type: args.type, // Can be 'tracker', 'text', etc
                isReminder: args.isReminder,
                reminderTime: args.reminderTime,
                visualPrompt: args.visualPrompt
            });
            result = "Note created.";

        } else if (fc.name === 'updateNote') {
            // Flexible update of any property
            this.callbacks.onNoteUpdate(args.noteId, {
                content: args.newContent,
                type: args.type,
                isTracking: args.isTracking,
                isReminder: args.isReminder,
                reminderTime: args.reminderTime,
                visualPrompt: args.visualPrompt
            });
            result = "Note updated.";
        }

        this.sessionPromise?.then(session => {
            session.sendToolResponse({
                functionResponses: {
                    id: fc.id,
                    name: fc.name,
                    response: { result }
                }
            });
        });
      }
    }

    // 3. Handle Interruption
    if (message.serverContent?.interrupted) {
      console.log("Model interrupted");
      this.audioStreamPlayer?.stop();
    }
  };

  private handleClose = () => {
    console.log("Live Session Closed");
    this.callbacks.onStatusChange(false);
  };

  private handleError = (e: ErrorEvent) => {
    console.error("Live Session Error", e);
    this.callbacks.onError(new Error("Connection error"));
  };

  public disconnect() {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.inputAudioContext) {
      this.inputAudioContext.close();
      this.inputAudioContext = null;
    }
    if (this.outputAudioContext) {
      this.outputAudioContext.close();
      this.outputAudioContext = null;
    }
    
    this.sessionPromise = null;
    this.callbacks.onStatusChange(false);
  }
}
