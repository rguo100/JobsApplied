export interface AnimationFrameCoalescer {
  schedule: () => void;
  cancel: () => void;
}

export function createAnimationFrameCoalescer(
  callback: () => void,
  requestFrame: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancelFrame: (id: number) => void = cancelAnimationFrame
): AnimationFrameCoalescer {
  let pendingFrameId: number | null = null;

  return {
    schedule() {
      if (pendingFrameId !== null) return;
      pendingFrameId = requestFrame(() => {
        pendingFrameId = null;
        callback();
      });
    },
    cancel() {
      if (pendingFrameId === null) return;
      cancelFrame(pendingFrameId);
      pendingFrameId = null;
    },
  };
}
