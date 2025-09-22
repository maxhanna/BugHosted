export async function fetchOrCreateVirus(userId: number): Promise<any> {
  // Try to fetch virus data from backend, create if not found
  const response = await fetch('/viral/getstate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userId)
  });
  let virusData = response.ok ? await response.json() : null;
  if (!virusData) {
    // If not found, create new virus
    virusData = {
      id: userId,
      position: { x: 100, y: 100 },
      size: 20,
      color: '#e91e63',
      map: 'default'
    };
    await fetch('/viral/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(virusData)
    });
  }
  return virusData;
}
export async function fetchMultiplayerState(map: string, userId: number, position: { x: number, y: number }): Promise<{ entities: any[], events: any[] }> {
  // Send current position to backend for update, then fetch multiplayer state
  const payload = {
    map,
    userId,
    position
  };
  const response = await fetch('/viral/syncmultiplayer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error('Failed to fetch multiplayer state');
  return await response.json();
}
