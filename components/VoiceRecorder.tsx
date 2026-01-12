
import React, { useState, useRef, useEffect } from 'react';

interface VoiceRecorderProps {
  onStop: (blob: Blob) => void;
  isRecording: boolean;
  setIsRecording: (recording: boolean) => void;
}

const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onStop, isRecording, setIsRecording }) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [timer, setTimer] = useState(0);
  const timerIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (isRecording) {
      startRecording();
      timerIntervalRef.current = window.setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    } else {
      stopRecording();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      setTimer(0);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isRecording]);

  const startRecording = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStream(mediaStream);
      const recorder = new MediaRecorder(mediaStream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        onStop(blob);
        mediaStream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
    } catch (err) {
      console.error("Failed to start recording:", err);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isRecording) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-red-50 text-red-600 rounded-full border border-red-100 animate-pulse">
      <div className="w-3 h-3 bg-red-600 rounded-full"></div>
      <span className="font-medium text-sm tabular-nums">{formatDuration(timer)}</span>
      <span className="text-xs font-bold uppercase tracking-wider">Recording...</span>
    </div>
  );
};

export default VoiceRecorder;
