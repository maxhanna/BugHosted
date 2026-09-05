import { Injectable } from '@angular/core';
import { BookEntry } from './datacontracts/books/book-entry';

/** Minimal structural types for the parts of pdf.js the thumbnail renderer
 *  uses — the dynamic import is cast through these so the service never
 *  hard-depends on pdf.js typing quirks. Same pattern as the reader. */
type PdfViewportLike = { width: number; height: number; clone(o: { scale: number }): PdfViewportLike };
type PdfThumbPage = {
  getViewport(o: { scale: number }): PdfViewportLike;
  render(p: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewportLike }): { cancel(): void; promise: Promise<void> };
};
type PdfThumbDoc = { numPages: number; getPage(n: number): Promise<PdfThumbPage>; destroy(): Promise<void> };
type PdfJsThumb = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: { data: ArrayBuffer } | { url: string; rangeChunkSize?: number; disableAutoFetch?: boolean }): { promise: Promise<PdfThumbDoc> };
};

@Injectable({
  providedIn: 'root'
})
export class BooksService {
  // ---- PDF first-page thumbnails (static so they survive component reuse) ----
  private static thumbCache = new Map<number, string>();
  private static thumbFailed = new Set<number>();
  private static thumbInflight = new Map<number, Promise<string | null>>();
  private static thumbChain: Promise<unknown> = Promise.resolve();
  private static pdfjs?: PdfJsThumb;

  constructor() { }

