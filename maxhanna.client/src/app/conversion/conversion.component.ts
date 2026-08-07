import { Component, ElementRef, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { ConversionService, ConversionResult, FontConversionResult, YoutubeDownloadResult, TextToAsciiResult } from '../../services/conversion.service';
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
  isUploading = false;
  isDragging = false;
  private uploadedFileKey = '';

  imageFormats = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tiff', 'tga', 'qoi', 'pbm', 'pnm', 'pgm', 'ppm'];
  audioFormats = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'opus', 'wma', 'ac3', 'mp2', 'alac', 'mka'];
  videoFormats = ['mp4', 'webm', 'mkv', 'avi', 'mov', 'm4v', 'flv', 'wmv', 'ts', 'm2ts', 'mpeg', 'mpg', 'ogv', '3gp', 'asf'];
  targetFormat = 'jpg';
  isConverting = false;
  conversionResult?: ConversionResult;

  fontText = '';
  isMakingFont = false;
  fontResult?: FontConversionResult;
  fontFamilyName = 'ConvertedFont';
  fontSampleText = 'The quick brown fox jumps over the lazy dog. 0123456789';

  visionPrompt = '';
  isRunningVision = false;
  visionStatusText = '';
  visionError = '';
  visionReport?: string;

  youtubeUrl = '';
  youtubeFormat = 'mp4';
  isDownloadingYoutube = false;
  youtubeProgress = 0;
  youtubeStatusText = '';
  youtubeError = '';
  youtubeResult?: YoutubeDownloadResult;

  asciiStyles = ['Blocks', 'Solid', 'Dots', 'Hash', 'Slash', 'Backslash', 'Bars', 'Stars', 'Dashes', 'Outline', 'Bubbles', 'Sparkle', 'Shade', 'Dither', 'Checker', 'Fade', '3D', 'Neon', 'Graffiti', 'Italic', 'Sideways', 'Flip', 'Bubble', 'Wave', 'Confetti', 'Stencil', 'Chrome', 'Negative', 'Halo', 'Mirror', 'Zigzag', 'Hatch', 'Deep', 'Aura', 'Gradient', 'Fence', 'Emboss', 'Cave', 'Grid', 'Slice', 'Dust', 'Chocolate', 'Mosaic', 'Ember', 'Melt', 'Jagged', 'GlowStencil', 'Blurred', 'Rose', 'Gothic', 'Crypt', 'Grave', 'Oldpaper', 'Statement', 'Prism', 'Illusion', 'Brushed', 'Slate', 'CutGlass', 'Parchment', 'Tattoo', 'Viscous', 'Lantern', 'Candy', 'Sunny', 'Party'];
  asciiText = '';
  asciiStyle = 'Blocks';
  asciiScale = 1;
  asciiScaleOptions = [1, 2, 3];
  isGeneratingAscii = false;
  asciiResult?: TextToAsciiResult;

  constructor(private conversionService: ConversionService, private fileService: FileService) {
    super();
  }

  get detectedKind(): 'image' | 'audio' | 'video' | 'other' {
    if (!this.selectedFile) return 'other';
    if (this.selectedFile.type.startsWith('image/')) return 'image';
    if (this.selectedFile.type.startsWith('audio/')) return 'audio';
    if (this.selectedFile.type.startsWith('video/')) return 'video';
    return 'other';
  }

  get detectedKindLabel(): string {
    switch (this.detectedKind) {
      case 'image': return 'Image';
      case 'audio': return 'Audio';
      case 'video': return 'Video';
      default: return 'File';
    }
  }

  get availableFormats(): string[] {
    switch (this.detectedKind) {
      case 'image': return this.imageFormats;
      case 'audio': return this.audioFormats;
      case 'video': return this.videoFormats;
      default: return [...this.imageFormats, ...this.audioFormats, ...this.videoFormats];
    }
  }

  get formatGroupLabel(): string {
    switch (this.detectedKind) {
      case 'image': return 'Image formats';
      case 'audio': return 'Audio formats';
      case 'video': return 'Video formats';
      default: return 'All formats';
    }
  }

  isImageSelected(): boolean {
    return this.detectedKind === 'image';
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragging = true;
  }

  onDragLeave() {
    this.isDragging = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging = false;
    const file = event.dataTransfer?.files?.[0];
    if (file) this.setSelectedFile(file);
  }

  onFileSelected(event: any) {
    const file: File | undefined = event?.target?.files?.[0];
    if (file) this.setSelectedFile(file);
  }

  setSelectedFile(file: File) {
    this.selectedFile = file;
    this.selectedFileEntry = undefined;
    this.uploadedFileKey = '';
    this.conversionResult = undefined;
    this.fontResult = undefined;
    this.visionReport = undefined;
    this.youtubeResult = undefined;
    if (this.localPreviewUrl) URL.revokeObjectURL(this.localPreviewUrl);
    this.localPreviewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;

    this.targetFormat = this.defaultFormatFor(this.detectedKind);
    if (!this.availableFormats.includes(this.targetFormat)) {
      this.targetFormat = this.availableFormats[0] ?? 'png';
    }
  }

  clearSelectedFile() {
    this.selectedFile = undefined;
    this.selectedFileEntry = undefined;
    this.uploadedFileKey = '';
    if (this.localPreviewUrl) { URL.revokeObjectURL(this.localPreviewUrl); this.localPreviewUrl = undefined; }
    this.conversionResult = undefined;
    this.fontResult = undefined;
    this.visionReport = undefined;
    if (this.fileInput) this.fileInput.nativeElement.value = '';
  }

  private defaultFormatFor(kind: 'image' | 'audio' | 'video' | 'other'): string {
    switch (kind) {
      case 'image': return 'jpg';
      case 'audio': return 'mp3';
      case 'video': return 'mp4';
      default: return 'png';
    }
  }

  async convert() {
    if (!this.selectedFile) { this.parentRef?.showNotification('Select a file first.'); return; }
    if (!this.selectedFileEntry && !(await this.ensureUploaded())) { this.parentRef?.showNotification('Upload failed.'); return; }
    if (!this.selectedFileEntry) return;

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
    if (!this.selectedFileEntry && !(await this.ensureUploaded())) { this.parentRef?.showNotification('Upload failed.'); return; }
    if (!this.selectedFileEntry) return;

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

  async runVision() {
    if (!this.selectedFile) { this.parentRef?.showNotification('Select a file first.'); return; }
    if (!this.selectedFileEntry && !(await this.ensureUploaded())) { this.parentRef?.showNotification('Upload failed.'); return; }
    if (!this.selectedFileEntry) return;

    this.isRunningVision = true;
    this.visionReport = undefined;
    this.visionError = '';
    this.visionStatusText = 'Starting analysis…';
    try {
      const started = await this.conversionService.startVisionReport(this.selectedFileEntry.id, this.visionPrompt || undefined, this.parentRef?.user?.id);
      if (!started?.jobId) { this.parentRef?.showNotification('Could not start the analysis.'); return; }

      const jobId = started.jobId;
      let status = await this.conversionService.getVisionReportStatus(jobId);
      // Model inference can be slow - poll for 31 minutes so the client always
      // outlasts the server's 30-minute job cap and sees the final result.
      const maxWaitMs = 31 * 60 * 1000;
      const pollIntervalMs = 3000;
      const startedAt = Date.now();

      while (status && status.status !== 'completed' && status.status !== 'failed' && Date.now() - startedAt < maxWaitMs) {
        this.visionStatusText = status.progressText || 'Asking the vision model…';
        await new Promise(r => setTimeout(r, pollIntervalMs));
        status = await this.conversionService.getVisionReportStatus(jobId);
      }

      if (status?.status === 'completed') {
        this.visionReport = status.report;
        if (!this.visionReport) this.parentRef?.showNotification('The vision model returned no report.');
      } else if (status?.status === 'failed') {
        this.visionError = status.error || 'Vision report failed.';
        this.parentRef?.showNotification('Vision report failed.');
      } else {
        this.visionError = 'The analysis is still running - check back in a minute.';
        this.parentRef?.showNotification('Analysis still in progress.');
      }
    } finally {
      this.isRunningVision = false;
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

  async downloadYoutube() {
    const url = this.youtubeUrl.trim();
    if (!url) { this.parentRef?.showNotification('Paste a YouTube URL first.'); return; }

    this.isDownloadingYoutube = true;
    this.youtubeResult = undefined;
    this.youtubeError = '';
    this.youtubeProgress = 0;
    this.youtubeStatusText = 'Starting download…';
    try {
      const started = await this.conversionService.startYoutubeDownload(url, this.youtubeFormat, this.parentRef?.user?.id);
      if (!started?.jobId) { this.parentRef?.showNotification('Could not start the download.'); return; }

      const jobId = started.jobId;
      let status = await this.conversionService.getYoutubeDownloadStatus(jobId);
      const maxWaitMs = 6 * 60 * 1000;
      const pollIntervalMs = 2000;
      const startedAt = Date.now();

      while (status && status.status !== 'completed' && status.status !== 'failed' && Date.now() - startedAt < maxWaitMs) {
        this.youtubeProgress = status.progress || 0;
        this.youtubeStatusText = status.progressText || `Downloading… ${this.youtubeProgress}%`;
        await new Promise(r => setTimeout(r, pollIntervalMs));
        status = await this.conversionService.getYoutubeDownloadStatus(jobId);
      }

      if (status?.status === 'completed' && status.result) {
        this.youtubeResult = status.result;
        this.parentRef?.showNotification(status.result.title ? `Downloaded: ${status.result.title}` : 'Download complete.');
      } else if (status?.status === 'failed') {
        this.youtubeError = status.error || 'Download failed.';
        this.parentRef?.showNotification('Download failed.');
      } else {
        this.youtubeError = 'The download is still running - check back in a minute.';
        this.parentRef?.showNotification('Download still in progress.');
      }
    } finally {
      this.isDownloadingYoutube = false;
    }
  }

  async generateAscii() {
    const text = this.asciiText.trim();
    if (!text) { this.parentRef?.showNotification('Type some text first.'); return; }

    this.isGeneratingAscii = true;
    try {
      this.asciiResult = (await this.conversionService.textToAscii(text, this.asciiStyle, this.asciiScale, this.parentRef?.user?.id)) ?? undefined;
      if (!this.asciiResult) this.parentRef?.showNotification('Could not render ASCII art.');
    } finally {
      this.isGeneratingAscii = false;
    }
  }

  async copyAscii() {
    const art = this.asciiResult?.art;
    if (!art) return;
    try {
      await navigator.clipboard.writeText(art);
      this.parentRef?.showNotification('ASCII art copied to clipboard.');
    } catch (e) {
      this.parentRef?.showNotification('Could not copy - select the text manually.');
    }
  }

  private async ensureUploaded(): Promise<boolean> {
    if (this.selectedFileEntry) return true;
    if (!this.selectedFile) return false;

    const key = `${this.selectedFile.name}|${this.selectedFile.size}|${this.selectedFile.lastModified}`;
    if (key === this.uploadedFileKey && this.selectedFileEntry) return true;

    this.isUploading = true;
    try {
      const text = await this.conversionService.uploadFile(this.selectedFile, this.parentRef?.user).toPromise();
      if (!text) return false;
      let parsed: any;
      try { parsed = JSON.parse(text); } catch { return false; }
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      if (!arr.length || !arr[0]?.id) return false;
      const f = arr[0];
      this.selectedFileEntry = new FileEntry(
        f.id, f.fileName, f.directory, f.visibility, undefined, undefined,
        f.isFolder, undefined, undefined, f.fileSize, f.fileType
      );
      this.uploadedFileKey = key;
      return true;
    } finally {
      this.isUploading = false;
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
