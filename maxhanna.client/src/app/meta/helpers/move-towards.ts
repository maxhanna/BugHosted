import { Vector2 } from "../../../services/datacontracts/meta/vector2";
import { Character } from "../objects/character";
import { GameObject } from "../objects/game-object";
import { Sprite } from "../objects/sprite";
import { DOWN, LEFT, RIGHT, UP, gridCells, isSpaceFree, snapToGrid } from "./grid-cells";

export function moveTowards(player: Character, destinationPosition: Vector2, speed: number) {
  if (!player || !player.position || !destinationPosition) return;

  let distanceToTravelX = destinationPosition.x - player.position.x;
  let distanceToTravelY = destinationPosition.y - player.position.y;
  let distance = Math.sqrt(distanceToTravelX ** 2 + distanceToTravelY ** 2);

  // Check if the sprite is at the destination or close enough to stop
  if (distance <= speed) {
    // Snap the position exactly to the destination to prevent overshooting
    player.position = destinationPosition.duplicate();
    return 0; // Return 0 to indicate the sprite has arrived
  } else {
    // Normalize the direction vector
    let normalizedX = distanceToTravelX / distance;
    let normalizedY = distanceToTravelY / distance;

    // Move the sprite towards the destination
    player.position.x += normalizedX * speed;
    player.position.y += normalizedY * speed;

    // Recalculate the remaining distance
    distanceToTravelX = destinationPosition.x - player.position.x;
    distanceToTravelY = destinationPosition.y - player.position.y;
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


export function tryMove(player: Character, root: any, isUserControlled: boolean, distanceToTravel: number) {
  if (!player.body) return;

  const { input } = root;
  if (isUserControlled && !input.direction) {
    //console.log("stand" + player.facingDirection.charAt(0) + player.facingDirection.substring(1, player.facingDirection.length).toLowerCase()); 
    player.body.animations?.play("stand" + player.facingDirection.charAt(0) + player.facingDirection.substring(1, player.facingDirection.length).toLowerCase());
    return;
  } 
  const gridSize = gridCells(1);
  let position = player.destinationPosition.duplicate();
  if (player.destinationPosition) { 
    if (isUserControlled) {
      if (input.direction === DOWN) {
        position.x = snapToGrid(position.x, gridSize);
        position.y = snapToGrid(position.y + gridSize, gridSize);
        player.body.animations?.play("walkDown"); 
      }
      else if (input.direction === UP) {
        position.x = snapToGrid(position.x, gridSize);
        position.y = snapToGrid(position.y - gridSize, gridSize);
        player.body.animations?.play("walkUp"); 
      }
      else if (input.direction === LEFT) {
        position.x = snapToGrid(position.x - gridSize, gridSize);
        position.y = snapToGrid(position.y, gridSize);
        player.body.animations?.play("walkLeft"); 
      }
      else if (input.direction === RIGHT) {
        position.x = snapToGrid(position.x + gridSize, gridSize);
        position.y = snapToGrid(position.y, gridSize);
        player.body.animations?.play("walkRight"); 
      }
      player.facingDirection = input.direction ?? player.facingDirection;
    } 
  } 
  if (!isUserControlled) {
    if (distanceToTravel > 0) {
      const destPos = player.destinationPosition;
      let tmpPosition = player.position;
      //if (player.name == "Bug Catcher") { 
      //  console.log("moving npc");
      //}
      // Calculate the difference between destination and current position
      const deltaX = destPos.x - tmpPosition.x;
      const deltaY = destPos.y - tmpPosition.y;
      const gridSize = gridCells(1);
      if (deltaX != 0 || deltaY != 0) {
        if (deltaX > 0) {
          player.facingDirection = RIGHT;
          player.body?.animations?.play("walkRight");
        } else if (deltaX < 0) {
          player.facingDirection = LEFT;
          player.body?.animations?.play("walkLeft");
        }
      }
      if (deltaY != 0) {
        if (deltaY > 0) {
          player.facingDirection = DOWN;
          player.body?.animations?.play("walkDown");
        } else if (deltaY < 0) {
          player.facingDirection = UP;
          player.body?.animations?.play("walkUp");
        }
      }
      updateAnimation(player); 
    } 
    else { 
      //if (player.name == "Bug Catcher") {
      //  console.log("standing still with npc");
      //}
      player.body.animations?.play("stand" + player.facingDirection.charAt(0) + player.facingDirection.substring(1, player.facingDirection.length).toLowerCase());
    }
  }
  if (!bodyAtSpace(player.parent, position)) {
    player.destinationPosition = player.lastPosition.duplicate();
    return;
  }
  /*console.log(position);*/
  if (isSpaceFree(root.level?.walls, position.x, position.y) && !bodyAtSpace(player.parent, position, true)) {

    player.destinationPosition = position;

    if (player.slopeType) {
      console.log(`slopeType: ${player.slopeType}, slopeDirection: ${player.slopeDirection}, slopeStepHeight: ${player.slopeStepHeight}, facingDirection: ${player.facingDirection}, scale: ${player.scale}`);
      recalculateScaleBasedOnSlope(player);
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
  if (player.name == "Max") {
    console.log(`before: scale:${player.scale.x}${player.scale.y}, endScale:${player.endScale.x}${player.endScale.y}, ogScale:${player.ogScale.x}${player.ogScale.y}, slopeDir:${player.slopeDirection}, slopeType:${player.slopeType}`);
  }

  if (shouldResetSlope(player)) {
    if (player.name == "Max") {
      console.log("autoreset");
    }
    return resetSlope(player, false);
  }

  const preScale = player.scale.duplicate();
  scaleWithStep(player, preScale);
  if (player.name == "Max") {
    console.log(`after : scale:${player.scale.x}${player.scale.y}, endScale:${player.endScale.x}${player.endScale.y}, ogScale:${player.ogScale.x}${player.ogScale.y}, slopeDir:${player.slopeDirection}, slopeType:${player.slopeType}`);
  }
  let forceResetSlope = isSlopeResetFromEndScale(player);

  if (forceResetSlope) {
    if (player.name == "Max") {
      console.log("force reset");
    }
    return resetSlope(player, true);
  }
  else {
    if (player.scale.x > 0 && player.scale.y > 0 && !preScale.matches(player.scale)) {

      if (player.name == "Max") {
        console.log("reinitialize body", player.scale);
      } 
      player.initializeBody();
       
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

export function adjustScale(se: number, scaleX: number, scaleY: number): Vector2 {
  return new Vector2(scaleX + se, scaleY + se);
}

export function adjustVerticalMovement(player: Character, se: number): void {
  if (Math.abs(player.ogScale.y - player.scale.y) > 0.1) {
    player.steppedUpOrDown = !player.steppedUpOrDown;

    const shouldMoveDown =
      (player.ogScale.y < player.scale.y && player.steppedUpOrDown) ||
      (player.facingDirection !== player.slopeDirection && !player.steppedUpOrDown);
    const shouldMoveUp =
      (player.ogScale.y > player.scale.y && player.steppedUpOrDown) ||
      (player.facingDirection !== player.slopeDirection && !player.steppedUpOrDown);

    if (shouldMoveDown) {
      player.destinationPosition.y -= gridCells(1);
      if (player.name == "Bot") {
        console.log('adjusting down');
      }
    } else if (shouldMoveUp) {
      player.destinationPosition.y += gridCells(1);
      // console.log("adjusting down");
    }
  }
}

export function scalePlayerBasedOnSlope(player: Character, se: number): void {
  switch (player.facingDirection) {
    case 'LEFT':
      if (player.slopeDirection === 'LEFT' && player.slopeType === 'UP') {
        player.scale = adjustScale(se, player.scale.x, player.scale.y);
      } else if (player.slopeDirection === 'LEFT' && player.slopeType === 'DOWN') {
        player.scale = adjustScale(-se, player.scale.x, player.scale.y);
      } else if (player.slopeDirection === 'RIGHT' && player.slopeType === 'DOWN') {
        player.scale = adjustScale(se, player.scale.x, player.scale.y);
      } else if (player.slopeDirection === 'RIGHT' && player.slopeType === 'UP') {
        player.scale = adjustScale(-se, player.scale.x, player.scale.y);
      }
      break;

    case 'RIGHT':
      if (player.slopeDirection === 'RIGHT' && player.slopeType === 'UP') {
        player.scale = adjustScale(se, player.scale.x, player.scale.y);
      } else if (player.slopeDirection === 'LEFT' && player.slopeType === 'DOWN') {
        player.scale = adjustScale(se, player.scale.x, player.scale.y);
      } else if (player.slopeDirection === 'LEFT' && player.slopeType === 'UP') {
        player.scale = adjustScale(-se, player.scale.x, player.scale.y);
      } else if (player.slopeDirection === 'RIGHT' && player.slopeType === 'DOWN') {
        player.scale = adjustScale(-se, player.scale.x, player.scale.y);
      }
      break;

    case 'UP':
      if (player.slopeDirection === 'UP' && player.slopeType === 'UP') {
        player.scale = adjustScale(se, player.scale.x, player.scale.y);
      } else if (player.slopeDirection === 'UP' && player.slopeType === 'DOWN') {
        player.scale = adjustScale(-se, player.scale.x, player.scale.y);
      } else if (player.slopeDirection === 'DOWN' && player.slopeType === 'DOWN') {
        player.scale = adjustScale(se, player.scale.x, player.scale.y);
      } else if (player.slopeDirection === 'DOWN' && player.slopeType === 'UP') {
        player.scale = adjustScale(-se, player.scale.x, player.scale.y);
      }
      break;

    case 'DOWN':
      if (player.slopeDirection === 'DOWN' && player.slopeType === 'UP') {
        player.scale = adjustScale(se, player.scale.x, player.scale.y);
      } else if (player.slopeDirection === 'DOWN' && player.slopeType === 'DOWN') {
        player.scale = adjustScale(-se, player.scale.x, player.scale.y);
      } else if (player.slopeDirection === 'UP' && player.slopeType === 'DOWN') {
        player.scale = adjustScale(se, player.scale.x, player.scale.y);
      } else if (player.slopeDirection === 'UP' && player.slopeType === 'UP') {
        player.scale = adjustScale(-se, player.scale.x, player.scale.y);
      }
      break;
  }
  if (player.body) {
    player.body.recalculatePrecomputedCanvases = true;
  }
}

export function scaleWithStep(player: Character, preScale: Vector2): void {
  if (!player.slopeStepHeight) return;

  const slopeStepHeight = player.slopeStepHeight.x;
  if (player.name == "Bot") {
    console.log('slope step height x', slopeStepHeight);
    console.log('player.facingDirection', player.facingDirection);
    console.log('player.slopeDirection', player.slopeDirection);
  }
  scalePlayerBasedOnSlope(player, slopeStepHeight);
  adjustVerticalMovement(player, slopeStepHeight);
}

export function resetSlope(player: any, skipDestroy?: boolean) {
  player.slopeDirection = undefined;
  player.slopeType = undefined;
  player.slopeStepHeight = undefined;
  player.steppedUpOrDown = false; 
  if (!skipDestroy) {
    player.body.recalculatePrecomputedCanvases = true;
  }
  if (player.name == "Max") {
    console.log("slope reset", player.scale);
  }
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
  }, (player.isUserControlled ? 1000 : 1500));
}


export function isObjectNeerby(player: Character) {
  const posibilities = player.parent.children.filter((child: GameObject) => {
    // Calculate the neighboring position with the facing direction
    const neighborPosition = player.position.toNeighbour(player.facingDirection);
    // Define the discrepancy value
    const discrepancy = 1;
    // Check if the child's position is within the discrepancy range of the neighbor position
    return (
      (!(child instanceof Sprite) || child.textContent) &&
      child.position.x >= neighborPosition.x - discrepancy &&
      child.position.x <= neighborPosition.x + discrepancy &&
      child.position.y >= neighborPosition.y - discrepancy &&
      child.position.y <= neighborPosition.y + discrepancy
    );
  });
  console.log(posibilities);
  const bestChoice = posibilities.find((x: any) => x.textContent?.string);
  if (bestChoice) {
    return bestChoice;
  }
  const bestChoiceContent = posibilities.find((x: any) => typeof x.getContent === 'function' && x.getContent());
  if (bestChoiceContent) {
    return bestChoiceContent;
  }
  const secondBestChoice = posibilities.find((x: any) => x.drawLayer != "FLOOR");
  if (secondBestChoice) {
    return secondBestChoice;
  }
  return posibilities[0];
}
