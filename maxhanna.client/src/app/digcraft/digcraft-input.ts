// Exported input and joystick handlers for DigCraftComponent.

import { User } from "../../services/datacontracts/user/user";

// Each function receives the component instance as `ctx` and the event.
export function onKeyDown(ctx: any, e: KeyboardEvent, userId: number): void {
  if (ctx.showChatPrompt) {
    if (e.code === 'Escape') ctx.showChatPrompt = false;
    return;
  } 

  // Open chat on Enter and focus the prompt input (keyboard users)
  if (e.code === 'Enter') {
    if (!ctx.showInventory && !ctx.showCrafting) {
      ctx.showChatPrompt = true;
      if (ctx.pointerLocked) document.exitPointerLock();
      setTimeout(() => { try { ctx.chatPrompt?.focusInput(); } catch (err) {} }, 50);
      e.preventDefault();
    }
    return;
  }
  ctx.keys.add(e.code);
  if (e.code === 'Space' && ctx.onGround && !ctx.showInventory && !ctx.showCrafting) {
    ctx.velY = 7;
    ctx.onGround = false;
  }
  if (e.code === 'KeyE') {
    ctx.showInventory = !ctx.showInventory;
    ctx.showCrafting = false;
    if (ctx.showInventory && ctx.pointerLocked) document.exitPointerLock();
  }
  if (e.code === 'KeyC') {
    ctx.showCrafting = !ctx.showCrafting;
    ctx.showInventory = false;
    if (ctx.showCrafting) {
      if (typeof ctx.updateAvailableRecipes === 'function') ctx.updateAvailableRecipes();
      if (ctx.pointerLocked) document.exitPointerLock();
    }
  }
  // Additional hotkeys for menus (useful on mobile where pointer is captured)
  if (e.code === 'KeyP') {
    ctx.showPlayersPanel = !ctx.showPlayersPanel;
    if (ctx.showPlayersPanel && ctx.pointerLocked) document.exitPointerLock();
  }
  if (e.code === 'KeyM') {
    ctx.isMenuPanelOpen = !ctx.isMenuPanelOpen;
    if (ctx.isMenuPanelOpen && ctx.pointerLocked) document.exitPointerLock();
  }
  if (e.code === 'KeyO') {
    ctx.showWorldPanel = !ctx.showWorldPanel;
    if (ctx.showWorldPanel && ctx.pointerLocked) document.exitPointerLock();
  }
  if (e.code === 'KeyL' && !userId) {
    // toggle login prompt (parent overlay may be needed by host)
    ctx.isShowingLoginPanel = !ctx.isShowingLoginPanel;
    if (ctx.isShowingLoginPanel && ctx.pointerLocked) document.exitPointerLock();
  }
  if (e.code === 'Escape') {
    ctx.showInventory = false;
    ctx.showCrafting = false;
    ctx.showPlayersPanel = false;
    ctx.isMenuPanelOpen = false;
  }
  if (e.code.startsWith('Digit')) {
    const n = parseInt(e.code.replace('Digit', ''), 10);
    if (n >= 1 && n <= 9) ctx.selectedSlot = n - 1;
  }
}

export function onKeyUp(ctx: any, e: KeyboardEvent): void {
  ctx.keys.delete(e.code);
}

export function onMouseMove(ctx: any, e: MouseEvent): void {
  if (!ctx.pointerLocked) return;
  const sens = 0.002;
  ctx.yaw -= e.movementX * sens;
  ctx.pitch -= e.movementY * sens;
  ctx.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, ctx.pitch));
}

export function onMouseDown(ctx: any, e: MouseEvent): void {
  if (!ctx.pointerLocked) {
    ctx.canvasRef?.nativeElement?.requestPointerLock();
    return;
  }
  if (e.button === 0) {
    // trigger local swing animation if equipped weapon is a sword/pickaxe
    try { if (typeof ctx.triggerSwing === 'function') ctx.triggerSwing(); } catch (err) {}
    ctx.breakBlock();
  }
  if (e.button === 2) {
    try { if (typeof ctx.handleRightClick === 'function') { ctx.handleRightClick(e); return; } } catch (err) {}
    ctx.placeBlock();
  }
}

export function onPointerLockChange(ctx: any): void {
  ctx.pointerLocked = document.pointerLockElement === ctx.canvasRef?.nativeElement;
}

