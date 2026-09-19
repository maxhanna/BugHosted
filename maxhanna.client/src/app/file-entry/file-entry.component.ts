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
    } else {
      this.loadFailed = true;
    }
    this.isLoading = false;
  }

  retry(): void { void this.onInView(true); }

  get c(): any { return this.context; }
  @Input() context: any;
  notesCount(): number {
    return this.c?.getFileNotesCount?.(this.file) ?? this.file.notesCount ?? this.file.notes?.length ?? 0;
  }
  commentsCount(): number {
    return this.file.commentsCount ?? this.c?.getTotalCommentCount?.(this.file.fileComments) ?? 0;
  }
}
