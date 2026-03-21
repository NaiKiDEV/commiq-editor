import { CommiqProvider } from '@naikidev/commiq-react';
import { workspaceStore, terminalStore, browserStore } from './stores';
import { Shell } from './components/Shell';

export function App() {
  return (
    <CommiqProvider stores={{ workspace: workspaceStore, terminal: terminalStore, browser: browserStore }}>
      <Shell />
    </CommiqProvider>
  );
}
