import { Vector2 } from "../../../../../services/datacontracts/bones/vector2";
import { Sprite } from "../../sprite";
import { resources } from "../../../helpers/resources";
import { FLOOR, GameObject } from "../../game-object";
import { snapToGrid } from "../../../helpers/grid-cells";
import { events } from "../../../helpers/events";
import { FrameIndexPattern } from "../../../helpers/frame-index-pattern";
import { Animations } from "../../../helpers/animations";
import { WARP_BASE_ANIMATION } from "../../Effects/Warp/warp-base-animations";

// Ordered chain for portal navigation (previous town is earlier in array)
// Use canonical level keys recognized by BonesComponent.getLevelFromLevelName
const TOWN_CHAIN = [
  // If Eclipsera Keep or similar custom maps exist, add their canonical keys here.
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
        console.log(`requesting portal? ${params.objectAtPosition.id} == ${this.id}`, params.objectAtPosition.id === this.id);
        if (params.objectAtPosition.id === this.id) {
          // Determine previous town in chain based on hero's current map
          const currentMap = (params.hero && (params.hero.map ?? params.hero.Map)) ?? undefined;
          if (!currentMap) return;
          const idx = TOWN_CHAIN.findIndex(s => s && s.toLowerCase() === (currentMap as string).toLowerCase());
          let target: string | undefined = undefined;
          if (idx > 0) target = TOWN_CHAIN[idx - 1];
          // If current map not found, or at start of chain, do nothing
          if (!target) return;
          // Emit a centralized event that the bones component will handle to change level
          events.emit("ENTER_TOWN_PORTAL", { hero: params.hero, targetMap: target, portalId: (this as any).serverPortalId ?? null });
        }
      } catch (ex) { console.warn('TownPortal interaction failed', ex); }
    });
  }
}
