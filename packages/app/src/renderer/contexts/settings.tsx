import { createContext, useContext, useEffect, useRef, useState } from 'react';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export type AppSettings = {
  terminal: {
    fontFamily: string;
    fontSize: number;
    cursorStyle: 'block' | 'underline' | 'bar';
    scrollback: number;
    shell: string;
  };
  browser: {
    defaultUrl: string;
  };
  whiteboard: {
    mcpPort: number;
  };
};

export const DEFAULT_SETTINGS: AppSettings = {
  terminal: {
    fontFamily: "'CommitMono NF', 'CommitMono NF Mono', Menlo, Monaco, monospace",
    fontSize: 13,
    cursorStyle: 'bar',
    scrollback: 1000,
    shell: '',
  },
  browser: {
    defaultUrl: 'https://www.google.com',
  },
  whiteboard: {
    mcpPort: 3100,
  },
};

function deepMerge<T extends object>(base: T, patch: DeepPartial<T>): T {
  const result = { ...base };
  for (const key in patch) {
    const patchVal = patch[key];
    const baseVal = base[key];
    if (
      patchVal !== undefined &&
      typeof patchVal === 'object' &&
      !Array.isArray(patchVal) &&
      typeof baseVal === 'object' &&
      baseVal !== null
    ) {
      result[key] = deepMerge(baseVal as object, patchVal as object) as T[typeof key];
    } else if (patchVal !== undefined) {
      result[key] = patchVal as T[typeof key];
    }
  }
  return result;
}

const SettingsContext = createContext<{
  settings: AppSettings;
  updateSettings: (patch: DeepPartial<AppSettings>) => void;
}>({ settings: DEFAULT_SETTINGS, updateSettings: () => {} });

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    window.electronAPI.settings.load()
      .then((loaded) => setSettings(deepMerge(DEFAULT_SETTINGS, loaded as DeepPartial<AppSettings>)))
      .catch(() => {/* keep defaults */});
  }, []);

  const updateSettings = (patch: DeepPartial<AppSettings>) => {
    setSettings((prev) => {
      const next = deepMerge(prev, patch);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        window.electronAPI.settings.save(next);
      }, 300);
      return next;
    });
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
