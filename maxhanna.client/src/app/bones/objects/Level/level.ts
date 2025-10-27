import { Vector2 } from "../../../../services/datacontracts/bones/vector2";
import { GameObject } from "../game-object";
import { gridCells } from "../../helpers/grid-cells";

 
export class Level extends GameObject {
  // Support multiple background layers with per-layer parallax factors.
  // Each layer can be an image or any drawable object the renderer understands.
  backgroundLayers: Array<{ image: any; parallax: number; offset?: Vector2; repeat?: boolean; scale?: number }> = [];
  defaultHeroPosition = new Vector2(gridCells(1), gridCells(1)); 
  itemsFound: string[] = [];
  walls: Set<string> = new Set(); 

  constructor() {
    super({ position: new Vector2(0, 0) });
    this.isOmittable = false;
  }

  /**
   * Add a background layer.
   * @param image any drawable (Image, HTMLCanvasElement, etc.)
   * @param parallax 0..1 (0 = static, 1 = moves with camera). Values >1 produce foreground-like motion.
   * @param offset optional pixel offset for the layer
   * @param repeat whether to tile the image horizontally/vertically
   * @param scale optional scale multiplier when drawing
   */
  addBackgroundLayer(image: any, parallax: number = 0.5, offset: Vector2 = new Vector2(0, 0), repeat: boolean = true, scale: number = 1) {
    this.backgroundLayers.push({ image, parallax, offset, repeat, scale });
  }

  setBackgroundLayers(layers: Array<{ image: any; parallax: number; offset?: Vector2; repeat?: boolean; scale?: number }>) {
    this.backgroundLayers = layers;
  }

  /**
   * Simple renderer helper to draw background layers onto a canvas context.
   * This assumes the renderer will call this with a camera position in pixels and a canvas context.
   * It's intentionally lightweight — you can replace or extend it to match your rendering pipeline.
   */
  renderBackground(ctx: CanvasRenderingContext2D, cameraPos: Vector2, canvasWidth: number, canvasHeight: number) {
    if (!this.backgroundLayers || this.backgroundLayers.length === 0) return;

    for (const layer of this.backgroundLayers) {
      const img = layer.image as any;
      if (!img) continue;

      const par = layer.parallax ?? 0.5;
      const offX = layer.offset?.x ?? 0;
      const offY = layer.offset?.y ?? 0;
      const scale = layer.scale ?? 1;
      const repeat = layer.repeat ?? true;

      // compute base draw position so that camera movement shifts layer by parallax factor
      const drawX = -cameraPos.x * par + offX;
      const drawY = -cameraPos.y * par + offY;

      // If the image has width/height (HTMLImageElement or canvas), handle simple tiling
      const iw = (img.width ?? 0) * scale;
      const ih = (img.height ?? 0) * scale;

      if (repeat && iw > 0 && ih > 0) {
        // Start drawing from a tiled origin that covers the canvas
        const startX = ((drawX % iw) + iw) % iw - iw;
        const startY = ((drawY % ih) + ih) % ih - ih;

        for (let x = startX; x < canvasWidth; x += iw) {
          for (let y = startY; y < canvasHeight; y += ih) {
            try {
              ctx.drawImage(img, x, y, iw, ih);
            } catch (e) {
              // drawImage may fail if img is not a real image yet — ignore
            }
          }
        }
      } else {
        // Single draw centered based on drawX/drawY
        try {
          ctx.drawImage(img, drawX, drawY, iw || canvasWidth, ih || canvasHeight);
        } catch (e) {
          // ignore if not ready
        }
      }
    }
  }

  getDefaultHeroPosition() {
    return this.defaultHeroPosition;
  }
}
