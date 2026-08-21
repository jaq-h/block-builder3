import { useEffect, useState } from "react";
import { recordMount, recordUnmount } from "./mountTracker";

const useMountTally = (name: string): void => {
  useEffect(() => {
    recordMount(name);
    return () => recordUnmount(name);
  }, [name]);
};

/**
 * Stand-in panels that count their own mounts and hold a scrap of state, so a
 * test can put something in one and check it is still there later. Losing that
 * state is the user-facing bug these stubs exist to catch.
 */
export const AssemblyPanelStub = () => {
  const [draft, setDraft] = useState("");
  useMountTally("assembly");

  return (
    <div data-testid="assembly-panel">
      <label htmlFor="assembly-draft">assembly draft</label>
      <input
        id="assembly-draft"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    </div>
  );
};

export const OrdersPanelStub = () => {
  const [draft, setDraft] = useState("");
  useMountTally("orders");

  return (
    <div data-testid="orders-panel">
      <label htmlFor="orders-draft">orders draft</label>
      <input
        id="orders-draft"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
    </div>
  );
};
