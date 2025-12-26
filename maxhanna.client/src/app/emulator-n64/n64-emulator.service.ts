import { Injectable } from '@angular/core';
import createMupen64PlusWeb, { putSaveFile, getAllSaveFiles } from 'mupen64plus-web';

/**
 * Lightweight wrapper service for a dynamic `n64-wasm` integration.
 *
 * Notes:
 * - This service attempts a dynamic `import('n64-wasm')` at runtime. If you prefer an
 *   explicit install, run `npm install n64-wasm` and your bundler will include it.
 * - The `n64-wasm` package API may differ from what this wrapper expects; this is a
 *   best-effort adapter that looks for common entry points. You may need to adapt
 *   `createEmulator`/`runRom` calls to match the exact library API.
 */
@Injectable({ providedIn: 'root' })
export class N64EmulatorService {
  private engine: any = null;
  private emuInstance: any = null;
  // mupen64plus-web exposes a factory that creates the emulator given module
  // arguments. We'll call that factory directly from `bootRom`.

  /**
   * Boot the ROM buffer on the provided canvas. Returns an instance with stop/pause methods when available.
   */
  async bootRom(romBuffer: ArrayBuffer, canvas: HTMLCanvasElement, options: any = {}): Promise<any> {
    // Use mupen64plus-web's factory to create the emulator instance.
    if (!canvas) throw new Error('Canvas element required for booting ROM');

    // Ensure canvas element is provided to mupen64plus-web via `canvas` arg
    const romData = new Int8Array(romBuffer);

    const moduleArgs: any = {
      canvas: canvas,
      romData: romData,
      coreConfig: options.coreConfig ?? {},
      netplayConfig: options.netplayConfig ?? {},
    };

    // createMupen64PlusWeb resolves to an EmulatorControls object
    try {
      const controls = await createMupen64PlusWeb(moduleArgs);
      this.emuInstance = controls;
      // start the emulator loop
      if (this.emuInstance && typeof this.emuInstance.start === 'function') {
        await this.emuInstance.start();
      }
      return this.emuInstance;
    } catch (err) {
      console.error('Failed to initialize mupen64plus-web emulator', err);
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.emuInstance) {
      if (typeof this.emuInstance.stop === 'function') {
        await this.emuInstance.stop();
      }
      this.emuInstance = null;
    }
  }

  async pause(): Promise<void> {
    if (this.emuInstance && typeof this.emuInstance.pause === 'function') {
      await this.emuInstance.pause();
    }
  }

  async resume(): Promise<void> {
    if (this.emuInstance && typeof this.emuInstance.resume === 'function') {
      await this.emuInstance.resume();
    }
  }

  async putSave(fileName: string, buffer: ArrayBuffer) {
    return putSaveFile(fileName, buffer);
  }

  async listSaves() {
    return getAllSaveFiles();
  }
}
