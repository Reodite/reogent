const owners = new WeakMap<HTMLElement, { count: number; value: string; priority: string }>();

/** Locks body scrolling until the final owner releases it; each release is idempotent. */
export function lockBodyScroll(): () => void {
  const body = document.body;
  let state = owners.get(body);
  if (!state) {
    state = {
      count: 0,
      value: body.style.getPropertyValue("overflow"),
      priority: body.style.getPropertyPriority("overflow"),
    };
    owners.set(body, state);
  }
  state.count += 1;
  body.style.setProperty("overflow", "hidden", state.priority);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.count -= 1;
    if (state.count > 0) return;
    if (state.value) body.style.setProperty("overflow", state.value, state.priority);
    else body.style.removeProperty("overflow");
    owners.delete(body);
  };
}
