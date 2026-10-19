// The app with its board routes as one module graph, which index.tsx imports on the routes that
// index.html preloaded them for. bitsocial-react-hooks starts the peer client, which downloads and
// evaluates several hundred kilobytes, when it is first evaluated. Evaluated in one step, as before
// the board routes were split out, and handed to the app without another import, the first render
// is scheduled before that work instead of after it.
import * as boardRoutes from './board-routes';
import { provideBoardRoutes } from './route-modules';

provideBoardRoutes(boardRoutes);

export * from './app';
export { default } from './app';
