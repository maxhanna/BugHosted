import { gridCells } from "../helpers/grid-cells";

export const walls = new Set();
//walls
walls.add(`297,188`);
walls.add(`297,172`);

for (let x = 0; x < 31; x++) {
  const pixelSize = gridCells(1);
  walls.add(`${-11 + (x * pixelSize)},-5`);
  walls.add(`${-11 + (x * pixelSize)},219`);
}
for (let y = 0; y < 21; y++) {
  const pixelSize = gridCells(1);
  walls.add(`-11,${-5 + (y * pixelSize)}`);
  walls.add(`309,${-5 + (y * pixelSize)}`);
}

//staircase
//for (let x = 0; x < 4; x++) {
//  //left guardrail
//  const pixelSize = gridCells(1);
//  walls.add(`200,${45 + (x * pixelSize)}`);
//  walls.add(`205,${45 + (x * pixelSize)}`);
//  //right guardrail
//  walls.add(`225,${45 + (x * pixelSize)}`);
//}
