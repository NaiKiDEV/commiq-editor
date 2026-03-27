import { createContext, useContext, useRef, useCallback, type ReactNode } from 'react';
import { usePanels, useLayout } from '../hooks/use-workspace';
import { getVisiblePanelIds } from '../lib/layout';

type BrowserVisibilityContextType = {
  pushOverlay: () => void;
  popOverlay: () => void;
};

const BrowserVisibilityContext = createContext<BrowserVisibilityContextType>({
  pushOverlay: () => {},
  popOverlay: () => {},
});

export function BrowserVisibilityProvider({ children }: { children: ReactNode }) {
  const panels = usePanels();
  const layout = useLayout();
  const countRef = useRef(0);
  // Keep refs so push/pop callbacks never go stale
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const pushOverlay = useCallback(() => {
    countRef.current++;
    if (countRef.current === 1) {
      window.electronAPI.browser.hideAll();
    }
  }, []);

  const popOverlay = useCallback(() => {
    countRef.current = Math.max(0, countRef.current - 1);
    if (countRef.current === 0) {
      const currentLayout = layoutRef.current;
      if (!currentLayout) return;
      const visibleIds = getVisiblePanelIds(currentLayout);
      for (const panel of panelsRef.current) {
        if (panel.type === 'browser' && visibleIds.has(panel.id)) {
          window.electronAPI.browser.showSession(panel.id);
        }
      }
    }
  }, []);

  return (
    <BrowserVisibilityContext.Provider value={{ pushOverlay, popOverlay }}>
      {children}
    </BrowserVisibilityContext.Provider>
  );
}

export function useBrowserVisibility() {
  return useContext(BrowserVisibilityContext);
}
