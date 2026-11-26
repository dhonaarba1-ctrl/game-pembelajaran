// Inlined in both standalone HTML exports. See embed-sync.cjs after edits.
function createClassroomSync({ read, write, endpoint, status, valid }) {
  let inFlight;
  let timer;
  let blockedUntil = 0;
  let failures = 0;

  function schedule(delay = 500) {
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), delay);
  }

  function flush(manual = false) {
    if (inFlight) return manual ? inFlight.then(() => flush(true)) : inFlight;
    if (manual) blockedUntil = 0;
    if (!navigator.onLine || !valid(endpoint()) || !read().length) return;

    if (blockedUntil > Date.now()) {
      schedule(blockedUntil - Date.now());
      return;
    }
    inFlight = send().finally(() => {
      inFlight = undefined;
      status();
    });
    return inFlight;
  }

  async function send() {
    try {
      while (navigator.onLine && read().length && valid(endpoint())) {
        const url = endpoint();
        const events = read().slice(0, 35);
        const controller = new AbortController();
        const deadline = setTimeout(() => controller.abort(), 12000);
        let body;
        try {
          const response = await fetch(url, {
            method: 'POST',
            credentials: 'omit',
            cache: 'no-store',
            redirect: 'follow',
            body: new URLSearchParams({ payload: JSON.stringify({ events }) }),
            signal: controller.signal,
          });
          if (!response.ok) throw new Error('HTTP ' + response.status);
          body = await response.json();
        } finally {
          clearTimeout(deadline);
        }
        if (!body?.ok || !Array.isArray(body.acceptedIds)) throw new Error('Missing receipt');
        if (endpoint() !== url) break;
        const batchIds = new Set(events.map(event => event.id));
        const accepted = new Set(body.acceptedIds.filter(id => batchIds.has(id)));
        if (!accepted.size) throw new Error('Empty receipt');
        write(read().filter(event => !accepted.has(event.id)));
        status();
      }
      failures = 0;
    } catch {
      failures += 1;
      const delay = Math.min(120000, 5000 * 2 ** (failures - 1));
      blockedUntil = Date.now() + delay;
      schedule(delay);
    }
  }

  window.addEventListener('online', () => schedule());
  return { schedule, flush };
}
