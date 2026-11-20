/* The director's office-icon tool: a thin adapter from MCP arguments to the portraits service (portrait.ts), so
   "use the app's icon" from chat behaves exactly like the route (same checks, same `project.changed`). */
import type { Store } from '../db/store.ts';
import type { CapableTool } from '../room/bridge.ts';
import type { Portraits } from './portrait.ts';

type Args = Record<string, unknown>;

export function iconTool(portraits: Portraits, store: Store, projectId: string): CapableTool {
  const now = () => {
    const src = store.projects.require(projectId).imageSource;
    if (!src) return 'No office icon: the office shows the colour tile.';
    return src === 'upload' ? 'The office icon is an uploaded picture.' : `The office icon is ${src}.`;
  };
  return {
    name: 'office_icon',
    can: '"use the app’s icon for the office": set the office icon to an image file inside the project folder (its AppIcon, favicon, logo; PNG, JPEG, WebP, GIF, SVG or ICNS), see what it is, or clear it back to the tile',
    description:
      'The office icon. With `path`: use that image file inside the project folder (relative to it; PNG, JPEG, WebP, GIF, SVG or .icns). A copy is kept, and refreshed when the file changes. With `clear: true`: back to the colour tile. With neither: say what the icon is now.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'An image file inside the project folder, e.g. "public/favicon.svg".',
        },
        clear: { type: 'boolean', description: 'true = remove the icon (back to the tile).' },
      },
    },
    run: async (a: Args) => {
      if (a.clear === true) {
        portraits.remove(projectId);
        return 'Office icon cleared: the office shows the colour tile.';
      }
      if (typeof a.path === 'string' && a.path.trim()) {
        portraits.link(projectId, a.path);
        return `Office icon set. ${now()}`;
      }
      return now();
    },
  };
}
