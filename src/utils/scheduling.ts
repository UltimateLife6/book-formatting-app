/**
 * Yield to the browser so long pagination / parsing work does not freeze the UI.
 * Prefer requestIdleCallback with a timeout so work still progresses when the tab is idle-starved.
 */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => resolve(), { timeout: 48 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}
