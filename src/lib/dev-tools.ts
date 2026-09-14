// Loaded only through the import.meta.env.DEV guard in index.html. Production builds omit this
// module and its inspector packages. Keep this entry point out of application imports.
type ElementSourceApi = NonNullable<Window['__ELEMENT_SOURCE__']>;
type ElementSourceResult = Awaited<ReturnType<ElementSourceApi['resolve']>>;

// element-source loads asynchronously, so publish a stub synchronously. An agent that
// evaluates `window.__ELEMENT_SOURCE__.resolve(...)` too early then gets a structured "not ready"
// answer instead of a TypeError on undefined.
const notReady = async (): Promise<ElementSourceResult> => ({ error: 'element-source is not ready yet.' });

const elementSourceApi: ElementSourceApi = {
  ready: false,
  error: null,
  resolve: notReady,
  resolveBySelector: notReady,
  resolveAtPoint: notReady,
  formatStack: () => '',
};

window.__ELEMENT_SOURCE__ = elementSourceApi;

import('element-source')
  .then(({ formatStack, resolveElementInfo }) => {
    const resolve = async (node: unknown): Promise<ElementSourceResult> => {
      if (!(node instanceof Element)) {
        return { error: 'Expected a DOM Element.' };
      }

      try {
        const info = await resolveElementInfo(node);
        return {
          ...info,
          available: Boolean(info.source || info.stack.length || info.componentName),
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    };

    Object.assign(elementSourceApi, {
      ready: true,
      resolve,
      resolveBySelector: async (selector: string): Promise<ElementSourceResult> => {
        const element = document.querySelector(selector);
        if (!(element instanceof Element)) {
          return { error: `No element matched selector: ${selector}` };
        }
        return resolve(element);
      },
      resolveAtPoint: async (x: number, y: number): Promise<ElementSourceResult> => {
        const element = document.elementFromPoint(x, y);
        if (!(element instanceof Element)) {
          return { error: `No element found at point (${x}, ${y})` };
        }
        return resolve(element);
      },
      formatStack: (stack: unknown, maxLines = 3) => (Array.isArray(stack) ? formatStack(stack, maxLines) : ''),
    } satisfies Partial<ElementSourceApi>);
  })
  .catch((error: unknown) => {
    elementSourceApi.error = error instanceof Error ? error.message : String(error);
  });

// Automated measurements suppress the toolbar before navigation to avoid capture overhead.
if (!window.__PROFILING__) {
  let disposed = false;
  let cleanup: (() => void) | undefined;
  import.meta.hot?.dispose(() => {
    disposed = true;
    cleanup?.();
  });

  Promise.all([import('react'), import('react-dom/client'), import('agentation')])
    .then(([{ createElement }, { createRoot }, { Agentation }]) => {
      if (disposed) return;
      const container = document.createElement('div');
      container.id = 'agentation-dev-tools';
      document.body.appendChild(container);
      const root = createRoot(container);
      cleanup = () => {
        root.unmount();
        container.remove();
      };
      root.render(createElement(Agentation));
    })
    .catch((error: unknown) => {
      console.warn('Agentation could not load:', error);
    });
}
