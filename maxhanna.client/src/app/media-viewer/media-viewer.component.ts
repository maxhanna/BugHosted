import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { FileEntry } from '../../services/datacontracts/file-entry';
import { FileService } from '../../services/file.service';
import { FileComment } from '../../services/datacontracts/file-comment';
import { User } from '../../services/datacontracts/user';
import { AppComponent } from '../app.component';
import { FileData } from '../../services/datacontracts/file-data';


@Component({
  selector: 'app-media-viewer',
  templateUrl: './media-viewer.component.html',
  styleUrl: './media-viewer.component.css'
})
export class MediaViewerComponent extends ChildComponent implements OnInit {
  constructor(private fileService: FileService) { super(); }
  notifications: string[] = [];

  videoFileExtensions = [
    "mp4", "mov", "avi", "wmv", "webm", "flv", "mkv", "m4v", "mpg", "mpeg", "3gp", "3g2", "asf", "rm",
    "rmvb", "swf", "vob", "ts", "mts", "m2ts", "mxf", "ogv", "divx", "xvid", "dv", "drc", "f4v", "f4p",
    "f4a", "f4b"
  ]; 
  audioFileExtensions = [
    "mp3", "wav", "ogg", "flac", "aac", "aiff", "alac", "amr", "ape", "au", "dss", "gsm", "m4a", "m4b",
    "m4p", "mid", "midi", "mpa", "mpc", "oga", "opus", "ra", "rm", "sln", "tta", "voc", "vox", "wma",
    "wv"
  ];
  imageFileExtensions = [
    "jpg", "jpeg", "png", "gif", "bmp", "tiff", "svg", "webp", "heif", "heic", "ico", "psd", "raw",
    "cr2", "nef", "orf", "sr2", "arw", "dng", "rw2", "pef", "raf", "3fr", "ari", "bay", "cap", "dcr",
    "drf", "eip", "erf", "fff", "iiq", "k25", "kdc", "mdc", "mos", "mrw", "nrw", "obm", "orf", "pef",
    "ptx", "r3d", "raf", "raw", "rwl", "rw2", "sr2", "srf", "srw", "x3f"
  ];

  selectedFileExtension = '';
  selectedFileSrc = '';
  selectedFile: FileEntry | undefined;
  fileType = '';
  showThumbnail = false;
  showComments = true;
  showCommentLoadingOverlay = false;
  selectedFileName = '';
  abortFileRequestController: AbortController | null = null;
  debounceTimer: any; 
  fS = '/';
  isFullscreenMode = false;
  @ViewChild('mediaContainer', { static: false }) mediaContainer!: ElementRef;
  @ViewChild('fullscreenOverlay', { static: false }) fullscreenOverlay!: ElementRef;
  @ViewChild('fullscreenImage', { static: false }) fullscreenImage!: ElementRef;
  @ViewChild('fullscreenVideo', { static: false }) fullscreenVideo!: ElementRef;
  @ViewChild('fullscreenAudio', { static: false }) fullscreenAudio!: ElementRef;
   
  @Input() displayExpander: boolean = true;
  @Input() displayExtraInfo: boolean = true;
  @Input() autoplay: boolean = true;
  @Input() showCommentSection: boolean = true;
  @Input() file?: FileEntry; 
  @Input() currentDirectory?: string = '';
  @Input() user?: User;
  @Input() inputtedParentRef?: AppComponent;

