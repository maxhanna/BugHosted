// Each function receives the component instance as `ctx` and the event.
export function onKeyDown(ctx: any, e: KeyboardEvent, userId: number): void {
  if (ctx.showChatPrompt) {
    if (e.code === 'Escape') {
      ctx.closePanel('chat');
    }
    return;
  } 

  // If user is in typing mode (renaming bonfire/chest), don't handle any hotkeys
  if (ctx.isTypingMode) {
    return;
  }

  // If bonfire or chest panel is open, allow Escape to close them, block other keys
  if (ctx.showBonfirePanel || ctx.showChestPanel) {
    if (e.code === 'Escape') {
      ctx.closePanel(ctx.showBonfirePanel ? 'bonfire' : 'chest');
    }
    return;
  }

  // Open chat on Enter and focus the prompt input (keyboard users)
  if (e.code === 'Enter') {
    if (!ctx.showInventory && !ctx.showCrafting) {
      ctx.showChatPrompt = true;
      ctx.exitPointerLock();
      setTimeout(() => { 
        try { ctx.chatPrompt?.focusInput(); } 
        catch (err) {} 
      }, 50);
      e.preventDefault();
    }
    return;
  }
  ctx.keys.add(e.code);
  if (e.code === 'Space' && !ctx.showInventory && !ctx.showCrafting) {
    ctx.handleSpaceBar(e);
  }
  if (e.code === 'KeyE') { 
    ctx.openPanel('inventory');  
  }
  if (e.code === 'KeyF') { 
    ctx.toggleLeftHand(169); // TORCH
  }
  if (e.code === 'KeyB') { 
    ctx.toggleLeftHand(172); // SHIELD
  }
  if (e.code === 'KeyC') {
    ctx.openPanel('crafting', undefined, 'general');  
  }
  // Additional hotkeys for menus (useful on mobile where pointer is captured)
  if (e.code === 'KeyP') { 
    ctx.openPanel('players'); 
  }
  if (e.code === 'KeyM') {
    ctx.openPanel('menu'); 
  }
  if (e.code === 'KeyO') { 
    ctx.openPanel('world'); 
  }
  if (e.code === 'KeyL' && !userId) {
    // toggle login prompt (parent overlay may be needed by host)
    ctx.isShowingLoginPanel = !ctx.isShowingLoginPanel;
    if (ctx.isShowingLoginPanel && ctx.pointerLocked && ctx.exitPointerLock) {
      ctx.exitPointerLock(); 
    } 
  }
  if (e.code === 'Escape') {
    ctx.closeAllPanels();
  }
  if (e.code.startsWith('Digit')) {
    const n = parseInt(e.code.replace('Digit', ''), 10);
    if (n >= 1 && n <= 9) ctx.selectedSlot = n - 1;
  }

}

export function onKeyUp(ctx: any, e: KeyboardEvent): void {
  ctx.keys.delete(e.code);
}

export function onMouseWheel(ctx: any, e: WheelEvent): void {
  if (ctx.onMobile()) return; // Only enable wheel on desktop

  // If any UI panel is open, allow the default scroll behavior to occur
  // (do not intercept wheel events for hotbar cycling).
  if (ctx.showInventory || ctx.showCrafting || ctx.showChatPrompt || ctx.showBonfirePanel || ctx.showChestPanel || ctx.showPlayersPanel || ctx.showWorldPanel || ctx.isMenuPanelOpen) {
    return;
  }

  const direction = e.deltaY > 0 ? 1 : -1;
  // Cycle through hotbar slots (0-8)
  ctx.selectedSlot = (ctx.selectedSlot + direction + 9) % 9;

  // Prevent default to avoid page scrolling when handling hotbar cycle
  e.preventDefault();
}

