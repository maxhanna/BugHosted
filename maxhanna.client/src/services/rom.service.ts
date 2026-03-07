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

  async getRomFile(
    rom: string,
    userId?: number,
    fileId?: number,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<Blob | null> {
    try {
      const response = await fetch(`/rom/getromfile/${encodeURIComponent(rom)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, FileId: fileId }),
      });

      if (!response.ok) return null;

      const totalSize =
        Number(response.headers.get('X-File-Size') || '0') ||
        Number(response.headers.get('Content-Length') || '0');
      if (onProgress && response.body) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let loaded = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.length;
          // Report progress; if total is unknown (0), pass loaded as total
          // so callers can at least show bytes transferred.
          onProgress(loaded, totalSize || loaded);
        }
        const all = new Uint8Array(loaded);
        let offset = 0;
        for (const chunk of chunks) {
          all.set(chunk, offset);
          offset += chunk.length;
        }
        return new Blob([all]);
      }

      return await response.blob();
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

  async incrementResetVote(fileId: number): Promise<{ ok: boolean; resetVotes?: number } | null> {
    try {
      const res = await fetch('/rom/incrementresetvote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fileId)
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }
 
  /** Normalize input into a tight ArrayBuffer (no offset/extra bytes). */
  private toTightArrayBuffer(input: ArrayBuffer | ArrayBufferView): ArrayBuffer {
    if (input instanceof ArrayBuffer) return input;
    const view = input as ArrayBufferView;
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
  } 

  guessSystemFromFileName(fileName: string): string | undefined {
    if (!fileName) return undefined;
    const name = fileName.toLowerCase();

    // PSP indicators (check before PS1 to avoid false positives on "playstation portable")
    if (name.includes('psp') || name.includes('playstation portable') || name.includes('umd')) {
      return 'psp';
    }
    // PSP serial codes (ULUS/ULES/UCUS/UCES/ULJS/ULJM/NPxx-nnnnn)
    if (/\b(UL[UEJKA]S|UC[UEJKA]S|UL[JA]M|NP[UHEJGA][HGXD])[-_]?\d{5}/i.test(name)) {
      return 'psp';
    }
    // Explicit (PSP) / [PSP] platform tag in filename
    if (/\(psp\)|\[psp\]/i.test(name)) {
      return 'psp';
    }
    // PSP-exclusive file extension
    if (name.endsWith('.pbp')) {
      return 'psp';
    }
    // PSP-exclusive franchise/title keywords that never appeared on PS1
    const pspKeywords = [
      'liberty city stories', 'vice city stories', 'crisis core', 'dissidia',
      'birth by sleep', 'kingdom hearts bbs', 'patapon', 'loco roco', 'locoroco',
      'god eater', 'phantasy star portable', 'jeanne d\'arc', 'daxter',
      'chains of olympus', 'ghost of sparta', 'peace walker', 'portable ops',
      'lumines', 'wipeout pure', 'wipeout pulse', 'fat princess', 'tactics ogre',
      'valkyria chronicles ii', 'valkyria chronicles 2', 'persona 3 portable',
      'ys seven', 'ys vs', 'trails in the sky', 'the 3rd birthday',
      'monster hunter freedom', 'monster hunter portable',
    ];
    if (pspKeywords.some(kw => name.includes(kw))) {
      return 'psp';
    }
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
    // If the filename contains common PlayStation cues (CUE for bin/cue pair)
    if (name.endsWith('.sfc') || name.includes('.sfc') || name.includes('sfc')) {
      return 'snes';
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

  async saveEmulatorJSState(
    romName: string,
    userId: number,
    stateData: Uint8Array,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<SaveUploadResponse> {

    const tight = new Uint8Array(this.toTightArrayBuffer(stateData));
    const form = new FormData();
    const ab: ArrayBuffer = this.toArrayBuffer(tight);

    form.append('file', new File([ab], 'savestate.bin', {
      type: 'application/octet-stream'
    }));

    form.append('userId', String(userId));
    form.append('romName', romName);

    // If a progress callback was supplied, use XMLHttpRequest which exposes
    // upload progress events.  fetch() does not support upload progress.
    if (onProgress) {
      return this.uploadWithXhr(form, onProgress, ab.byteLength);
    }

    try {
      // keepalive requests are intended for short, small payloads (and
      // many browsers limit the allowed body size). For large save states
      // (several MB) using keepalive can cause the request to hang or be
      // dropped. Only enable keepalive for small uploads.
      const maxKeepalive = 64 * 1024; // 64 KB
      const useKeepalive = ab.byteLength <= maxKeepalive;
      if (!useKeepalive) console.debug('[EJS] large upload detected; disabling keepalive', ab.byteLength);

      const res = await fetch('/rom/saveemulatorjsstate', {
        method: 'POST',
        body: form,
        ...(useKeepalive ? { keepalive: true } : {}),
      });
      const status = res.status;
      const ct = (res.headers.get('content-type') || '').toLowerCase();

      // Read body exactly once based on content-type
      let body: any = null;
      try {
        if (ct.includes('application/json')) {
          body = await res.json(); // consumes body once
        } else {
          body = await res.text(); // consumes body once
        }
      } catch (readErr) {
        // If parsing fails, capture raw text as fallback
        try {
          body = await res.text();
        } catch {
          body = null;
        }
      }

      console.log("returning body:", body, res);

      if (!res.ok) {
        const errorBody = typeof body === 'string' ? body : JSON.stringify(body ?? { error: 'Upload failed' });
        return { ok: false, status, errorText: errorBody };
      }
      return { ok: true, status, body };
    } catch (error: any) {
      return { ok: false, status: 0, errorText: String(error?.message ?? error) };
    }
  }

  /** Upload FormData via XMLHttpRequest so we can track upload progress. */
  private uploadWithXhr(
    form: FormData,
    onProgress: (loaded: number, total: number) => void,
    knownTotal: number = 0
  ): Promise<SaveUploadResponse> {
    return new Promise<SaveUploadResponse>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/rom/saveemulatorjsstate');

      xhr.upload.addEventListener('progress', (e) => {
        const total = e.lengthComputable ? e.total : knownTotal;
        onProgress(e.loaded, total || e.loaded);
      });

      xhr.addEventListener('load', () => {
        const status = xhr.status;
        const ct = (xhr.getResponseHeader('content-type') || '').toLowerCase();
        let body: any = null;
        try {
          body = ct.includes('application/json') ? JSON.parse(xhr.responseText) : xhr.responseText;
        } catch {
          body = xhr.responseText || null;
        }

        if (status >= 200 && status < 300) {
          resolve({ ok: true, status, body });
        } else {
          const errorBody = typeof body === 'string' ? body : JSON.stringify(body ?? { error: 'Upload failed' });
          resolve({ ok: false, status, errorText: errorBody });
        }
      });

      xhr.addEventListener('error', () => {
        resolve({ ok: false, status: 0, errorText: 'Network error during upload' });
      });

      xhr.addEventListener('abort', () => {
        resolve({ ok: false, status: 0, errorText: 'Upload aborted' });
      });

      xhr.send(form);
    });
  }

  async getEmulatorJSSaveState(romName: string, userId: number): Promise<Blob | null> {
    try {
      const response = await fetch(`/rom/getemulatorjssavestate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ UserId: userId, RomName: romName }),
      });

      if (!response.ok) return null;


      const blob = await response.blob();
      let u8: Uint8Array = new Uint8Array(await blob.arrayBuffer());

      // Convert to tight ArrayBuffer only at the end
      return new Blob([this.toArrayBuffer(u8)], { type: 'application/octet-stream' });
    } catch {
      return null;
    }
  }
}
