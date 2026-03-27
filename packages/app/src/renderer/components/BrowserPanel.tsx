import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, X as XIcon } from 'lucide-react';
import { useBrowserSession, useBrowserActions } from '../hooks/use-browser';
import { useWorkspaceActions } from '../hooks/use-workspace';
import { persistenceReady } from '../stores';
import { useSettings } from '../contexts/settings';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';

type BrowserPanelProps = {
  sessionId: string;
  panelId: string;
  isActive: boolean;
};

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/.test(trimmed)) return `https://${trimmed}`;
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

export function BrowserPanel({ sessionId, panelId, isActive }: BrowserPanelProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const createdRef = useRef(false);
  const session = useBrowserSession(sessionId);
  const { open, navigate, back, forward, reload, updateNavigation, updateTitle, updateLoading } =
    useBrowserActions();
  const { updatePanelTitle } = useWorkspaceActions();
  const { settings } = useSettings();
  const [urlInput, setUrlInput] = useState('');

  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;

    persistenceReady.then((browserUrls) => {
      const restoredUrl = browserUrls?.[sessionId];
      const initialUrl = restoredUrl ?? settings.browser.defaultUrl;
      open(sessionId, panelId, initialUrl);
      if (initialUrl !== 'about:blank') setUrlInput(initialUrl);
    });

    const removeNav = window.electronAPI.browser.onNavigated(sessionId, (info) => {
      updateNavigation(sessionId, info.url, info.canGoBack, info.canGoForward);
      setUrlInput(info.url);
    });

    const removeTitle = window.electronAPI.browser.onTitleChanged(sessionId, (title) => {
      updateTitle(sessionId, title);
      updatePanelTitle(panelId, title);
    });

    const removeLoading = window.electronAPI.browser.onLoading(sessionId, (loading) => {
      updateLoading(sessionId, loading);
    });

    return () => {
      removeNav();
      removeTitle();
      removeLoading();
    };
  }, [sessionId, panelId]);

  useEffect(() => {
    if (!viewportRef.current) return;

    const updateBounds = () => {
      if (!viewportRef.current) return;
      const rect = viewportRef.current.getBoundingClientRect();
      window.electronAPI.browser.setBounds(sessionId, {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };

    const resizeObserver = new ResizeObserver(updateBounds);
    resizeObserver.observe(viewportRef.current);
    updateBounds();

    return () => resizeObserver.disconnect();
  }, [sessionId]);

  useEffect(() => {
    if (isActive) {
      window.electronAPI.browser.show(sessionId);
      if (viewportRef.current) {
        const rect = viewportRef.current.getBoundingClientRect();
        window.electronAPI.browser.setBounds(sessionId, {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    } else {
      window.electronAPI.browser.hide(sessionId);
    }
  }, [isActive, sessionId]);

  const handleNavigate = () => {
    const url = normalizeUrl(urlInput);
    navigate(sessionId, url);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleNavigate();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Navigation bar */}
      <div className="flex items-center gap-1 px-1.5 py-1 bg-card border-b border-border shrink-0">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={!session?.canGoBack}
                onClick={() => back(sessionId)}
              />
            }
          >
            <ArrowLeft className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>Back</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={!session?.canGoForward}
                onClick={() => forward(sessionId)}
              />
            }
          >
            <ArrowRight className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>Forward</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => reload(sessionId)}
              />
            }
          >
            {session?.loading ? (
              <XIcon className="size-3.5" />
            ) : (
              <RotateCw className="size-3.5" />
            )}
          </TooltipTrigger>
          <TooltipContent>{session?.loading ? 'Stop' : 'Reload'}</TooltipContent>
        </Tooltip>
        <Input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter URL or search..."
          className="flex-1 h-6 text-xs"
        />
      </div>

      <div ref={viewportRef} className="flex-1" />
    </div>
  );
}
