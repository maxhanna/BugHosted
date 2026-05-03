import { buildOpaqueChunkMesh, buildFluidMeshes, NeighborChunkData } from './digcraft-mesh-builder';

// Worker receives: { type: 'build', cx, cz, blocks, biomeColumn, neighbors, lowEndMode }
self.addEventListener('message', (ev: MessageEvent) => {
  const msg = ev.data as any;
  if (!msg || msg.type !== 'build') return;
  try {
    const { cx, cz, blocks, blockHealth, biomeColumn, neighbors, lowEndMode, seq } = msg;
    // Reconstruct neighbor map typed arrays (already cloned by structured clone)
    const neighborMap: Record<string, NeighborChunkData | undefined> = {};
    if (neighbors) {
      for (const k of Object.keys(neighbors)) {
        const nd = neighbors[k];
        // Buffers were transferred — use them directly, no copy needed
        neighborMap[k] = {
          cx: nd.cx,
          cz: nd.cz,
          blocks: nd.blocks instanceof Uint8Array ? nd.blocks : new Uint8Array(nd.blocks),
          biomeColumn: nd.biomeColumn ? (nd.biomeColumn instanceof Uint8Array ? nd.biomeColumn : new Uint8Array(nd.biomeColumn)) : undefined,
          waterLevel: nd.waterLevel ? (nd.waterLevel instanceof Uint8Array ? nd.waterLevel : new Uint8Array(nd.waterLevel)) : undefined,
          fluidIsSource: nd.fluidIsSource ? (nd.fluidIsSource instanceof Uint8Array ? nd.fluidIsSource : new Uint8Array(nd.fluidIsSource)) : undefined,
        };
      }
    }

    const ch = (typeof blockHealth !== 'undefined' && blockHealth) ? (blockHealth instanceof Uint8Array ? blockHealth : new Uint8Array(blockHealth)) : undefined;
    const blocksArr = blocks instanceof Uint8Array ? blocks : new Uint8Array(blocks);
    const biomeArr = biomeColumn ? (biomeColumn instanceof Uint8Array ? biomeColumn : new Uint8Array(biomeColumn)) : undefined;
    const res = buildOpaqueChunkMesh(cx, cz, blocksArr, ch, biomeArr, neighborMap, !!lowEndMode);
    // Build fluid meshes using provided waterLevel/fluidIsSource (may be undefined)
    const wLevel = (typeof (msg.waterLevel) !== 'undefined' && msg.waterLevel) ? (msg.waterLevel instanceof Uint8Array ? msg.waterLevel : new Uint8Array(msg.waterLevel)) : undefined;
    const fSource = (typeof (msg.fluidIsSource) !== 'undefined' && msg.fluidIsSource) ? (msg.fluidIsSource instanceof Uint8Array ? msg.fluidIsSource : new Uint8Array(msg.fluidIsSource)) : undefined;
    let fluidRes: any = {};
    if (!lowEndMode) {
      fluidRes = buildFluidMeshes(cx, cz, new Uint8Array(blocks), wLevel, fSource, neighborMap, !!lowEndMode);
    }

    // Prepare transfer list and payload
    const transfer: ArrayBufferLike[] = [res.vData.buffer, res.iData.buffer];
    const payload: any = { type: 'result', key: res.key, vData: res.vData, iData: res.iData, seq };
    if (fluidRes.wVData && fluidRes.wIData) {
      payload.wVData = fluidRes.wVData; payload.wIData = fluidRes.wIData;
      transfer.push(fluidRes.wVData.buffer, fluidRes.wIData.buffer);
    }
    if (fluidRes.lVData && fluidRes.lIData) {
      payload.lVData = fluidRes.lVData; payload.lIData = fluidRes.lIData;
      transfer.push(fluidRes.lVData.buffer, fluidRes.lIData.buffer);
    }
    (self as any).postMessage(payload, transfer);
  } catch (e) {
    (self as any).postMessage({ type: 'error', message: String(e) });
  }
});

function ndOrUndefined(v: any) { return v ? new Uint8Array(v) : undefined; }
