import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, OnChanges, SimpleChanges, Output, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { FileService } from '../../services/file.service';
import { AppComponent } from '../app.component';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { User } from '../../services/datacontracts/user/user';
import { FileComment } from '../../services/datacontracts/file/file-comment';
import { Topic } from '../../services/datacontracts/topics/topic';
import { Todo } from '../../services/datacontracts/todo';
import { TodoService } from '../../services/todo.service';
import { TopicsComponent } from '../topics/topics.component';


@Component({
  selector: 'app-media-viewer',
  templateUrl: './media-viewer.component.html',
  styleUrl: './media-viewer.component.css',
  standalone: false
})
export class MediaViewerComponent extends ChildComponent implements OnInit, OnDestroy, OnChanges {

  constructor(private fileService: FileService, private todoService: TodoService) {
    super();
    if (this.file) {
      this.selectedFile = this.file;
    }
  }
  fileViewers?: User[] | undefined;
  fileFavouriters?: User[] | undefined;
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
  isShowingFileFavouriters = false;
  isEditingFileName = false;
  editingTopics: number[] = [];
  isVideoBuffering = false;
  private inViewConfirmTimer: any = null;
  private pendingDelayedInView: boolean = false;

  @ViewChild('mediaContainer', { static: false }) mediaContainer!: ElementRef;
  @ViewChild('fullscreenOverlay', { static: false }) fullscreenOverlay!: ElementRef;
  @ViewChild('fullscreenImage', { static: false }) fullscreenImage!: ElementRef;
  @ViewChild('fullscreenVideo', { static: false }) fullscreenVideo!: ElementRef;
  @ViewChild('fullscreenAudio', { static: false }) fullscreenAudio!: ElementRef;
  @ViewChild('editFileNameInput', { static: false }) editFileNameInput!: ElementRef;
  @ViewChild(TopicsComponent) topicComponent!: TopicsComponent;
 
  @Input() debug = false;
  @Input() displayExpander: boolean = true;
  @Input() displayExtraInfo: boolean = true;
  @Input() blockExpand: boolean = false;
  @Input() autoplay: boolean = true;
  @Input() autoplayAudio: boolean = false;
  @Input() autoload: boolean = true;
  @Input() displayControls: boolean = true;
  @Input() loop: boolean = true;
  @Input() muted: boolean = true;
  @Input() forceInviewLoad: boolean = true;
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
  @Input() commentId?: number;
  @Input() inViewConfirmDelayMs: number = 100;
  @Output() emittedNotification = new EventEmitter<string>();
  @Output() commentHeaderClickedEvent = new EventEmitter<boolean>();
  @Output() expandClickedEvent = new EventEmitter<FileEntry>();
  @Output() topicClickedEvent = new EventEmitter<Topic[]>();
  @Output() mediaEndedEvent = new EventEmitter<void>();

