import { Component, ElementRef, EventEmitter, Input, OnDestroy, AfterViewInit, Output } from '@angular/core';
import { FileService } from '../../services/file.service';
import { FileEntry } from '../../services/datacontracts/file/file-entry';

@Component({
  selector: 'app-file-entry',
  templateUrl: './file-entry.component.html',
  styleUrl: './file-entry.component.css',
  standalone: false,
})
export class FileEntryComponent implements AfterViewInit, OnDestroy {
  @Input() file!: FileEntry;
  @Input() userId?: number;
  @Input() fileCache?: FileEntry[];
  @Input() includeRomMetadata = false;
  @Input() isRomView = false;
  @Input() displayAsTable = true;
  @Output('fileHydrated') hydrated = new EventEmitter<FileEntry>();

  isHydrated = false;
  isLoading = false;
  loadFailed = false;
  bookCount: number | null = null;
  /** True while this entry is outside the viewport. Any media element that
   *  mounts while set (e.g. a lazy-loaded video whose src arrives after the
   *  user already scrolled past) is paused immediately, so off-screen media
   *  never plays. */
  private isOutOfView = false;
  private mediaMountObserver?: MutationObserver;
  private static readonly bookCountCache = new Map<string, number>();

  constructor(private fileService: FileService, private host: ElementRef) {}

  ngAfterViewInit(): void {
    // Watch for media elements mounting inside this entry while it is scrolled
    // out of view. The InView sweep alone cannot handle them: a video that
    // mounts after the sweep ran (lazy src + autoplay) would start playing
    // off-screen. Pausing in the mutation callback wins that race.
    try {
      const root: HTMLElement | undefined = this.host?.nativeElement;
      if (!root || typeof MutationObserver === 'undefined') return;
      this.mediaMountObserver = new MutationObserver((mutations) => {
        if (!this.isOutOfView) return;
        for (const mutation of mutations) {
          mutation.addedNodes?.forEach((node) => {
            const el = node as HTMLElement;
            if (!el || !el.querySelectorAll) return;
            if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') this.pauseMediaElement(el as HTMLMediaElement);
            el.querySelectorAll<HTMLMediaElement>('video, audio').forEach(m => this.pauseMediaElement(m));
          });
        }
      });
      this.mediaMountObserver.observe(root, { childList: true, subtree: true });
    } catch { /* host unavailable during early teardown */ }
  }

  ngOnDestroy(): void {
    this.isOutOfView = true;
    try { this.mediaMountObserver?.disconnect(); } catch { }
    this.mediaMountObserver = undefined;
    this.pauseOutOfViewMedia();
  }

  async onInView(inView: boolean): Promise<void> {
    if (!inView) {
      this.isOutOfView = true;
      this.pauseOutOfViewMedia();
      return;
    }
    this.isOutOfView = false;
    if (this.isHydrated || this.isLoading || !this.file?.id) return;
    this.isLoading = true;
    this.loadFailed = false;
    const hydratedFile = await this.fileService.getFileEntryById(
      this.file.id, this.userId, this.fileCache, this.includeRomMetadata,
    );
    if (hydratedFile) {
      Object.assign(this.file, hydratedFile);
      this.isHydrated = true;
      this.hydrated.emit(this.file);
      if (this.isBookFolder) void this.loadBookCount();
    } else {
      this.loadFailed = true;
    }
    this.isLoading = false;
  }

  retry(): void { void this.onInView(true); }

  /** Pause any inline video/audio inside this entry. Called when the entry
   *  scrolls out of view (e.g. a file-list inside meme.component) and on
   *  destroy, so off-screen media never keeps playing. Fullscreen overlay
   *  media is excluded — an active fullscreen session is intentional. Also
   *  clears the autoplay flag: a mounted-but-still-buffering video would
   *  otherwise begin playback the moment data arrives, even off-screen. */
  private pauseOutOfViewMedia(): void {
    try {
      const root: HTMLElement | undefined = this.host?.nativeElement;
      if (!root || !root.querySelectorAll) return;
      root.querySelectorAll<HTMLMediaElement>('video, audio').forEach((m) => this.pauseMediaElement(m));
    } catch { /* host unavailable (e.g. during teardown) */ }
  }

  private pauseMediaElement(m: HTMLMediaElement): void {
    try {
      if (m.closest?.('.fullscreen-overlay')) return;
      if (m.tagName === 'VIDEO') m.autoplay = false;
      if (!m.paused) m.pause();
    } catch { /* per-element failure must not break the sweep */ }
  }

  @Input() context: any;

  get c(): any { return this.context; }

  get isBookFolder(): boolean {
    return !!this.file?.isFolder && !!this.c?.isBookView;
  }

  private async loadBookCount(): Promise<void> {
    if (!this.file?.id || !this.c?.isBookView) return;
    const base = (this.file.directory ?? this.c.currentDirectory ?? '')
      .replace(/\\/g, '/').replace(/\/+$/g, '');
    const name = (this.file.fileName ?? '').replace(/^\/+|\/+$/g, '');
    if (!name) return;
    const directory = `${base}/${name}/`.replace(/^\/+/, '');
    const cacheKey = `${directory}|${(this.c.allowedFileTypes ?? []).join(',')}`;
    const cached = FileEntryComponent.bookCountCache.get(cacheKey);
    if (cached !== undefined) {
      this.bookCount = cached;
      return;
    }

    try {
      const result = await this.fileService.getDirectory(
        directory,
        'all',
        'all',
        this.c.currentUser,
        1,
        1,
        '',
        undefined,
        this.c.allowedFileTypes?.length ? this.c.allowedFileTypes : undefined,
        false,
        '',
        false,
        true,
        false,
        undefined,
        this.c.isDisplayingNSFW,
        undefined,
        undefined,
        false,
        true,
      );
      const count = result?.totalCount ?? 0;
      FileEntryComponent.bookCountCache.set(cacheKey, count);
      this.bookCount = count;
    } catch {
      this.bookCount = 0;
    }
  }

  notesCount(): number {
    return this.c?.getFileNotesCount?.(this.file) ?? this.file.notesCount ?? this.file.notes?.length ?? 0;
  }

  commentsCount(): number {
    return this.file.commentsCount ?? this.c?.getTotalCommentCount?.(this.file.fileComments) ?? 0;
  }

  get displayName(): string {
    return this.file.givenFileName ?? this.c?.getFileWithoutExtension?.(this.file.fileName ?? '') ?? this.file.fileName ?? '';
  }

}
