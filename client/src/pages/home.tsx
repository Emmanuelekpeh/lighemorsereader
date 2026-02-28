import { useEffect } from "react";
import { Camera, Settings2, Play, Square, Save, RotateCcw, AlertTriangle, Activity, Database, Lightbulb, MessageSquareText } from "lucide-react";
import { useMorseReader } from "@/hooks/use-morse-reader";
import { useMessages, useCreateMessage, useDeleteMessage } from "@/hooks/use-messages";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { MessageCard } from "@/components/message-card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  const reader = useMorseReader();
  const { data: messages, isLoading: isMessagesLoading } = useMessages();
  const createMessage = useCreateMessage();
  const deleteMessage = useDeleteMessage();

  const handleSave = () => {
    if (!reader.decodedText && !reader.rawMorse) return;
    createMessage.mutate({
      content: reader.decodedText.trim(),
      rawMorse: reader.rawMorse.trim()
    }, {
      onSuccess: () => reader.clearData()
    });
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-secondary/40 via-background to-background pt-6 pb-12 px-4 sm:px-6 lg:px-8">
      
      <header className="max-w-7xl mx-auto mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/20">
            <Lightbulb className="text-primary-foreground w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Lumina</h1>
            <p className="text-xs font-mono text-muted-foreground tracking-widest">OPTICAL MORSE DECODER</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* LEFT COLUMN: CAMERA & LIVE DECODING */}
        <div className="lg:col-span-8 space-y-6">
          
          <div className={`relative aspect-video rounded-3xl overflow-hidden bg-black border-2 transition-colors duration-300 ${reader.isLightOn ? 'border-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.2)]' : 'border-white/10'}`}>
            
            {/* The actual video element */}
            <video 
              ref={reader.videoRef} 
              className="w-full h-full object-cover opacity-80"
              playsInline 
              muted 
            />
            
            {/* Hidden canvas for processing */}
            <canvas ref={reader.canvasRef} width="64" height="64" className="hidden" />

            {/* Overlay State UI */}
            {!reader.isStreaming && !reader.cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
                <Camera className="w-16 h-16 text-white/20 mb-4" />
                <p className="text-white/60 font-medium">Camera is offline</p>
                <Button onClick={reader.startStream} className="mt-6 gap-2 rounded-full px-6">
                  <Play className="w-4 h-4 fill-current" /> Start Camera
                </Button>
              </div>
            )}

            {reader.cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-destructive/20 backdrop-blur-sm">
                <AlertTriangle className="w-16 h-16 text-destructive mb-4" />
                <p className="text-white font-medium text-center px-6">{reader.cameraError}</p>
                <Button onClick={reader.startStream} variant="outline" className="mt-6">
                  Try Again
                </Button>
              </div>
            )}

            {/* Live Indicator Overlay */}
            {reader.isStreaming && (
              <div className="absolute top-4 right-4 flex items-center gap-3 bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
                <span className="font-mono text-xs font-bold tracking-wider">
                  {reader.isLightOn ? 'SIGNAL DETECTED' : 'AWAITING SIGNAL'}
                </span>
                <div className={`w-3 h-3 rounded-full transition-all duration-150 ${reader.isLightOn ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,1)]' : 'bg-white/20'}`} />
              </div>
            )}
          </div>

          {/* Decoding Readouts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-panel p-6 rounded-2xl flex flex-col">
              <div className="flex items-center gap-2 mb-4 text-muted-foreground">
                <Activity className="w-4 h-4" />
                <h3 className="text-sm font-bold tracking-widest">LIVE DECODING</h3>
              </div>
              <div className="flex-1 bg-black/30 rounded-xl p-4 min-h-[120px] border border-white/5 font-sans text-xl break-words">
                {reader.decodedText || <span className="text-white/20 italic">Waiting for input...</span>}
              </div>
            </div>

            <div className="glass-panel p-6 rounded-2xl flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-primary">
                  <Activity className="w-4 h-4" />
                  <h3 className="text-sm font-bold tracking-widest text-primary">RAW SIGNAL</h3>
                </div>
              </div>
              <div className="flex-1 bg-black/30 rounded-xl p-4 min-h-[120px] border border-primary/20 font-mono text-primary/80 tracking-[0.2em] break-all overflow-hidden relative">
                {reader.rawMorse || <span className="text-primary/20 tracking-normal italic">...</span>}
              </div>
            </div>
          </div>
          
          {/* Action Bar */}
          <div className="flex items-center justify-end gap-3">
             <Button variant="outline" onClick={reader.clearData} className="gap-2 border-white/10 hover:bg-white/5">
                <RotateCcw className="w-4 h-4" /> Clear
             </Button>
             <Button 
                onClick={handleSave} 
                disabled={!reader.decodedText || createMessage.isPending}
                className="gap-2 bg-gradient-to-r from-primary to-blue-500 text-white shadow-lg shadow-primary/20 hover:shadow-primary/40 rounded-xl px-6"
              >
                <Save className="w-4 h-4" /> 
                {createMessage.isPending ? "Saving..." : "Save Message"}
             </Button>
          </div>

        </div>

        {/* RIGHT COLUMN: CONTROLS & HISTORY */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Controls Panel */}
          <div className="glass-panel p-6 rounded-3xl">
            <div className="flex items-center gap-2 mb-6 border-b border-white/10 pb-4">
              <Settings2 className="w-5 h-5 text-primary" />
              <h2 className="font-display font-semibold text-lg text-foreground">Decoder Settings</h2>
            </div>

            <div className="space-y-8">
              {/* Camera Toggle */}
              <div className="flex justify-between items-center bg-black/20 p-4 rounded-2xl border border-white/5">
                 <div>
                   <p className="font-medium text-sm">Camera Stream</p>
                   <p className="text-xs text-muted-foreground mt-1">Capture live video</p>
                 </div>
                 {reader.isStreaming ? (
                    <Button variant="destructive" size="sm" onClick={reader.stopStream} className="gap-2">
                      <Square className="w-3 h-3 fill-current" /> Stop
                    </Button>
                 ) : (
                    <Button variant="secondary" size="sm" onClick={reader.startStream} className="gap-2">
                      <Play className="w-3 h-3 fill-current" /> Start
                    </Button>
                 )}
              </div>

              {/* Threshold Slider */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium">Light Sensitivity</label>
                  <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-1 rounded">
                    {reader.threshold}/255
                  </span>
                </div>
                <Slider 
                  value={[reader.threshold]} 
                  onValueChange={(val) => reader.setThreshold(val[0])}
                  max={255} 
                  step={1}
                  className="[&_[role=slider]]:bg-primary"
                />
                
                {/* Visualizer Bar */}
                <div className="relative h-4 bg-black rounded-full overflow-hidden border border-white/10">
                  <div 
                    className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-75"
                    style={{ width: `${(reader.currentBrightness / 255) * 100}%` }}
                  />
                  <div 
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                    style={{ left: `${(reader.threshold / 255) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">Current brightness vs. activation threshold</p>
              </div>

              {/* Speed Slider */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium">Base Speed (Dot Unit)</label>
                  <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-1 rounded">
                    {reader.unitTime}ms
                  </span>
                </div>
                <Slider 
                  value={[reader.unitTime]} 
                  onValueChange={(val) => reader.setUnitTime(val[0])}
                  min={50}
                  max={1000} 
                  step={10}
                  className="[&_[role=slider]]:bg-primary"
                />
                <p className="text-xs text-muted-foreground">Adjust expected duration of a single dot</p>
              </div>
            </div>
          </div>

          {/* History Panel */}
          <div className="glass-panel p-6 rounded-3xl flex flex-col h-[500px]">
            <div className="flex items-center gap-2 mb-6 border-b border-white/10 pb-4">
              <Database className="w-5 h-5 text-primary" />
              <h2 className="font-display font-semibold text-lg text-foreground">Saved Messages</h2>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
              {isMessagesLoading ? (
                <>
                  <Skeleton className="h-32 w-full rounded-2xl bg-white/5" />
                  <Skeleton className="h-32 w-full rounded-2xl bg-white/5" />
                </>
              ) : messages && messages.length > 0 ? (
                messages.map(msg => (
                  <MessageCard 
                    key={msg.id} 
                    message={msg} 
                    onDelete={(id) => deleteMessage.mutate(id)}
                    isDeleting={deleteMessage.isPending}
                  />
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground/50">
                  <MessageSquareText className="w-12 h-12 mb-4 opacity-20" />
                  <p className="text-sm">No messages saved yet.</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
