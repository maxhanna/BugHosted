import { Injectable } from '@angular/core';

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

  async loadEngine(): Promise<any> {
    if (this.engine) return this.engine;

    // Prefer the bundled external dist (cloned repo) if available. This will load
    // the project's `script.js` which sets up `window.myApp` and will append the
    // Emscripten-generated `n64wasm.js` dynamically.
    if ((window as any).myApp) {
      this.engine = (window as any).myApp;
      return this.engine;
    }

    // Attempt to load the dist script from the cloned external folder.
    const scriptUrl = '/assets/n64wasm/script.js';
    await new Promise<void>((resolve, reject) => {
      // If myApp becomes available before script load, resolve immediately
      if ((window as any).myApp) return resolve();
      const s = document.createElement('script');
      s.src = scriptUrl;
      s.onload = () => {
        // small timeout to allow the script to initialize myApp
        setTimeout(() => {
          if ((window as any).myApp) return resolve();
          // myApp not present yet; still resolve and let bootRom retry
          return resolve();
        }, 50);
      };
      s.onerror = (err) => reject(new Error('Failed loading n64 dist script: ' + scriptUrl));
      document.getElementsByTagName('head')[0].appendChild(s);
    }).catch((ex) => {
      // If loading the dist script failed, fall back to checking for globals
      console.warn(ex);
    });

    if ((window as any).myApp) {
      this.engine = (window as any).myApp;
      return this.engine;
    }

    // Final fallback: if a module named `n64-wasm` is installed as an npm package,
    // try dynamic import. This will usually fail for this repo but keeps compatibility.
    try {
      // Use a normal dynamic import so the bundler will include `n64-wasm`
      // when it is installed in `package.json`.
      const mod = await import('n64-wasm');
      this.engine = mod?.default ?? mod;
      return this.engine;
    } catch (e) {
      throw new Error('n64-wasm not available: include the dist build (external/N64Wasm/dist) or install an npm distribution.');
    }
  }

  /**
   * Boot the ROM buffer on the provided canvas. Returns an instance with stop/pause methods when available.
   */
  async bootRom(romBuffer: ArrayBuffer, canvas: HTMLCanvasElement, options: any = {}): Promise<any> {
    // First ensure the dist script (which creates window.myApp) is loaded.
    const engine = await this.loadEngine();

    // The external dist in this repo exposes a `myApp` instance with a `LoadEmulator` method
    // which accepts a byte array. That code expects a canvas with id 'canvas' to exist.
    if ((window as any).myApp && typeof (window as any).myApp.LoadEmulator === 'function') {
      // Ensure the canvas has id 'canvas' so the dist script can find it
      if (canvas.id !== 'canvas') canvas.id = 'canvas';

      // Convert buffer to Uint8Array (the dist code expects a byte array)
      const byteArray = new Uint8Array(romBuffer);

      // Call the high-level loader provided by the dist scripts
      await (window as any).myApp.LoadEmulator(byteArray);
      this.emuInstance = (window as any).myApp;
      return this.emuInstance;
    }

    // If we reached here, try older/npm package APIs as a fallback
    if (engine) {
      if (typeof engine.createEmulator === 'function') {
        this.emuInstance = await engine.createEmulator({ canvas, rom: romBuffer, ...options });
        if (this.emuInstance && typeof this.emuInstance.start === 'function') {
          await this.emuInstance.start();
        }
        return this.emuInstance;
      }
      if (typeof engine.runRom === 'function') {
        this.emuInstance = await engine.runRom({ romBuffer, canvas, ...options });
        return this.emuInstance;
      }
    }

    throw new Error('No compatible N64 engine API available. Use the bundled dist in external/N64Wasm/dist or provide a compatible build.');
  }

  async stop(): Promise<void> {
    if (this.emuInstance) {
      if (typeof this.emuInstance.stop === 'function') {
        await this.emuInstance.stop();
      } else if (typeof this.emuInstance.destroy === 'function') {
        await this.emuInstance.destroy();
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
}
