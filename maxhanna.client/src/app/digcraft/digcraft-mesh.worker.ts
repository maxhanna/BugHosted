import { buildOpaqueChunkMesh, NeighborChunkData } from './digcraft-mesh-builder';

// Worker receives: { type: 'build', cx, cz, blocks, biomeColumn, neighbors, lowEndMode }
self.addEventListener('message', (ev: MessageEvent) => {
  const msg = ev.data as any;
  if (!msg || msg.type !== 'build') return;
  try {
    const { cx, cz, blocks, biomeColumn, neighbors, lowEndMode } = msg;
    // Reconstruct neighbor map typed arrays (already cloned by structured clone)
    const neighborMap: Record<string, NeighborChunkData | undefined> = {};
    if (neighbors) {
      for (const k of Object.keys(neighbors)) {
        const nd = neighbors[k];
        neighborMap[k] = {
          cx: nd.cx,
          cz: nd.cz,
          blocks: new Uint8Array(nd.blocks),
          biomeColumn: nd.biomeColumn ? new Uint8Array(nd.biomeColumn) : undefined,
          waterLevel: nd.waterLevel ? new Uint8Array(nd.waterLevel) : undefined,
          fluidIsSource: nd.fluidIsSource ? new Uint8Array(nd.fluidIsSource) : undefined,
        };
      }
    }

    const res = buildOpaqueChunkMesh(cx, cz, new Uint8Array(blocks), biomeColumn ? new Uint8Array(biomeColumn) : undefined, neighborMap, !!lowEndMode);

    // Post result and transfer buffers for efficiency
    (self as any).postMessage({ type: 'result', key: res.key, vData: res.vData, iData: res.iData }, [res.vData.buffer, res.iData.buffer]);
  } catch (e) {
    (self as any).postMessage({ type: 'error', message: String(e) });
  }
});