  async ngOnInit() {
    this.debugLog('ngOnInit start', { isLoadedFromURL: this.isLoadedFromURL, autoload: this.autoload, fileId: this.fileId, hasFileObj: !!this.file, fileSrc: this.fileSrc });
    if (this.isLoadedFromURL) {
      const componentContainers = document.getElementsByClassName("componentContainer");
      for (let i = 0; i < componentContainers.length; i++) {
        (componentContainers[i] as HTMLDivElement).style.backgroundColor = "var(--component-background-color)";
      }
    }
    // Attempt an eager load when arriving directly via URL (or anytime autoload is true and inputs are present)
    this.ensureInitialLoad();
    // Fallback retry if still not loaded after a short delay (covers race where inputs arrive slightly later)
    setTimeout(() => this.ensureInitialLoad(true), 600);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['fileId'] || changes['file'] || changes['fileSrc']) {
      this.debugLog('ngOnChanges detected media-relevant input change', {
        fileId: this.fileId,
        hasFileObj: !!this.file,
        fileSrc: this.fileSrc,
        alreadyLoaded: !!this.selectedFileSrc
      });
      // If source not yet resolved (or a new id provided) try again
      if (!this.selectedFileSrc || (changes['fileId'] && !changes['fileId'].isFirstChange())) {
        this.ensureInitialLoad();
      }
    }
  }

  private ensureInitialLoad(isRetry: boolean = false) {
    if (!this.autoload) {
      this.debugLog('ensureInitialLoad skipped (autoload disabled)');
      return;
    }
    // If we're forcing in-view loading, don't eagerly load on init; wait for intersection
    if (this.forceInviewLoad && !this.fileSrc && !this.file) {
      this.debugLog('ensureInitialLoad skipped (forceInviewLoad active - waiting for onInView)');
      return;
    }
    if (this.selectedFileSrc) {
      this.debugLog('ensureInitialLoad skipped (already have src)', { selectedFileSrcLength: this.selectedFileSrc.length });
      return;
    }
    if (!(this.fileSrc || this.fileId || this.file)) {
      this.debugLog('ensureInitialLoad aborted - no identifiers yet', { isRetry });
      return;
    }
    this.debugLog('ensureInitialLoad invoking fetchFileSrc', { isRetry });
    this.fetchFileSrc();
  }

  private debugLog(message: string, data?: any) {
    if (this.debug) {
      console.log(`[MediaViewerDebug] ${message}`, data || '', this.file, this.fileId);
    }
  }
  onInView(isInView: boolean) {
    if (!isInView && this.inViewConfirmTimer) {
      clearTimeout(this.inViewConfirmTimer);
      this.inViewConfirmTimer = null;
      this.pendingDelayedInView = false;
      this.debugLog('onInView cancelled pending timer (element out of view)');
      return;
    }

    if (!this.forceInviewLoad || isInView) {
      if (this.selectedFileSrc) return;

      if (this.inViewConfirmDelayMs && this.inViewConfirmDelayMs > 0) {
        if (this.pendingDelayedInView) return; // already scheduled
        this.pendingDelayedInView = true;
        this.inViewConfirmTimer = setTimeout(() => {
          this.inViewConfirmTimer = null;
          this.pendingDelayedInView = false;
          // Re-check visibility & (optionally) center gating
          let stillVisible = this.isStillVisible();
          if (!stillVisible) {
            this.debugLog('onInView delayed check aborted (no longer visible or center not satisfied)');
            return;
          }
          this.debugLog('onInView delayed check passed - fetching');
          this.fetchFileSrc().then(() => this.applyPageTitleIfNeeded());
        }, this.inViewConfirmDelayMs);
        this.debugLog('onInView scheduled delayed fetch', { delay: this.inViewConfirmDelayMs });
      } else {
        this.debugLog('onInView immediate fetch (no delay)');
        this.fetchFileSrc().then(() => this.applyPageTitleIfNeeded());
      }
    } else {
      // Not in view and forced in-view mode: abort & clear timer
      if (this.abortFileRequestController) {
        this.debugLog('onInView aborting pending fetch (forced mode and not visible)');
        this.abortFileRequestController.abort();
      }
      if (this.inViewConfirmTimer) {
        clearTimeout(this.inViewConfirmTimer);
        this.inViewConfirmTimer = null;
        this.pendingDelayedInView = false;
      }
    }
  }

  private isStillVisible() {
    const el = this.mediaContainer?.nativeElement as HTMLElement | undefined;
    let stillVisible = false;
    if (el) { 
      stillVisible = true;
    }
    return stillVisible;
  }

  private applyPageTitleIfNeeded() {
    const urlContainsMedia = window.location.href.includes('/Media');
    const file = this.file ?? this.selectedFile;
    if (urlContainsMedia && (file?.fileName || file?.givenFileName)) {
      this.selectedFileName = file.givenFileName ?? file.fileName ?? 'MediaViewer';
      if (file) {
        this.inputtedParentRef?.replacePageTitleAndDescription(this.selectedFileName, this.selectedFileName);
      }
    }
  }
  
  async fetchFileSrc() {
    this.debugLog('fetchFileSrc invoked', { fileId: this.fileId, hasFileObj: !!this.file, fileSrcInput: this.fileSrc, alreadySelectedSrc: !!this.selectedFileSrc });
    if (this.fileSrc) {
      this.selectedFileSrc = this.fileSrc;
      this.debugLog('fetchFileSrc used direct fileSrc input');
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
        this.debugLog('fetchFileSrc found cached parentRef pictureSrcs entry (indexed)');
        this.setFileSrcByParentRefValue(this.fileId);
        return;
      } else {
        this.debugLog('fetchFileSrc no cached value (indexed array access), proceeding to setFileSrcById');
        this.setFileSrcById(this.selectedFile.id);
      }
    }
    else if (this.file) {
      const fileObject = Array.isArray(this.file) && this.file.length > 0 ? this.file[0] : this.file;
      const fileId = fileObject.id;

      const parentRef = this.parentRef || this.inputtedParentRef;
      if (parentRef?.pictureSrcs[fileId]?.value) {
        this.debugLog('fetchFileSrc found cached parentRef pictureSrcs entry (object style)');
        this.setFileSrcByParentRefValue(fileId);
      } else {
        this.debugLog('fetchFileSrc no cached value for file object; calling setFileSrcById');
        this.setFileSrcById(fileId);
        this.selectedFile = fileObject;
      }
    }
  }
  private setFileSrcByParentRefValue(id: number) {
    this.muteOtherVideos();
    try {
      this.selectedFileSrc = this.parentRef?.pictureSrcs[id].value ?? this.inputtedParentRef!.pictureSrcs[id].value;
      this.debugLog('setFileSrcByParentRefValue succeeded', { id });
    } catch (ex) {
      this.debugLog('setFileSrcByParentRefValue failed (likely sparse array access)', { id, error: ex });
    }
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
  copyLink(fileEntry?: FileEntry) {
    const file = fileEntry ?? this.file ?? this.selectedFile;
    const link = `https://bughosted.com/${file?.directory?.includes("Meme") ? 'Memes' : 'File'}/${file?.id}`;
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
    if (this.selectedFileSrc) { 
      this.debugLog('setFileSrcById early exit (already have selectedFileSrc)');
      return; 
    } 
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
      const requesterId = this.parentRef?.user?.id ?? this.inputtedParentRef?.user?.id;
      this.fileService.getFileEntryById(fileId, requesterId).then(res => {
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
          this.debugLog('FileReader onloadend set selectedFileSrc', { length: this.selectedFileSrc.length });
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
      setTimeout(() => {
        this.topicComponent.focusInput();
      }, 10);
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

      const requesterId = this.parentRef?.user?.id ?? this.inputtedParentRef?.user?.id;
      const fileEntry = await this.fileService.getFileEntryById(file.id, requesterId);
      if (fileEntry) {
        directoryValue = fileEntry.directory;
      }
    }

    let target = (directoryValue ?? "").replace(/\\/g, "/");
    target += ((directoryValue ?? "").length > 0 && (directoryValue ?? "")[(directoryValue ?? "").length - 1] === this.fS) ? file.fileName : (directoryValue ?? "").length > 0 ? this.fS + file.fileName : file.fileName;

    console.log(target, directoryValue);
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
  async getFavouritedBy(fileId: number) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.closeOverlay();
    try {
      const list: any[] = await this.fileService.getFavouritedBy(fileId);
      parent?.showOverlay();
      this.fileFavouriters = list;
      this.isShowingFileFavouriters = true;
    } catch (ex) {
      console.error(ex);
      parent?.showOverlay();
      this.inputtedParentRef?.showNotification?.('Failed to get favourited by list');
    }
  }
  closeFileViewers() {
    this.isShowingFileViewers = false;
    const parent = this.inputtedParentRef ?? this.parentRef;
    this.fileViewers = undefined;
    parent?.closeOverlay();
  }
  closeFileFavouriters() {
    this.isShowingFileFavouriters = false;
    const parent = this.inputtedParentRef ?? this.parentRef;
    this.fileFavouriters = undefined;
    parent?.closeOverlay();
  }
  onMediaEnded() {
    console.log("Media ended");
    this.mediaEndedEvent.emit();
  }
  onVideoWaiting() {
    this.isVideoBuffering = true;
  }

  onVideoCanPlay() {
    this.isVideoBuffering = false;
  }

  onVideoStalled() {
    this.isVideoBuffering = true;
  }
  async toggleFavourite(file: FileEntry) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user;
    if (!user?.id) { return alert('You must be logged in to favourite files.'); }
    try {
      this.startLoading();
      const res: any = await this.fileService.toggleFavourite(user.id, file.id);
      if (res) {
        file.favouriteCount = res.favouriteCount ?? file.favouriteCount ?? 0;
        file.isFavourited = res.isFavourited ?? !file.isFavourited;
        parent?.showNotification?.((file.isFavourited ? 'Added to favourites' : 'Removed from favourites'));
      }
    } catch (ex) {
      console.error(ex);
    } finally {
      this.stopLoading();
    }
  }
  isVideoOrAudio(fileEntry: FileEntry) {
    let fileType = fileEntry.fileType ?? this.fileService.getFileExtension(fileEntry.fileName ?? '');
    fileType = fileType.replace(".", "");
    console.log(fileType);
    return this.fileService.videoFileExtensions.includes(fileType) || this.fileService.audioFileExtensions.includes(fileType);
  }
  async addFileToMusicPlaylist(fileEntry: FileEntry) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user;
    if (!user?.id || !fileEntry || !fileEntry.id) {
      return alert("Error: Cannot add file to music playlist without logging in or a valid file entry.");
    }

    let tmpTodo = new Todo();
    tmpTodo.type = "music";
    tmpTodo.todo = (fileEntry.givenFileName ?? fileEntry.fileName ?? `Video ID:${fileEntry.id}`).trim();
    tmpTodo.fileId = fileEntry.id;
    tmpTodo.date = new Date();
    const resTodo = await this.todoService.createTodo(user.id, tmpTodo);
    if (resTodo) {
      parent?.showNotification(`Added ${tmpTodo.todo} to music playlist.`);
    }
  }
}
