
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { AIResponse, Note } from "../types";

// --- CONFIGURATION ---
// REPLACE THIS WITH YOUR GEMINI API KEY from https://aistudio.google.com/app/apikey
const GEMINI_API_KEY = "REPLACE_WITH_YOUR_GEMINI_API_KEY";

const getAiClient = () => {
    if (GEMINI_API_KEY.includes("REPLACE_WITH")) {
        console.error("Gemini API Key is missing. Please update services/geminiService.ts");
        throw new Error("Gemini API Key missing");
    }
    return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
};

// Get detailed user context to ensure the AI understands "Local Time"
const getUserContext = () => {
  const now = new Date();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  return {
    localTime: now.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: true,
      timeZoneName: 'short'
    }),
    timeZone,
    offsetMinutes: now.getTimezoneOffset() 
  };
};

const getSystemInstruction = (historyContext: string) => {
  const ctx = getUserContext();
  return `You are Chronos, the intelligent timeline manager.
  
  === CONTEXT ===
  - User Local Time: ${ctx.localTime}
  - Timezone: ${ctx.timeZone}
  
  === INSTRUCTION: INTENT DETECTION ===
  1. **Log vs Request**: Distinguish between simple notes and active requests.
  
  === MODES ===
  
  MODE A: VERBATIM LOGGING (Default)
  - Trigger: Dictating notes, facts, lists.
  - Action: "formatted" = EXACT input. "intent": null.

  MODE B: ACTIVE ASSISTANCE
  - Trigger: "Remind me", "Plan this", "Track steps".
  - Action: Process text, set reminderDate, subtasks.

  === FITNESS COMMANDS ===
  - "Start tracking steps" -> intent: "track_steps_start"
  - "Stop tracking" -> intent: "track_steps_stop"

  === OUTPUT FORMAT (JSON) ===
  {
    "formatted": "String",
    "transcript": "String",
    "reminderDate": "String (ISO-8601) or null",
    "intent": "String or null",
    "visualPrompt": "String or null",
    "subtasks": ["String"] or null
  }`;
}

// Helper to format history for the prompt
const formatHistoryForPrompt = (notes: Note[]) => {
  // Take last 15 notes to save context window, focusing on content and time
  return notes.slice(0, 15).map(n => 
    `[${new Date(n.timestamp).toLocaleDateString()}] ${n.content}`
  ).join('\n');
};

export async function processAudioNote(base64Audio: string, mimeType: string, existingNotes: Note[]): Promise<AIResponse> {
  const ai = getAiClient();
  // Use gemini-2.0-flash-exp for reliable multimodal processing
  const model = 'gemini-2.0-flash-exp';
  const history = formatHistoryForPrompt(existingNotes);
  
  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Audio,
          },
        },
        {
          text: "Transcribe and process this audio.",
        },
      ],
    },
    config: {
      systemInstruction: getSystemInstruction(history),
      responseMimeType: "application/json",
    }
  });

  try {
    const json = JSON.parse(response.text || "{}");
    return {
      ...json,
      formatted: json.formatted || "Processed Audio Note"
    };
  } catch (e) {
    console.error("Failed to parse AI response", e);
    return { formatted: response.text || "Processing failed.", transcript: "" };
  }
}

export async function formatTextNote(rawText: string, existingNotes: Note[]): Promise<AIResponse> {
  const ai = getAiClient();
  // Use gemini-2.0-flash-exp for text processing
  const model = 'gemini-2.0-flash-exp';
  const history = formatHistoryForPrompt(existingNotes);
  
  const response = await ai.models.generateContent({
    model,
    contents: `User Input: ${rawText}`,
    config: {
      systemInstruction: getSystemInstruction(history),
      responseMimeType: "application/json",
    }
  });

  try {
    const json = JSON.parse(response.text || "{}");
    return {
      ...json,
      formatted: json.formatted || rawText
    };
  } catch (e) {
    console.error("Failed to parse AI response", e);
    return { formatted: rawText };
  }
}

export async function transcribeAudio(base64Audio: string, mimeType: string): Promise<string> {
  const ai = getAiClient();
  // Use gemini-2.0-flash-exp for transcription
  const model = 'gemini-2.0-flash-exp';
  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Audio } },
          { text: "Transcribe the speech in this audio to text verbatim. Do not add any commentary." },
        ],
      },
    });
    return response.text || "";
  } catch (e) {
    console.error("Transcription failed", e);
    return "";
  }
}

export async function analyzeImageNote(base64Image: string, mimeType: string, userText: string, existingNotes: Note[]): Promise<AIResponse> {
  const ai = getAiClient();
  // Use gemini-2.0-flash-exp for image analysis
  const model = 'gemini-2.0-flash-exp';
  
  const systemInstruction = `You are Chronos Tracker.
  
  === TASK ===
  1. Analyze the image + text context ("${userText}").
  2. If FOOD: Estimate Calories/Macros.
  3. If NOT FOOD: Describe object/scene.
  
  === OUTPUT FORMAT (JSON) ===
  {
      "formatted": "Summary of analysis",
      "visualPrompt": null,
      "subtasks": []
  }
  `;

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Image,
          },
        },
        {
          text: userText ? `Context: ${userText}` : "Analyze this image.",
        },
      ],
    },
    config: {
      systemInstruction: systemInstruction,
      responseMimeType: "application/json",
    }
  });

  try {
    const json = JSON.parse(response.text || "{}");
    return {
      ...json,
      formatted: json.formatted || "Processed Image Log"
    };
  } catch (e) {
    console.error("Failed to parse AI response", e);
    return { formatted: response.text || "Analysis failed." };
  }
}

/**
 * Generates a fun cartoon illustration based on a prompt.
 */
export async function generateIllustration(prompt: string): Promise<string | null> {
  const ai = getAiClient();
  // Use gemini-2.5-flash-image for generation
  const model = 'gemini-2.5-flash-image';
  const fullPrompt = `A fun, vibrant, clean cartoon illustration of: ${prompt}. Minimalist style, suitable for a mobile app timeline.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [{ text: fullPrompt }],
      },
      // nano banana series doesn't support responseMimeType
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        const base64 = part.inlineData.data;
        return `data:${part.inlineData.mimeType};base64,${base64}`;
      }
    }
    return null;
  } catch (e) {
    console.error("Image generation failed", e);
    return null;
  }
}

/**
 * Generates speech from text.
 */
export async function streamSpeech(text: string) {
  const ai = getAiClient();
  const model = "gemini-2.5-flash-preview-tts";
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });
    
    return {
      [Symbol.asyncIterator]: async function* () {
        if (response) {
            yield response;
        }
      }
    };
  } catch (e) {
    console.error("TTS failed", e);
    throw e;
  }
}
