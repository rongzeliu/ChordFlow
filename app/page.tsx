import { AuthGate } from '@/components/AuthGate';
import { ChordFlowWorkspace } from '@/components/ChordFlowWorkspace';

export default function HomePage() {
  return (
    <AuthGate>
      <ChordFlowWorkspace />
    </AuthGate>
  );
}
