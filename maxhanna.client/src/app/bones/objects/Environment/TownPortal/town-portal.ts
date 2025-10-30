import { Vector2 } from "../../../../../services/datacontracts/bones/vector2";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { FLOOR, GameObject } from "../../game-object";
import { snapToGrid } from "../../../helpers/grid-cells";
import { events } from "../../../helpers/events";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { Animations } from "../../../helpers/animations";
import { WARP_BASE_ANIMATION } from "../../Effects/Warp/warp-base-animations";

const TOWN_CHAIN = [
    "HEROROOM",
    "ROADTOCITADELOFVESPER",
    "CITADELOFVESPER",
    "ROADTORIFTEDBASTION",
    "RIFTEDBASTION",
    "ROADTOFORTPENUMBRA",
    "FORTPENUMBRA",
    "ROADTOGATESOFHELL",
    "GATESOFHELL",
];

export class TownPortal extends GameObject {
  id = Math.floor(Math.random() * 55000) + 10000;
  objectId = Math.floor(Math.random() * 55000) + 10000;
  preventDestroyTimeout = false;
  serverPortalId?: number;
  constructor(params: { position: Vector2, label?: string, preventDestroyTimeout?: boolean }) {
    super({
      position: new Vector2(snapToGrid(params.position.x), snapToGrid(params.position.y)),
      name: params.label ?? "Town Portal",
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
         if (params.objectAtPosition.id === this.id) {
           const currentMap = this.parent.name ?? undefined;
           if (!currentMap) return;
           // If this portal object has server-provided data that includes an originMap/originX/originY,
           // we are likely in Town and should emit a CHANGE_LEVEL payload object that contains coordinates
           // so the destination level can position the hero where they entered from.
           try {
             const data: any = (this as any).data ?? (this as any).serverData ?? undefined;
             if (data && data.originMap) {
               // Emitting full payload object: { map: originMap, position: { x, y }, portalId }
               const originMap = data.originMap as string;
               const originX = Number(data.originX ?? data.coordsX ?? 0);
               const originY = Number(data.originY ?? data.coordsY ?? 0);
               const payload = { 
                 map: originMap,
                 position: { x: originX, y: originY }, 
                 portalId: (this as any).serverPortalId ?? null,
                 defaultHeroPosition: new Vector2(0,0) };
               events.emit("CHANGE_LEVEL", payload);
               return;
             }
           } catch (e) { /* ignore and fallback to chain behavior */ }
           // Fallback chain behavior: find previous map in chain and emit its name
           const idx = TOWN_CHAIN.findIndex(s => s && s.toLowerCase() === (currentMap as string).toLowerCase());
           let target: string | undefined = undefined;
           if (idx > 0) target = TOWN_CHAIN[idx - 1];
           if (!target) return;
           events.emit("CHANGE_LEVEL", target);
        }
      } catch (ex) { console.warn('TownPortal interaction failed', ex); }
    });
  }
}
