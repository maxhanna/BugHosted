import { Injectable } from '@angular/core';


export interface N64StateUpload {
  userId: number;
  romName: string;
  filename: string;
  bytes: Uint8Array;
  emuKey: string;
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

  async getRomFile(rom: string, userId?: number, fileId?: number) {
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


  async getN64SaveByName(romName: string, userId: number): Promise<{ blob: Blob; filename: string } | null> {
    const url = `/Rom/GetN64SaveByName/${encodeURIComponent(romName)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userId)
    });
    if (!res.ok) return null;

    // Extract filename from Content-Disposition header
    const cd = res.headers.get('content-disposition') || '';
    let filename = romName; // fallback
    // robust parse: supports filename="..." and RFC5987 filename*=UTF-8''
    const rfc5987 = cd.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
    const quoted = cd.match(/filename="([^"]+)"/i);
    if (rfc5987 && rfc5987[1]) filename = decodeURIComponent(rfc5987[1]);
    else if (quoted && quoted[1]) filename = quoted[1];

    const blob = await res.blob();
    return { blob, filename };
  }


  //deprecated, delete
  async getN64StateFile(rom: string, userId?: number) {
    try {
      const response = await fetch(`/rom/getn64statefile/${encodeURIComponent(rom)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });

      return await response.blob();
    } catch (error) {
      return null;
    }
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
}
