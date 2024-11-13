import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { GameObject } from "../objects/game-object";
import { Sprite } from "../objects/sprite";

export function moveTowards(sprite: GameObject, destinationPosition: Vector2, speed: number) {
  if (!sprite || !sprite.position || !destinationPosition) return;

  // Calculate distances
  let distanceToTravelX = destinationPosition.x - sprite.position.x;
  let distanceToTravelY = destinationPosition.y - sprite.position.y;
  let distance = Math.sqrt(distanceToTravelX ** 2 + distanceToTravelY ** 2);

  // Check if the sprite is at the destination or close enough to stop
  if (distance <= speed) {
    // Snap the position exactly to the destination to prevent overshooting
    sprite.position = destinationPosition.duplicate();
    return 0; // Return 0 to indicate the sprite has arrived
  } else {
    // Normalize the direction vector
    let normalizedX = distanceToTravelX / distance;
    let normalizedY = distanceToTravelY / distance;

    // Move the sprite towards the destination
    sprite.position.x += normalizedX * speed;
    sprite.position.y += normalizedY * speed;

    // Recalculate the remaining distance
    distanceToTravelX = destinationPosition.x - sprite.position.x;
    distanceToTravelY = destinationPosition.y - sprite.position.y;
    distance = Math.sqrt(distanceToTravelX ** 2 + distanceToTravelY ** 2);
  }

  return distance; // Return the updated distance
}
