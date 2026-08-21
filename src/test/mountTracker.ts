/**
 * Mount/unmount tallies for the stubbed panels in `panelStubs`.
 *
 * A JSX element that appears in two branches of the tree mounts two independent
 * components, each holding its own state. Counting mounts is the most direct
 * way to assert that has not come back.
 */
export const mounts: Record<string, number> = {};
export const unmounts: Record<string, number> = {};

export const recordMount = (name: string): void => {
  mounts[name] = (mounts[name] ?? 0) + 1;
};

export const recordUnmount = (name: string): void => {
  unmounts[name] = (unmounts[name] ?? 0) + 1;
};

export const resetMountTracker = (): void => {
  for (const key of Object.keys(mounts)) delete mounts[key];
  for (const key of Object.keys(unmounts)) delete unmounts[key];
};
