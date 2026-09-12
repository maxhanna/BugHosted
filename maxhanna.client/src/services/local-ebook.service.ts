import { Injectable } from '@angular/core';

/**
 * Optional filesystem cache for books opened from the eBooks component.
 * The book and its page-cover image are deliberately separate files so a
 * reader can use both without contacting the server again.
 */
export interface LocalEbookFile {
  name: string;
  size: number;
  modifiedAt: number;
  extension: string;
}

@Injectable({ providedIn: 'root' })
export class LocalEbookService {
  private readonly dbName = 'maxhanna_local_ebooks';
  private readonly dbVersion = 1;
  private readonly handleKey = 'ebookDirHandle';
  private dbPromise?: Promise<IDBDatabase>;
  private coverUrlCache = new Map<string, string>();

  supportsFileSystemAccess(): boolean {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  private getDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(this.dbName, this.dbVersion);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains('meta')) req.result.createObjectStore('meta');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbPromise;
  }

  private async getHandle(): Promise<FileSystemDirectoryHandle | null> {
    if (!this.supportsFileSystemAccess()) return null;
    try {
      const db = await this.getDb();
      return await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
        const tx = db.transaction('meta', 'readonly');
        const req = tx.objectStore('meta').get(this.handleKey);
        req.onsuccess = () => {
          const value = req.result;
          resolve(value && typeof (value as any).getFileHandle === 'function' ? value : null);
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return null;
    }
  }

  private async setHandle(handle: FileSystemDirectoryHandle): Promise<void> {
    const db = await this.getDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put(handle, this.handleKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async chooseFolder(): Promise<FileSystemDirectoryHandle | null> {
    if (!this.supportsFileSystemAccess()) return null;
    try {
      const picker = window as any;
      const previous = await this.getHandle();
      const handle = await picker.showDirectoryPicker({
        id: 'ebooks-dir',
        mode: 'readwrite',
        startIn: previous ?? 'downloads'
      }) as FileSystemDirectoryHandle;
      await this.setHandle(handle);
      try { await navigator.storage?.persist?.(); } catch { }
      return handle;
    } catch (error: any) {
      if (error?.name === 'AbortError') return null;
      throw error;
    }
  }

  async getFolderName(): Promise<string | null> {
    return (await this.getHandle())?.name ?? null;
  }

  async permissionState(): Promise<PermissionState | null> {
    const handle = await this.getHandle();
    if (!handle) return null;
    try { return await (handle as any).queryPermission({ mode: 'read' }) ?? 'prompt'; } catch { return null; }
  }

  async reconnectFolder(): Promise<boolean> {
    const handle = await this.getHandle();
    if (!handle) return false;
    try {
      const state = await (handle as any).queryPermission({ mode: 'read' });
      if (state === 'granted') return true;
      return (await (handle as any).requestPermission({ mode: 'read' })) === 'granted';
    } catch { return false; }
  }

  async clearFolder(): Promise<void> {
    try {
      const db = await this.getDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('meta', 'readwrite');
        tx.objectStore('meta').delete(this.handleKey);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch { }
  }

  private safePart(value: string): string {
    return (value || 'book').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 100) || 'book';
  }

  private baseName(fileId: number, title: string, extension: string): string {
    const ext = this.safePart(extension).replace(/^\./, '').toLowerCase() || 'bin';
    return `ebook-${fileId}-${this.safePart(title)}.${ext}`;
  }

  private coverName(bookName: string): string { return `${bookName}.cover.jpg`; }

  private extensionOf(name: string): string {
    const dot = name.lastIndexOf('.');
    return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  }

  async listBooks(): Promise<LocalEbookFile[]> {
    const handle = await this.getHandle();
    if (!handle) return [];
    const allowed = new Set(['pdf', 'epub', 'txt', 'md', 'rtf', 'doc', 'docx', 'docm', 'dot', 'dotx', 'dotm', 'odt']);
    const files: LocalEbookFile[] = [];
    try {
      for await (const entry of (handle as any).values()) {
        if (entry.kind !== 'file') continue;
        const extension = this.extensionOf(entry.name);
        if (!allowed.has(extension) || entry.name.endsWith('.cover.jpg')) continue;
        try {
          const file = await entry.getFile();
          files.push({ name: entry.name, size: file.size, modifiedAt: file.lastModified || 0, extension });
        } catch { }
      }
    } catch { }
    return files.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getLocalFile(name: string): Promise<Blob | null> {
    const handle = await this.getHandle();
    if (!handle) return null;
    try {
      const file = await (await handle.getFileHandle(name)).getFile();
      return file.size > 0 ? file : null;
    } catch { return null; }
  }

  async getLocalCover(name: string): Promise<Blob | null> {
    const handle = await this.getHandle();
    if (!handle) return null;
    try {
      const file = await (await handle.getFileHandle(`${name}.cover.jpg`)).getFile();
      return file.size > 0 ? file : null;
    } catch { return null; }
  }

  async getLocalCoverObjectUrl(name: string): Promise<string | null> {
    const key = `local:${name}`;
    const cached = this.coverUrlCache.get(key);
    if (cached) return cached;
    const blob = await this.getLocalCover(name);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    this.coverUrlCache.set(key, url);
    return url;
  }

  async getBook(fileId: number, title: string, extension: string): Promise<Blob | null> {
    const handle = await this.getHandle();
    if (!handle) return null;
    try {
      const file = await (await handle.getFileHandle(this.baseName(fileId, title, extension))).getFile();
      return file.size > 0 ? file : null;
    } catch { return null; }
  }

  async saveBook(fileId: number, title: string, extension: string, blob: Blob): Promise<boolean> {
    const handle = await this.getHandle();
    if (!handle) return false;
    try {
      const fileHandle = await handle.getFileHandle(this.baseName(fileId, title, extension), { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch { return false; }
  }

  async getCover(fileId: number, title: string, extension: string): Promise<Blob | null> {
    const handle = await this.getHandle();
    if (!handle) return null;
    try {
      const bookName = this.baseName(fileId, title, extension);
      const file = await (await handle.getFileHandle(this.coverName(bookName))).getFile();
      return file.size > 0 ? file : null;
    } catch { return null; }
  }

  async saveCover(fileId: number, title: string, extension: string, blob: Blob): Promise<boolean> {
    const handle = await this.getHandle();
    if (!handle) return false;
    try {
      const bookName = this.baseName(fileId, title, extension);
      const fileHandle = await handle.getFileHandle(this.coverName(bookName), { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch { return false; }
  }

  /** Returns a browser URL for a locally stored cover, or null when it has not
   *  been cached yet. The URL is kept for the lifetime of this service. */
  async getCoverObjectUrl(fileId: number, title: string, extension: string): Promise<string | null> {
    const key = `${fileId}:${title}:${extension}`;
    const cached = this.coverUrlCache.get(key);
    if (cached) return cached;
    const blob = await this.getCover(fileId, title, extension);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    this.coverUrlCache.set(key, url);
    return url;
  }
}
