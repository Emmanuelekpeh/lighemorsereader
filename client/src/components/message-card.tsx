import { format } from "date-fns";
import { Trash2, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type MessageResponse } from "@shared/routes";

interface MessageCardProps {
  message: MessageResponse;
  onDelete: (id: number) => void;
  isDeleting: boolean;
}

export function MessageCard({ message, onDelete, isDeleting }: MessageCardProps) {
  return (
    <div className="group relative bg-card/40 backdrop-blur-sm border border-white/5 rounded-2xl p-5 hover:bg-card/60 hover:border-primary/20 transition-all duration-300">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider font-semibold">
          <MessageSquareText className="w-4 h-4 text-primary" />
          {format(new Date(message.createdAt!), "MMM d, yyyy • HH:mm")}
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 -mr-2 -mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onDelete(message.id)}
          disabled={isDeleting}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      
      <div className="space-y-4">
        <div>
          <h4 className="text-xs text-muted-foreground mb-1 font-mono">DECODED TEXT</h4>
          <p className="text-foreground font-medium text-lg leading-snug break-words">
            {message.content || <span className="italic opacity-50">Empty message</span>}
          </p>
        </div>
        
        <div>
          <h4 className="text-xs text-muted-foreground mb-1 font-mono">RAW SIGNAL</h4>
          <p className="text-primary font-mono text-sm tracking-[0.2em] break-all opacity-80 bg-black/20 p-2 rounded-lg">
            {message.rawMorse || <span className="italic tracking-normal">No signal data</span>}
          </p>
        </div>
      </div>
    </div>
  );
}
