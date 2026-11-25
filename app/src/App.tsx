import { CreditsLine } from './features/credits';
import { Pager, pages } from './pages';
import { BackendGate } from './shell/BackendGate';
import { Quitting } from './shell/Quitting';
import { Shell } from './shell/Shell';

export function App() {
  return (
    <Quitting>
      <BackendGate>
        <Shell pages={pages} Pager={Pager} TopLine={CreditsLine} />
      </BackendGate>
    </Quitting>
  );
}
