import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { FileService } from '../../services/file.service';
import { AppComponent } from '../app.component';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { User } from '../../services/datacontracts/user/user';
import { FileComment } from '../../services/datacontracts/file/file-comment';
import { Topic } from '../../services/datacontracts/topics/topic';


@Component({
  selector: 'app-media-viewer',
  templateUrl: './media-viewer.component.html',
  styleUrl: './media-viewer.component.css',
  standalone: false
})
export class MediaViewerComponent extends ChildComponent implements OnInit, OnDestroy {

  constructor(private fileService: FileService) {
    super();
    if (this.file) {
      this.selectedFile = this.file;
    }
  }
  fileViewers?: User[] | undefined;
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
  isShowingMediaInformation = false;
  isShowingFileViewers = false; 
  isEditingFileName = false;
  editingTopics: number[] = [];
  @ViewChild('mediaContainer', { static: false }) mediaContainer!: ElementRef;
  @ViewChild('fullscreenOverlay', { static: false }) fullscreenOverlay!: ElementRef;
  @ViewChild('fullscreenImage', { static: false }) fullscreenImage!: ElementRef;
  @ViewChild('fullscreenVideo', { static: false }) fullscreenVideo!: ElementRef;
  @ViewChild('fullscreenAudio', { static: false }) fullscreenAudio!: ElementRef; 
  @ViewChild('editFileNameInput', { static: false }) editFileNameInput!: ElementRef;

  @Input() displayExpander: boolean = true;
  @Input() displayExtraInfo: boolean = true;
  @Input() blockExpand: boolean = false;
  @Input() autoplay: boolean = true;
  @Input() autoplayAudio: boolean = false;
  @Input() autoload: boolean = true;
  @Input() displayControls: boolean = true;
  @Input() loop: boolean = true;
  @Input() muted: boolean = true;
  @Input() forceInviewLoad: boolean = false;
  @Input() showTopics: boolean = true;
  @Input() showCommentSection: boolean = true;
  @Input() showCommentSectionHeader: boolean = true;
  @Input() showCommentSectionOnLoad: boolean = true;
  @Input() canScroll: boolean = false;
  @Input() file?: FileEntry;
  @Input() fileId?: number;
  @Input() fileSrc?: string;
  @Input() title?: string;
  @Input() currentDirectory?: string = '';
  @Input() user?: User;
  @Input() inputtedParentRef?: AppComponent;
  @Input() isLoadedFromURL = false;
  @Input() showMediaInformation = false; 
  @Output() emittedNotification = new EventEmitter<string>();
  @Output() commentHeaderClickedEvent = new EventEmitter<boolean>();
  @Output() expandClickedEvent = new EventEmitter<FileEntry>();
  @Output() topicClickedEvent = new EventEmitter<Topic[]>();
  @Output() mediaEndedEvent = new EventEmitter<void>();

