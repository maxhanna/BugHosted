import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component'; 
import { FileService } from '../../services/file.service';  
import { AppComponent } from '../app.component';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { User } from '../../services/datacontracts/user/user';
import { FileComment } from '../../services/datacontracts/file/file-comment';
 

@Component({
  selector: 'app-media-viewer',
  templateUrl: './media-viewer.component.html',
  styleUrl: './media-viewer.component.css'
})
export class MediaViewerComponent extends ChildComponent implements OnInit, OnDestroy {
  constructor(private fileService: FileService) { super(); }
 
  

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
  @Input() autoload: boolean = true;
  @Input() showCommentSection: boolean = true;
  @Input() file?: FileEntry;
  @Input() fileSrc?: string; 
  @Input() currentDirectory?: string = '';
  @Input() user?: User;
  @Input() inputtedParentRef?: AppComponent;

  async ngOnInit() {
    if (this.fileSrc) {
      this.selectedFileSrc = this.fileSrc;
      return;
    }
    if (this.selectedFileSrc) return;
    if (!this.autoload) return;
    if (this.file && Array.isArray(this.file) && this.file.length > 0) {
      const fileObject = this.file[0];
      await this.setFileSrcById(fileObject.id);
      this.selectedFile = fileObject;
    } else if (this.file && !Array.isArray(this.file)) {
      await this.setFileSrcById(this.file.id);
      this.selectedFile = this.file;
    }
  }

  ngOnDestroy() {
    try {
      if (this.abortFileRequestController) {
        this.abortFileRequestController.abort("Component is destroyed");
      }
    } catch (e) { }
  }
  forceLoad() {
    this.autoload = true;
    this.ngOnInit();
  }
  copyLink() {
    const link = `https://bughosted.com/${this.file?.directory.includes("Meme") ? 'Memes' : 'File'}/${this.file?.id ?? this.selectedFile!.id}`;
    navigator.clipboard.writeText(link);
  }
  createUserProfileComponent(user?: User) {
    if (!user) { return alert("you must select a user!"); }
    setTimeout(() => { this.inputtedParentRef?.createComponent("User", { "user": user }); }, 1);
  }
   
  async setFileSrcById(fileId: number) {
    if (this.selectedFileSrc) return;
    this.startLoading();
    if (this.abortFileRequestController) {
      this.abortFileRequestController.abort();
    } 
    this.abortFileRequestController = new AbortController();
    try { 
      const response = await this.fileService.getFileById(fileId, {
        signal: this.abortFileRequestController.signal
      });
      if (!response || response == null) return;

      const contentDisposition = response.headers["content-disposition"];
      this.selectedFileExtension = this.fileService.getFileExtensionFromContentDisposition(contentDisposition);
      const type = this.fileType = this.fileService.videoFileExtensions.includes(this.selectedFileExtension)
        ? `video/${this.selectedFileExtension}`
        : this.fileService.audioFileExtensions.includes(this.selectedFileExtension)
          ? `audio/${this.selectedFileExtension}`
          : `image/${this.selectedFileExtension}`;

      const blob = new Blob([response.blob], { type });
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        this.showThumbnail = true;
        setTimeout(() => { this.selectedFileSrc = (reader.result as string); }, 1);
      };
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error(error);
      }
    } finally {
      this.stopLoading();
    }
  }
  expandFile(file: any) {
    this.isFullscreenMode = true;
    (this.mediaContainer.nativeElement as HTMLMediaElement).src = '';
    const overlay = this.fullscreenOverlay.nativeElement;
    const image = this.fullscreenImage.nativeElement;
    const video = this.fullscreenVideo.nativeElement;
    const audio = this.fullscreenAudio.nativeElement;

    if (this.fileService.videoFileExtensions.includes(file.extension)) {
      video.src = this.selectedFileSrc;
      video.style.display = 'block';
      image.style.display = 'none';
      audio.style.display = 'none';
    } else if (this.fileService.audioFileExtensions.includes(file.extension)) {
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
  commentAddedEvent(event: FileComment) {
    if (this.file) {
      if (!this.file.fileComments) {
        this.file.fileComments = new Array<FileComment>
      }
      this.file.fileComments.push(event);
    }
  }
  commentRemovedEvent(event: FileComment) {
    if (this.file && this.file.fileComments) {
      this.file.fileComments = this.file.fileComments.filter(x => x.id != event.id);
    }
  }
  videoFileExtensionsIncludes(ext: string) {
    return this.fileService.videoFileExtensions.includes(ext);
  }
  audioFileExtensionsIncludes(ext: string) {
    return this.fileService.audioFileExtensions.includes(ext);
  }
  imageFileExtensionsIncludes(ext: string) {
    return this.fileService.imageFileExtensions.includes(ext);
  }
}
