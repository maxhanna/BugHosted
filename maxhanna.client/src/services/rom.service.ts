import { Injectable } from '@angular/core';


export interface N64StateUpload {
  userId: number;
  romName: string;
  filename: string;
  bytes: Uint8Array;
  startTimeMs?: number;
  saveTimeMs?: number;
  durationSeconds?: number;
}

export interface SaveUploadResponse {
  ok: boolean;
  status: number;
  body?: any;
  errorText?: string;
}

// shared contract (can live in a common contracts folder)
/** Keyed by (userId, romToken) */
export interface LastInputSelection {
  userId: number;
  romToken: string;
  mappingName?: string | null;
  gamepadId?: string | null;
  updatedAtMs?: number;
}


@Injectable({
  providedIn: 'root'
})
export class RomService {
  constructor() { }

  async getRomFile(rom: string, userId?: number, fileId?: number): Promise<Blob | null> {
    try {
      const response = await fetch(`/rom/getromfile/${encodeURIComponent(rom)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, FileId: fileId }),
      });

      return await response.blob();
    } catch (error) {
      return null;
    }
  }

  async getN64SaveByName(romName: string, userId: number): Promise<{ blob: Blob; fileName: string } | null> {
    const resp = await fetch(`/rom/getn64savebyname/${encodeURIComponent(romName)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userId)
    });
    if (!resp.ok) return null;

    const blob = await resp.blob();
    const cd = resp.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename\*?=(?:UTF-8''|")?([^";]+)"?/i);
    const fileName = m ? decodeURIComponent(m[1]) : `${romName.replace(/\.[^.]+$/, '')}.eep`; // fallback
    return { blob, fileName };
  }

  async uploadRomFile(userId: number, form: FormData) {
    form.append('userId', JSON.stringify(userId));

    try {
      const response = await fetch(`/rom/uploadrom/`, {
        method: 'POST',
        body: form,
      });

      return await response.json();
    } catch (error) {
      return null;
    }
  }

  getFileExtension(file: string) {
    return file.lastIndexOf('.') !== -1 ? file.split('.').pop() : null;
  }

  // Returns aggregate emulation stats for a user: { totalSeconds, topGameName, topGamePlays }
  async getUserEmulationStats(userId: number) {
    try {
      const res = await fetch(`/rom/userstats/${userId}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }
  // Returns breakdown per ROM: [{ romFileName, totalSeconds, plays }, ...]
  async getUserEmulationBreakdown(userId: number) {
    try {
      const res = await fetch(`/rom/usergamebreakdown/${userId}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  async getActivePlayers(minutes: number = 2) {
    try {
      const response = await fetch('/rom/activeplayers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(minutes)
      });
      if (!response.ok) return null;
      return await response.json(); // { count }
    } catch { return null; }
  }

  async getActiveN64Players(minutes: number = 2) {
    try {
      const response = await fetch('/rom/activen64players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(minutes)
      });
      if (!response.ok) return null;
      return await response.json(); // { count }
    } catch { return null; }
  }

  // Mapping persistence APIs
  async listMappings(userId: number) {
    try {
      const res = await fetch('/rom/getmappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userId)
      });
      if (!res.ok) return null;
      return await res.json(); // array of names
    } catch {
      return null;
    }
  }

  async getMapping(userId: number, name: string) {
    try {
      const req = { UserId: userId, Name: name };
      const res = await fetch('/rom/getmapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req)
      });
      if (!res.ok) return null;
      return await res.json(); // mapping object
    } catch {
      return null;
    }
  }

  async saveMapping(userId: number, name: string, mapping: any) {
    try {
      const req = { UserId: userId, Name: name, Mapping: mapping };
      const res = await fetch('/rom/savemapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req)
      });
      const status = res.status;
      if (!res.ok) {
        // return status and text for caller to inspect (e.g. 403 limit reached)
        const txt = await res.text();
        return { ok: false, status, text: txt };
      }
      const body = await res.json();
      return { ok: true, status, body };
    } catch {
      return null;
    }
  }

  async deleteMapping(userId: number, name: string) {
    try {
      const req = { UserId: userId, Name: name };
      const res = await fetch('/rom/deletemapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req)
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async getLastInputSelection(userId: number, romToken: string): Promise<LastInputSelection | null> {
    try {
      const req = { UserId: userId, RomToken: romToken };
      const res = await fetch('/rom/getlastinputselection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req)
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async saveLastInputSelection(payload: LastInputSelection): Promise<{ ok: boolean; status: number; text?: string }> {
    try {
      const res = await fetch('/rom/savelastinputselection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          UserId: payload.userId,
          RomToken: payload.romToken,
          MappingName: payload.mappingName ?? null,
          GamepadId: payload.gamepadId ?? null
        })
      });
      const status = res.status;
      if (!res.ok) {
        const text = await res.text().catch(() => undefined);
        return { ok: false, status, text };
      }
      return { ok: true, status };
    } catch (e: any) {
      return { ok: false, status: 0, text: String(e?.message ?? e) };
    }
  }

  /** Normalize input into a tight ArrayBuffer (no offset/extra bytes). */
  private toTightArrayBuffer(input: ArrayBuffer | ArrayBufferView): ArrayBuffer {
    if (input instanceof ArrayBuffer) return input;
    const view = input as ArrayBufferView;
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
  }

  async saveN64State(req: N64StateUpload): Promise<SaveUploadResponse> {
    const form = new FormData();
    // NOTE: req.romName must be provided by caller
    if (!(req as any).romName) {
      return { ok: false, status: 0, errorText: 'romName is required on N64StateUpload' };
    }

    const tightAb: ArrayBuffer = this.toTightArrayBuffer(req.bytes);
    form.append('file', new File([tightAb], req.filename, { type: 'application/octet-stream' }));
    form.append('userId', String(req.userId));
    form.append('romName', (req as any).romName as string); // typed as any to be drop-in safe
    form.append('filename', req.filename);

    if (typeof req.startTimeMs === 'number') form.append('startTimeMs', String(req.startTimeMs));
    if (typeof req.saveTimeMs === 'number') form.append('saveTimeMs', String(req.saveTimeMs));
    if (typeof req.durationSeconds === 'number') form.append('durationSeconds', String(req.durationSeconds));

    try {
      const res = await fetch(`/rom/saven64state`, { method: 'POST', body: form });
      const status = res.status;
      const ct = (res.headers.get('content-type') || '').toLowerCase();

      const readAsText = async () => await res.text();
      const readAsJson = async () => { try { return await res.json(); } catch { return null; } };

      if (!res.ok) {
        const errorBody = ct.includes('application/json') ? await readAsJson() : await readAsText();
        const errorText = typeof errorBody === 'string' ? errorBody : JSON.stringify(errorBody ?? { error: 'Upload failed' });
        return { ok: false, status, errorText };
      }

      const body = ct.includes('application/json') ? await readAsJson() : await readAsText();
      return { ok: true, status, body };
    } catch (error: any) {
      return { ok: false, status: 0, errorText: String(error?.message ?? error) };
    }
  }

  guessSystemFromFileName(fileName: string): string | undefined {
    if (!fileName) return undefined;
    const name = fileName.toLowerCase();

    // Clear indicators for specific systems
    if (name.includes('playstation') || name.includes('ps1') || name.includes('psx') || name.includes('scph') || name.includes('sony')) {
      return 'ps1';
    }
    if (name.includes('segacd') || name.includes('sega cd') || (name.includes('cd') && name.includes('sega'))) {
      return 'genesis';
    }
    if (name.includes('saturn') || name.includes('[ss]') || name.includes('segasaturn')) {
      return 'saturn';
    }
    if (name.includes('dreamcast') || name.includes('[dc]') || name.includes('sega-dreamcast') || name.includes('[gdi]') || name.includes('[cdr]')) {
      return 'dreamcast';
    }
    if (name.includes('turbo') || name.includes('tgcd') || name.includes('pcengine') || name.includes('pc-engine') || name.includes('hu-card') || name.includes('huc')) {
      return 'tgcd';
    }
    // If the filename contains common PlayStation cues (CUE for bin/cue pair)
    if (name.endsWith('.cue') || name.includes('.cue') || name.includes('cue')) {
      return 'ps1';
    }

    // Default: assume PlayStation (PSX) for generic .bin files
    return 'ps1';
  }
  /** Ensure bytes become a tight, real ArrayBuffer (never SharedArrayBuffer). */
  private toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const buf = bytes.buffer;

    if (buf instanceof ArrayBuffer) {
      // Tight slice of the view
      return buf.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }

    // If SharedArrayBuffer (or other ArrayBufferLike), copy to a new ArrayBuffer
    const copy = Uint8Array.from(bytes);
    return copy.buffer; // ArrayBuffer
  }

  private supportsCompressionStreams(): boolean {
    return typeof (window as any).CompressionStream !== 'undefined';
  }

  private async gzip(input: Uint8Array): Promise<Uint8Array> {
    const cs = new CompressionStream('gzip');
    const stream = new Blob([this.toArrayBuffer(input)]).stream().pipeThrough(cs);
    const ab = await new Response(stream).arrayBuffer();
    return new Uint8Array(ab);
  }

  private async gunzip(input: Uint8Array): Promise<Uint8Array> {
    const ds = new DecompressionStream('gzip');

    // Convert to real ArrayBuffer so BlobPart typing stays happy
    const stream = new Blob([this.toArrayBuffer(input)]).stream().pipeThrough(ds);

    const ab = await new Response(stream).arrayBuffer();
    return new Uint8Array(ab);
  }

  async saveEmulatorJSState(
    romName: string,
    userId: number,
    stateData: Uint8Array
  ): Promise<SaveUploadResponse> {

    const originalSize = stateData.length;
    let bytesToUpload = stateData;
    let encoding: 'gzip' | 'identity' = 'identity';

    // Aggressively compress anything > 100 KB (N64 states love gzip)
    if (originalSize > 100 * 1024 && this.supportsCompressionStreams()) {
      try {
        const gzipped = await this.gzip(stateData);
        if (gzipped.length < originalSize * 0.92) {   // 8%+ savings = worth it
          bytesToUpload = gzipped;
          encoding = 'gzip';
          console.log(`[EJS] Gzipped ${originalSize} → ${gzipped.length} bytes (${Math.round((1 - gzipped.length / originalSize) * 100)}% saved)`);
        }
      } catch (e) {
        console.warn('[EJS] Gzip failed, sending raw', e);
      }
    }

    const form = new FormData();
    const ab = this.toTightArrayBuffer(bytesToUpload);

    form.append('file', new File([ab], encoding === 'gzip' ? 'state.gz' : 'state.bin', {
      type: encoding === 'gzip' ? 'application/gzip' : 'application/octet-stream'
    }));

    form.append('userId', String(userId));
    form.append('romName', romName);
    form.append('encoding', encoding);
    form.append('originalSize', String(originalSize));

    try {
      const res = await fetch('/rom/saveemulatorjsstate', {
        method: 'POST',
        body: form,
        // keepalive only for small saves (browser limits)
        keepalive: originalSize < 512 * 1024
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Upload failed');
        return { ok: false, status: res.status, errorText };
      }

      const body = await res.json().catch(() => ({}));
      return { ok: true, status: res.status, body };
    } catch (error: any) {
      return { ok: false, status: 0, errorText: error?.message ?? String(error) };
    }
  }

  async getEmulatorJSSaveState(romName: string, userId: number): Promise<Blob | null> {
    try {
      const response = await fetch(`/rom/getemulatorjssavestate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ UserId: userId, RomName: romName }),
      });

      if (!response.ok) return null;

      const enc = (response.headers.get('X-EJS-Encoding') || 'identity').toLowerCase();
      const encoding: 'gzip' | 'identity' = enc === 'gzip' ? 'gzip' : 'identity';

      const blob = await response.blob();
      let u8: Uint8Array = new Uint8Array(await blob.arrayBuffer());

      if (encoding === 'gzip') {
        u8 = await this.gunzip(u8); // u8 stays Uint8Array ✅
      }

      // Convert to tight ArrayBuffer only at the end
      return new Blob([this.toArrayBuffer(u8)], { type: 'application/octet-stream' });
    } catch {
      return null;
    }
  }
}
