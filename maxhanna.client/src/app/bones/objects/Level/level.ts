import { Vector2 } from "../../../../services/datacontracts/bones/vector2";
import { BASE, GameObject } from "../game-object";
import { gridCells } from "../../helpers/grid-cells";
import { Sprite } from "../sprite";
import { Resource } from "../../helpers/resources";

 
export class Level extends GameObject {
  // Support multiple background layers with per-layer parallax factors.
  // Each layer can be an image or any drawable object the renderer understands.
  // direction: 'LEFT' means the layer moves opposite the camera (default behavior).
  // direction: 'RIGHT' reverses the horizontal movement direction for the layer.
  backgroundLayers: Array<{ image: any; parallax: number; offset?: Vector2; repeat?: boolean; scale?: number; direction?: 'LEFT' | 'RIGHT' }> = [];
  defaultHeroPosition = new Vector2(gridCells(1), gridCells(1)); 
  itemsFound: string[] = [];
  walls: Set<string> = new Set(); 

  constructor() {
    super({ position: new Vector2(0, 0) });
    this.isOmittable = false;
  }

  /**
   * Tile a rectangular floor area centered at `center`.
   * Adds Sprite tiles as children and marks perimeter walls in `this.walls`.
   *
   * @param center pixel position (Vector2) used as the center of the tiled area
   * @param tilesX number of tiles horizontally
   * @param tilesY number of tiles vertically
   * @param tileWidth tile pixel width
   * @param tileHeight tile pixel height
   * @param resource Resource used for each tile (must match Sprite constructor expectations)
   * @param opts optional settings: drawLayer (defaults to BASE) and startObjectId (optional starting id for tiles)
   * @returns array of created Sprite tiles
   */
  tileFloor(center: Vector2, tilesX: number, tilesY: number, tileWidth: number, tileHeight: number, resource: Resource, opts?: { drawLayer?: typeof BASE | string, startObjectId?: number }) : Sprite[] {
    const drawLayer = opts?.drawLayer ?? BASE;
    let nextId = opts?.startObjectId ?? Math.floor(Math.random() * 10000) * -1;

    // central tile indices on the hero grid (gridCells(1) == 20px)
    const centerTileX = Math.round(center.x / gridCells(1));
    const centerTileY = Math.round(center.y / gridCells(1));
    const startTileX = centerTileX - Math.floor(tilesX / 2);
    const startTileY = centerTileY - Math.floor(tilesY / 2);

    const tileStart = new Vector2(gridCells(startTileX), gridCells(startTileY));

    const created: Sprite[] = [];
    for (let rx = 0; rx < tilesX; rx++) {
      for (let ry = 0; ry < tilesY; ry++) {
        const tile = new Sprite({
          objectId: nextId--,
          resource: resource,
          discoverable: false,
          position: new Vector2(tileStart.x + tileWidth * rx, tileStart.y + tileHeight * ry),
          frameSize: new Vector2(tileWidth, tileHeight),
          drawLayer: drawLayer as any,
        });
        created.push(tile);
        this.addChild(tile);
      }
    }

    // compute perimeter walls in hero-grid coordinates so they align with gridCells(1)
    const leftPixel = tileStart.x;
    const topPixel = tileStart.y;
    const rightPixel = tileStart.x + tilesX * tileWidth - 1;
    const bottomPixel = tileStart.y + tilesY * tileHeight - 1;

    const cellPixel = gridCells(1);
    const leftIndex = Math.floor(leftPixel / cellPixel);
    const rightIndex = Math.floor(rightPixel / cellPixel);
    const topIndex = Math.floor(topPixel / cellPixel);
    const bottomIndex = Math.floor(bottomPixel / cellPixel);

    // horizontal edges
    for (let gx = leftIndex; gx <= rightIndex; gx++) {
      this.walls.add(`${gridCells(gx)},${gridCells(topIndex)}`);
      this.walls.add(`${gridCells(gx)},${gridCells(bottomIndex)}`);
    }
    // vertical edges
    for (let gy = topIndex; gy <= bottomIndex; gy++) {
      this.walls.add(`${gridCells(leftIndex)},${gridCells(gy)}`);
      this.walls.add(`${gridCells(rightIndex)},${gridCells(gy)}`);
    }

    return created;
  }

  /**
   * Place a repeating top border along the top edge of a tiled floor area.
   * The border will be centered horizontally at `center`, span `tilesX` tiles,
   * and each border tile uses `borderResource` with width `tileWidth` and height `borderHeight`.
   * Returns created Sprite instances.
   */
  tileFloorTopBorder(center: Vector2, tilesX: number, tileWidth: number, borderHeight: number, borderResource: Resource, opts?: { drawLayer?: typeof BASE | string, startObjectId?: number }) : Sprite[] {
    const drawLayer = opts?.drawLayer ?? BASE;
    let nextId = opts?.startObjectId ?? Math.floor(Math.random() * 10000) * -1;

    const centerTileX = Math.round(center.x / gridCells(1));
    const startTileX = centerTileX - Math.floor(tilesX / 2);
    const tileStartX = gridCells(startTileX);

    const created: Sprite[] = [];
    for (let rx = 0; rx < tilesX; rx++) {
      const xPos = tileStartX + tileWidth * rx;
      const yPos = center.y - borderHeight / 2 - (gridCells(1) * 0); // place at top edge relative to center; caller can adjust center.y as needed
      const borderTile = new Sprite({
        objectId: nextId--,
        resource: borderResource,
        discoverable: false,
        position: new Vector2(xPos, yPos),
        frameSize: new Vector2(tileWidth, borderHeight),
        drawLayer: drawLayer as any,
      });
      created.push(borderTile);
      this.addChild(borderTile);
    }

    return created;
  }

  /**
   * Add a background layer.
   * @param image any drawable (Image, HTMLCanvasElement, etc.)
   * @param parallax 0..1 (0 = static, 1 = moves with camera). Values >1 produce foreground-like motion.
   * @param offset optional pixel offset for the layer
   * @param repeat whether to tile the image horizontally/vertically
   * @param scale optional scale multiplier when drawing
   */
  addBackgroundLayer(image: any, parallax: number = 0.5, offset: Vector2 = new Vector2(0, 0), repeat: boolean = true, scale: number = 1, direction: 'LEFT' | 'RIGHT' = 'LEFT') {
    this.backgroundLayers.push({ image, parallax, offset, repeat, scale, direction });
  }

  setBackgroundLayers(layers: Array<{ image: any; parallax: number; offset?: Vector2; repeat?: boolean; scale?: number; direction?: 'LEFT' | 'RIGHT' }>) {
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

  // direction controls horizontal movement: LEFT (default) moves opposite camera (-cameraPos.x * par)
  // RIGHT moves in the same direction as camera movement (cameraPos.x * par)
  const dir = (layer.direction ?? 'LEFT');
  const dirFactor = dir === 'RIGHT' ? 1 : -1;

  // compute base draw position so that camera movement shifts layer by parallax factor
  const drawX = dirFactor * cameraPos.x * par + offX;
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
