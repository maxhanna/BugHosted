
import { Injectable } from '@angular/core';
import { CanDeactivate } from '@angular/router'; 
import { Emulator1Component } from '../app/emulator-1/emulator-1.component';

@Injectable({ providedIn: 'root' })
export class EmulatorCanDeactivateGuard implements CanDeactivate<Emulator1Component> {
  async canDeactivate(component: Emulator1Component): Promise<boolean> {
    // If nothing running, allow
    if (!component.romName || !component.parentRef?.user?.id) return true;

    const shouldSave = window.confirm('Save emulator state before leaving?');
    if (!shouldSave) return true;

    // Block navigation until save completes (or times out)
    const ok = await component['flushSavesBeforeExit'](20000);
    return ok || window.confirm('Save did not finish. Leave anyway?');
  }
}
