/* Placeholder for routes no feature has claimed yet (see src/pages.tsx). */
import { Hero } from '../characters/Hero';
import type { HeroAgent } from '../characters/hero-svg';
import { Button, SceneHead } from '../ui';
import { formatRoute, type Route } from './router';

const TINKER: HeroAgent = {
  name: 'Tinker',
  look: {
    hat: 'inventor',
    tool: 'blueprint',
    decal: 'Inventor',
    body: 'sprout',
    antenna: 'bob',
    face: 'none',
    hue: 'teal',
  },
};

const TITLE: Record<Route['name'], string> = {
  projects: 'Projects',
  cast: 'Cast',
  'cast.agent': 'Agent',
  'cast.team': 'Team',
  access: 'Access',
  blueprint: 'Blueprint',
  new: 'Project setup',
  office: 'Office',
  reports: 'Reports',
  gallery: 'Gallery',
};

export function Building({ route }: { route: Route }) {
  const inOffice = route.name === 'office';
  return (
    <div style={inOffice ? { padding: 'var(--stage-pad)' } : undefined}>
      <SceneHead
        kicker="Coming soon"
        title={TITLE[route.name]}
        actions={
          inOffice ? (
            <Button onDark small onClick={() => (location.hash = '#projects')}>
              ← Studio
            </Button>
          ) : undefined
        }
      >
        Building… <code style={{ fontFamily: 'var(--mono)', opacity: 0.8 }}>{formatRoute(route)}</code>
      </SceneHead>
      <div className="empty-state">
        <Hero agent={TINKER} size={160} pose="typing" label />
      </div>
    </div>
  );
}