  /** Books the user has added to their own library. */
  async getMyLibrary(userId: number, sessionToken?: string): Promise<BookEntry[]> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Encrypted-UserId'] = sessionToken;
      const response = await fetch(`/books/getmylibrary?userId=${userId}`, { headers });
      if (!response.ok) return [];
      return (await response.json()) as BookEntry[];
    } catch (error) {
      console.error('Error fetching book library:', error);
      return [];
    }
  }

  /** All publicly shared / shared books — the community catalog. */
  async getCatalog(userId?: number): Promise<BookEntry[]> {
    try {
      const url = userId ? `/books/getcatalog?userId=${userId}` : '/books/getcatalog';
      const response = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
      if (!response.ok) return [];
      return (await response.json()) as BookEntry[];
    } catch (error) {
      console.error('Error fetching book catalog:', error);
      return [];
    }
  }

  /** Registers an uploaded file (pdf/txt/doc...) as a book in the user's library. */
  async registerBook(payload: {
    userId: number; fileId: number; title: string; author?: string; description?: string;
    coverFileId?: number; isPublic?: boolean;
  }, sessionToken?: string): Promise<{ bookId: number; fileId: number; updated: boolean } | null> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Encrypted-UserId'] = sessionToken;
      const response = await fetch('/books/register', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('Error registering book:', error);
      return null;
    }
  }

  async updateBook(payload: {
    userId: number; bookId?: number; fileId?: number; title: string; author?: string;
    description?: string; coverFileId?: number; isPublic?: boolean;
  }, sessionToken?: string): Promise<boolean> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Encrypted-UserId'] = sessionToken;
      const response = await fetch('/books/update', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      return response.ok;
    } catch (error) {
      console.error('Error updating book:', error);
      return false;
    }
  }

  /** Share a book publicly or with specific usernames/user ids. */
  async shareBook(payload: {
    userId: number; bookId: number; makePublic?: boolean; usernames?: string[]; userIds?: number[];
  }, sessionToken?: string): Promise<{ success: boolean; isPublic?: boolean; sharedWith?: number[]; unknownUsernames?: string[] } | null> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Encrypted-UserId'] = sessionToken;
      const response = await fetch('/books/share', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch (error) {
      console.error('Error sharing book:', error);
      return null;
    }
  }

  async unshareBook(payload: {
    userId: number; bookId: number; makePublic?: boolean; usernames?: string[]; userIds?: number[];
  }, sessionToken?: string): Promise<boolean> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Encrypted-UserId'] = sessionToken;
      const response = await fetch('/books/unshare', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      return response.ok;
    } catch (error) {
      console.error('Error unsharing book:', error);
      return false;
    }
  }

  /** Removes a book from the library (the uploaded file itself is untouched). */
  async removeBook(payload: { userId: number; bookId: number }, sessionToken?: string): Promise<boolean> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Encrypted-UserId'] = sessionToken;
      const response = await fetch('/books/remove', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      return response.ok;
    } catch (error) {
      console.error('Error removing book:', error);
      return false;
    }
  }

  /** Cached first-page thumbnail for a PDF book, when one has been rendered. */
  peekPdfThumbnail(fileId: number): string | undefined {
    return BooksService.thumbCache.get(fileId);
  }

  /** Lazily loads pdf.js and points its worker at the copied asset. */
  private async loadPdfJs(): Promise<PdfJsThumb> {
    if (BooksService.pdfjs) return BooksService.pdfjs;
    const mod = (await import('pdfjs-dist')) as unknown as PdfJsThumb;
    mod.GlobalWorkerOptions.workerSrc = 'assets/pdfjs/pdf.worker.min.mjs';
    BooksService.pdfjs = mod;
    return mod;
  }

  /** Renders page 1 of a PDF book to a small JPEG data URL. Requests are
   *  deduplicated per fileId and serialized through one chain so a catalog
   *  full of PDFs never hammers the server with parallel downloads. Failed
   *  renders are remembered so broken files aren't retried on every scroll. */
  async getPdfThumbnail(fileId: number): Promise<string | null> {
    const cached = BooksService.thumbCache.get(fileId);
    if (cached) return cached;
    if (BooksService.thumbFailed.has(fileId)) return null;
    const existing = BooksService.thumbInflight.get(fileId);
    if (existing) return existing;
    const promise = new Promise<string | null>(resolve => {
      BooksService.thumbChain = BooksService.thumbChain
        .then(() => this.renderPdfThumbnail(fileId))
        .then(url => resolve(url))
        .catch(() => resolve(null));
    });
    BooksService.thumbInflight.set(fileId, promise);
    return promise;
  }

  private async renderPdfThumbnail(fileId: number): Promise<string | null> {
    try {
      if (typeof document === 'undefined') return null;
      const pdfjs = await this.loadPdfJs();
      // Prefer range requests: only the bytes needed for page 1 cross the
      // wire (see FileController.GetFileRange). Falls through to the full
      // download when the server or file doesn't cooperate.
      try {
        const rangeDoc = await pdfjs.getDocument({
          url: `/file/getfilerange/${fileId}`,
          rangeChunkSize: 65536,
          disableAutoFetch: true,
        }).promise;
        try {
          const url = await this.renderFirstPage(rangeDoc);
          if (url) {
            BooksService.thumbCache.set(fileId, url);
            return url;
          }
        } finally {
          await rangeDoc.destroy().catch(() => { });
        }
      } catch (rangeError) {
        console.debug('Range thumbnail failed, falling back to full download:', rangeError);
      }
      const blob = await this.downloadBook(fileId);
      if (!blob || blob.size === 0) {
        BooksService.thumbFailed.add(fileId);
        return null;
      }
      const data = await blob.arrayBuffer();
      const doc = await pdfjs.getDocument({ data }).promise;
      try {
        const url = await this.renderFirstPage(doc);
        if (!url) {
          BooksService.thumbFailed.add(fileId);
          return null;
        }
        BooksService.thumbCache.set(fileId, url);
        return url;
      } finally {
        await doc.destroy().catch(() => { });
      }
    } catch (error) {
      console.error('Error rendering PDF thumbnail:', error);
      BooksService.thumbFailed.add(fileId);
      return null;
    } finally {
      BooksService.thumbInflight.delete(fileId);
    }
  }

  /** Renders page 1 of an already-open pdf.js document to a small JPEG data
   *  URL (null when the page can't be rendered). Shared by the range-loading
   *  and full-download thumbnail paths. */
  private async renderFirstPage(doc: PdfThumbDoc): Promise<string | null> {
    try {
      const page = await doc.getPage(1);
      // Target a ~340px-wide cover at device clarity, capped so huge pages
      // don't blow the canvas size.
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2, Math.max(0.5, 340 / Math.max(1, base.width)));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      // PDF pages have no background — fill white or the JPEG turns black.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      return canvas.toDataURL('image/jpeg', 0.72);
    } catch (e) {
      console.error('Error rendering PDF first page:', e);
      return null;
    }
  }

  /**
   * Preview image for a book: the uploaded cover file when present, otherwise a
   * deterministic server-generated SVG cover (same book always gets the same art).
   */
  getCoverUrl(book: BookEntry, sessionToken?: string): string {
    if (book.coverUrl) return book.coverUrl;
    const params = new URLSearchParams();
    params.set('title', book.title || 'Untitled');
    if (book.author) params.set('author', book.author);
    if (book.fileType) params.set('fmt', book.fileType);
    return `/books/cover.svg?${params.toString()}`;
  }

  /**
   * Builds a shareable deep link to the eBooks component. Keyed by fileId —
   * the canonical identity of the book (bookId differs per user who saved a
   * copy, and unregistered files have none).
   */
  getShareLink(book: BookEntry): string {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    return `${base}/Books/${book.fileId}`;
  }

  /** Per-user reading position for a book file (null when none saved yet).
   *  `position` carries a free-form reader location such as an EPUB CFI. */
  async getReadingProgress(userId: number, fileId: number, sessionToken?: string): Promise<{ page: number; scroll: number; position?: string } | null> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Encrypted-UserId'] = sessionToken;
      const response = await fetch(`/books/progress?userId=${userId}&fileId=${fileId}`, { headers });
      if (!response.ok) return null;
      const data = await response.json();
      if (!data?.position) return null;
      return {
        page: data.position.page ?? 1,
        scroll: data.position.scroll ?? 0,
        position: data.position.position ?? undefined,
      };
    } catch (error) {
      console.error('Error fetching reading progress:', error);
      return null;
    }
  }

  /** Saves the per-user reading position (page + in-page scroll ratio 0..1, plus
   *  an optional free-form position such as an EPUB CFI). */
  async saveReadingProgress(payload: { userId: number; fileId: number; page: number; scroll: number; position?: string }, sessionToken?: string): Promise<boolean> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Encrypted-UserId'] = sessionToken;
      const response = await fetch('/books/progress', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      return response.ok;
    } catch (error) {
      console.error('Error saving reading progress:', error);
      return false;
    }
  }

  /** Registers many uploaded files as books in one pass. Files that already
   *  have a registration for this user are updated with the given defaults;
   *  everything else is inserted. Uses one server call per file — returns the
   *  number of successes so the UI can report partial failures. */
  async bulkRegister(payloads: Array<{
    userId: number; fileId: number; title: string; author?: string; description?: string;
    isPublic?: boolean;
  }>, sessionToken?: string): Promise<number> {
    let ok = 0;
    for (const p of payloads) {
      const r = await this.registerBook(p, sessionToken);
      if (r) ok++;
    }
    return ok;
  }

  /** Distinct subfolder names (one level) under Books/{prefix} the user can see. */
  async getBookFolders(userId: number, prefix = ''): Promise<string[]> {
    try {
      const params = new URLSearchParams({ userId: String(userId) });
      if (prefix) params.set('prefix', prefix);
      const response = await fetch(`/books/getbookfolders?${params.toString()}`);
      if (!response.ok) return [];
      return (await response.json()) as string[];
    } catch (error) {
      console.error('Error fetching book folders:', error);
      return [];
    }
  }

  /** Streams the actual book file for reading/downloading. */
  async downloadBook(fileId: number): Promise<Blob | null> {
    try {
      const response = await fetch(`/file/getfilebyid/${fileId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(null),
      });
      if (!response.ok) return null;
      return await response.blob();
    } catch (error) {
      console.error('Error downloading book:', error);
      return null;
    }
  }
}
