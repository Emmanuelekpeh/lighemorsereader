import { useState, useRef, useEffect, useCallback } from 'react';
import { decodeMorseSymbol } from '@/lib/morse-dictionary';

export function useMorseReader() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [isStreaming, setIsStreaming] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  // Adjustable settings
  const [threshold, setThreshold] = useState(() => {
    const saved = localStorage.getItem('morse_threshold');
    return saved ? parseInt(saved, 10) : 150;
  });
  const [unitTime, setUnitTime] = useState(() => {
    const saved = localStorage.getItem('morse_unitTime');
    return saved ? parseInt(saved, 10) : 200;
  });
  const [colorMode, setColorMode] = useState<'grayscale' | 'red' | 'green'>(() => {
    const saved = localStorage.getItem('morse_colorMode');
    return (saved as 'grayscale' | 'red' | 'green') || 'grayscale';
  });
  
  // Live state for UI
  const [currentBrightness, setCurrentBrightness] = useState(0);
  const [isLightOn, setIsLightOn] = useState(false);
  const [rawMorse, setRawMorse] = useState('');
  const [decodedText, setDecodedText] = useState('');
  const [trackingSpot, setTrackingSpot] = useState<{x: number, y: number} | null>(null);
  
  const [focusMode, setFocusMode] = useState<'auto' | 'manual'>(() => {
    const saved = localStorage.getItem('morse_focusMode');
    return (saved as 'auto' | 'manual') || 'auto';
  });
  const [manualSpot, setManualSpot] = useState<{x: number, y: number} | null>(() => {
    const saved = localStorage.getItem('morse_manualSpot');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  });
  const [autoThreshold, setAutoThreshold] = useState(() => {
    const saved = localStorage.getItem('morse_autoThreshold');
    return saved ? saved === 'true' : true;
  });

  // Refs for requestAnimationFrame loop to avoid stale closures
  const stateRef = useRef({
    threshold: threshold,
    unitTime: unitTime,
    colorMode: colorMode,
    focusMode: focusMode,
    manualSpot: manualSpot,
    autoThreshold: autoThreshold,
    localMin: 255,
    localMax: 0,
    lastLightState: false,
    pendingLightState: false,
    pendingLightStateTime: performance.now(),
    stateChangeTime: performance.now(),
    lastTrackX: -1,
    lastTrackY: -1,
    currentSymbol: '',
    finalRawMorse: '',
    finalDecodedText: '',
    animationFrameId: 0,
    frameCount: 0,
    lastFrameTime: 0
  });

  // Sync state to refs and localStorage
  useEffect(() => { 
    stateRef.current.threshold = threshold; 
    localStorage.setItem('morse_threshold', threshold.toString());
  }, [threshold]);
  
  useEffect(() => { 
    stateRef.current.unitTime = unitTime; 
    localStorage.setItem('morse_unitTime', unitTime.toString());
  }, [unitTime]);
  
  useEffect(() => { 
    stateRef.current.colorMode = colorMode; 
    localStorage.setItem('morse_colorMode', colorMode);
  }, [colorMode]);
  
  useEffect(() => { 
    stateRef.current.focusMode = focusMode; 
    localStorage.setItem('morse_focusMode', focusMode);
  }, [focusMode]);
  
  useEffect(() => { 
    stateRef.current.manualSpot = manualSpot; 
    if (manualSpot) {
      localStorage.setItem('morse_manualSpot', JSON.stringify(manualSpot));
    } else {
      localStorage.removeItem('morse_manualSpot');
    }
  }, [manualSpot]);
  
  useEffect(() => { 
    stateRef.current.autoThreshold = autoThreshold; 
    localStorage.setItem('morse_autoThreshold', autoThreshold.toString());
  }, [autoThreshold]);

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) {
      stateRef.current.animationFrameId = requestAnimationFrame(processFrame);
      return;
    }

    const now = performance.now();
    // For fast microcontroller (Pico) tracking, we want the highest frame rate possible.
    // Ensure we process every available frame from requestAnimationFrame (typically 60fps)
    stateRef.current.lastFrameTime = now;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Draw video frame to small canvas for fast processing
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Calculate max intensity spot for small LED detection
    let maxIntensity = -1;
    let maxX = s.lastTrackX !== -1 ? s.lastTrackX : Math.floor(canvas.width / 2);
    let maxY = s.lastTrackY !== -1 ? s.lastTrackY : Math.floor(canvas.height / 2);
    const s = stateRef.current;
    
    // Optimized pixel reading loop (using typed arrays where possible could improve performance further, 
    // but a 64x64 canvas means only 4096 iterations which takes < 1ms on modern devices)
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
      // Auto mode: scan everything with a preference for the previous tracking spot (stickiness)
      const maxDist = Math.sqrt(canvas.width * canvas.width + canvas.height * canvas.height);
      
      for (let i = 0; i < frame.data.length; i += 4) {
        const cx = (i / 4) % canvas.width;
        const cy = Math.floor((i / 4) / canvas.width);
        
        let intensity = 0;
        const r = frame.data[i];
        const g = frame.data[i+1];
        const b = frame.data[i+2];

        if (s.colorMode === 'red') {
          if (r > 240 && g > 240 && b > 240) intensity = r; // Handle overexposed white LED center
          else intensity = Math.max(0, r - (g + b) / 2);
        } else if (s.colorMode === 'green') {
          if (r > 240 && g > 240 && b > 240) intensity = g; // Handle overexposed white LED center
          else intensity = Math.max(0, g - (r + b) / 2);
        } else {
          intensity = 0.299 * r + 0.587 * g + 0.114 * b;
        }
        
        // Add spatial stickiness if we have a previous tracking spot
        if (s.lastTrackX !== -1) {
          const dist = Math.sqrt(Math.pow(cx - s.lastTrackX, 2) + Math.pow(cy - s.lastTrackY, 2));
          // Penalize pixels that are further away from the last known spot
          // This keeps the tracker locked onto the Pico even if another bright reflection appears
          const distancePenalty = (dist / maxDist) * 30; // Max penalty of 30 intensity points
          intensity -= distancePenalty;
        }
        
        if (intensity > maxIntensity) {
          maxIntensity = intensity;
          maxX = cx;
          maxY = cy;
        }
      }
    }
    
    // Use the single brightest pixel's intensity rather than the average.
    // This allows detecting tiny LEDs from far away without the background diluting the signal.
    const brightness = Math.max(0, maxIntensity); // clamp bottom in case of negative distance penalties
    
    // Save tracking spot for next frame's hysteresis
    s.lastTrackX = maxX;
    s.lastTrackY = maxY;
    
    if (s.autoThreshold) {
      if (brightness > s.localMax) s.localMax = brightness;
      if (brightness < s.localMin) s.localMin = brightness;
      
      // Slow decay to adapt to changing ambient light
      s.localMax -= 0.5;
      s.localMin += 0.5;
      
      // Keep bounds
      if (s.localMax < brightness) s.localMax = brightness;
      if (s.localMin > brightness) s.localMin = brightness;
      
      // Only adjust threshold if we have a reasonable spread (prevent noise from triggering)
      if (s.localMax - s.localMin > 10) {
        // Set threshold halfway between min and max
        s.threshold = s.localMin + (s.localMax - s.localMin) * 0.5; 
      }
    }
    
    const rawIsOn = brightness > s.threshold;
    
    // Debounce light state to filter out 1-frame camera glitches / noise
    if (rawIsOn !== s.pendingLightState) {
      s.pendingLightState = rawIsOn;
      s.pendingLightStateTime = now;
    }
    
    let isOn = s.lastLightState;
    // Require the state to be stable for a fraction of the dot duration to register as a genuine change.
    // This dynamically scales with unitTime to allow for very fast machine-generated morse from a Pico.
    const debounceTime = Math.min(20, s.unitTime * 0.3);
    if (s.pendingLightState !== s.lastLightState && (now - s.pendingLightStateTime) >= debounceTime) {
      isOn = s.pendingLightState;
    }
    
    const duration = now - s.stateChangeTime;

    // Update UI less frequently (every ~6 frames / 100ms) to save render cycles
    s.frameCount++;
    if (s.frameCount % 6 === 0) {
      setCurrentBrightness(Math.round(brightness));
      if (s.autoThreshold) {
        setThreshold(Math.round(s.threshold));
      }
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
      // State hasn't changed. Check if we need to auto-resolve a trailing character or add a word gap
      if (!isOn) {
        if (s.currentSymbol && duration >= s.unitTime * 2.5) {
          s.finalDecodedText += decodeMorseSymbol(s.currentSymbol);
          s.finalRawMorse += ' ';
          s.currentSymbol = '';
          setRawMorse(s.finalRawMorse);
          setDecodedText(s.finalDecodedText);
        } else if (!s.currentSymbol && duration >= s.unitTime * 5.5) {
          // If a long gap happens after a letter, add a space to signify word completion
          if (s.finalRawMorse && !s.finalRawMorse.endsWith(' / ')) {
            s.finalRawMorse = s.finalRawMorse.trimEnd() + ' / ';
            s.finalDecodedText = s.finalDecodedText.trimEnd() + ' ';
            setRawMorse(s.finalRawMorse);
            setDecodedText(s.finalDecodedText);
          }
        }
      }
    }

    s.animationFrameId = requestAnimationFrame(processFrame);
  }, []);

  const startStream = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment', // Prefer back camera on mobile
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 60 } // Request high framerate for fast Pico morse
        } 
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
      if (stateRef.current.animationFrameId) {
        cancelAnimationFrame(stateRef.current.animationFrameId);
      }
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
    setManualSpot,
    autoThreshold,
    setAutoThreshold
  };
}
