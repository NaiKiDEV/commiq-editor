import { CommiqProvider } from '@naikidev/commiq-react';
import { workspaceStore, terminalStore } from './stores';
import { Shell } from './components/Shell';

export function App() {
  return (
    <CommiqProvider stores={{ workspace: workspaceStore, terminal: terminalStore }}>
      <Shell />
    </CommiqProvider>
  );
}
