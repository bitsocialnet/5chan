// The routes' code-split modules, kept out of app.tsx so that file only exports its component.
//
// The board, catalog, thread, and pending-post routes and the post components only they render, a
// large part of the app, load on demand so the home page does not wait for them. On those routes
// index.html preloads them with the startup files (scripts/vite-app-preload.mjs) and the first render
// waits for loadRouteModules, so it never suspends. A tracked import, unlike lazy(), renders in the
// same commit once loaded: the pending-post view must replace the post form right after publishing.
import type { ReactNode } from 'react';
import { createRoutesFromChildren, matchRoutes, type RouteObject } from 'react-router-dom';
import { createTrackedImport } from './lib/tracked-import';

export const BOARD_ROUTES_ID = 'board-routes';

let providedBoardRoutes: typeof import('./board-routes') | undefined;

/** Hands loadBoardRoutes the module app-with-board-routes.ts evaluated with the app, so it needs no import. */
export const provideBoardRoutes = (module: typeof import('./board-routes')) => {
  providedBoardRoutes = module;
};

export const loadBoardRoutes = createTrackedImport(() => (providedBoardRoutes ? Promise.resolve(providedBoardRoutes) : import('./board-routes')));

let routeTree: ReactNode;
let routeObjects: RouteObject[] | undefined;

/** app.tsx registers the route tree App renders, which loadRouteModules matches against. */
export const registerRouteTree = (tree: ReactNode) => {
  routeTree = tree;
  routeObjects = undefined;
};

/**
 * Loads the code-split modules the route at `pathname` renders, so the first render does not suspend
 * (index.tsx and the static shell's build render wait for it). Call it after importing app.tsx.
 */
export const loadRouteModules = async (pathname: string): Promise<void> => {
  if (rendersBoardRoutes(pathname)) await loadBoardRoutes();
};

/** Whether the route at `pathname` renders the board routes, by the route tree app.tsx registered. */
export const rendersBoardRoutes = (pathname: string): boolean => {
  if (!routeTree) throw new Error('route-modules: app.tsx has not registered its routes');
  routeObjects ??= createRoutesFromChildren(routeTree);
  // HashRouter reads `#biz` as /biz.
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return matchRoutes(routeObjects, path)?.some((match) => match.route.id === BOARD_ROUTES_ID) ?? false;
};
