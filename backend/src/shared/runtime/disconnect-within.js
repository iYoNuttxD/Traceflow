export const DISCONNECT_WAIT_MS = 5000;

export async function disconnectWithin(disconnect, waitMs = DISCONNECT_WAIT_MS) {
  let timer;
  const expired = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), waitMs);
  });
  try {
    return await Promise.race([
      Promise.resolve()
        .then(() => disconnect())
        .then(
          () => ({ ok: true }),
          (error) => ({ error })
        ),
      expired
    ]);
  } finally {
    clearTimeout(timer);
  }
}
