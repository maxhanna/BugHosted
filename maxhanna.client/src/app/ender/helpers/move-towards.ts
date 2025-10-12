import { Vector2 } from "../../../services/datacontracts/meta/vector2";  
import { Character } from "../objects/character";
import { GameObject } from "../objects/game-object"; 
import { Sprite } from "../objects/sprite";
import { DOWN, LEFT, RIGHT, UP, gridCells, isSpaceFree, snapToGrid } from "./grid-cells";

export function moveTowards(player: Character, destinationPosition: Vector2, speed: number) {
	if (!player || !player.position || !destinationPosition) return;

	// If a correction is in progress (server told us the true position and we
	// are interpolating), update the displayed position first using the
	// correction interpolation. When correction finishes, prediction is cleared.
	try {
		const corrTarget = (player as any).correctionTarget;
		const corrStart = (player as any).correctionStart;
		const corrStartAt = (player as any).correctionStartAt;
		const corrDuration = (player as any).correctionDuration ?? 200;
		if (corrTarget && corrStart && corrStartAt) {
			const elapsed = Date.now() - corrStartAt;
			const t = Math.min(1, Math.max(0, elapsed / corrDuration));
			player.position.x = corrStart.x + (corrTarget.x - corrStart.x) * t;
			player.position.y = corrStart.y + (corrTarget.y - corrStart.y) * t;
			if (t >= 1) {
				// finished correction; remove correction metadata and predicted pos
				delete (player as any).correctionTarget;
				delete (player as any).correctionStart;
				delete (player as any).correctionStartAt;
				delete (player as any).correctionDuration;
				clearPredictedPosition(player);
			}
		}
	} catch { /* defensive */ }

	// If this is a non-user-controlled player and we have a recent prediction,
	// prefer moving toward the predicted position so the player appears where
	// we'd expect them to be for the next ~2 seconds. Prediction is considered
	// stale after ~2500ms and will be ignored then.
	let chosenDestination = destinationPosition;
	try {
		if (!player.isUserControlled && (player as any).predictedPosition) {
			const predictedAt = (player as any).predictedAt ?? 0;
			const age = Date.now() - predictedAt;
			if (age >= 0 && age <= 2500) {
				chosenDestination = (player as any).predictedPosition;
			}
		}
	} catch { /* defensive: if shape differs, ignore prediction */ }

	let distanceToTravelX = chosenDestination.x - player.position.x;
	let distanceToTravelY = chosenDestination.y - player.position.y;
	let distance = Math.sqrt(distanceToTravelX ** 2 + distanceToTravelY ** 2);

	// Check if the sprite is at the destination or close enough to stop
	if (distance <= speed) {
		// Snap the position exactly to the chosen destination to prevent overshooting
		player.position = chosenDestination.duplicate();
		return 0; // Return 0 to indicate the sprite has arrived
	} else {
		// Normalize the direction vector
		let normalizedX = distanceToTravelX / distance;
		let normalizedY = distanceToTravelY / distance;

		// Move the sprite towards the destination
		player.position.x += normalizedX * speed;
		player.position.y += normalizedY * speed;

		// Recalculate the remaining distance
		distanceToTravelX = chosenDestination.x - player.position.x;
		distanceToTravelY = chosenDestination.y - player.position.y;
		distance = Math.sqrt(distanceToTravelX ** 2 + distanceToTravelY ** 2);
  } 
	return distance; // Return the updated distance
}


/**
 * Compute and attach a predicted position to the given player assuming they
 * continue moving toward their current destination at their current speed.
 * This function does not mutate server state; it only attaches `predictedPosition`
 * and `predictedAt` to the player object on the client for interpolation.
 *
 * Assumptions:
 * - `player.speed` is the per-tick movement amount (ticks per second defaults to 60).
 * - If `player.destinationPosition` is not set, the current position is used.
 *
 * Usage: call this immediately after processing `fetchGameData` updates for other
 * players (clients only). The render/move logic will use the attached prediction
 * for up to ~2500ms.
 */
export function setPredictedPosition(player: any, seconds = 2, ticksPerSecond = 60, speedOverride?: number) {
	if (!player || !player.position) return;
	if (!player.destinationPosition) {
		player.predictedPosition = player.position.duplicate();
		player.predictedAt = Date.now();
		return;
	}

	const speed = typeof speedOverride === 'number' ? speedOverride : (player.speed ?? 0);
	const steps = Math.max(0, Math.floor(seconds * ticksPerSecond));
	let pos = player.position.duplicate();
	const dest = player.destinationPosition.duplicate();

	for (let i = 0; i < steps; i++) {
		const dx = dest.x - pos.x;
		const dy = dest.y - pos.y;
		const dist = Math.sqrt(dx * dx + dy * dy);
		if (dist <= speed || dist === 0) {
			pos = dest.duplicate();
			break;
		}
		pos.x += (dx / dist) * speed;
		pos.y += (dy / dist) * speed;
	}

	player.predictedPosition = pos;
	player.predictedAt = Date.now();
}