export function onMouseMove(ctx: any, e: MouseEvent): void {
  if (!ctx.pointerLocked || ctx.showBonfirePanel || ctx.showChestPanel) return;
  const sens = 0.002 * ((ctx.mouseSensitivity ?? 10) / 10);
  // If in third-person/orbit mode, update the orbit angles instead of the player view
  if (ctx.thirdPerson) {
    ctx.thirdPersonYaw = (ctx.thirdPersonYaw ?? 0) - e.movementX * sens;
    ctx.thirdPersonPitch = (ctx.thirdPersonPitch ?? 0) - e.movementY * sens;
    ctx.thirdPersonPitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, ctx.thirdPersonPitch));
  } else {
    ctx.yaw -= e.movementX * sens;
    ctx.pitch -= e.movementY * sens;
    ctx.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, ctx.pitch));
  }
}

export function onMouseDown(ctx: any, e: MouseEvent): void {
  // Prevent context menu on right click  
  if (e.button === 2) { try { e.preventDefault(); e.stopPropagation(); } catch { } }
  if (ctx.showInventory || ctx.showCrafting || ctx.showChatPrompt || ctx.showBonfirePanel || ctx.showChestPanel || ctx.showPlayersPanel || ctx.showWorldPanel) return;
  const canvas = ctx.canvasRef?.nativeElement;
  try { console.debug('[digcraft-input] onMouseDown', { button: e.button, pointerLockElement: document.pointerLockElement ? (document.pointerLockElement as any).tagName : null, canvas }); } catch (err) { }
  if (!canvas) return;
  if (!document.pointerLockElement) {
    canvas.requestPointerLock();
    return;
  }
  // Middle mouse: toggle third-person/orbit look (when pointer locked)
  if (e.button === 1) {
    try { e.preventDefault(); e.stopPropagation(); } catch { }
    try { if (ctx.toggleThirdPerson) ctx.toggleThirdPerson(); } catch { }
    return;
  }
  if (e.button === 0) {
    // First click - execute immediately
    ctx.handleLeftClick(e);
    // Start interval for holding (repeat every 500ms)
    if (ctx.leftClickHoldInterval) clearInterval(ctx.leftClickHoldInterval);
    ctx.leftClickHoldInterval = setInterval(() => {
      ctx.handleLeftClick(e);
    }, ctx.HOLD_INTERVAL_MS || 500);
    return;  
  }
  if (e.button === 2) {
    try { e.preventDefault(); e.stopPropagation(); } catch { }
    // If player has an item in left hand, use right-click to block/defend instead of placing
    if (ctx.leftHand && ctx.leftHand > 0) {
      try { ctx.handleBlock(e); } catch { }
      // No repeat interval required for blocking; release handled in onMouseUp
      return;
    }

    // First click - execute immediately (normal right-click behavior)
    ctx.handleRightClick(e);
    // Start interval for holding (repeat every 500ms)
    if (ctx.rightClickHoldInterval) clearInterval(ctx.rightClickHoldInterval);
    ctx.rightClickHoldInterval = setInterval(() => {
      ctx.handleRightClick(e);
    }, ctx.HOLD_INTERVAL_MS || 500);
    return;
  }
}

// Handler for mouse up to stop the holding intervals
export function onMouseUp(ctx: any, e: MouseEvent): void {
  if (e.button === 0) {
    // Stop left click hold interval
    if (ctx.leftClickHoldInterval) {
      clearInterval(ctx.leftClickHoldInterval);
      ctx.leftClickHoldInterval = null;
    }
  }
  if (e.button === 2) {
    // Stop right click hold interval
    if (ctx.rightClickHoldInterval) {
      clearInterval(ctx.rightClickHoldInterval);
      ctx.rightClickHoldInterval = null;
    }
    // If left hand was equipped, releasing right mouse ends blocking
    try {
      if (ctx.leftHand && ctx.leftHand > 0) ctx.handleBlockRelease();
    } catch { }
  }
} 

