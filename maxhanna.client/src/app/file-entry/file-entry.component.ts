import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FileService } from '../../services/file.service';
import { FileEntry } from '../../services/datacontracts/file/file-entry';

@Component({
  selector: 'app-file-entry',
  templateUrl: './file-entry.component.html',
  styleUrl: './file-entry.component.css',
  standalone: false,
})
export class FileEntryComponent {
  @Input() file!: FileEntry;
  @Input() userId?: number;
  @Input() fileCache?: FileEntry[];
  @Input() includeRomMetadata = false;
  @Input() displayAsTable = true;
  @Output('fileHydrated') hydrated = new EventEmitter<FileEntry>();

  isHydrated = false;
  isLoading = false;
  loadFailed = false;
  bookCount: number | null = null;
  private static readonly bookCountCache = new Map<string, number>();

  constructor(private fileService: FileService) {}

  async onInView(inView: boolean): Promise<void> {
    if (!inView || this.isHydrated || this.isLoading || !this.file?.id) return;
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
}
