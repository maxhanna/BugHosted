/**
 * Pure engine for the Marbles game — a "Lose Your Marbles" style marble
 * dropper. Marbles fall one at a time into an 8×12 pegboard; when 3+ marbles
 * of the same color are orthogonally connected they pop, and every popped
 * marble rains down onto the opponent's board. First board to overflow loses.
 *
 * This module is used by the local "vs Computer" mode. The multiplayer server
 * (MarblesHub.cs) implements the same rules in C#.
 */
export const COLS = 8;
export const ROWS = 12;
export const COLOR_COUNT = 6;

export interface BoardState {
  /** [row][col], row 0 = top, 0 = empty, 1..COLOR_COUNT = marble color. */
  grid: number[][];
  /** Stack height per column (marbles always settle to the bottom). */
  heights: number[];
  score: number;
}

export interface PopOutcome {
  /** Colors of the marbles that were cleared (they fly to the opponent). */
  popped: number[];
  /** Grid positions of cleared marbles, for pop animations. */
  poppedCells: { row: number; col: number; color: number }[];
  /** Points gained this resolution (chain-scaled). */
  gained: number;
  /** Number of cascade chains. */
  chain: number;
}

export interface RainEvent {
  col: number;
  /** The row the marble lands on (top of its stack). */
  row: number;
  color: number;
}

export function newBoard(): BoardState {
  const grid: number[][] = [];
  for (let r = 0; r < ROWS; r++) grid.push(new Array<number>(COLS).fill(0));
  return { grid, heights: new Array<number>(COLS).fill(0), score: 0 };
}

export function cloneBoard(b: BoardState): BoardState {
  return {
    grid: b.grid.map(row => row.slice()),
    heights: b.heights.slice(),
    score: b.score,
  };
}

export function boardFromGrid(grid: number[][]): BoardState {
  const b = newBoard();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      b.grid[r][c] = grid[r]?.[c] ?? 0;
    }
  }
  recomputeHeights(b);
  return b;
}

export function recomputeHeights(b: BoardState): void {
  for (let c = 0; c < COLS; c++) {
    let h = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (b.grid[r][c] !== 0) h++;
      else break;
    }
    b.heights[c] = h;
  }
}

/** Drop `color` into `col` at the lowest free hole. Returns false if the column is full. */
export function drop(b: BoardState, col: number, color: number): boolean {
  if (col < 0 || col >= COLS) return false;
  if (b.heights[col] >= ROWS) return false;
  b.grid[ROWS - 1 - b.heights[col]][col] = color;
  b.heights[col]++;
  return true;
}

/**
 * Clear every orthogonally-connected cluster of 3+ same-colored marbles,
 * settle gravity, and repeat until stable (cascades). The cleared marbles are
 * returned so they can rain onto the opponent.
 */
export function resolvePops(b: BoardState): PopOutcome {
  const popped: number[] = [];
  const poppedCells: { row: number; col: number; color: number }[] = [];
  let gained = 0;
  let chain = 0;

  for (;;) {
    const toClear: { row: number; col: number; color: number }[] = [];
    const seen = new Set<number>();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const color = b.grid[r][c];
        if (!color || seen.has(r * COLS + c)) continue;
        const cluster: { row: number; col: number }[] = [];
        const stack: { row: number; col: number }[] = [{ row: r, col: c }];
        seen.add(r * COLS + c);
        while (stack.length) {
          const cur = stack.pop()!;
          cluster.push(cur);
          for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
            const nr = cur.row + dr, nc = cur.col + dc;
            if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
            if (b.grid[nr][nc] !== color || seen.has(nr * COLS + nc)) continue;
            seen.add(nr * COLS + nc);
            stack.push({ row: nr, col: nc });
          }
        }
        if (cluster.length >= 3) {
          for (const cell of cluster) toClear.push({ row: cell.row, col: cell.col, color });
        }
      }
    }
    if (toClear.length === 0) break;

    chain++;
    gained += toClear.length * 10 * chain;
    for (const cell of toClear) {
      popped.push(cell.color);
      poppedCells.push(cell);
      b.grid[cell.row][cell.col] = 0;
    }
    // Gravity: settle every column to the bottom.
    for (let c = 0; c < COLS; c++) {
      let w = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (b.grid[r][c] !== 0) {
          if (w !== r) {
            b.grid[w][c] = b.grid[r][c];
            b.grid[r][c] = 0;
          }
          w--;
        }
      }
    }
    recomputeHeights(b);
  }

  b.score += gained;
  return { popped, poppedCells, gained, chain };
}

/**
 * Rain a list of marbles into `b` at random columns. Returns the landing
 * positions plus `overflow` = true if a column was already full (the board
 * lost). Marbles that can't be placed are skipped (the caller decides who
 * lost based on `overflow`).
 */
export function rainInto(b: BoardState, colors: number[]): { rains: RainEvent[]; overflow: boolean } {
  const rains: RainEvent[] = [];
  let overflow = false;
  for (const color of colors) {
    const open: number[] = [];
    for (let c = 0; c < COLS; c++) if (b.heights[c] < ROWS) open.push(c);
    if (open.length === 0) {
      overflow = true;
      continue;
    }
    const col = open[Math.floor(Math.random() * open.length)];
    drop(b, col, color);
    rains.push({ col, row: ROWS - b.heights[col], color });
  }
  return { rains, overflow };
}

/**
 * Simple heuristic AI: pick the column that (a) makes a match if possible,
 * (b) sits next to same-colored marbles to set up future matches, and
 * (c) keeps its own stacks low. `blunder` (0..1) is the chance of a random
 * pick, for difficulty tuning.
 */
export function aiPickColumn(ai: BoardState, color: number, blunder: number): number {
  if (Math.random() < blunder) {
    const open: number[] = [];
    for (let c = 0; c < COLS; c++) if (ai.heights[c] < ROWS) open.push(c);
    return open.length ? open[Math.floor(Math.random() * open.length)] : 0;
  }

  let best = 0;
  let bestScore = -Infinity;
  for (let c = 0; c < COLS; c++) {
    if (ai.heights[c] >= ROWS) continue;
    const sim = cloneBoard(ai);
    drop(sim, c, color);
    const { gained } = resolvePops(sim);

    let score = gained * 5;
    // Setup bonus: count same-colored neighbors around the landing cell.
    const landingRow = ROWS - 1 - ai.heights[c];
    let neighbors = 0;
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nr = landingRow + dr, nc = c + dc;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && sim.grid[nr][nc] === color) neighbors++;
    }
    score += neighbors * 2.2;
    // Prefer not to stack too high.
    score += (ROWS - ai.heights[c]) * 0.35;
    score += Math.random() * 1.5;

    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

export function randomColor(): number {
  return 1 + Math.floor(Math.random() * COLOR_COUNT);
}