export function onTouchStart(ctx: any, e: TouchEvent): void {
  if (ctx.showInventory || ctx.showCrafting || ctx.showChatPrompt) return;
  const canvas = ctx.canvasRef?.nativeElement;
  if (!canvas) return;
  const canvasRect = canvas.getBoundingClientRect();
  // Only handle touches that start inside the game canvas. This avoids
  // preventing default behavior for UI elements (title bar, buttons) that
  // live outside the canvas and should remain interactive on mobile.
  let anyInCanvas = false;
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (t.clientX >= canvasRect.left && t.clientX <= canvasRect.right && t.clientY >= canvasRect.top && t.clientY <= canvasRect.bottom) {
      anyInCanvas = true; break;
    }
  }
  if (!anyInCanvas) return;
  e.preventDefault();
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const joystickRect = ctx.joystickRef?.nativeElement?.getBoundingClientRect();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (
      joystickRect &&
      t.clientX >= joystickRect.left &&
      t.clientX <= joystickRect.right &&
      t.clientY >= joystickRect.top &&
      t.clientY <= joystickRect.bottom &&
      ctx.touchMoveId === null
    ) {
      ctx.touchMoveId = t.identifier;
      ctx.touchStartX = joystickRect.left + joystickRect.width / 2;
      ctx.touchStartY = joystickRect.top + joystickRect.height / 2;
      ctx.touchMoveX = 0;
      ctx.touchMoveY = 0;
      ctx.touchStartedOnJoystick = true;
    } else if (t.clientX < (canvasRect.left + w / 2) && t.clientY > (canvasRect.top + h / 2) && ctx.touchMoveId === null) {
      ctx.touchMoveId = t.identifier;
      ctx.touchStartX = t.clientX;
      ctx.touchStartY = t.clientY;
      ctx.touchMoveX = 0;
      ctx.touchMoveY = 0;
      ctx.touchStartedOnJoystick = true;
    } else if (ctx.touchLookId === null) {
      ctx.touchLookId = t.identifier;
      ctx.touchLookStartX = t.clientX;
      ctx.touchLookStartY = t.clientY;
    }
  }
}

export function onTouchMove(ctx: any, e: TouchEvent): void {
  if (ctx.showInventory || ctx.showCrafting || ctx.showChatPrompt || !ctx.touchStartedOnCanvas) return;
  e.preventDefault();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (t.identifier === ctx.touchMoveId) {
      const dx = t.clientX - ctx.touchStartX;
      const dy = t.clientY - ctx.touchStartY;
      const deadzone = ctx.touchStartedOnJoystick ? 8 : 15;
      ctx.touchMoveX = Math.abs(dx) > deadzone ? Math.sign(dx) * Math.min(Math.abs(dx) / 60, 1) : 0;
      ctx.touchMoveY = Math.abs(dy) > deadzone ? -Math.sign(dy) * Math.min(Math.abs(dy) / 60, 1) : 0;
    }
    if (t.identifier === ctx.touchLookId) {
      const dx = t.clientX - ctx.touchLookStartX;
      const dy = t.clientY - ctx.touchLookStartY;
      ctx.touchLookStartX = t.clientX;
      ctx.touchLookStartY = t.clientY;
      ctx.yaw -= dx * 0.005;
      ctx.pitch -= dy * 0.005;
      ctx.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, ctx.pitch));
    }
  }
}

export function onTouchEnd(ctx: any, e: TouchEvent): void {
  if (!ctx.touchStartedOnCanvas) return;
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (t.identifier === ctx.touchMoveId) {
      ctx.touchMoveId = null;
      ctx.touchMoveX = 0;
      ctx.touchMoveY = 0;
      ctx.touchStartedOnJoystick = false;
    }
    if (t.identifier === ctx.touchLookId) {
      ctx.touchLookId = null;
    }
  }
  // If no touch IDs remain, clear the canvas-start flag so future UI touches work.
  if (ctx.touchMoveId === null && ctx.touchLookId === null) ctx.touchStartedOnCanvas = false;
}

export function getJoystickKnobTransform(ctx: any): string {
  const maxPx = 28; // max distance knob moves from center
  const x = (ctx.touchMoveX || 0) * maxPx;
  const y = -(ctx.touchMoveY || 0) * maxPx; // invert Y for visual coordinates
  return `translate(-50%,-50%) translate(${x}px, ${y}px)`;
}

export function requestPointerLock(ctx: any): void {
  ctx.canvasRef?.nativeElement?.requestPointerLock();
}
