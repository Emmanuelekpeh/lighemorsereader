import { useState, useRef, useEffect, useCallback } from 'react';
import { decodeMorseSymbol } from '@/lib/morse-dictionary';

export function useMorseReader() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isStreaming, setIsStreaming] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  // Adjustable settings
  const [threshold, setThreshold] = useState(150); // 0-255 brightness
  const [unitTime, setUnitTime] = useState(200); // ms per dot
  const [colorMode, setColorMode] = useState<'grayscale' | 'red' | 'green'>('grayscale');
  
  // Live state for UI
  const [currentBrightness, setCurrentBrightness] = useState(0);
  const [isLightOn, setIsLightOn] = useState(false);
  const [rawMorse, setRawMorse] = useState('');
  const [decodedText, setDecodedText] = useState('');
  const [trackingSpot, setTrackingSpot] = useState<{x: number, y: number} | null>(null);
  
  const [focusMode, setFocusMode] = useState<'auto' | 'manual'>('auto');
  const [manualSpot, setManualSpot] = useState<{x: number, y: number} | null>(null);

  // Refs for requestAnimationFrame loop to avoid stale closures
  const stateRef = useRef({
    threshold: 150,
    unitTime: 200,
    colorMode: 'grayscale' as 'grayscale' | 'red' | 'green',
    focusMode: 'auto' as 'auto' | 'manual',
    manualSpot: null as {x: number, y: number} | null,
    lastLightState: false,
    stateChangeTime: performance.now(),
    currentSymbol: '',
    finalRawMorse: '',
    finalDecodedText: '',
    animationFrameId: 0,
    frameCount: 0
  });

  // Sync state to refs
  useEffect(() => { stateRef.current.threshold = threshold; }, [threshold]);
  useEffect(() => { stateRef.current.unitTime = unitTime; }, [unitTime]);
  useEffect(() => { stateRef.current.colorMode = colorMode; }, [colorMode]);
  useEffect(() => { stateRef.current.focusMode = focusMode; }, [focusMode]);
  useEffect(() => { stateRef.current.manualSpot = manualSpot; }, [manualSpot]);

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) {
      stateRef.current.animationFrameId = requestAnimationFrame(processFrame);
      return;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Draw video frame to small canvas for fast processing
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Calculate max intensity spot for small LED detection
    let maxIntensity = 0;
    let maxX = 0;
    let maxY = 0;
    const s = stateRef.current;
    
    if (s.focusMode === 'manual' && s.manualSpot) {
      // Look at the specific area around the manual spot
      const x = Math.floor((s.manualSpot.x / 100) * canvas.width);
      const y = Math.floor((s.manualSpot.y / 100) * canvas.height);
      const radius = 2; // 5x5 area (small region to allow slight camera movement)
      
      maxX = x;
      maxY = y;
      
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const cx = Math.min(Math.max(x + dx, 0), canvas.width - 1);
          const cy = Math.min(Math.max(y + dy, 0), canvas.height - 1);
          const idx = (cy * canvas.width + cx) * 4;
          
          let intensity = 0;
          if (s.colorMode === 'red') {
            intensity = Math.max(0, frame.data[idx] - (frame.data[idx+1] + frame.data[idx+2]) / 2);
          } else if (s.colorMode === 'green') {
            intensity = Math.max(0, frame.data[idx+1] - (frame.data[idx] + frame.data[idx+2]) / 2);
          } else {
            intensity = 0.299 * frame.data[idx] + 0.587 * frame.data[idx+1] + 0.114 * frame.data[idx+2];
          }
          if (intensity > maxIntensity) {
            maxIntensity = intensity;
            maxX = cx;
            maxY = cy;
          }
        }
      }
    } else {
      // Auto mode: scan everything
      for (let i = 0; i < frame.data.length; i += 4) {
        let intensity = 0;
        if (s.colorMode === 'red') {
          // Red intensity: Red channel minus average of Blue and Green to isolate red light
          const red = frame.data[i];
          const green = frame.data[i+1];
          const blue = frame.data[i+2];
          intensity = Math.max(0, red - (green + blue) / 2);
        } else if (s.colorMode === 'green') {
          // Green intensity: Green channel minus average of Red and Blue to isolate green light
          const red = frame.data[i];
          const green = frame.data[i+1];
          const blue = frame.data[i+2];
          intensity = Math.max(0, green - (red + blue) / 2);
        } else {
          // Standard grayscale luminance
          intensity = 0.299 * frame.data[i] + 0.587 * frame.data[i+1] + 0.114 * frame.data[i+2];
        }
        
        if (intensity > maxIntensity) {
          maxIntensity = intensity;
          const pixelIndex = i / 4;
          maxX = pixelIndex % canvas.width;
          maxY = Math.floor(pixelIndex / canvas.width);
        }
      }
    }
    
    // Use the single brightest pixel's intensity rather than the average.
    // This allows detecting tiny LEDs from far away without the background diluting the signal.
    const brightness = maxIntensity;
    
    const isOn = brightness > s.threshold;
    const now = performance.now();
    const duration = now - s.stateChangeTime;

    // Update UI less frequently (every ~6 frames / 100ms) to save render cycles
    s.frameCount++;
    if (s.frameCount % 6 === 0) {
      setCurrentBrightness(Math.round(brightness));
      setTrackingSpot({ 
        x: (maxX / canvas.width) * 100, 
        y: (maxY / canvas.height) * 100 
      });
    }

    if (isOn !== s.lastLightState) {
      // State has toggled
      setIsLightOn(isOn); // UI Update

      if (isOn) {
        // Just turned ON. Check duration of the preceding OFF state.
        if (duration >= s.unitTime * 5.5) {
          // Word gap (standard is 7, we trigger if > 5.5)
          if (s.currentSymbol) {
             s.finalDecodedText += decodeMorseSymbol(s.currentSymbol);
             s.finalRawMorse += ' ';
             s.currentSymbol = '';
          }
          s.finalRawMorse += ' / ';
          s.finalDecodedText += ' ';
        } else if (duration >= s.unitTime * 2.5) {
          // Letter gap (standard is 3)
          if (s.currentSymbol) {
            s.finalDecodedText += decodeMorseSymbol(s.currentSymbol);
            s.finalRawMorse += ' ';
            s.currentSymbol = '';
          }
        }
      } else {
        // Just turned OFF. Check duration of the preceding ON state.
        if (duration >= s.unitTime * 2.0) {
          // Dash (standard is 3)
          s.currentSymbol += '-';
          s.finalRawMorse += '-';
        } else {
          // Dot (standard is 1)
          s.currentSymbol += '.';
          s.finalRawMorse += '.';
        }
      }

      s.lastLightState = isOn;
      s.stateChangeTime = now;
      
      // Update UI with new string fragments
      setRawMorse(s.finalRawMorse + (s.currentSymbol ? ' ' + s.currentSymbol : ''));
      setDecodedText(s.finalDecodedText);

    } else {
      // State hasn't changed. Check if we need to auto-resolve a trailing character
      if (!isOn && s.currentSymbol) {
        if (duration >= s.unitTime * 2.5) {
          s.finalDecodedText += decodeMorseSymbol(s.currentSymbol);
          s.finalRawMorse += ' ';
          s.currentSymbol = '';
          setRawMorse(s.finalRawMorse);
          setDecodedText(s.finalDecodedText);
        }
      }
    }

    s.animationFrameId = requestAnimationFrame(processFrame);
  }, []);

  const startStream = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } // Prefer back camera on mobile
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setIsStreaming(true);
        stateRef.current.stateChangeTime = performance.now();
        stateRef.current.animationFrameId = requestAnimationFrame(processFrame);
      }
    } catch (err) {
      console.error('Failed to access camera:', err);
      setCameraError('Could not access camera. Please allow permissions.');
      setIsStreaming(false);
    }
  };

  const stopStream = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    cancelAnimationFrame(stateRef.current.animationFrameId);
    setIsStreaming(false);
    setIsLightOn(false);
  };

  const clearData = () => {
    stateRef.current.finalRawMorse = '';
    stateRef.current.finalDecodedText = '';
    stateRef.current.currentSymbol = '';
    setRawMorse('');
    setDecodedText('');
  };

  useEffect(() => {
    return () => {
      stopStream();
    };
  }, []);

  return {
    videoRef,
    canvasRef,
    isStreaming,
    cameraError,
    startStream,
    stopStream,
    clearData,
    threshold,
    setThreshold,
    unitTime,
    setUnitTime,
    currentBrightness,
    isLightOn,
    rawMorse,
    decodedText,
    colorMode,
    setColorMode,
    trackingSpot,
    focusMode,
    setFocusMode,
    manualSpot,
    setManualSpot
  };
}