export function onPointerLockChange(ctx: any): void {
  ctx.pointerLocked = document.pointerLockElement === ctx.canvasRef?.nativeElement;
  try { console.debug('[digcraft-input] pointerLockChange', { locked: ctx.pointerLocked, pointerLockElement: document.pointerLockElement, canvasRef: ctx.canvasRef?.nativeElement }); } catch (err) { }
}

export function onTouchStart(ctx: any, e: TouchEvent): void {
  if (ctx.showInventory || ctx.showCrafting || ctx.showChatPrompt || ctx.showBonfirePanel || ctx.showChestPanel) return;
  const canvas = ctx.canvasRef?.nativeElement;
  if (!canvas) return;
  const joystickRect = ctx.joystickRef?.nativeElement?.getBoundingClientRect?.();

  // Decide per-touch whether it targets the canvas area (game) or a UI overlay.
  // We treat touches that hit the actual canvas element or the joystick overlay
  // as in-game touches and capture them; other overlays (hotbar, inventory buttons)
  // should remain interactive and not be prevented.
  let anyCaptured = false;
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    const el = document.elementFromPoint(t.clientX, t.clientY) as Element | null;
    let isGameTouch = false;
    if (el === canvas) {
      isGameTouch = true;
    } else if (el && el.closest && el.closest('.joystick')) {
      // joystick overlay should be treated as game input
      isGameTouch = true;
    }
    if (isGameTouch) { anyCaptured = true; }
  }

  if (!anyCaptured) return;

  // prevent scrolling / default gestures for captured touches
  e.preventDefault();
  // mark that a touch sequence started on the canvas so move/look handlers run
  ctx.touchStartedOnCanvas = true;

  // For each changed touch, assign roles (joystick / move / look) using elementFromPoint
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    const el = document.elementFromPoint(t.clientX, t.clientY) as Element | null;
    const hitJoystick = el && el.closest && el.closest('.joystick');
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    if (hitJoystick && ctx.touchMoveId === null && joystickRect) {
      ctx.touchMoveId = t.identifier;
      ctx.touchStartX = joystickRect.left + joystickRect.width / 2;
      ctx.touchStartY = joystickRect.top + joystickRect.height / 2;
      ctx.touchMoveX = 0;
      ctx.touchMoveY = 0;
      ctx.touchStartedOnJoystick = true;
    } else if ((el === canvas) && t.clientX < (canvas.getBoundingClientRect().left + w / 2) && t.clientY > (canvas.getBoundingClientRect().top + h / 2) && ctx.touchMoveId === null) {
      // bottom-left region of the canvas starts movement by default
      ctx.touchMoveId = t.identifier;
      ctx.touchStartX = t.clientX;
      ctx.touchStartY = t.clientY;
      ctx.touchMoveX = 0;
      ctx.touchMoveY = 0;
      ctx.touchStartedOnJoystick = true;
    } else if (ctx.touchLookId === null && (el === canvas || hitJoystick)) {
      // assign remaining captured touch as look control
      ctx.touchLookId = t.identifier;
      ctx.touchLookStartX = t.clientX;
      ctx.touchLookStartY = t.clientY;
    }
  }
}

export function onTouchMove(ctx: any, e: TouchEvent): void {
  if (ctx.showInventory || ctx.showCrafting || ctx.showChatPrompt || !ctx.touchStartedOnCanvas || ctx.showBonfirePanel || ctx.showChestPanel) return;
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
    if (t.identifier === ctx.touchLookId && !ctx.showBonfirePanel && !ctx.showChestPanel) {
      const dx = t.clientX - ctx.touchLookStartX;
      const dy = t.clientY - ctx.touchLookStartY;
      ctx.touchLookStartX = t.clientX;
      ctx.touchLookStartY = t.clientY;
      const sens = 0.005 * ((ctx.mouseSensitivity ?? 10) / 10);
      ctx.yaw -= dx * sens;
      ctx.pitch -= dy * sens;
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
