import { Vector2 } from "../../../../../services/datacontracts/bones/vector2";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { FLOOR, GameObject, HUD } from "../../game-object";
import { gridCells, snapToGrid } from "../../../helpers/grid-cells";
import { events } from "../../../helpers/events";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { Animations } from "../../../helpers/animations"; 
import { PORTAL_ANIMATION } from "./town-portal-animations";
import { ColorSwap } from "../../../../../services/datacontracts/meta/color-swap";
import { Hero } from "../../Hero/hero";
  

export class TownPortal extends GameObject {
  id = Math.floor(Math.random() * 55000) + 10000;
  objectId = Math.floor(Math.random() * 55000) + 10000; 
  serverPortalId?: number;
  private bodySprite: any;
  private _revealStart: number = Date.now();
  private _revealDurationMs: number = 1000; // 1 second
  private isDestroying: boolean = false;
  private _destroyStartMs: number = 0;
  private _destroyDurationMs: number = 1000;
  private _destroyInitialScale: number = 1;
  constructor(params: { position: Vector2, label?: string, colorSwap?: ColorSwap }) {
    const label = params.label ?? ""; 
    super({
      position: new Vector2(snapToGrid(params.position.x), snapToGrid(params.position.y)),
      name: label,
      forceDrawName: true,
      preventDrawName: false,
      drawLayer: HUD,
      colorSwap: params.colorSwap,
    }); 

    console.log("new town portal");
  const body = new Sprite({
        objectId: Math.floor(Math.random() * (9999)) * -1,
        resource: resources.images['portal'],
        name: this.name ?? "Portal", 
        frameSize: new Vector2(40, 95),
        vFrames: 1,
        hFrames: 4,
        offsetX: -10,
        offsetY: -65,
        drawLayer: HUD,
        colorSwap: params.colorSwap,
        animations: new Animations({
            portalAnimation: new FrameIndexPattern(PORTAL_ANIMATION),
        }),
    });
  // Start scaled down so it "reveals" itself; final frameSize is 40x95 and we'll scale from 0->1 over 1s
  body.scale = new Vector2(0, 0);
  this.bodySprite = body;
  this.addChild(body);
    const shadow = new Sprite({
      resource: resources.images["shadow"],
      drawLayer: FLOOR
    });
    this.addChild(shadow);
    body?.animations?.play("portalAnimation");
    // Play portal sound once; include a safeguard stop in case the audio element loops or stalls
    
    resources.playSound('portalNoise', { allowOverlap: false, loop: false }); 
  }

  override step(delta: number, root: any) {
    // Handle reveal and destroy animations
    try {
      const now = Date.now();

      if (this.isDestroying) {
        const elapsed = now - this._destroyStartMs;
        const t = Math.min(1, elapsed / this._destroyDurationMs);
        const ease = 1 - Math.pow(1 - t, 3);
        const remaining = Math.max(0, this._destroyInitialScale * (1 - ease));
        if (this.bodySprite) {
          this.bodySprite.scale.x = remaining;
          this.bodySprite.scale.y = remaining;
        }
        if (t >= 1) {
          // Once the shrink animation finishes, remove the object
          super.destroy();
          return;
        }
      } else {
        const elapsed = now - this._revealStart;
        const t = Math.min(1, elapsed / this._revealDurationMs);
        if (this.bodySprite) {
          // ease-out cubic for a nicer reveal
          const ease = 1 - Math.pow(1 - t, 3);
          this.bodySprite.scale.x = ease;
          this.bodySprite.scale.y = ease;
        }
      }
    } catch (ex) {
      // swallow animation errors to avoid breaking main loop
      console.warn('TownPortal animation error', ex);
    }

    // call children/animations stepping
    super.step(delta, root);
  }

  override destroy() {
    // Start a shrink animation instead of destroying immediately
    if (this.isDestroying) return; // already in progress
    this.isDestroying = true;
    this._destroyStartMs = Date.now();
    this._destroyInitialScale = this.bodySprite?.scale?.x ?? 1;
    // Do not call super.destroy() now; step() will call it when animation completes
  }

  override ready() {  
    events.on("HERO_REQUESTS_ACTION", this, (params: { hero: Hero, objectAtPosition: any }) => {
      console.log('HERO_REQUESTS_ACTION received in TownPortal', params);  
      let heroLoc = params.hero.position.duplicate(); 
      heroLoc.x = snapToGrid(heroLoc.x, gridCells(1));
      heroLoc.y = snapToGrid(heroLoc.y, gridCells(1));
      let tmpPosition = this.position.duplicate();
      tmpPosition.x = snapToGrid(tmpPosition.x, gridCells(1));
      tmpPosition.y = snapToGrid(tmpPosition.y, gridCells(1));
      if (!heroLoc || !heroLoc.matches(tmpPosition)) {
        return
      }
        const data: any = (this as any).serverData ?? (this as any).data ?? undefined;
        let originMapRaw: any = data ? (data.originMap ?? data.map) : undefined;
        if (Array.isArray(originMapRaw)) {
          originMapRaw = originMapRaw.length > 0 ? originMapRaw[0] : undefined;
        }
        let originMap = originMapRaw !== undefined && originMapRaw !== null ? String(originMapRaw).trim() : undefined;
         if (!originMap) {
          originMap = 'HeroHome'; 
        }

        const rawX = data ? (data.originX ?? data.coordsX ?? data.x ?? 0) : 0;
        const rawY = data ? (data.originY ?? data.coordsY ?? data.y ?? 0) : 0;
        const originX = Number(Array.isArray(rawX) ? (rawX.length > 0 ? rawX[0] : 0) : rawX) || 0;
        const originY = Number(Array.isArray(rawY) ? (rawY.length > 0 ? rawY[0] : 0) : rawY) || 0;
        const payload = {
          map: originMap,
          position: { x: originX, y: originY },
          portalId: ((this as any).serverPortalId !== undefined && (this as any).serverPortalId !== null) ? Number((this as any).serverPortalId) : undefined,
        };
        events.emit("ENTER_TOWN_PORTAL", payload);
      
    });
  }
}
