
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
  }).format(new Date(timestamp));
}

export function getLocalDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (date.getTime() === today.getTime()) return 'Today';
  if (date.getTime() === yesterday.getTime()) return 'Yesterday';
  if (date.getTime() === tomorrow.getTime()) return 'Tomorrow';
  
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
  }).format(date);
}

// Helper for base64 decoding
function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Convert Float32 audio buffer (from Web Audio API) to Int16 PCM (for Gemini Live API)
export function float32ToInt16PCM(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
}
  
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// Legacy single-shot player (kept for reference, but streaming is preferred)
export function playGeminiTTS(base64Audio: string, audioContext: AudioContext): { source: AudioBufferSourceNode, completed: Promise<void> } {
  const pcmData = decodeBase64(base64Audio);
  // Safe typed array creation using byte offset/length logic just in case
  const dataInt16 = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength / 2);
  
  // Create buffer at 24000Hz (Gemini Output) - Browser will resample to Context rate
  const buffer = audioContext.createBuffer(1, dataInt16.length, 24000);
  const channelData = buffer.getChannelData(0);
  
  for (let i = 0; i < dataInt16.length; i++) {
      channelData[i] = dataInt16[i] / 32768.0;
  }

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);
  source.start();
  
  const completed = new Promise<void>(resolve => {
      source.onended = () => resolve();
  });

  return { source, completed };
}

/**
 * Handles streaming PCM audio chunks for gapless playback.
 */
export class AudioStreamPlayer {
  private context: AudioContext;
  private nextStartTime: number = 0;
  private sources: AudioBufferSourceNode[] = [];
  private isStopped: boolean = false;
  private activeSourcesCount = 0;
  private onPlayStateChange?: (isPlaying: boolean) => void;

  constructor(context: AudioContext) {
    this.context = context;
    this.nextStartTime = context.currentTime;
  }

  public setPlayStateCallback(callback: (isPlaying: boolean) => void) {
    this.onPlayStateChange = callback;
  }

  public scheduleChunk(base64Audio: string) {
    if (this.isStopped) return;

    try {
      const pcmData = decodeBase64(base64Audio);
      // Ensure we have an even number of bytes for 16-bit PCM
      if (pcmData.length % 2 !== 0) {
          console.warn("Audio chunk has odd byte length, skipping malformed frame.");
          return;
      }
      
      const dataInt16 = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength / 2);
      if (dataInt16.length === 0) return;

      // Gemini Text-to-Speech output is 24kHz. 
      // We create a buffer saying "This is 24kHz data". 
      // The Web Audio API automatically resamples this to the hardware context rate (e.g. 44.1k/48k).
      const buffer = this.context.createBuffer(1, dataInt16.length, 24000);
      const channelData = buffer.getChannelData(0);

      // Convert Int16 PCM to Float32
      for (let i = 0; i < dataInt16.length; i++) {
        channelData[i] = dataInt16[i] / 32768.0;
      }

      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.context.destination);

      // Schedule gapless playback
      const currentTime = this.context.currentTime;
      if (this.nextStartTime < currentTime) {
          this.nextStartTime = currentTime;
      }

      source.start(this.nextStartTime);
      
      // Update State
      this.activeSourcesCount++;
      if (this.activeSourcesCount === 1) {
          this.onPlayStateChange?.(true);
      }

      // Advance the pointer by the duration of this chunk
      this.nextStartTime += buffer.duration;
      this.sources.push(source);

      // Cleanup finished nodes to save memory
      source.onended = () => {
        this.activeSourcesCount--;
        if (this.activeSourcesCount === 0) {
            this.onPlayStateChange?.(false);
        }

        const index = this.sources.indexOf(source);
        if (index > -1) {
          this.sources.splice(index, 1);
        }
      };
    } catch (e) {
      console.error("Error scheduling audio chunk", e);
    }
  }

  public stop() {
    this.isStopped = true;
    this.sources.forEach(source => {
      try {
        source.stop();
        source.disconnect();
      } catch(e) { /* ignore */ }
    });
    this.sources = [];
    this.activeSourcesCount = 0;
    this.onPlayStateChange?.(false);
    
    // Reset time tracking
    this.nextStartTime = this.context.currentTime;
    // Allow restarting
    setTimeout(() => { this.isStopped = false; }, 100); 
  }
}

/**
 * Resizes an image file to a maximum dimension to save memory and bandwidth.
 * Uses URL.createObjectURL to avoid loading the entire file into memory as a string.
 */
export function resizeImage(file: File, maxWidth = 800, maxHeight = 800): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // 1. Create a lightweight reference to the file
    const url = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = () => {
      // 2. Revoke immediately to free up memory
      URL.revokeObjectURL(url);
      
      let width = img.width;
      let height = img.height;

      // 3. Calculate new dimensions
      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }

      // 4. Draw to canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      
      // 5. Output compressed BLOB (not base64 string yet)
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Image resize failed"));
      }, 'image/jpeg', 0.7); // 70% quality for efficiency
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    
    img.src = url;
  });
}