  async ngOnInit() {
    if (this.file && this.file.fileName && this.user) {
      await this.setFileSrc(this.file.fileName, this.currentDirectory);
      this.selectedFile = this.file;
    }
  }
  copyLink() {
    console.log("in compy link");
    const link = `https://bughosted.com/${this.currentDirectory == 'Meme/' ? 'Memes' : 'File'}/${this.file?.id ?? this.selectedFile!.id}`;
    console.log(link);
    navigator.clipboard.writeText(link).then(() => {
      this.notifications.push('Link copied to clipboard!');
    }).catch(err => {
      this.notifications.push('Failed to copy link!');
    });
  }
  createUserProfileComponent(user?: User) {
    if (!user) { return alert("you must select a user!"); }
    setTimeout(() => { this.inputtedParentRef?.createComponent("User", { "user": user }); }, 1);
  }
  async setFileSrc(fileName: string, currentDirectory?: string) {
    this.startLoading();
    if (this.abortFileRequestController) {
      this.abortFileRequestController.abort();
    }
    if (currentDirectory) {
      this.currentDirectory = currentDirectory;
    }
    this.abortFileRequestController = new AbortController();

    let target = (currentDirectory ?? '').replace(/\\/g, "/");
    target += (currentDirectory && currentDirectory.length > 0 && currentDirectory[currentDirectory.length - 1] === this.fS) ? fileName : currentDirectory && currentDirectory.length > 0 ? this.fS + fileName : fileName;

    const response = await this.fileService.getFile(target, {
      signal: this.abortFileRequestController.signal
    });
    if (!response || response == null) return;
    const contentDisposition = response.headers["content-disposition"];
    this.selectedFileExtension = this.getFileExtensionFromContentDisposition(contentDisposition);
    const type = this.fileType = this.videoFileExtensions.includes(this.selectedFileExtension)
      ? `video/${this.selectedFileExtension}`
      : this.audioFileExtensions.includes(this.selectedFileExtension)
        ? `audio/${this.selectedFileExtension}`
        : `image/${this.selectedFileExtension}`;

    const blob = new Blob([response.blob], { type });
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => {
      this.showThumbnail = true;
      setTimeout(() => { this.selectedFileSrc = (reader.result as string); }, 1);
      this.selectedFileName = fileName;
    }; 
    this.stopLoading();
  }
  expandFile(file: any) {
    this.isFullscreenMode = true;
    (this.mediaContainer.nativeElement as HTMLMediaElement).src = '';
    const overlay = this.fullscreenOverlay.nativeElement;
    const image = this.fullscreenImage.nativeElement;
    const video = this.fullscreenVideo.nativeElement;
    const audio = this.fullscreenAudio.nativeElement;

    if (this.videoFileExtensions.includes(file.extension)) {
      video.src = this.selectedFileSrc;
      video.style.display = 'block';
      image.style.display = 'none';
      audio.style.display = 'none';
    } else if (this.audioFileExtensions.includes(file.extension)) {
      audio.src = this.selectedFileSrc;
      audio.style.display = 'block';
      image.style.display = 'none';
      video.style.display = 'none';
    } else {
      image.src = this.selectedFileSrc;
      image.style.display = 'block';
      video.style.display = 'none';
      audio.style.display = 'none';
    }

    overlay.style.display = 'block';
  }

  shrink() {
    const overlay = this.fullscreenOverlay.nativeElement;
    const image = this.fullscreenImage.nativeElement;
    const video = this.fullscreenVideo.nativeElement;
    const audio = this.fullscreenAudio.nativeElement;
    image.src = undefined;
    video.src = undefined;
    audio.src = undefined;
    (this.mediaContainer.nativeElement as HTMLMediaElement).src = this.selectedFileSrc;

    overlay.style.display = 'none';
    this.isFullscreenMode = false;
  }
  getFileExtensionFromContentDisposition(contentDisposition: string | null): string {
    if (!contentDisposition) return '';
    try {
      // Match the filename* pattern first to handle UTF-8 encoding
      const filenameStarMatch = contentDisposition.match(/filename\*=['"]?UTF-8''([^'";\s]+)['"]?/);
      if (filenameStarMatch && filenameStarMatch[1]) {
        const utf8Filename = decodeURIComponent(filenameStarMatch[1]);
        return utf8Filename.split('.').pop() || '';
      }

      // Match the filename pattern
      const filenameMatch = contentDisposition.match(/filename=['"]?([^'";\s]+)['"]?/);
      if (filenameMatch && filenameMatch[1]) {
        const filename = filenameMatch[1];
        return filename.split('.').pop() || '';
      }
    }
    catch { }

    return '';
  }
   

  async download(file: FileEntry, force: boolean) {
    
    if (!confirm(`Download ${file.fileName}?`)) {
      return;
    }

    const directoryValue = this.currentDirectory;
    let target = (directoryValue ?? "").replace(/\\/g, "/");
    target += ((directoryValue ?? "").length > 0 && (directoryValue ?? "")[(directoryValue ?? "").length - 1] === this.fS) ? file.fileName : (directoryValue ?? "").length > 0 ? this.fS + file.fileName : file.fileName;

    try {
      this.startLoading();
      const response = await this.fileService.getFile(target, undefined, this.user);
      const blob = new Blob([(response?.blob)!], { type: 'application/octet-stream' });

      const a = document.createElement('a');
      a.href = window.URL.createObjectURL(blob);
      a.download = file.fileName;
      a.id = (Math.random() * 100) + "";
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(a.href);
      document.getElementById(a.id)?.remove();
      this.stopLoading();
    } catch (ex) {
      console.error(ex);
    }
  }
}