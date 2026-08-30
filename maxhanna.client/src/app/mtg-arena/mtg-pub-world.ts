import { BlockId, CHUNK_SIZE, WORLD_HEIGHT } from '../digcraft/digcraft-types';
import { Chunk } from '../digcraft/digcraft-world';

/** Small static pub level: one bounded chunk, no biome or procedural generation. */
export function createMtgPubChunk(cx = 0, cz = 0): Chunk {
  const chunk = new Chunk(cx, cz, false);
  for (let y = 0; y < WORLD_HEIGHT; y++) for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) {
    const edge = x === 0 || z === 0 || x === CHUNK_SIZE - 1 || z === CHUNK_SIZE - 1;
    if (y === 0) chunk.setBlock(x, y, z, BlockId.STONE_BRICK);
    else if (edge && y <= 4) chunk.setBlock(x, y, z, BlockId.PLANK);
    else if (edge) chunk.setBlock(x, y, z, BlockId.BRICK);
  }
  for (let x = 2; x < 8; x++) for (let z = 2; z < 5; z++) chunk.setBlock(x, 1, z, BlockId.PLANK);
  for (let x = 8; x < 14; x++) for (let z = 7; z < 10; z++) chunk.setBlock(x, 1, z, BlockId.PLANK);
  return chunk;
}