  async ngOnInit() { 
    if (this.isLoadedFromURL) {
      const componentContainers = document.getElementsByClassName("componentContainer");
      for (let i = 0; i < componentContainers.length; i++) {
        (componentContainers[i] as HTMLDivElement).style.backgroundColor = "var(--component-background-color)";
      }
    } 
  }
  onInView(isInView: boolean) {
    if (!this.forceInviewLoad || (this.forceInviewLoad && isInView && this.isComponentHeightSufficient())) {
      this.fetchFileSrc().then(() => {
        const urlContainsMedia = window.location.href.includes('/Media'); 
        const file = this.file ?? this.selectedFile;
        if (urlContainsMedia && (file?.fileName || file?.givenFileName)) {
          this.selectedFileName = file.givenFileName ?? file.fileName ?? "MediaViewer";
          if (file) {
            this.inputtedParentRef?.replacePageTitleAndDescription(this.selectedFileName, this.selectedFileName);
          }
        }  
      });
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
        this.setFileSrcById(this.selectedFile.id);
      } 
    }
    else if (this.file) {
      const fileObject = Array.isArray(this.file) && this.file.length > 0 ? this.file[0] : this.file;
      const fileId = fileObject.id;

      const parentRef = this.parentRef || this.inputtedParentRef;
      if (parentRef?.pictureSrcs[fileId]?.value) {
        this.setFileSrcByParentRefValue(fileId);
      } else {
        this.setFileSrcById(fileId);
        this.selectedFile = fileObject;
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
    window.removeEventListener('popstate', this.handleBackButton);
    window.removeEventListener('keydown', this.handleEscapeKey);
  }
  
  private handleBackButton = (event: PopStateEvent) => {
    if (this.isFullscreenMode) {
      event.preventDefault();  
      this.shrink(); 
      window.history.pushState(null, '', window.location.href);
    }
  };
 
  private handleEscapeKey = (event: KeyboardEvent) => {
    if (this.isFullscreenMode && event.key === 'Escape') {
      this.shrink();  
    }
  };
 
  private setupBackButtonListener() { 
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', this.handleBackButton);
  }
 
  private setupEscapeKeyListener() {
    console.log("set up escape listener");
    window.addEventListener('keydown', this.handleEscapeKey);
  }
  /**
 * Reloads the media in the component by resetting and fetching the file source again
 * @param forceReload If true, will reload even if the src hasn't changed
 */
  async reloadMedia(forceReload: boolean = false) {
    // Reset current state
    this.resetSelectedFile();

    // Check which input property has changed and needs to be used for reloading
    if (this.fileSrc && (forceReload || this.fileSrc !== this.selectedFileSrc)) {
      // Directly use the provided src
      this.selectedFileSrc = this.fileSrc;
      this.showThumbnail = true;
      this.muteOtherVideos();
    }
    else if (this.fileId && (forceReload || !this.selectedFile || this.fileId !== this.selectedFile.id)) {
      // Fetch by file ID
      this.selectedFile = { id: this.fileId } as FileEntry;
      await this.setFileSrcById(this.fileId);
    }
    else if (this.file && (forceReload || !this.selectedFile || this.file !== this.selectedFile)) {
      // Use the provided file object
      const fileObject = Array.isArray(this.file) && this.file.length > 0 ? this.file[0] : this.file;
      if (fileObject.id) {
        await this.setFileSrcById(fileObject.id);
      } else if (fileObject.filePath) {
        // Handle case where file has a direct path but no ID
        this.selectedFileSrc = fileObject.filePath;
        this.showThumbnail = true;
        this.muteOtherVideos();
      }
      this.selectedFile = fileObject;
    }

    // If we have a media container, reload the media element
    if (this.mediaContainer && this.mediaContainer.nativeElement) {
      const mediaElement = this.mediaContainer.nativeElement;

      // For video/audio elements, we need to load() after changing src
      if (mediaElement instanceof HTMLVideoElement || mediaElement instanceof HTMLAudioElement) {
        mediaElement.src = this.selectedFileSrc;
        mediaElement.load();

        // Reapply autoplay settings if needed
        if (this.autoplay && mediaElement instanceof HTMLVideoElement) {
          mediaElement.play().catch(e => console.log('Autoplay prevented:', e));
        }
        if (this.autoplayAudio && mediaElement instanceof HTMLAudioElement) {
          mediaElement.play().catch(e => console.log('Autoplay prevented:', e));
        }
      }
      // For images, just setting src is enough
      else if (mediaElement instanceof HTMLImageElement) {
        mediaElement.src = this.selectedFileSrc;
      }
    }
  }
  forceLoad() {
    this.autoload = true;
    this.ngOnInit();
  }
  copyLink() {
    const link = `https://bughosted.com/${this.file?.directory?.includes("Meme") ? 'Memes' : 'File'}/${this.file?.id ?? this.selectedFile!.id}`;
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

    if (!this.selectedFile?.givenFileName && !this.selectedFile?.fileName) {
      this.fileService.getFileEntryById(fileId).then(res => {
        if (res) {
          this.selectedFile = res;
        }
      });
    }
    if (this.abortFileRequestController) {
      this.abortFileRequestController.abort();
    }
    this.abortFileRequestController = new AbortController();
    try {
      const parent = this.inputtedParentRef ?? this.parentRef;
      const user = parent?.user;
      const sessionToken = await parent?.getSessionToken();
      this.fileService.getFileById(fileId, sessionToken ?? "", {
        signal: this.abortFileRequestController.signal
      }, user?.id).then(response => {
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
            this.parentRef.pictureSrcs.push({ key: fileId + '', value: this.selectedFileSrc, type: type, extension: this.selectedFileExtension });
          }
          else if (this.inputtedParentRef && !this.inputtedParentRef.pictureSrcs.find(x => x.key == fileId + '')) {
            this.inputtedParentRef.pictureSrcs.push({ key: fileId + '', value: this.selectedFileSrc, type: type, extension: this.selectedFileExtension });
          }
          setTimeout(() => {
            if (this.mediaContainer && this.mediaContainer.nativeElement) {
              //this.mediaContainer.nativeElement.muted = true;
             // this.mediaContainer.nativeElement.loop = true;
            }
          }, 50);
        };
      });
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
  editFileName(file: FileEntry) {
    this.isEditingFileName = true; 
  }
  async saveFileName(file: FileEntry) {
    const fileName = this.editFileNameInput.nativeElement.value.trim();
    if (!fileName || fileName.length === 0) {
      this.emittedNotification.emit("File name cannot be empty!");
      return;
    }
    if (fileName === file.fileName) {
      this.isEditingFileName = false;
      return;
    }
    this.startLoading(); 
    const res = await this.fileService.updateFileData(this.user?.id ?? this.inputtedParentRef?.user?.id ?? 0, { FileId: file.id, GivenFileName: fileName, Description: '', LastUpdatedBy: this.user || this.inputtedParentRef?.user || new User(0, "Anonymous") });
    if (res) {
      this.inputtedParentRef?.showNotification(res);
      file.givenFileName = fileName;
      this.isEditingFileName = false;
    }
    this.stopLoading();
  }
  async removeTopicFromFile(topic: Topic, file: FileEntry) {
    const user = this.inputtedParentRef?.user ?? this.parentRef?.user;
    if (user) {
      file.topics = file.topics?.filter(x => x.id != topic.id);
      await this.fileService.editTopics(user, file, file.topics ?? []);
    }
  }
  editFileTopic(file: FileEntry) { 
    if (this.editingTopics.includes(file.id)) {
      this.editingTopics = this.editingTopics.filter(x => x != file.id);
    } else {
      this.editingTopics.push(file.id);
    }
  }
  async editFileTopicInDB(topics: Topic[], file: FileEntry) {
    const user = this.inputtedParentRef?.user ?? this.parentRef?.user;
    if (user) {
      await this.fileService.editTopics(user, file, topics);
      this.editingTopics = this.editingTopics.filter(x => x != file.id);
      file.topics = topics;
    }
  }
  expandFile(file: any) {
    if (this.selectedFile) { this.expandClickedEvent.emit(this.selectedFile); }
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

    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      parent.hideBodyOverflow();
    }

    this.setupBackButtonListener();
    this.setupEscapeKeyListener();
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

    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      parent.restoreBodyOverflow();
    }

