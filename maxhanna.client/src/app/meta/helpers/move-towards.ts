import { Vector2 } from "../../../services/datacontracts/meta/vector2"; 
import { Bot } from "../objects/Bot/bot";
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


export function tryMove(player: any, root: any, isUserControlled: boolean, distanceToTravel: number) {
	if (!player.body) return;

	const { input } = root;
	if (isUserControlled && !input.direction) {
		player.body.animations?.play("stand" + player.facingDirection.charAt(0) + player.facingDirection.substring(1, player.facingDirection.length).toLowerCase());
		return;
	}
	const gridSize = gridCells(1);
	let position = player.destinationPosition.duplicate();
	if (player.destinationPosition && isUserControlled) {
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
  else if (!isUserControlled) { 
    if (distanceToTravel > 0) {
      if (player.heroId) {
        player.body.animations?.play("walk" + player.facingDirection.charAt(0) + player.facingDirection.substring(1, player.facingDirection.length).toLowerCase());
      } else {
        const destPos = player.destinationPosition;
        let tmpPosition = player.position;
        const deltaX = destPos.x - tmpPosition.x;
        const deltaY = destPos.y - tmpPosition.y;
        if (deltaX != 0 || deltaY != 0) {
          if (deltaY <= 0) {
            if (deltaX > 0 && deltaY >= 0) {
              player.facingDirection = RIGHT;
              player.body?.animations?.play("walkRight");
            }
            else if (deltaX < 0 && deltaY >= 0) {
              player.facingDirection = LEFT;
              player.body?.animations?.play("walkLeft");
            }
            else if (deltaX <= 0 && deltaY <= 0) {
              player.facingDirection = UP;
              player.body?.animations?.play("walkUp");
            }
            else if (deltaX == 0 && deltaY > 0) {
              player.facingDirection = DOWN;
              player.body?.animations?.play("walkDown");
            }
          }
          else if (deltaY > 0) {
            if (deltaX > 0 && deltaY > 0) {
              player.facingDirection = RIGHT;
              player.body?.animations?.play("walkRight");
            }
            else if (deltaX < 0 && deltaY >= 0) {
              player.facingDirection = LEFT;
              player.body?.animations?.play("walkLeft");
            }
            else if (deltaX >= 0 && deltaY <= 0) {
              player.facingDirection = UP;
              player.body?.animations?.play("walkUp");
            }
            else if (deltaX == 0 && deltaY > 0) {
              player.facingDirection = DOWN;
              player.body?.animations?.play("walkDown");
            }
          }
        } 
      } 

			setAnimationToStandAfterTimeElapsed(player);
		}
		else {
			player.body.animations?.play("stand" + player.facingDirection.charAt(0) + player.facingDirection.substring(1, player.facingDirection.length).toLowerCase());
    } 
  }
  if (!bodyAtSpace(player.parent, position) && isUserControlled) {
    const lastPos = player.position.duplicate();
    player.destinationPosition.x = snapToGrid(lastPos.x, gridSize);
    player.destinationPosition.y = snapToGrid(lastPos.y, gridSize); 
		return;
	}
	if (isSpaceFree(root.level?.walls, position.x, position.y) && !bodyAtSpace(player.parent, position, true)) {
		player.destinationPosition = position;
		if (player.slopeType) {
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
	if (player.name == "Jaguar") {
		console.log(`before: scale:${player.scale.x}${player.scale.y}, endScale:${player.endScale.x}${player.endScale.y}, ogScale:${player.ogScale.x}${player.ogScale.y}, slopeDir:${player.slopeDirection}, slopeType:${player.slopeType}`);
	}

	if (shouldResetSlope(player)) { 
		return resetSlope(player, false);
	}

	const preScale = player.scale.duplicate();
	scaleWithStep(player, preScale);
	if (player.name == "Jaguar") {
		console.log(`after : scale:${player.scale.x}${player.scale.y}, endScale:${player.endScale.x}${player.endScale.y}, ogScale:${player.ogScale.x}${player.ogScale.y}, slopeDir:${player.slopeDirection}, slopeType:${player.slopeType}`);
	}
	let forceResetSlope = isSlopeResetFromEndScale(player);

	if (forceResetSlope) {
		if (player.name == "Jaguar") {
			console.log("force reset");
		}
		return resetSlope(player, true);
	}
	else {
		if (player.scale.x > 0 && player.scale.y > 0 && !preScale.matches(player.scale)) { 
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
	if (player.name == "Jaguar") {
		console.log("slope reset", player.scale);
	}
}

export function setAnimationToStandAfterTimeElapsed(player: any) {
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

export function getBotsInRange(player: Bot): Bot[] { 
  const discrepancy = gridCells(5);

  const posibilities = player.parent?.children?.filter((child: Bot) => {
    return (
      ((player.heroId ?? 0) < 0 ? (child.heroId ?? 0) > 0 : true) &&
      (child.isDeployed) &&
      (child.id != player.id) &&
      (child.isEnemy) &&
      !(child instanceof Sprite) &&
      child.position.x >= player.position.x - discrepancy &&
      child.position.x <= player.position.x + discrepancy &&
      child.position.y >= player.position.y - discrepancy &&
      child.position.y <= player.position.y + discrepancy
    );
  }); 
  return posibilities ?? [];
}
export function isObjectNearby(playerOrObject: any) {
	const basePosition = playerOrObject.position;
	const neighborPosition =
		playerOrObject.facingDirection && typeof playerOrObject.position.toNeighbour === 'function'
			? basePosition.toNeighbour(playerOrObject.facingDirection)
			: basePosition;

	// Define the discrepancy value
	const discrepancy = 1;

	// Get nearby objects
	const possibilities = playerOrObject.parent?.children?.filter((child: GameObject) => {
		return (
     (
        !(child instanceof Sprite) || child.textContent) && 
			child.position.x >= neighborPosition.x - discrepancy &&
			child.position.x <= neighborPosition.x + discrepancy &&
			child.position.y >= neighborPosition.y - discrepancy &&
			child.position.y <= neighborPosition.y + discrepancy
		);
	}) ?? [];
   

	// Prioritize objects with text content
	const bestChoice = possibilities.find((x: any) => x.textContent?.string);
	if (bestChoice) return bestChoice;

	// Objects with a `getContent` method that returns something
	const bestChoiceContent = possibilities.find((x: any) => typeof x.getContent === 'function' && x.getContent());
	if (bestChoiceContent) return bestChoiceContent;

	// Any object that isn't on the floor
	const secondBestChoice = possibilities.find((x: any) => x.drawLayer !== "FLOOR");
	if (secondBestChoice) return secondBestChoice;

	// Default to the first nearby object
	return possibilities[0];
}


