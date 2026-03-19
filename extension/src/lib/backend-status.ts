let _backendAvailable: boolean | null = null;
let _checkPromise: Promise<boolean> | null = null;

export async function checkBackendAvailable(backendUrl: string): Promise<boolean> {
  if (_checkPromise) return _checkPromise;

  _checkPromise = (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${backendUrl}/api/health`, { signal: controller.signal });
      clearTimeout(timeout);
      _backendAvailable = res.ok;
    } catch {
      _backendAvailable = false;
    }
    _checkPromise = null;
    return _backendAvailable;
  })();

  return _checkPromise;
}

export function getBackendAvailable(): boolean {
  return _backendAvailable ?? false;
}

export function resetBackendStatus(): void {
  _backendAvailable = null;
  _checkPromise = null;
}
