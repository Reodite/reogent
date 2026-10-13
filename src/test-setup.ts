// Happy DOM eagerly creates finished promises; normal animation cancellation rejects them.
if (typeof window !== "undefined" && "happyDOM" in window && window.Animation) {
  const cancel = window.Animation.prototype.cancel;
  window.Animation.prototype.cancel = function () {
    void this.finished.catch((error: unknown) => {
      if ((error as { name?: string } | null)?.name !== "AbortError") throw error;
    });
    cancel.call(this);
  };
}
