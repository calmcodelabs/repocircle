import type { ComponentType, JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

/**
 * Route-level code splitting without preact/compat: load the module on first
 * render, show a skeleton meanwhile. Chunks are cached after the first visit.
 */
export function lazyView<P extends object>(
  loader: () => Promise<Record<string, unknown>>,
  exportName: string,
): (props: P) => JSX.Element {
  return function Lazy(props: P) {
    const [Comp, setComp] = useState<ComponentType<P> | null>(null);
    useEffect(() => {
      let alive = true;
      void loader().then((m) => {
        if (alive) setComp(() => m[exportName] as ComponentType<P>);
      });
      return () => {
        alive = false;
      };
    }, []);
    return Comp ? <Comp {...props} /> : <span class="skeleton" />;
  };
}
