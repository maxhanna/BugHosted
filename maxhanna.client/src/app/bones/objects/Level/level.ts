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
      const raw = layer.image as any;
      if (!raw) continue;

      const par = layer.parallax ?? 0.5;
      const offX = layer.offset?.x ?? 0;
      const offY = layer.offset?.y ?? 0;
      const scale = layer.scale ?? 1;
      const repeat = layer.repeat ?? true;

      // compute base draw position so that camera movement shifts layer by parallax factor
      const drawX = -cameraPos.x * par + offX;
      const drawY = -cameraPos.y * par + offY;

      // Determine drawable type:
      // - resources.Resource-like: { image: HTMLImageElement, isLoaded }
      // - HTMLImageElement
      // - Sprite-like: object with drawImage(ctx,x,y)
      let drawableImage: HTMLImageElement | null = null;
      let drawableSprite: any = null;
      let isLoaded = true;

      if (raw && raw.image instanceof HTMLImageElement) {
        drawableImage = raw.image as HTMLImageElement;
        isLoaded = !!raw.isLoaded;
      } else if (raw instanceof HTMLImageElement) {
        drawableImage = raw as HTMLImageElement;
        isLoaded = !!drawableImage.complete;
      } else if (typeof raw.drawImage === 'function') {
        // Sprite-like
        drawableSprite = raw;
        // Sprite.drawImage checks resource.isLoaded internally
      }

      if (!drawableImage && !drawableSprite) continue;

      if (drawableImage && !isLoaded) {
        // not ready yet — skip drawing this layer for now
        continue;
      }

      // If we have a Sprite-like object, use its drawImage method. For repeating, we call drawImage in tiles.
      if (drawableSprite) {
        // Try tiling by calling drawImage at tile positions. If the sprite expects frame drawing, it will handle resource check.
        const iw = (drawableSprite.frameSize?.x ?? drawableSprite.resource?.image?.width ?? 0) * (drawableSprite.scale?.x ?? 1) * scale;
        const ih = (drawableSprite.frameSize?.y ?? drawableSprite.resource?.image?.height ?? 0) * (drawableSprite.scale?.y ?? 1) * scale;
        if (repeat && iw > 0 && ih > 0) {
          const startX = ((drawX % iw) + iw) % iw - iw;
          const startY = ((drawY % ih) + ih) % ih - ih;
          for (let x = startX; x < canvasWidth; x += iw) {
            for (let y = startY; y < canvasHeight; y += ih) {
              try { drawableSprite.drawImage(ctx, x, y); } catch { }
            }
          }
        } else {
          try { drawableSprite.drawImage(ctx, drawX, drawY); } catch { }
        }
        continue;
      }

      // Otherwise use raw HTMLImageElement drawing
      const iw = (drawableImage?.width ?? 0) * scale;
      const ih = (drawableImage?.height ?? 0) * scale;

      if (repeat && iw > 0 && ih > 0) {
        const startX = ((drawX % iw) + iw) % iw - iw;
        const startY = ((drawY % ih) + ih) % ih - ih;
        for (let x = startX; x < canvasWidth; x += iw) {
          for (let y = startY; y < canvasHeight; y += ih) {
            try { ctx.drawImage(drawableImage as HTMLImageElement, x, y, iw, ih); } catch { }
          }
        }
      } else {
        try { ctx.drawImage(drawableImage as HTMLImageElement, drawX, drawY, iw || canvasWidth, ih || canvasHeight); } catch { }
      }
    }
  }

  getDefaultHeroPosition() {
    return this.defaultHeroPosition;
  }
}
