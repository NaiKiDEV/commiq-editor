import { useSelector, useQueue } from '@naikidev/commiq-react';
import { browserStore } from '../stores';
import {
  openBrowser,
  navigateBrowser,
  browserBack,
  browserForward,
  browserReload,
  closeBrowser,
  updateBrowserNavigation,
  updateBrowserTitle,
  updateBrowserLoading,
} from '../stores/browser';

export function useBrowserSession(sessionId: string) {
  return useSelector(browserStore, (s) => s.sessions[sessionId] ?? null);
}

export function useBrowserActions() {
  const queue = useQueue(browserStore);

  return {
    open: (sessionId: string, panelId: string, url: string) =>
      queue(openBrowser(sessionId, panelId, url)),
    navigate: (id: string, url: string) => queue(navigateBrowser(id, url)),
    back: (id: string) => queue(browserBack(id)),
    forward: (id: string) => queue(browserForward(id)),
    reload: (id: string) => queue(browserReload(id)),
    close: (id: string) => queue(closeBrowser(id)),
    updateNavigation: (id: string, url: string, canGoBack: boolean, canGoForward: boolean) =>
      queue(updateBrowserNavigation(id, url, canGoBack, canGoForward)),
    updateTitle: (id: string, title: string) => queue(updateBrowserTitle(id, title)),
    updateLoading: (id: string, loading: boolean) => queue(updateBrowserLoading(id, loading)),
  };
}
