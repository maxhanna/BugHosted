import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { GameObject } from "../objects/game-object";
import { Sprite } from "../objects/sprite";
import { DOWN, LEFT, RIGHT, UP, gridCells, isSpaceFree } from "./grid-cells";

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


export function bodyAtSpace(parent: GameObject, position: Vector2, solid?: boolean) {
  return parent.children.find((c: any) => {
    return (solid ? c.isSolid : true) && c.position.x == position.x
      && c.position.y == position.y;
  });
} 



export function otherPlayerMove(player: any, root: any) { 
    let moved = false;
    player.position = player.position.duplicate();
    player.destinationPosition = player.destinationPosition.duplicate();
    const destPos = player.destinationPosition;
    let tmpPosition = player.position;
    if (destPos) {
      // Calculate the difference between destination and current position
      const deltaX = destPos.x - tmpPosition.x;
      const deltaY = destPos.y - tmpPosition.y;
      const gridSize = gridCells(1);
      if (deltaX != 0 || deltaY != 0) {
        if (deltaX > 0) {
          tmpPosition.x = (tmpPosition.x);
          player.facingDirection = RIGHT;
          player.body.animations?.play("walkRight");
          console.log("walk right");
          moved = true;
        } else if (deltaX < 0) {
          tmpPosition.x = (tmpPosition.x);
          player.facingDirection = LEFT;
          player.body.animations?.play("walkLeft");
          console.log("walk left");
          moved = true;
        }
      }
      if (deltaY != 0) {
        if (deltaY > 0) {
          tmpPosition.y = tmpPosition.y;
          player.facingDirection = DOWN;
          player.body.animations?.play("walkDown");
          moved = true;
        } else if (deltaY < 0) {
          tmpPosition.y = tmpPosition.y;
          player.facingDirection = UP;
          player.body.animations?.play("walkUp");
          moved = true;
        }
      }
      updateAnimation(player);
      const spaceIsFree = isSpaceFree(root.level?.walls, tmpPosition.x, tmpPosition.y);
      const solidBodyAtSpace = bodyAtSpace(player.parent, tmpPosition, true);

      if (spaceIsFree && !solidBodyAtSpace) {
        player.position = tmpPosition;
        if (player.slopeType && moved && player.lastPosition.x % 16 == 0 && player.lastPosition.y % 16 == 0) {
          player.recalculateScaleBasedOnSlope();
        }
      }
    }  
}

export function shouldResetSlope(player: any) {
  // Check DOWN slope conditions
  if (player.slopeDirection === DOWN && player.facingDirection === UP) {
    if (player.ogScale.x >= player.scale.x || player.ogScale.y >= player.scale.y) {
      return true;
    }
  }
  // Check RIGHT slope conditions
  if (player.slopeDirection === UP && player.facingDirection === DOWN) {
    if (player.ogScale.x <= player.scale.x || player.ogScale.y <= player.scale.y) {
      return true;
    }
  }

  // Check LEFT slope conditions
  if (player.slopeDirection === LEFT && player.facingDirection === RIGHT) {
    if (player.slopeType === UP && (player.ogScale.x >= player.scale.x || player.ogScale.y >= player.scale.y)) {
      return true;
    }
    if (player.slopeType === DOWN && (player.scale.x >= player.ogScale.x || player.scale.y >= player.ogScale.y)) {
      return true;
    }
  }

  // Check RIGHT slope conditions
  if (player.slopeDirection === RIGHT && player.facingDirection === LEFT) {
    if (player.slopeType === DOWN && (player.ogScale.x <= player.scale.x || player.ogScale.y <= player.scale.y)) {
      return true;
    }
    if (player.slopeType === UP && (player.ogScale.x >= player.scale.x || player.ogScale.y >= player.scale.y)) {
      return true;
    }
  }

  // If none of the conditions matched, return false
  return false;
}


 export function recalculateScaleBasedOnSlope(player: any) {
  if (!player.slopeDirection || !player.slopeType) return;
  //console.log(`before: scale:${player.scale.x}${player.scale.y}, endScale:${player.endScale.x}${player.endScale.y}, ogScale:${player.ogScale.x}${player.ogScale.y}, slopeDir:${player.slopeDirection}, slopeType:${player.slopeType}`);

  if (shouldResetSlope(player)) {
    console.log("autoreset");
    return resetSlope(player, true);
  }

  const preScale = new Vector2(player.scale.x, player.scale.y);
  scaleWithStep(player, preScale);
 // console.log(`after : scale:${player.scale.x}${player.scale.y}, endScale:${player.endScale.x}${player.endScale.y}, ogScale:${player.ogScale.x}${player.ogScale.y}, slopeDir:${player.slopeDirection}, slopeType:${player.slopeType}`);
  let forceResetSlope = isSlopeResetFromEndScale(player);

  if (forceResetSlope) {
    console.log("force reset");
    return resetSlope(player, true);
  }
  else {
    if (player.scale.x > 0 && player.scale.y > 0 && !preScale.matches(player.scale)) {
      //player.destroyBody();
      player.initializeBody(true);
      return true;
    }
    else
      return false;
  }
}
export function isSlopeResetFromEndScale(player: any): boolean {
  let resetSlope = false;
  if (player.slopeType == UP && player.endScale.x <= player.scale.x && player.endScale.y <= player.scale.y) {
    resetSlope = true;
  } else if (player.slopeType == DOWN && player.endScale.x >= player.scale.x && player.endScale.y >= player.scale.y) {
    resetSlope = true;
  }
  return resetSlope;
}

