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
  @Input() fileId?: number;
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
    if (this.fileId) {
      this.selectedFile = {
        id: this.fileId,
      } as FileEntry;

      if (this.parentRef && this.parentRef.pictureSrcs[this.fileId] && this.parentRef.pictureSrcs[this.fileId].value
        || this.inputtedParentRef && this.inputtedParentRef.pictureSrcs[this.fileId] && this.inputtedParentRef.pictureSrcs[this.fileId].value) {
        console.log("setting file Src for file id" + this.fileId);
        this.selectedFileSrc = this.parentRef?.pictureSrcs[this.fileId].value ?? this.inputtedParentRef!.pictureSrcs[this.fileId].value;
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
        this.selectedFileSrc = this.parentRef?.pictureSrcs[fileObject.id].value ?? this.inputtedParentRef!.pictureSrcs[fileObject.id].value;
        return;
      } else {
        await this.setFileSrcById(fileObject.id);
        this.selectedFile = fileObject;
      } 
    } else if (this.file && !Array.isArray(this.file)) {
      if (this.parentRef && this.parentRef.pictureSrcs[this.file.id] && this.parentRef.pictureSrcs[this.file.id].value
        || this.inputtedParentRef && this.inputtedParentRef.pictureSrcs[this.file.id] && this.inputtedParentRef.pictureSrcs[this.file.id].value) {
        console.log("setting file Src for file id" + this.fileId);
        this.selectedFileSrc = this.parentRef?.pictureSrcs[this.file.id].value ?? this.inputtedParentRef!.pictureSrcs[this.file.id].value;
        return;
      } else {
        await this.setFileSrcById(this.file.id);
        this.selectedFile = this.file;
      } 
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
    try {
      navigator.clipboard.writeText(link);
    } catch {
      console.log("Error: Unable to share link!");
    }
  }
  createUserProfileComponent(user?: User) {
    if (!user) { return alert("you must select a user!"); }
    setTimeout(() => { this.inputtedParentRef?.createComponent("User", { "user": user }); }, 1);
  }
   
  async setFileSrcById(fileId: number) {
    if (this.selectedFileSrc) return;
    //console.log(this.parentRef?.pictureSrcs);
    //console.log(this.inputtedParentRef?.pictureSrcs);
    if (this.parentRef && this.parentRef.pictureSrcs && this.parentRef.pictureSrcs.find(x => x.key == fileId + '')) {
      //console.log("getting already set file Src for file id" + fileId);
      this.showThumbnail = true; 
      this.selectedFileSrc = this.parentRef.pictureSrcs.find(x => x.key == fileId + '')!.value;
      this.fileType = this.parentRef.pictureSrcs.find(x => x.key == fileId + '')!.type;
      this.selectedFileExtension = this.parentRef.pictureSrcs.find(x => x.key == fileId + '')!.extension;
      return;
    }
    else if (this.inputtedParentRef && this.inputtedParentRef.pictureSrcs && this.inputtedParentRef.pictureSrcs.find(x => x.key == fileId + '')) {
      //console.log("getting already set file Src for file id" + fileId);
      this.showThumbnail = true;
      this.selectedFileSrc = this.inputtedParentRef.pictureSrcs.find(x => x.key == fileId + '')!.value;
      this.fileType = this.inputtedParentRef.pictureSrcs.find(x => x.key == fileId + '')!.type;
      this.selectedFileExtension = this.inputtedParentRef.pictureSrcs.find(x => x.key == fileId + '')!.extension;
      return;
    }
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
        this.selectedFileSrc = (reader.result as string);
        if (this.parentRef && !this.parentRef.pictureSrcs.find(x => x.key == fileId + '')) {
          console.log("adding file src to parentRef.pictureSrcs " + fileId);
          this.parentRef.pictureSrcs.push({ key: fileId + '', value: this.selectedFileSrc, type: type, extension: this.selectedFileExtension });
        }
        else if (this.inputtedParentRef && !this.inputtedParentRef.pictureSrcs.find(x => x.key == fileId + '')) {
          console.log("adding file src to inputtedParentRef.pictureSrcs " + fileId);  
          this.inputtedParentRef.pictureSrcs.push({ key: fileId + '', value: this.selectedFileSrc, type: type, extension: this.selectedFileExtension });
        } 
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
