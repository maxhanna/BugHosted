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
  preventDestroyTimeout = false;
  serverPortalId?: number;
  constructor(params: { position: Vector2, label?: string, preventDestroyTimeout?: boolean }) {
    // label may include owner name and newline; default to 'Town Portal' when not provided
    const label = params.label ?? "Town Portal";
    super({
      position: new Vector2(snapToGrid(params.position.x), snapToGrid(params.position.y)),
      name: label,
      forceDrawName: true,
      preventDrawName: false,
      drawLayer: FLOOR,
    });

    this.preventDestroyTimeout = params.preventDestroyTimeout ?? false;

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
    if (!this.preventDestroyTimeout) {
      // portals persist by default; do not auto destroy
    }
    events.on("HERO_REQUESTS_ACTION", this, (params: { hero: any, objectAtPosition: any }) => {
      try {
        console.debug('[TownPortal] HERO_REQUESTS_ACTION received', params);
        if (!params || !params.objectAtPosition) {
          console.debug('[TownPortal] HERO_REQUESTS_ACTION missing params or objectAtPosition');
          return;
        }
        // objectAtPosition may be a wrapper or a raw object; guard access
        const targetId = params.objectAtPosition.id ?? params.objectAtPosition.objectId ?? params.objectAtPosition?.id;
        console.debug('[TownPortal] resolved targetId', targetId, 'this.id', this.id);
        if (targetId === undefined || targetId === null) return;
        if (Number(targetId) !== Number(this.id)) {
          console.debug('[TownPortal] targetId does not match portal id, ignoring');
          return;
        }

        // Ensure we have a parent map name (we're in a level)
        const currentMap = this.parent?.name ?? undefined;
        if (!currentMap) {
          console.debug('[TownPortal] no parent map, ignoring');
          return;
        }

        // serverData is attached during reconciliation; fall back to 'data' if present
        const data: any = (this as any).serverData ?? (this as any).data ?? undefined;
        console.debug('[TownPortal] server/data', data);
        // Support either originMap (preferred) or map (older format) and coerce arrays -> primitives
        let originMapRaw: any = data ? (data.originMap ?? data.map) : undefined;
        if (Array.isArray(originMapRaw)) originMapRaw = originMapRaw.length > 0 ? originMapRaw[0] : undefined;
        let originMap = originMapRaw !== undefined && originMapRaw !== null ? String(originMapRaw).trim() : undefined;
         if (!originMap) {
          // No origin map provided by server; emit the 'town' alias so the component resolves the previous town
          console.debug('[TownPortal] no originMap found in server data (after coercion); falling back to alias "town"', originMapRaw);
          originMap = 'HeroHome'; 
        }

        // Compute origin coordinates from multiple possible keys and coerce arrays -> primitives
        const rawX = data ? (data.originX ?? data.coordsX ?? data.x ?? 0) : 0;
        const rawY = data ? (data.originY ?? data.coordsY ?? data.y ?? 0) : 0;
        const originX = Number(Array.isArray(rawX) ? (rawX.length > 0 ? rawX[0] : 0) : rawX) || 0;
        const originY = Number(Array.isArray(rawY) ? (rawY.length > 0 ? rawY[0] : 0) : rawY) || 0;
        console.debug('[TownPortal] origin coords', originX, originY, 'rawX', rawX, 'rawY', rawY);

        // Emit a normalized event so the component can construct the proper Level instance
        const payload = {
          map: originMap,
          position: { x: originX, y: originY },
          portalId: ((this as any).serverPortalId !== undefined && (this as any).serverPortalId !== null) ? Number((this as any).serverPortalId) : undefined,
        };
        console.info('[TownPortal] emitting ENTER_TOWN_PORTAL', payload);
        events.emit("ENTER_TOWN_PORTAL", payload);
      } catch (ex) {
        console.warn('HERO_REQUESTS_ACTION handler failed for TownPortal', ex);
      }
    });
  }
}