    window.removeEventListener('popstate', this.handleBackButton);
    window.removeEventListener('keydown', this.handleEscapeKey);
  } 

  async download(file: FileEntry, force: boolean) {

    if (!confirm(`Download ${file.givenFileName ?? file.fileName}?`)) {
      return;
    }
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (!parent) return;
    const session = await parent.getSessionToken();

    let directoryValue = this.currentDirectory;
    if (!directoryValue) {

      const fileEntry = await this.fileService.getFileEntryById(file.id);
      if (fileEntry) {
        directoryValue = fileEntry.directory;
      }
    }
 
    let target = (directoryValue ?? "").replace(/\\/g, "/");
    target += ((directoryValue ?? "").length > 0 && (directoryValue ?? "")[(directoryValue ?? "").length - 1] === this.fS) ? file.fileName : (directoryValue ?? "").length > 0 ? this.fS + file.fileName : file.fileName;

    console.log(target,directoryValue);
    try {
      this.startLoading();
      this.emittedNotification.emit(`Downloading ${file.fileName}`);

      const response = await this.fileService.getFile(target, undefined, this.parentRef?.user ?? this.inputtedParentRef?.user);
      const blob = new Blob([(response?.blob)!], { type: 'application/octet-stream' });

      const a = document.createElement('a');
      a.href = window.URL.createObjectURL(blob);
      a.download = file.fileName ?? "";
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
    this.muteOtherVideos(currentVideo);
  }

  muteOtherVideos(excludeMedia?: HTMLMediaElement) {
    const mediaElements = document.querySelectorAll<HTMLMediaElement>('video, audio');

    mediaElements.forEach((media) => {
      if (media !== excludeMedia) {
        media.muted = true;
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
    if (ext.includes("image")) return true;
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
  topicClicked(event?: Topic[]) {
    if (event) {
      this.topicClickedEvent.emit(event);
    }
  }
  formatFileSize(bytes: number, decimalPoint: number = 2): string {
    return this.fileService.formatFileSize(bytes, decimalPoint);
  }
  getDirectoryName(file: FileEntry): string {
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      return parent?.getDirectoryName(file);
    } else return '.';
  }
  shortenFilename(filename: string, maxLength: number = 20): string {
    if (!filename || filename.length <= maxLength) {
      return filename;
    }

    // Split filename into base name and extension
    const lastDotIndex = filename.lastIndexOf('.');
    let baseName = filename;
    let extension = '';

    if (lastDotIndex !== -1 && lastDotIndex < filename.length - 1) {
      baseName = filename.substring(0, lastDotIndex);
      extension = filename.substring(lastDotIndex); // Includes the dot
    }

    // If the extension is too long, prioritize it but truncate base name more
    if (extension.length >= maxLength - 3) {
      return extension.substring(0, maxLength - 3) + '...';
    }

    // Calculate lengths for base name parts
    const availableLength = maxLength - extension.length - 3; // Room for "..."
    const firstPartLength = Math.ceil(availableLength / 2);
    const lastPartLength = availableLength - firstPartLength;

    // Ensure we don't exceed the base name length
    const truncatedBaseName = baseName.length <= availableLength
      ? baseName
      : baseName.substring(0, firstPartLength) + '...' + baseName.slice(-lastPartLength);

    return truncatedBaseName + extension;
  }
  showMediaInformationButtonClicked() {
    this.isShowingMediaInformation = !this.isShowingMediaInformation;
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (this.isShowingMediaInformation) {
      parent?.showOverlay();
    } else {
      parent?.closeOverlay();
    }
    console.log(this.selectedFile);
  }
  closeMediaInformationButtonClicked() { 
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (this.isShowingMediaInformation) {
      parent?.closeOverlay();
    }  
    setTimeout(() => { this.isShowingMediaInformation = false; }, 50);
  }
  getFileViewers(fileId: number) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.closeOverlay();
    this.fileService.getFileViewers(fileId).then(res => {
      parent?.showOverlay();
      this.fileViewers = res;
      this.isShowingFileViewers = true;
    });
  }
  closeFileViewers() {
    this.isShowingFileViewers = false; 
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.closeOverlay();
  }
  onMediaEnded() {
    console.log("Media ended");
    this.mediaEndedEvent.emit();
  }
  
}
