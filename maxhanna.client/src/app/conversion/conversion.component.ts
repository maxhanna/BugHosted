import { Component, ElementRef, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { ConversionService, ConversionResult, FontConversionResult } from '../../services/conversion.service';
import { FileService } from '../../services/file.service';
import { FileEntry } from '../../services/datacontracts/file/file-entry';

@Component({
    selector: 'app-conversion',
    templateUrl: './conversion.component.html',
    styleUrl: './conversion.component.css',
    standalone: false
})
export class ConversionComponent extends ChildComponent {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  selectedFile?: File;
  selectedFileEntry?: FileEntry;
  localPreviewUrl?: string;

  targetFormats = ['mp4', 'mp3', 'webm', 'ogg', 'wav', 'flac', 'png', 'jpg', 'webp', 'bmp', 'gif'];
  targetFormat = 'mp4';
  isConverting = false;
  conversionResult?: ConversionResult;

  fontText = '';
  isMakingFont = false;
  fontResult?: FontConversionResult;
  fontFamilyName = 'ConvertedFont';
  fontSampleText = 'The quick brown fox jumps over the lazy dog. 0123456789';

  visionPrompt = '';
  isRunningVision = false;
  visionReport?: string;

  constructor(private conversionService: ConversionService, private fileService: FileService) {
    super();
  }

  onFileSelected(event: any) {
    const file: File | undefined = event?.target?.files?.[0];
    if (!file) return;
    this.selectedFile = file;
    this.selectedFileEntry = undefined;
    this.conversionResult = undefined;
    this.fontResult = undefined;
    this.visionReport = undefined;
    if (this.localPreviewUrl) URL.revokeObjectURL(this.localPreviewUrl);
    this.localPreviewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
  }

  isImageSelected(): boolean {
    return !!this.selectedFile && this.selectedFile.type.startsWith('image/');
  }

  async convert() {
    if (!this.selectedFile) { this.parentRef?.showNotification('Select a file first.'); return; }
    if (!this.selectedFileEntry) await this.uploadSelectedFile();
    if (!this.selectedFileEntry) { this.parentRef?.showNotification('Upload failed.'); return; }

    this.isConverting = true;
    try {
      this.conversionResult = await this.conversionService.convertFile(this.selectedFileEntry.id, this.targetFormat, this.parentRef?.user?.id) ?? undefined;
      if (!this.conversionResult) this.parentRef?.showNotification('Conversion failed.');
      else this.parentRef?.showNotification('Conversion complete.');
    } finally {
      this.isConverting = false;
    }
  }

  async makeFont() {
    if (!this.selectedFile) { this.parentRef?.showNotification('Select an image file first.'); return; }
    if (!this.selectedFileEntry) await this.uploadSelectedFile();
    if (!this.selectedFileEntry) { this.parentRef?.showNotification('Upload failed.'); return; }

    this.isMakingFont = true;
    try {
      const result = await this.conversionService.imageToFont(this.selectedFileEntry.id, this.fontText || undefined, this.parentRef?.user?.id);
      this.fontResult = result ?? undefined;
      if (!this.fontResult) {
        this.parentRef?.showNotification('Font conversion failed.');
      } else {
        this.fontFamilyName = (this.fontResult.fileName || 'ConvertedFont').replace(/\.ttf$/i, '').replace(/[^A-Za-z0-9]/g, '') || 'ConvertedFont';
        await this.loadFontFace(this.fontResult.fontDataUri, this.fontFamilyName);
        this.parentRef?.showNotification(`Font created: ${this.fontResult.fileName} (${this.fontResult.characters?.length ?? 0} glyphs)`);
      }
    } finally {
      this.isMakingFont = false;
    }
  }

  async downloadConverted(fileId: number, fileName: string) {
    const sessionToken = await this.parentRef?.getSessionToken() ?? '';
    const dataUri = await this.fileService.getFileSrcByFileId(fileId, sessionToken);
    if (!dataUri) { this.parentRef?.showNotification('Could not load file.'); return; }
    const a = document.createElement('a');
    a.href = dataUri;
    a.download = fileName;
    a.click();
  }

  async runVision() {
    if (!this.selectedFile) { this.parentRef?.showNotification('Select a file first.'); return; }
    if (!this.selectedFileEntry) await this.uploadSelectedFile();
    if (!this.selectedFileEntry) { this.parentRef?.showNotification('Upload failed.'); return; }

    this.isRunningVision = true;
    try {
      const result = await this.conversionService.visionReport(this.selectedFileEntry.id, this.visionPrompt || undefined, this.parentRef?.user?.id);
      this.visionReport = result?.report;
      if (!this.visionReport) this.parentRef?.showNotification('Vision report failed.');
    } finally {
      this.isRunningVision = false;
    }
  }

  private async uploadSelectedFile() {
    if (!this.selectedFile) return;
    const text = await this.conversionService.uploadFile(this.selectedFile, this.parentRef?.user).toPromise();
    if (!text) return;
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { return; }
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    if (arr.length > 0 && arr[0]?.id) {
      const f = arr[0];
      this.selectedFileEntry = new FileEntry(
        f.id, f.fileName, f.directory, f.visibility, undefined, undefined,
        f.isFolder, undefined, undefined, f.fileSize, f.fileType
      );
    }
  }

  private async loadFontFace(dataUri: string, family: string) {
    try {
      const font = new FontFace(family, `url(${dataUri})`);
      const loaded = await font.load();
      (document as any).fonts.add(loaded);
    } catch (e) {
      console.error('Failed to load generated font:', e);
    }
  }
}