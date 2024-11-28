import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
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
  constructor(private fileService: FileService) {
    super();
    if (this.file) {
      this.selectedFile = this.file;
    }
  }

  selectedFileExtension = '';
  selectedFileSrc = '';
  selectedFile: FileEntry | undefined;
  fileType = '';
  showThumbnail = false;
  showComments = true;
  showCommentLoadingOverlay = false;
  selectedFileName = '';
  abortFileRequestController: AbortController | null = null; 
  fS = '/'; 
  isFullscreenMode = false;
  @ViewChild('mediaContainer', { static: false }) mediaContainer!: ElementRef;
  @ViewChild('fullscreenOverlay', { static: false }) fullscreenOverlay!: ElementRef;
  @ViewChild('fullscreenImage', { static: false }) fullscreenImage!: ElementRef;
  @ViewChild('fullscreenVideo', { static: false }) fullscreenVideo!: ElementRef;
  @ViewChild('fullscreenAudio', { static: false }) fullscreenAudio!: ElementRef;
   
  @Input() displayExpander: boolean = true;
  @Input() displayExtraInfo: boolean = true;
  @Input() blockExpand: boolean = false;
  @Input() autoplay: boolean = true;
  @Input() autoload: boolean = true;
  @Input() forceInviewLoad: boolean = false;
  @Input() showCommentSection: boolean = true; 
  @Input() showCommentSectionOnLoad: boolean = true; 
  @Input() canScroll: boolean = false;
  @Input() file?: FileEntry;
  @Input() fileId?: number;
  @Input() fileSrc?: string; 
  @Input() title?: string; 
  @Input() currentDirectory?: string = '';
  @Input() user?: User;
  @Input() inputtedParentRef?: AppComponent;
  @Output() emittedNotification = new EventEmitter<string>(); 
    
  async ngOnInit() { 
  }
  onInView(isInView: boolean) { 
    if (!this.forceInviewLoad || (this.forceInviewLoad && isInView && this.isComponentHeightSufficient())) {
      this.fetchFileSrc();
    } else {
      // Pause any media playback when not in view or height is insufficient
      if (this.mediaContainer && this.mediaContainer.nativeElement instanceof HTMLVideoElement) {
        this.mediaContainer.nativeElement.pause();
      } else if (this.mediaContainer && this.mediaContainer.nativeElement instanceof HTMLAudioElement) {
        this.mediaContainer.nativeElement.pause();
      }

      // Abort the file request if loading is in progress
      if (this.abortFileRequestController) {
        this.abortFileRequestController.abort();
      }
    }
  }

  // Helper method to check if the component's height is sufficient
  private isComponentHeightSufficient(): boolean {
    const mediaContainer = document.getElementById('mediaContainer' + this.fileId);
    if (mediaContainer) {
      const containerHeight = mediaContainer.offsetHeight;
      const windowHeight = window.innerHeight; 
      return containerHeight <= windowHeight;
    }
    return false;
  }

  async fetchFileSrc() { 
    if (this.fileSrc) {
      this.selectedFileSrc = this.fileSrc;
      return;
    }
    if (this.selectedFileSrc) return;
    if (!this.autoload) return;
    if (this.fileId) {
      this.selectedFile = {
        id: this.fileId,
      } as FileEntry;
         
      if (this.parentRef && this.parentRef.pictureSrcs[this.fileId] && this.parentRef.pictureSrcs[this.fileId].value
        || this.inputtedParentRef && this.inputtedParentRef.pictureSrcs[this.fileId] && this.inputtedParentRef.pictureSrcs[this.fileId].value) {  
        this.setFileSrcByParentRefValue(this.fileId);  
        return;
      } else {
        await this.setFileSrcById(this.selectedFile.id);
      }

    }
    else if (this.file && Array.isArray(this.file) && this.file.length > 0) {
      const fileObject = this.file[0];
      if (this.parentRef && this.parentRef.pictureSrcs[fileObject.id] && this.parentRef.pictureSrcs[fileObject.id].value
        || this.inputtedParentRef && this.inputtedParentRef.pictureSrcs[fileObject.id] && this.inputtedParentRef.pictureSrcs[fileObject.id].value) {
        console.log("setting file Src for file id" + this.fileId); 
        this.setFileSrcByParentRefValue(fileObject.id);  
        return;
      } else {
        await this.setFileSrcById(fileObject.id);
        this.selectedFile = fileObject;
      }
    } else if (this.file && !Array.isArray(this.file)) {
      if (this.parentRef && this.parentRef.pictureSrcs[this.file.id] && this.parentRef.pictureSrcs[this.file.id].value
        || this.inputtedParentRef && this.inputtedParentRef.pictureSrcs[this.file.id] && this.inputtedParentRef.pictureSrcs[this.file.id].value) {
        console.log("setting file Src for file id" + this.fileId);
        this.setFileSrcByParentRefValue(this.file.id); 
        return;
      } else {
        await this.setFileSrcById(this.file.id);
        this.selectedFile = this.file;
      }
    }
  }
  private setFileSrcByParentRefValue(id: number) {
    this.muteOtherVideos();
    this.selectedFileSrc = this.parentRef?.pictureSrcs[id].value ?? this.inputtedParentRef!.pictureSrcs[id].value;
  }

  resetSelectedFile() {
    if (this.abortFileRequestController) {
      this.abortFileRequestController.abort("Component is destroyed");
    }
    this.selectedFile = undefined;
    this.selectedFileSrc = "";
    this.selectedFileName = "";
    this.selectedFileExtension = "";
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
    try {
      navigator.clipboard.writeText(link);
      this.emittedNotification.emit(`${link} copied to clipboard!`);
    } catch {
      this.emittedNotification.emit("Error: Unable to share link!");
      console.log("Error: Unable to share link!");
    }
  }
  createUserProfileComponent(user?: User) {
    if (!user) { return alert("you must select a user!"); }
    setTimeout(() => { this.inputtedParentRef?.createComponent("User", { "user": user }); }, 1);
  }
   
  async setFileSrcById(fileId: number) {
    if (this.selectedFileSrc) return; 
    if (this.parentRef && this.parentRef.pictureSrcs && this.parentRef.pictureSrcs.find(x => x.key == fileId + '')) {
      this.showThumbnail = true; 
      this.selectedFileSrc = this.parentRef.pictureSrcs.find(x => x.key == fileId + '')!.value;
      this.fileType = this.parentRef.pictureSrcs.find(x => x.key == fileId + '')!.type;
      this.selectedFileExtension = this.parentRef.pictureSrcs.find(x => x.key == fileId + '')!.extension;
      this.muteOtherVideos();
      return;
    }
    else if (this.inputtedParentRef && this.inputtedParentRef.pictureSrcs && this.inputtedParentRef.pictureSrcs.find(x => x.key == fileId + '')) {
      this.showThumbnail = true;
      this.selectedFileSrc = this.inputtedParentRef.pictureSrcs.find(x => x.key == fileId + '')!.value;
      this.fileType = this.inputtedParentRef.pictureSrcs.find(x => x.key == fileId + '')!.type;
      this.selectedFileExtension = this.inputtedParentRef.pictureSrcs.find(x => x.key == fileId + '')!.extension;
      this.muteOtherVideos();
      return;
    }
    //this.startLoading();
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
        this.selectedFileSrc = (reader.result as string);
        if (this.parentRef && !this.parentRef.pictureSrcs.find(x => x.key == fileId + '')) {
          //console.log("adding file src to parentRef.pictureSrcs " + fileId);
          this.parentRef.pictureSrcs.push({ key: fileId + '', value: this.selectedFileSrc, type: type, extension: this.selectedFileExtension });
        }
        else if (this.inputtedParentRef && !this.inputtedParentRef.pictureSrcs.find(x => x.key == fileId + '')) {
          //console.log("adding file src to inputtedParentRef.pictureSrcs " + fileId);  
          this.inputtedParentRef.pictureSrcs.push({ key: fileId + '', value: this.selectedFileSrc, type: type, extension: this.selectedFileExtension });
        }
        setTimeout(() => { 
          if (this.mediaContainer && this.mediaContainer.nativeElement)
            this.mediaContainer.nativeElement.muted = true;
        }, 50);
      };
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error(error);
        this.emittedNotification.emit((error as Error).message);
      }
    } finally {
      this.stopLoading();
      if (this.canScroll) { 
        setTimeout(() => { document.getElementById('fileIdName' + fileId)?.scrollIntoView(); }, 100);
      }
    }
  }
 
  expandFile(file: any) {
    if (this.blockExpand) return;
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
      this.emittedNotification.emit(`Downloading ${file.fileName}`);

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
      this.emittedNotification.emit((ex as Error).message); 
    }
  }
  togglePlay(currentVideo: HTMLVideoElement | HTMLAudioElement) {
    // Mute and pause all other media elements
    this.muteOtherVideos(currentVideo);  
    currentVideo.muted = false;
    currentVideo.play(); 
  }

  muteOtherVideos(excludeMedia?: HTMLMediaElement) {
    const mediaElements = document.querySelectorAll<HTMLMediaElement>('video, audio');

    mediaElements.forEach((media) => {
      // Mute and pause all media elements except the current video
      if (media !== excludeMedia) {
        media.muted = true;
        media.pause();
      }
    });
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
  otherFileExtensionsIncludes(ext: string) {
    return !this.videoFileExtensionsIncludes(ext) && !this.audioFileExtensionsIncludes(ext) && !this.imageFileExtensionsIncludes(ext);
  }
  commentAddedEvent(comment: FileComment) { 
    const addCommentToFile = (file: { fileComments?: FileComment[] }) => {
      if (file) {
        if (!file.fileComments) {
          file.fileComments = [];
        }
        file.fileComments.push(comment);
      }
    }; 
    if (this.file) { 
      addCommentToFile(this.file);
    }
    else if (this.selectedFile) {
      addCommentToFile(this.selectedFile);
    }
  } 
}
