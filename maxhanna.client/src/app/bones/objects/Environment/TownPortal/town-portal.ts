import { Vector2 } from "../../../../../services/datacontracts/bones/vector2";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { FLOOR, GameObject } from "../../game-object";
import { snapToGrid } from "../../../helpers/grid-cells";
import { events } from "../../../helpers/events";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { Animations } from "../../../helpers/animations";
import { WARP_BASE_ANIMATION } from "../../Effects/Warp/warp-base-animations";
  

export class TownPortal extends GameObject {
  id = Math.floor(Math.random() * 55000) + 10000;
  objectId = Math.floor(Math.random() * 55000) + 10000; 
  serverPortalId?: number;
  constructor(params: { position: Vector2, label?: string }) {
    const label = params.label ?? ""; 
    super({
      position: new Vector2(snapToGrid(params.position.x), snapToGrid(params.position.y)),
      name: label,
      forceDrawName: true,
      preventDrawName: false,
      drawLayer: FLOOR,
    }); 

    const body = new Sprite({
        objectId: Math.floor(Math.random() * (9999)) * -1,
        resource: resources.images['warpbase'],
        name: this.name ?? "Portal", 
        frameSize: new Vector2(32, 32),
        vFrames: 1,
        hFrames: 8,
        drawLayer: FLOOR,
        animations: new Animations({
            warpBaseAnimation: new FrameIndexPattern(WARP_BASE_ANIMATION),
        }),
    });
    this.addChild(body);
    const shadow = new Sprite({
      resource: resources.images["shadow"],
      drawLayer: FLOOR
    });
    this.addChild(shadow);
  }

  override ready() {  
    events.on("HERO_REQUESTS_ACTION", this, (params: { hero: any, objectAtPosition: any }) => {
      try {
        if (!params || !params.objectAtPosition) {
          return;
        } 
        const targetId = params.objectAtPosition.id ?? params.objectAtPosition.objectId ?? params.objectAtPosition?.id;
        if (targetId === undefined || targetId === null) return;
        if (Number(targetId) !== Number(this.id)) {
          return;
        } 
        const currentMap = this.parent?.name ?? undefined;
        if (!currentMap) {
          return;
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
      } catch (ex) {
        console.warn('HERO_REQUESTS_ACTION handler failed for TownPortal', ex);
      }
    });
  }
}
