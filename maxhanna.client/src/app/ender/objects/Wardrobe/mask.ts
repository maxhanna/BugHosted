import { Vector2 } from "../../../../services/datacontracts/meta/vector2"; 
import { GameObject } from "../game-object";
import { Sprite } from "../sprite"; 
import { resources } from "../../helpers/resources"; 

export class Mask extends Sprite { 
  constructor(name: string) {
    super({
      resource: resources.images[name],
      name: name,
      frameSize: new Vector2(32, 32),
      hFrames: 3,
      vFrames: 1,
    }); 
  }
}

export function getMaskNameById(maskId?: number) {
  const masks = [
    AI_MASK,
    BUNNYEARS_MASK,
    VISOR_MASK,
    BOT_MASK,
    ANBU_MASK,
    BUNNY_MASK,
    NO_MASK, 
  ];
  if (!maskId) return "";
  const mask = masks.find(m => m.id === maskId);
  return mask ? mask.name : ""; // Return mask name if found, otherwise null
}

export const VISOR_MASK = {
  name: "visormask",
  id: 6,
}
export const AI_MASK = {
  name: "aimask",
  id: 5,
}
export const BUNNYEARS_MASK = {
  name: "bunnyearsmask",
  id: 4,
}
export const BOT_MASK = {
  name: "botmask",
  id: 3,
}
export const ANBU_MASK = {
  name: "anbumask",
  id: 2,
}
export const BUNNY_MASK = {
  name: "bunnymask",
  id: 1,
}
export const NO_MASK = {
  name: "unequip",
  id: 0,
}
