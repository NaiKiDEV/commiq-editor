import { useState, useCallback, memo } from 'react';
import { BookMarked, ChevronDown } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

type WsTemplate = { id: string; name: string; payload: string };

type MessageComposerProps = {
  isConnected: boolean;
  templates: WsTemplate[];
  onSend: (payload: string) => void;
  onSaveTemplate: (name: string, payload: string) => void;
};

// Memoized — only re-renders when isConnected or templates change, never on incoming messages
export const MessageComposer = memo(function MessageComposer({
  isConnected,
  templates,
  onSend,
  onSaveTemplate,
}: MessageComposerProps) {
  const [text, setText] = useState('');
  const [showSave, setShowSave] = useState(false);
  const [templateName, setTemplateName] = useState('');

  const handleSend = useCallback(() => {
    if (!text.trim() || !isConnected) return;
    onSend(text);
  }, [text, isConnected, onSend]);

  const handleSaveTemplate = useCallback(() => {
    if (!templateName.trim() || !text.trim()) return;
    onSaveTemplate(templateName.trim(), text);
    setTemplateName('');
    setShowSave(false);
  }, [templateName, text, onSaveTemplate]);

  return (
    <div className="border-t border-border p-2 shrink-0">
      {showSave && (
        <div className="flex items-center gap-1 mb-1.5">
          <Input
            className="flex-1 h-6 text-xs"
            placeholder="Template name..."
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveTemplate();
              if (e.key === 'Escape') { setShowSave(false); setTemplateName(''); }
            }}
            autoFocus
          />
          <Button size="xs" onClick={handleSaveTemplate} disabled={!templateName.trim()}>
            Save
          </Button>
          <Button variant="ghost" size="xs" onClick={() => { setShowSave(false); setTemplateName(''); }}>
            Cancel
          </Button>
        </div>
      )}
      <Textarea
        className="w-full bg-muted border-0 text-xs font-mono resize-none focus-visible:ring-0 p-2 min-h-[60px] max-h-[120px]"
        placeholder={'{"type": "ping"}'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleSend();
          }
        }}
      />
      <div className="flex items-center gap-1 mt-1.5">
        <Button
          variant="ghost" size="xs"
          onClick={() => setShowSave(s => !s)}
          disabled={!text.trim()}
          title="Save payload as template"
        >
          <BookMarked className="size-3" /> Save as template
        </Button>
        {templates.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="xs" />}>
              Templates <ChevronDown className="size-3 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {templates.map(tpl => (
                <DropdownMenuItem key={tpl.id} onClick={() => setText(tpl.payload)}>
                  {tpl.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="xs" onClick={() => setText('')} disabled={!text}>
            Clear
          </Button>
          <Button
            size="xs"
            onClick={handleSend}
            disabled={!isConnected || !text.trim()}
            title="Send (Ctrl+Enter)"
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
});