export function scaleWithStep(player: any, preScale: Vector2) {
  if (!player.slopeStepHeight) return;
  const se = player.slopeStepHeight.x;
  if (player.facingDirection === LEFT) {
    if (player.slopeDirection === LEFT && player.slopeType === UP) {
      player.scale = new Vector2(player.scale.x + se, player.scale.y + se);
    } else if (player.slopeDirection === LEFT && player.slopeType === DOWN) {
      player.scale = new Vector2(player.scale.x - se, player.scale.y - se);
    } else if (player.slopeDirection === RIGHT && player.slopeType === DOWN) {
      player.scale = new Vector2(player.scale.x + se, player.scale.y + se);
    } else if (player.slopeDirection === RIGHT && player.slopeType === UP) {
      player.scale = new Vector2(player.scale.x - se, player.scale.y - se);
    }
  } else if (player.facingDirection === RIGHT) {
    if (player.slopeDirection === RIGHT && player.slopeType === UP) {
      player.scale = new Vector2(player.scale.x + se, player.scale.y + se);
    } else if (player.slopeDirection === LEFT && player.slopeType === DOWN) {
      player.scale = new Vector2(player.scale.x + se, player.scale.y + se);
    } else if (player.slopeDirection === LEFT && player.slopeType === UP) {
      player.scale = new Vector2(player.scale.x - se, player.scale.y - se);
    } else if (player.slopeDirection === RIGHT && player.slopeType === DOWN) {
      player.scale = new Vector2(player.scale.x - se, player.scale.y - se);
    }
  } else if (player.facingDirection === UP) {
    if (player.slopeDirection === UP && player.slopeType === UP) {
      player.scale = new Vector2(player.scale.x + se, player.scale.y + se);
    } else if (player.slopeDirection === UP && player.slopeType === DOWN) {
      player.scale = new Vector2(player.scale.x - se, player.scale.y - se);
    } else if (player.slopeDirection === DOWN && player.slopeType === DOWN) {
      player.scale = new Vector2(player.scale.x + se, player.scale.y + se);
    } else if (player.slopeDirection === DOWN && player.slopeType === UP) {
      player.scale = new Vector2(player.scale.x - se, player.scale.y - se);
    }
  } else if (player.facingDirection === DOWN) {
    if (player.slopeDirection === DOWN && player.slopeType === UP) {
      player.scale = new Vector2(player.scale.x + se, player.scale.y + se);
    } else if (player.slopeDirection === DOWN && player.slopeType === DOWN) {
      player.scale = new Vector2(player.scale.x - se, player.scale.y - se);
    } else if (player.slopeDirection === UP && player.slopeType === DOWN) {
      player.scale = new Vector2(player.scale.x + se, player.scale.y + se);
    } else if (player.slopeDirection === UP && player.slopeType === UP) {
      player.scale = new Vector2(player.scale.x - se, player.scale.y - se);
    }
  }
  if (Math.abs(player.ogScale.y - player.scale.y) > 0.1) {
    player.steppedUpOrDown = !player.steppedUpOrDown;
    if (player.ogScale.y < player.scale.y && player.steppedUpOrDown || (player.facingDirection != player.slopeDirection && !player.steppedUpOrDown)) {
      player.destinationPosition.y -= gridCells(1);
      console.log("adjusting down");
    } else if ((player.ogScale.y > player.scale.y && player.steppedUpOrDown) || (player.facingDirection != player.slopeDirection && !player.steppedUpOrDown)) {
      player.destinationPosition.y += gridCells(1);
      //console.log("adjusting down");
    }
  }
}

export function resetSlope(player: any, skipDestroy ?: boolean) {
  player.slopeDirection = undefined;
  player.slopeType = undefined;
  player.slopeStepHeight = undefined;
  player.steppedUpOrDown = false;
  if (!skipDestroy) {
    player.destroyBody();
    player.body = player.initializeBody(true);
  }
  console.log("slope reset", player.endScale);
}

export function updateAnimation(player: any) {
  setTimeout(() => {
    const currentTime = new Date().getTime();
    if (currentTime - player.lastStandAnimationTime >= 300) {
      if (player.destinationPosition.matches(player.position)) {
        player.body.animations?.play(
          "stand" + player.facingDirection.charAt(0) +
          player.facingDirection.substring(1, player.facingDirection.length).toLowerCase()
        );
      }
      player.lastStandAnimationTime = currentTime; // Update the last time it was run
    }
  }, (player.isUserControlled ? 1000 : 2000));
}
