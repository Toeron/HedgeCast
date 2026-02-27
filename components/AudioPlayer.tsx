import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Article } from '../types';

// --- Audio Decoding Helpers ---

/**
 * Decodes a base64 string into a Uint8Array.
 */
function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decodes raw PCM audio data into an AudioBuffer that can be played.
 * The Gemini TTS API returns audio as 16-bit single-channel PCM at a 24kHz sample rate.
 * @param pcmData The raw audio data.
 * @param context The AudioContext to use for decoding.
 * @returns A promise that resolves to an AudioBuffer.
 */
async function decodePcmData(
  pcmData: Uint8Array,
  context: AudioContext,
): Promise<AudioBuffer> {
  const sampleRate = 24000;
  const numChannels = 1;
  const dataInt16 = new Int16Array(pcmData.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = context.createBuffer(numChannels, frameCount, sampleRate);
  const channelData = buffer.getChannelData(0);

  for (let i = 0; i < frameCount; i++) {
    // Normalize from [-32768, 32767] to the float range [-1, 1]
    channelData[i] = dataInt16[i] / 32768.0;
  }
  return buffer;
}

// --- WAV File Generation ---
const writeString = (view: DataView, offset: number, str: string) => {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
};

const createWavBlob = (pcmData: Int16Array, sampleRate: number): Blob => {
    const numChannels = 1;
    const bytesPerSample = 2; // 16-bit
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcmData.length * bytesPerSample;
    const bufferSize = 44 + dataSize;
    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    for (let i = 0; i < pcmData.length; i++) {
        view.setInt16(44 + i * 2, pcmData[i], true);
    }

    return new Blob([view], { type: 'audio/wav' });
};


interface AudioPlayerProps {
  audioData: string;
  article: Article;
  isFavorited: boolean;
  onToggleFavorite: (article: Article, audioData: string) => void;
}

const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioData, article, isFavorited, onToggleFavorite }) => {
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    
    // Refs to hold state values to break dependency cycles in callbacks
    const isPlayingRef = useRef(isPlaying);
    useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

    const progressRef = useRef(progress);
    useEffect(() => { progressRef.current = progress; }, [progress]);

    const durationRef = useRef(duration);
    useEffect(() => { durationRef.current = duration; }, [duration]);

    const audioContextRef = useRef<AudioContext | null>(null);
    const audioBufferRef = useRef<AudioBuffer | null>(null);
    const pcmDataRef = useRef<Int16Array | null>(null);
    const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
    const startTimeRef = useRef(0);
    const startOffsetRef = useRef(0);
    const animationFrameRef = useRef(0);

    const play = useCallback(() => {
        if (!audioContextRef.current || !audioBufferRef.current || isPlayingRef.current) return;

        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBufferRef.current;
        source.connect(audioContextRef.current.destination);

        const offset = startOffsetRef.current;
        source.start(0, offset);

        source.onended = () => {
            if (sourceNodeRef.current === source) {
                setIsPlaying(false);
                if (progressRef.current >= durationRef.current - 0.1) {
                    startOffsetRef.current = 0;
                    setProgress(0);
                }
            }
        };

        sourceNodeRef.current = source;
        startTimeRef.current = audioContextRef.current.currentTime - offset;
        setIsPlaying(true);
    }, []); // Made stable by using refs

    const pause = useCallback(() => {
        if (!isPlayingRef.current || !sourceNodeRef.current) return;
        
        sourceNodeRef.current.onended = null;
        try {
          sourceNodeRef.current.stop();
        } catch (e) {
          // Can throw if already stopped. Ignore.
        }
        sourceNodeRef.current = null;
        
        startOffsetRef.current = progressRef.current;
        setIsPlaying(false);
    }, []); // Made stable by using refs

    const cleanup = useCallback(() => {
        pause();
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(e => console.warn("Error closing audio context:", e));
        }
        cancelAnimationFrame(animationFrameRef.current);
        audioContextRef.current = null;
        audioBufferRef.current = null;
        pcmDataRef.current = null;
        setIsReady(false);
        setProgress(0);
        setDuration(0);
        startOffsetRef.current = 0;
    }, [pause]); // Depends on stable `pause`

    useEffect(() => {
        if (!audioData) return;

        let isActive = true;
        cleanup(); // Cleanup any existing audio context

        const setupAudio = async () => {
            try {
                const context = new (window.AudioContext || (window as any).webkitAudioContext)();
                const pcmBytes = decodeBase64(audioData);
                pcmDataRef.current = new Int16Array(pcmBytes.buffer);

                const buffer = await decodePcmData(pcmBytes, context);

                if (!isActive) {
                    context.close();
                    return;
                }
                
                audioContextRef.current = context;
                audioBufferRef.current = buffer;
                setDuration(buffer.duration);
                setIsReady(true);
                play(); // Autoplay
            } catch (error) {
                console.error("Failed to decode audio data:", error);
            }
        };

        setupAudio();

        return () => {
            isActive = false;
            cleanup();
        };
    }, [audioData, cleanup, play]); // Dependencies are now stable, preventing infinite loop
    
    const updateProgress = useCallback(() => {
        if (isPlayingRef.current && audioContextRef.current && audioBufferRef.current) {
            const elapsedTime = audioContextRef.current.currentTime - startTimeRef.current;
            if (elapsedTime <= audioBufferRef.current.duration) {
                 setProgress(elapsedTime);
            }
            animationFrameRef.current = requestAnimationFrame(updateProgress);
        }
    }, []); // Stable

    useEffect(() => {
        if (isPlaying) {
            animationFrameRef.current = requestAnimationFrame(updateProgress);
        } else {
            cancelAnimationFrame(animationFrameRef.current);
        }
        return () => cancelAnimationFrame(animationFrameRef.current);
    }, [isPlaying, updateProgress]); // `updateProgress` is stable

    const handlePlayPause = () => {
        if (audioContextRef.current?.state === 'suspended') {
            audioContextRef.current.resume();
        }
        if (isPlaying) {
            pause();
        } else {
            play();
        }
    };

    const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!audioBufferRef.current) return;
        const wasPlaying = isPlaying;
        if (wasPlaying) pause();

        const seekTime = parseFloat(event.target.value);
        startOffsetRef.current = seekTime;
        setProgress(seekTime);

        if (wasPlaying) play();
    };

    const handleDownload = () => {
        if (!pcmDataRef.current) return;

        const blob = createWavBlob(pcmDataRef.current, 24000);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        const fileName = `${article.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.wav`;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
    };

    const handleShare = async () => {
        if (!pcmDataRef.current || !navigator.share) return;

        const blob = createWavBlob(pcmDataRef.current, 24000);
        const fileName = `${article.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.wav`;
        const file = new File([blob], fileName, { type: 'audio/wav' });

        const shareData = {
            title: article.title,
            text: `Listen to the AI-generated audio summary for: "${article.title}"`,
            url: article.link,
            files: [file],
        };

        try {
            if (navigator.canShare && navigator.canShare(shareData)) {
                await navigator.share(shareData);
            } else if (navigator.canShare && navigator.canShare({title: shareData.title, text: shareData.text, url: shareData.url})) {
                // Fallback for devices that can't share files but can share links
                 await navigator.share({title: shareData.title, text: shareData.text, url: shareData.url});
            } else {
                console.warn("Sharing not supported for this data.");
            }
        } catch (error) {
            // Ignore abort errors from the user cancelling the share dialog
            if (error instanceof DOMException && error.name === 'AbortError') {
                return;
            }
            console.error('Error sharing:', error);
        }
    };
    
    const handleFavoriteClick = () => {
        onToggleFavorite(article, audioData);
    };


  return (
    <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 shadow-lg animate-fade-in">
        <div className="mb-4">
            <p className="text-sm text-slate-400">Now Playing</p>
            <h3 className="text-xl font-bold text-white truncate">{article.title}</h3>
        </div>
        <div className="flex items-center gap-4">
            <button 
                onClick={handlePlayPause}
                disabled={!isReady}
                className="p-3 bg-sky-500 text-white rounded-full disabled:bg-slate-600 disabled:cursor-not-allowed transition-transform duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 focus:ring-offset-slate-800"
                aria-label={isPlaying ? 'Pause' : 'Play'}
            >
                {isPlaying ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><path d="M14.016 5.016H18v13.969h-3.984V5.016zM6 18.984V5.015h3.984v13.969H6z" /></svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><path d="M8.016 5.016L18.985 12 8.016 18.984V5.016z" /></svg>
                )}
            </button>
            <div className="flex-grow flex items-center gap-2 text-sm text-slate-400">
                <span>{formatTime(progress)}</span>
                <input 
                    type="range"
                    min="0"
                    max={duration || 1}
                    step="0.1"
                    value={progress}
                    onChange={handleSeek}
                    disabled={!isReady}
                    className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sky-400"
                />
                <span>{formatTime(duration)}</span>
            </div>
             <div className="flex items-center gap-1">
                <button 
                    onClick={handleFavoriteClick}
                    className="p-2 text-slate-400 rounded-full transition-colors duration-200 hover:text-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-slate-800"
                    aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                >
                    {isFavorited ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
                           <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                        </svg>
                    )}
                </button>
                <button 
                    onClick={handleDownload}
                    disabled={!isReady}
                    className="p-2 text-slate-400 rounded-full disabled:text-slate-600 disabled:cursor-not-allowed transition-colors duration-200 hover:text-white focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 focus:ring-offset-slate-800"
                    aria-label="Download Audio"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.016 12.984l-5.016 5.016-5.016-5.016h3v-9h4.031v9h3zM18.984 8.016v9.984h-13.97V8.016h-3v9.984q0 1.219.89 2.11t2.11.89h13.969q1.219 0 2.11- .89t.89-2.11V8.016h-3z" /></svg>
                </button>
                {navigator.share && (
                    <button 
                        onClick={handleShare}
                        disabled={!isReady}
                        className="p-2 text-slate-400 rounded-full disabled:text-slate-600 disabled:cursor-not-allowed transition-colors duration-200 hover:text-white focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 focus:ring-offset-slate-800"
                        aria-label="Share Audio"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" /></svg>
                    </button>
                )}
            </div>
        </div>
        {!isReady && audioData && (
            <div className="text-xs text-slate-400 mt-2 text-center">Decoding audio...</div>
        )}
    </div>
  );
};

export default AudioPlayer;
