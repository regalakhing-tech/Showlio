const status = document.querySelector('#app-status');

if (status) {
  fetch('/api/health', { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
    .then(async (response) => {
      if (!response.ok) throw new Error('Health check failed');
      const payload = await response.json();
      status.textContent = payload.status === 'ok' ? 'Showlio starter · Online' : 'Showlio starter';
    })
    .catch(() => { status.textContent = 'Showlio starter · Temporarily offline'; });
}