export function clearPredictedPosition(player: any) {
	if (!player) return;
	delete (player as any).predictedPosition;
	delete (player as any).predictedAt;
}

/**
 * When a server authoritative position arrives that differs from the client's
 * predicted position, call this to smoothly interpolate the client display
 * from the current displayed position to the server position.
 *
 * - `durationMs` controls how long the interpolation takes. Use small values
 *   like 150-300.
 */
export function applyServerCorrection(player: any, serverPosition: Vector2, durationMs = 200) {
	if (!player || !player.position || !serverPosition) return;
	// If the divergence is tiny, snap and clear prediction
	try {
		const dx = serverPosition.x - ((player as any).predictedPosition?.x ?? player.position.x);
		const dy = serverPosition.y - ((player as any).predictedPosition?.y ?? player.position.y);
		const dist = Math.sqrt(dx * dx + dy * dy);
		const snapThreshold = gridCells(1) * 1.5;
		if (dist <= snapThreshold) {
			player.position = serverPosition.duplicate();
			clearPredictedPosition(player);
			// clear any in-flight correction
			delete (player as any).correctionTarget;
			delete (player as any).correctionStart;
			delete (player as any).correctionStartAt;
			delete (player as any).correctionDuration;
			return;
		}
	} catch {
		// ignore and fall back to interpolation
	}

	// Begin interpolation from current displayed position to authoritative position
	(player as any).correctionStart = player.position.duplicate();
	(player as any).correctionTarget = serverPosition.duplicate();
	(player as any).correctionStartAt = Date.now();
	(player as any).correctionDuration = durationMs;
	// prediction should be ignored while we correct
	clearPredictedPosition(player);
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
      if (!player.targeting && player.lastAttack?.getTime() + 500 < new Date().getTime()) {
        player.body.animations?.play("stand" + player.facingDirection.charAt(0) + player.facingDirection.substring(1, player.facingDirection.length).toLowerCase());
      } else if (player.targeting && player.lastAttack && player.lastAttack.getTime() + 500 >= new Date().getTime()) {
        player.body.animations?.play("attack" + player.facingDirection.charAt(0) + player.facingDirection.substring(1).toLowerCase());
      }
    } 
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
	if (shouldResetSlope(player)) { 
		return resetSlope(player, false);
	}

	const preScale = player.scale.duplicate();
	scaleWithStep(player, preScale); 
	let forceResetSlope = isSlopeResetFromEndScale(player);

	if (forceResetSlope) { 
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
}

export function setAnimationToStandAfterTimeElapsed(player: any) {
	setTimeout(() => {
		const currentTime = new Date().getTime();
		if (currentTime - player.lastStandAnimationTime >= 300) {
      if (player.destinationPosition.matches(player.position)) {
        if (player.targeting) return; 
				player.body.animations?.play(
					"stand" + player.facingDirection.charAt(0) +
					player.facingDirection.substring(1, player.facingDirection.length).toLowerCase()
				);
			}
			player.lastStandAnimationTime = currentTime; // Update the last time it was run
		}
	}, (player.isUserControlled ? 1000 : 1500));
}
  
export function isObjectNearby(playerOrObject: any) {
	const basePosition = playerOrObject.position;
	const neighborPosition =
		playerOrObject.facingDirection && typeof playerOrObject.position.toNeighbour === 'function'
			? basePosition.toNeighbour(playerOrObject.facingDirection)
			: basePosition;

	// Define the discrepancy value
	const discrepancy = 1;

	// Get nearby objects - check both base position and neighbor position
	const possibilities = playerOrObject.parent?.children?.filter((child: GameObject) => {
		// Check if child is at either base position or neighbor position
		const isAtBasePosition = child.name != playerOrObject.name &&
			child.position.x >= basePosition.x - discrepancy &&
			child.position.x <= basePosition.x + discrepancy &&
			child.position.y >= basePosition.y - discrepancy &&
			child.position.y <= basePosition.y + discrepancy;

		const isAtNeighborPosition =
			child.position.x >= neighborPosition.x - discrepancy &&
			child.position.x <= neighborPosition.x + discrepancy &&
			child.position.y >= neighborPosition.y - discrepancy &&
			child.position.y <= neighborPosition.y + discrepancy;

		return (
			(!(child instanceof Sprite) || child.textContent) &&
			(isAtBasePosition || isAtNeighborPosition)
		);
	}) ?? [];
 
	// Prioritize items to pickup
	const bestChoiceItem = possibilities.find((x: any) => x.itemLabel);
	if (bestChoiceItem) return bestChoiceItem;

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


