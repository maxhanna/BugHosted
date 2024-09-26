import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { Sprite } from "../objects/sprite";

export function moveTowards(sprite: Sprite, destinationPosition: Vector2, speed: number) {
  if (!sprite || !sprite.position || !destinationPosition || !destinationPosition.x || !destinationPosition.y) return;
  let distanceToTravelX = destinationPosition.x - sprite.position.x;
  let distanceToTravelY = destinationPosition.y - sprite.position.y;

  let distance = Math.sqrt(distanceToTravelX ** 2 + distanceToTravelY ** 2);

  if (distance <= speed) {
    sprite.position = destinationPosition.duplicate();
  } else {
    let normalizedX = distanceToTravelX / distance;
    let normalizedY = distanceToTravelY / distance;

    sprite.position.x += normalizedX * speed;
    sprite.position.y += normalizedY * speed; 

    distanceToTravelX = destinationPosition.x - sprite.position.x;
    distanceToTravelY = destinationPosition.y - sprite.position.y;
    distance = Math.sqrt(distanceToTravelX ** 2 + distanceToTravelY ** 2);
  }
  return distance;
}
