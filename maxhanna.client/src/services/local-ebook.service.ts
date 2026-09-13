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
  source: 'folder' | 'browser';
}

@Injectable({ providedIn: 'root' })
export class LocalEbookService {
  private readonly dbName = 'maxhanna_local_ebooks';
  private dbVersion = 2;
  private handleKey = 'ebookDirHandle';
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
          if (!req.result.objectStoreNames.contains('books')) req.result.createObjectStore('books', { keyPath: 'name' });
          if (!req.result.objectStoreNames.contains('covers')) req.result.createObjectStore('covers', { keyPath: 'name' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbPromise;
  }

  private async readCachedFile(store: 'books' | 'covers', name: string): Promise<Blob | null> {
    try {
      const db = await this.getDb();
      return await new Promise<Blob | null>((resolve, reject) => {
        const req = db.transaction(store, 'readonly').objectStore(store).get(name);
        req.onsuccess = () => resolve(req.result?.blob?.size > 0 ? req.result.blob : null);
        req.onerror = () => reject(req.error);
      });
    } catch { return null; }
  }

  private async writeCachedFile(store: 'books' | 'covers', name: string, blob: Blob): Promise<boolean> {
    try {
      const db = await this.getDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put({ name, blob, size: blob.size, modifiedAt: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return true;
    } catch { return false; }
  }

  private async listCachedBooks(): Promise<LocalEbookFile[]> {
    try {
      const db = await this.getDb();
      return await new Promise<LocalEbookFile[]>((resolve, reject) => {
        const req = db.transaction('books', 'readonly').objectStore('books').getAll();
        req.onsuccess = () => resolve((req.result ?? []).map((entry: any) => ({
          name: entry.name,
          size: entry.size ?? entry.blob?.size ?? 0,
          modifiedAt: entry.modifiedAt ?? 0,
          extension: this.extensionOf(entry.name),
          source: 'browser',
        })));
        req.onerror = () => reject(req.error);
      });
    } catch { return []; }
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

  async permissionState(mode: 'read' | 'readwrite' = 'read'): Promise<PermissionState | null> {
    const handle = await this.getHandle();
    if (!handle) return null;
    try { return await (handle as any).queryPermission({ mode }) ?? 'prompt'; } catch { return null; }
  }

  /**
   * Re-arm both read and write access with a user gesture. Android browsers
   * commonly suspend directory permissions when the tab is backgrounded, so
   * use readwrite here rather than read-only: cached books and covers must
   * remain usable after the folder is reconnected.
   */
  async reconnectFolder(): Promise<boolean> {
    const handle = await this.getHandle();
    if (!handle) return false;
    try {
      const state = await (handle as any).queryPermission({ mode: 'readwrite' });
      if (state === 'granted') return true;
      return (await (handle as any).requestPermission({ mode: 'readwrite' })) === 'granted';
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
    const files: LocalEbookFile[] = [];
    const handle = await this.getHandle();
    if (handle) {
      const allowed = new Set(['pdf', 'epub', 'txt', 'md', 'rtf', 'doc', 'docx', 'docm', 'dot', 'dotx', 'dotm', 'odt']);
      try {
        for await (const entry of (handle as any).values()) {
          if (entry.kind !== 'file') continue;
          const extension = this.extensionOf(entry.name);
          if (!allowed.has(extension) || entry.name.endsWith('.cover.jpg')) continue;
          try {
            const file = await entry.getFile();
          files.push({ name: entry.name, size: file.size, modifiedAt: file.lastModified || 0, extension, source: 'folder' });
          } catch { }
        }
      } catch { }
    }
    // Keep cached copies visible when Android has suspended folder permission.
    // They can still be opened offline while the banner offers reconnection.
    for (const cached of await this.listCachedBooks()) {
      if (!files.some(file => file.name === cached.name)) files.push(cached);
    }
    return files.sort((a, b) => a.name.localeCompare(b.name));
  }

  async cacheLocalFile(name: string, blob: Blob): Promise<boolean> {
    return this.writeCachedFile('books', name, blob);
  }

  async cacheLocalCover(name: string, blob: Blob): Promise<boolean> {
    return this.writeCachedFile('covers', `${name}.cover.jpg`, blob);
  }

  async getLocalFile(name: string): Promise<Blob | null> {
    const handle = await this.getHandle();
    if (handle) {
      try {
        const file = await (await handle.getFileHandle(name)).getFile();
        if (file.size > 0) return file;
      } catch { }
    }
    return this.readCachedFile('books', name);
  }

  async getLocalCover(name: string): Promise<Blob | null> {
    const handle = await this.getHandle();
    if (handle) {
      try {
        const file = await (await handle.getFileHandle(`${name}.cover.jpg`)).getFile();
        if (file.size > 0) return file;
      } catch { }
    }
    return this.readCachedFile('covers', `${name}.cover.jpg`);
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
    const name = this.baseName(fileId, title, extension);
    const handle = await this.getHandle();
    if (handle) {
      try {
        const file = await (await handle.getFileHandle(name)).getFile();
        if (file.size > 0) return file;
      } catch { }
    }
    return this.readCachedFile('books', name);
  }

  async saveBook(fileId: number, title: string, extension: string, blob: Blob): Promise<boolean> {
    const name = this.baseName(fileId, title, extension);
    const handle = await this.getHandle();
    if (handle) {
      try {
        const fileHandle = await handle.getFileHandle(name, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
      } catch { }
    }
    return this.writeCachedFile('books', name, blob);
  }

  async getCover(fileId: number, title: string, extension: string): Promise<Blob | null> {
    const name = this.coverName(this.baseName(fileId, title, extension));
    const handle = await this.getHandle();
    if (handle) {
      try {
        const file = await (await handle.getFileHandle(name)).getFile();
        if (file.size > 0) return file;
      } catch { }
    }
    return this.readCachedFile('covers', name);
  }

  async saveCover(fileId: number, title: string, extension: string, blob: Blob): Promise<boolean> {
    const name = this.coverName(this.baseName(fileId, title, extension));
    const handle = await this.getHandle();
    if (handle) {
      try {
        const fileHandle = await handle.getFileHandle(name, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
      } catch { }
    }
    return this.writeCachedFile('covers', name, blob);
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
