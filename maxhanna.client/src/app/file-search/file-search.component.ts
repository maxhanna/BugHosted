
import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FileService } from '../../services/file.service';
import { DirectoryResults } from '../../services/datacontracts/file/directory-results';
import { ChildComponent } from '../child.component';
import { MediaViewerComponent } from '../media-viewer/media-viewer.component';
import { ActivatedRoute } from '@angular/router';
import { AppComponent } from '../app.component';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { User } from '../../services/datacontracts/user/user';
import { Topic } from '../../services/datacontracts/topics/topic';
import { UserService } from '../../services/user.service';
import { FileComment } from '../../services/datacontracts/file/file-comment';
import { Todo } from '../../services/datacontracts/todo';
import { TodoService } from '../../services/todo.service';
import { RomService } from '../../services/rom.service';
import { RatingsService } from '../../services/ratings.service';
import { FileAccessLog } from '../../services/datacontracts/file/file-access-log';
import { FileNote } from '../../services/datacontracts/file/file-note';
import { Core } from '../emulator/emulator-types';

@Component({
  selector: 'app-file-search',
  templateUrl: './file-search.component.html',
  styleUrl: './file-search.component.css',
  standalone: false
})
export class FileSearchComponent extends ChildComponent implements OnInit, AfterViewInit, OnDestroy {
  defaultCurrentPage = 1;
  @Input() currentDirectory = '';
  @Input() clearAfterSelectFile = false;
  @Input() allowedFileTypes: string[] = [];
  @Input() user?: User;
  @Input() inputtedParentRef?: AppComponent;
  @Input() displayPrivatePublicOption: boolean = true;
  @Input() maxResults: number = 50;
  @Input() fileSearchMode: boolean = false;
  @Input() canChangeDirectory: boolean = true;
  @Input() displayFileType: boolean = true;
  @Input() displayFileSize: boolean = true;
  @Input() displayFileData: boolean = true;
  @Input() displayFileActions: boolean = true;
  @Input() displayComments: boolean = true;
  @Input() displayReactions: boolean = true;
  @Input() displayPicturesOnlyToggler: boolean = true;
  @Input() displayVideosOnlyToggler: boolean = true;
  @Input() displayNSFWToggler: boolean = true;
  @Input() displayHiddenFilesToggler: boolean = true;
  @Input() displaySystemIcons: boolean = false;
  @Input() displayRatings: boolean = false;
  @Input() displayRomMetadata = false;
  @Input() displayRomMetadataDesktop: boolean = false;
  @Input() autoload: boolean = false;
  @Input() canDragMove: boolean = true;
  @Input() fileId?: number | undefined = undefined;
  @Input() commentId?: number;
  @Input() displayTotal = true;
  @Input() showSpaceForNotifications = false;
  @Input() showHiddenFiles: boolean = false; // default: do not show hidden files unless user toggles or user setting enables it
  @Input() showTopics: boolean = true;
  @Input() captureNotifications: boolean = false;
  @Input() currentPage = this.defaultCurrentPage;
  @Input() massDeleteMode: boolean = false;
  @Input() disabled = false;
  @Input() searchButtonSlot = 2 as SlotNumber;
  @Output() selectedForDeleteChange = new EventEmitter<number[]>();
  @Output() selectFileEvent = new EventEmitter<FileEntry>();
  @Output() currentDirectoryChangeEvent = new EventEmitter<string>();
  @Output() userNotificationEvent = new EventEmitter<string>();
  @Output() expandClickedEvent = new EventEmitter<FileEntry>();

  selectedForDelete: Set<number> = new Set<number>();
  showFavouritesOnly = false;
  showPicturesOnly = false;
  showVideosOnly = false;
  trendingSearches: string[] = [];
  sortOption: string = '';
  actualSystemFilter?: string;
  showData = true;
  showShareUserList = false;
  isSearchPanelOpen = false;
  isOptionsPanelOpen = false;
  isShowingFileViewers = false;
  isShowingFileFavouriters = false;
  isShowingImagePreview = false;
  imagePreviewUrl?: string | null = null;
  isVisibilityDropdownOpen = false;
  visibilityDropdownFile: FileEntry | null = null;
  showCommentsInOpenedFiles: number[] = [];
  fileViewers?: FileAccessLog[] | undefined;
  fileFavouriters?: User[] | undefined;
  optionsFile: FileEntry | undefined;
  directory?: DirectoryResults;
  defaultTotalPages = 1;
  totalPages = this.defaultTotalPages;
  showUpFolderRow: boolean = true;
  draggedFilename: string | undefined;
  destinationFilename: string | undefined;
  fS = '/';
  selectedSharedFile?: FileEntry = undefined;
  viewMediaFile = false;
  isEditing: number[] = [];
  editingTopics: number[] = [];
  openedFiles: number[] = [];
  searchTerms = ""
  tmpSearchTerms = ""
  filter = {
    visibility: 'all',
    hidden: this.showHiddenFiles ? 'all' : 'unhidden',
    ownership: 'all'
  };
  isDisplayingNSFW = false;
  fileTypeFilter = "";
  fileIdFilter?: number | undefined = undefined;
  activeRomSystems: string[] = [];
  loadingSearch = false;
  showMetadataInOptionsPanel = true;
  isShowingFileNotes = false;
  fileNotes: FileNote[] = [];
  notesFile: FileEntry | undefined;
  isFirstLoad = true;
  pageLocked = false;
  private _savedDirectoryBeforeFileIdSearch: string | null = null;
  private windowScrollHandler: Function;
  private containerScrollHandler: Function;

  @ViewChild('search') search!: ElementRef<HTMLInputElement>;
  @ViewChild('popupSearch') popupSearch!: ElementRef<HTMLInputElement>;
  @ViewChild('fileTypeFilterInput') fileTypeFilterInput!: ElementRef<HTMLInputElement>;
  @ViewChild('folderVisibility') folderVisibility!: ElementRef<HTMLSelectElement>;
  @ViewChild('shareUserListDiv') shareUserListDiv!: ElementRef<HTMLDivElement>;
  @ViewChild('fileContainer') fileContainer!: ElementRef;
  @ViewChildren('fileNameDiv') fileHeaders!: QueryList<ElementRef>;
  @ViewChildren('nsfwCheckmark') nsfwCheckmark!: ElementRef<HTMLInputElement>;
  @ViewChildren('visibilitySelect') visibilitySelect!: ElementRef<HTMLInputElement>;
  @ViewChildren('optionsFileVisibilitySelect') optionsFileVisibilitySelect!: ElementRef<HTMLInputElement>;

  @ViewChild(MediaViewerComponent) mediaViewerComponent!: MediaViewerComponent;
  @ViewChild('directoryDisplayDiv') directoryDisplayDivRef?: ElementRef<HTMLDivElement>;


  constructor(
    public fileService: FileService,
    private userService: UserService,
    private todoService: TodoService,
    private romService: RomService,
    private ratingsService: RatingsService,
    private route: ActivatedRoute,
    private changeDetectorRef: ChangeDetectorRef,
    private sanitizer: DomSanitizer) {
    super();
    this.previousComponent = "Files";
    this.windowScrollHandler = this.debounce(this.onWindowScroll.bind(this), 200);
    this.containerScrollHandler = this.debounce(this.onContainerScroll.bind(this), 200);
  }

  async ngOnInit() {
    if (this.inputtedParentRef) {
      this.parentRef = this.inputtedParentRef;
    }
    const user = this.parentRef?.user;
    if (user?.id) {
      this.userService.getUserSettings(user.id).then(res => {
        if (res) {
          this.isDisplayingNSFW = res.nsfwEnabled ?? false;
          if (res.showHiddenFiles !== undefined) {
            this.showHiddenFiles = res.showHiddenFiles;
            this.filter.hidden = this.showHiddenFiles ? 'all' : 'unhidden';
          }
        }
      });
    }

    this.allowedFileTypes = this.allowedFileTypes.map(type => type.toLowerCase());
    if (this.fileId && this.fileId != null) {
      this.fileIdFilter = this.fileId;
      console.log('[FileSearch] ngOnInit: using @Input fileId', this.fileId);
      await this.loadFileByIdOnce(this.fileId);
      this.replacePageTitleAndDescription();
      return;
    }

    const routeFileIdParam = this.route.snapshot.paramMap.get('fileId');
    const routeFileId = routeFileIdParam ? +routeFileIdParam : undefined;
    if (routeFileId) {
      this.fileId = routeFileId;
      this.fileIdFilter = this.fileId;
      console.log('[FileSearch] ngOnInit: using route snapshot fileId', this.fileId);
      await this.loadFileByIdOnce(this.fileId);
      this.replacePageTitleAndDescription();
      return;
    }

    this.route.paramMap.subscribe(async (params: any) => {
      const paramFileId = +params.get('fileId');
      //console.log('[FileSearch] route.paramMap event', paramFileId);
      if (paramFileId && paramFileId != null) {
        this.fileId = paramFileId;
        this.fileIdFilter = this.fileId;
        console.log('[FileSearch] paramMap handler: invoking getDirectory for fileId', this.fileId);
        await this.loadFileByIdOnce(this.fileId);
        this.replacePageTitleAndDescription();
        return;
      }
    });

    // No route fileId -> load directory normally
    await this.getDirectory();
  }

  ngAfterViewInit() {
    // Attach window scroll listener
    window.addEventListener('scroll', this.windowScrollHandler as EventListener);
    // console.log('Window scroll event listener registered');

    // Attach container scroll listener if fileContainer exists
    if (this.fileContainer?.nativeElement) {
      this.fileContainer.nativeElement.addEventListener('scroll', this.containerScrollHandler as EventListener);
      // console.log('fileContainer scroll event listener registered');
    } else {
      console.error('fileContainer is not defined');
    }
    this.updateDisplayRomMetadataDesktop();
  }
  
  ngAfterViewChecked() {
    if (this.directoryDisplayDivRef?.nativeElement) {
      const el = this.directoryDisplayDivRef.nativeElement;
      const computed = window.getComputedStyle(el);
      let maxHeight = computed.getPropertyValue('max-height');
      // Only handle px values
      if (maxHeight && maxHeight.endsWith('px')) {
        let px = parseFloat(maxHeight);
        if (!isNaN(px)) {
          if (this.showUpFolderRow && this.canChangeDirectory && !this.fileSearchMode) {
            // Add 50px if not already added
            if (!el.dataset['maxHeightAdjusted'] || el.dataset['maxHeightAdjusted'] !== 'added') {
              el.style.setProperty('max-height', (px - 50) + 'px', 'important');
              el.dataset['maxHeightAdjusted'] = 'added';
            }
          }
        }
      }
    }
  }

  onVisibilitySelect(file?: FileEntry) {
    const targetFile = file ?? this.visibilityDropdownFile;
    if (!targetFile) {
      console.error('Visibility dropdown file or select element is not defined');
      return;
    }
    let visibility = undefined;
    if (!file && this.visibilitySelect?.nativeElement) {
      visibility = this.visibilitySelect.nativeElement.value;
    }
    else if (file && this.optionsFileVisibilitySelect?.nativeElement) {
      visibility = this.optionsFileVisibilitySelect.nativeElement.value;
    }

    if (!visibility) {
      console.error('Visibility select element is not defined');
      return;
    }
    if (visibility) {
      if (!file && this.visibilityDropdownFile) {
        this.visibilityDropdownFile.visibility = visibility;
        this.setFileVisibility(this.visibilityDropdownFile, visibility);
        this.closeVisibilityDropdown();
      }
      else if (file) {
        file.visibility = visibility;
        this.setFileVisibility(file, visibility);
      }
    }
  }

  private updateDisplayRomMetadataDesktop() {
    if (!this.displayRomMetadataDesktop || !this.displayRomMetadata) {
      console.log('Not displaying ROM metadata on desktop: displayRomMetadataDesktop or showRomMetadata is false');
      return;
    }

    try {
      this.displayRomMetadataDesktop = !this.onMobile() && (window?.innerWidth ?? 0) >= 1000;
    } catch (e) {
      this.displayRomMetadataDesktop = false;
      console.error('Error determining displayRomMetadataDesktop', e);
    }
  }
  openVisibilityDropdown(file: FileEntry) {
    this.visibilityDropdownFile = file;
    this.isVisibilityDropdownOpen = true;
    this.parentRef?.showOverlay();
  }

  closeVisibilityDropdown() {
    this.isVisibilityDropdownOpen = false;
    this.visibilityDropdownFile = null;
    this.parentRef?.closeOverlay();
  }

  setFileVisibility(file?: FileEntry, visibility?: string) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const targetFile = file ?? this.visibilityDropdownFile;
    const targetVisibility = visibility ?? (!file ? this.visibilityDropdownFile?.visibility : undefined);
    if (!targetFile || !targetVisibility) return;
    const isVisible = targetVisibility.toLowerCase() == 'private' ? false : true;

    const user = parent?.user ?? new User(0, 'Anonymous');
    this.fileService.updateFileVisibility(user?.id ?? 0, isVisible, targetFile.id).then(res => {
      parent?.showNotification(res ?? 'File visibility updated.');
    });
  }

  // Parse comma-separated user ids from optionsFile.sharedWith
  get optionsFileSharedWithIds(): number[] {
    if (!this.optionsFile || !this.optionsFile.sharedWith) return [];
    try {
      return (this.optionsFile.sharedWith as string)
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !isNaN(Number(s)))
        .map(s => Number(s));
    } catch (e) {
      return [];
    }
  }

  get isInRomDirectory(): boolean {
    return (this.currentDirectory ?? '').toLowerCase().endsWith('roms/');
  }

  // Return true if any search/filter option is currently applied
  public hasActiveFilters(): boolean {
    // Search terms
    if (this.searchTerms && this.searchTerms.trim() !== '') return true;
    // File type text filter
    if (this.fileTypeFilter && this.fileTypeFilter.trim() !== '') return true;
    // File ID filter
    if (this.fileIdFilter !== undefined && this.fileIdFilter !== null) return true;
    // Visibility / ownership / hidden filters
    if (this.filter && (this.filter.visibility !== 'all' || this.filter.ownership !== 'all')) return true;
    // Toggle filters
    if (this.showFavouritesOnly || this.showPicturesOnly || this.showVideosOnly) return true;
    // Rom system filter
    if (this.activeRomSystems && this.activeRomSystems.length > 0) return true;
    // Sort option changed
    if (!this.isInRomDirectory) {
      if (this.sortOption !== 'Latest' && this.sortOption !== '') {
        return true;
      }
    }
    if (this.isInRomDirectory) {
      if (this.sortOption !== 'Last Access' && this.sortOption !== '') {
        return true;
      }
    }
    return false;
  }

  // CSS classes for the top search button, exposed as a string for use with `[class]`
  get topSearchButtonClass(): string {
    const classes: string[] = ['searchButton'];
    if ((this.activeRomSystems && this.activeRomSystems.length > 0) || this.hasActiveFilters()) {
      classes.push('glowing');
    }
    return classes.join(' ');
  }

  ngOnDestroy() {
    // Remove window scroll listener
    window.removeEventListener('scroll', this.windowScrollHandler as EventListener);
    // console.log('Window scroll event listener removed');

    // Remove container scroll listener if fileContainer exists
    if (this.fileContainer?.nativeElement) {
      this.fileContainer.nativeElement.removeEventListener('scroll', this.containerScrollHandler as EventListener);
      // console.log('fileContainer scroll event listener removed');
    }
  }

  onWindowScroll() {
    // console.log('Window scroll event triggered');
    const threshold = 100;
    const atBottom =
      window.innerHeight + window.scrollY >=
      document.documentElement.scrollHeight - threshold;

    if (atBottom && !this.isLoading && this.currentPage < this.totalPages) {
      console.log('Reached bottom of page, loading next page...');
      this.appendNextPage();
    }
  }

  onContainerScroll() {
    // console.log('fileContainer scroll event triggered');
    const element = this.fileContainer.nativeElement;
    const threshold = 100;
    const atBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + threshold;

    if (atBottom && !this.isLoading && this.currentPage < this.totalPages) {
      console.log('Reached bottom of fileContainer, loading next page...');
      this.appendNextPage();
    }
  }

  scrollToFile(fileId: number) {
    setTimeout(() => {
      const element = document.getElementById('fileIdName' + fileId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        //element.click();
      }
    }, 1000);
  }
  async delete(file: FileEntry) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user ?? this.user;

    if (confirm(`Delete : ${file.fileName} ?`)) {
      this.startLoading();
      try {
        const response = await this.fileService.deleteFile(user?.id ?? 0, file);
        if (response) {
          this.notifyUser(response);
          if (response.includes("successfully")) {
            this.directory!.data = this.directory?.data!.filter(res => res.fileName != file.fileName);
          }
        }
      } catch (ex) {
        this.notifyUser(`Failed to delete ${file.fileName}!`);
      }
      this.stopLoading();
      this.closeOptionsPanel();
    }
  }

  async getDirectory(file?: string, fileId?: number, append?: boolean) {
    if (this.isLoading || this.pageLocked) return;
    // console.log('[FileSearch] getDirectory called', { fileArg: file, fileIdArg: fileId, append, isLoading: this.isLoading, currentDirectory: this.currentDirectory });
    this.startLoading();
    this.pageLocked = true;
    let fileTypes: string[] = [];
    const filterArr = this.fileTypeFilter.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
    if (this.allowedFileTypes && this.allowedFileTypes.length > 0) {
      if (filterArr.length > 0) {
        fileTypes = this.allowedFileTypes.filter(type => filterArr.includes(type));
      } else {
        fileTypes = this.allowedFileTypes;
      }
    } else if (filterArr.length > 0) {
      fileTypes = filterArr;
    } else {
      fileTypes = [];
    }
    this.showData = true;
    try {
      const effectiveFileId = (fileId ?? this.fileIdFilter) as number | undefined;

      const isFileIdSearch = !!effectiveFileId;
      if (isFileIdSearch && this._savedDirectoryBeforeFileIdSearch == null) {
        this._savedDirectoryBeforeFileIdSearch = this.currentDirectory;
      }

      const includeRomMetadata = this.shouldShowRomMetadata();

      // Default to Last Access (recent first) for ROM folders when no other sort option provided
      let sortToUse = this.sortOption && this.sortOption.trim() !== '' ? this.sortOption : '';
      const cur = (this.currentDirectory ?? '').toLowerCase();
      if (!sortToUse && /\broms?\b/.test(cur)) {
        sortToUse = 'Last Access';
        this.sortOption = sortToUse;
      }


      await this.fileService.getDirectory(
        this.currentDirectory,
        this.filter.visibility,
        this.filter.ownership,
        this.user,
        this.currentPage,
        this.maxResults,
        this.searchTerms,
        effectiveFileId,
        fileTypes,
        this.filter.hidden == 'all' ? true : false,
        sortToUse,
        this.showFavouritesOnly,
        includeRomMetadata,
        this.actualSystemFilter
      ).then(res => {
        if (append && this.directory && this.directory.data) {
          // Normalize and derive thumbnails for newly-appended items before merging
          const newItems = (res.data || []).filter((d: FileEntry) =>
            !this.directory?.data?.some((existingData) => existingData.id === d.id)
          );

          if (this.shouldShowRomMetadata() && newItems.length) {
            for (const f of newItems) {
              this.normalizeRomMetadata(f);
            }
          }

          this.directory.data = this.directory.data.concat(newItems);

          if (this.optionsFile) {
            const linked = this.directory.data.find(d => d.id === this.optionsFile?.id);
            if (linked) {
              this.optionsFile = linked;
              try { this.changeDetectorRef.detectChanges(); } catch { }
            }
          }
        } else {
          this.directory = res;

          if (this.shouldShowRomMetadata() && this.directory?.data?.length) {
            for (const f of this.directory.data) {
              this.normalizeRomMetadata(f);
            }
          }

          if (!isFileIdSearch && this.fileIdFilter == null) {
            if (this.directory && this.directory.currentDirectory) {
              this.currentDirectory = this.directory.currentDirectory;
            } else {
              this.currentDirectory = '';
            }
            this.currentDirectoryChangeEvent.emit(this.currentDirectory);
          }
          this.showUpFolderRow = (this.currentDirectory && this.currentDirectory.trim() !== "") ? true : false;
          if (this.directory) {
            if (this.directory.page) {
              this.currentPage = this.directory.page ?? 1;
            } else {
              this.currentPage = 1;
            }

            if (this.directory.totalCount) {
              this.totalPages = Math.ceil(this.directory.totalCount / this.maxResults);
            } else {
              this.totalPages = 1;
            }

            if (effectiveFileId && effectiveFileId !== null && effectiveFileId !== 0 && this.directory.data!.find(x => x.id == effectiveFileId)) {
              this.scrollToFile(effectiveFileId);
            }
          }


          // Keep folders at the top, but otherwise preserve the backend's ordering.
          if (this.directory && this.directory.data) {
            // Only reorder to ensure folders appear first; let the backend provide the remainder ordering.
            const folders = this.directory.data.filter(d => d.isFolder);
            const others = this.directory.data.filter(d => !d.isFolder);
            this.directory.data = folders.concat(others);
          }

          this.directory?.data?.forEach(data => {
            if (data) {
              if (!data.date) { data.date = new Date(); }
              if (typeof data.date === 'string') {
                data.date = new Date(data.date);
              }
              data.date = new Date(data.date.getTime() - data.date.getTimezoneOffset() * 60000);  //Convert UTC dates to local time.

              if (!data.lastAccess) { data.lastAccess = new Date(); }
              if (typeof data.lastAccess === 'string') {
                data.lastAccess = new Date(data.lastAccess);
              }
              data.lastAccess = new Date(data.lastAccess.getTime() - data.lastAccess.getTimezoneOffset() * 60000);  //Convert UTC dates to local time.


              if (!data.lastUpdated) { data.lastUpdated = new Date(); }
              if (typeof data.lastUpdated === 'string') {
                data.lastUpdated = new Date(data.lastUpdated);
              }
              data.lastUpdated = new Date(data.lastUpdated.getTime() - data.lastUpdated.getTimezoneOffset() * 60000);  //Convert UTC dates to local time.
            }
          });
        }

        // If we just cleared a fileId search, drop the saved directory snapshot
        if (!isFileIdSearch && this._savedDirectoryBeforeFileIdSearch != null) {
          this._savedDirectoryBeforeFileIdSearch = null;
        }

        setTimeout(() => {
          this.pageLocked = false;
        }, 1000);
      });
    } catch (error: any) {
      // Ignore aborted requests - these are expected when a newer request is issued
      if (error && (error.name === 'AbortError' || error.message === 'The user aborted a request.')) {
        console.debug('getDirectory() request aborted');
      } else {
        this.notifyUser((error as Error).message);
      }
    }
    this.isFirstLoad = false;
    this.stopLoading();
  }

  // Helper: normalize rom metadata fields and derive inline thumbnails for a file entry
  private normalizeRomMetadata(f: FileEntry | undefined | null): void {
    if (!f || f.isFolder) return;
    if (!f.romMetadata) return;
    try {
      const md: any = f.romMetadata;
      md.screenshots = this.safeJsonArray(md.screenshotsJson);
      md.artworks = this.safeJsonArray(md.artworksJson);
      md.videos = this.safeJsonArray(md.videosJson);
      md.platforms = this.safeJsonArray(md.platformsJson ?? md.platformsJson);
      md.genres = this.safeJsonArray(md.genresJson ?? md.genresJson);
      f.romInlineThumbs = this.pickInlineThumbs(f);
    } catch (e) {
      console.error('normalizeRomMetadata failed', e);
    }
  }

  debounceSearch() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      await this.getDirectory().then(() => { this.scrollToTop(); });
    }, 1000);
  }

  private async loadFileByIdOnce(id: number) {
    this.fileId = id;
    this.fileIdFilter = id;
    await this.getDirectory(undefined, id);
  }

  getFileExtension(filename: string) {
    return this.fileService.getFileExtension(filename);
  }
  selectFileNoPropagation(event: any, file: FileEntry) {
    if (!this.fileSearchMode) return;
    event.stopPropagation();
    return this.selectFile(file);
  }
  selectFile(file: FileEntry) {
    if (!file.isFolder && this.clearAfterSelectFile) {
      this.selectFileEvent.emit(file);
      this.showData = false;
      if (this.search?.nativeElement && file.fileName) {
        this.search.nativeElement.value = file.fileName;
      }
    } else {
      if (!file.isFolder) {
        this.download(file, false, true)
      } else {
        this.goToFirstPage();
        this.currentDirectory += file.fileName + "/";
        this.getDirectory(file.fileName);
      }
    }
  }
  async previousPage() {
    if (this.pageLocked) { return; }
    if (this.currentPage > 1) {
      this.currentPage--;
      await this.getDirectory().then(() => { this.scrollToTop(); });
    }
  }

  async nextPage() {
    if (this.pageLocked) { return; }
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      await this.getDirectory().then(() => { this.scrollToTop(); });
    }
  }
  async appendNextPage() {
    if (this.pageLocked) { return; }
    if (this.currentPage < this.totalPages) {
      console.log("Appending next page...");
      this.currentPage++;
      await this.getDirectory(undefined, undefined, true);
    }
  }

  searchDirectory() {
    this.reinitializePages();
    this.debounceSearch();
  }

  setFilterVisibility(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.filter.visibility = target.value;
    this.getDirectory();
  }
  setFilterHidden(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.filter.hidden = target.value;
    this.getDirectory();
  }
  toggleShowHiddenFiles(event: Event) {
    const isChecked = (event.target as HTMLInputElement).checked;
    this.showHiddenFiles = isChecked;
    this.filter.hidden = this.showHiddenFiles ? 'all' : 'unhidden';
    const user = this.inputtedParentRef?.user ?? this.parentRef?.user;
    if (user?.id) {
      this.userService.updateShowHiddenFiles(user.id, isChecked).then(res => {
        if (res && res.toLowerCase().includes('successfully')) {
          this.parentRef?.showNotification(res);
        }
      });
    }
    this.getDirectory();
  }

  toggleShowHiddenFilesButton() {
    this.showHiddenFiles = !this.showHiddenFiles;
    this.filter.hidden = this.showHiddenFiles ? 'all' : 'unhidden';
    const user = this.inputtedParentRef?.user ?? this.parentRef?.user;
    if (user?.id) {
      this.userService.updateShowHiddenFiles(user.id, this.showHiddenFiles).then(res => {
        if (res && res.toLowerCase().includes('successfully')) {
          this.parentRef?.showNotification(res);
        }
      });
    }
    this.getDirectory();
  }

  toggleNSFW() {
    const user = this.inputtedParentRef?.user ?? this.parentRef?.user;
    if (!user?.id) {
      alert('You must be logged in to view NSFW content.');
      this.isDisplayingNSFW = false;
      return;
    }
    this.isDisplayingNSFW = !this.isDisplayingNSFW;
    this.userService.updateNSFW(user.id, this.isDisplayingNSFW).then(res => {
      if (res) {
        this.parentRef?.showNotification(res);
        this.reinitializePages();
        this.getDirectory();
      }
    });
  }
  async editFileKeyUp(event: KeyboardEvent, fileId: number) {
    if (!this.isEditing.length) return;
    const text = (event.target as HTMLInputElement).value;
    if (event.key === 'Enter') {
      console.log(event);
      event.preventDefault();
      await this.editFile(fileId, text);
      this.isEditing = [];
    } else {
      event.stopPropagation();
    }
  }
  async editFile(fileId: number, text: string) {
    if (!this.user) { return alert("You must be logged in to use this feature!"); }

    if (!text || text.trim() == '') {
      this.isEditing = this.isEditing.filter(x => x != fileId);
      return;
    }
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      if (this.user) {
        const res = await this.fileService.updateFileData(this.user.id ?? 0, { FileId: fileId, GivenFileName: text, Description: '', LastUpdatedBy: this.user || this.inputtedParentRef?.user || new User(0, "Anonymous") });
        if (res) {
          this.notifyUser(res);
          this.isEditing = this.isEditing.filter(x => x != fileId);
          const local = this.directory?.data?.find(d => d.id === fileId);
          if (local) {
            local.givenFileName = text;
          }
          if (this.optionsFile?.id === fileId) {
            this.optionsFile.givenFileName = text;
          }
          if (this.selectedSharedFile?.id === fileId) {
            this.selectedSharedFile.givenFileName = text;
          }
        }
        setTimeout(() => {
          if (document.getElementById("fileIdName" + fileId) != null) {
            document.getElementById("fileIdName" + fileId)!.innerText = text;
          }
        }, 100);
      }
    }, 500);
  }
  async startEditingFileName(fileId: number) {
    const parent = document.getElementById("fileIdDiv" + fileId)!;
    const text = parent.getElementsByTagName("input")[0].value!;
    this.closeOptionsPanel();

    if (this.isEditing.includes(fileId) && text.trim() == '') {
      this.isEditing = this.isEditing.filter(x => x != fileId);
      return;
    }

    this.showCommentsInOpenedFiles = [];

    if (!this.isEditing.includes(fileId)) {
      this.isEditing.push(fileId);
      setTimeout(() => { (document.getElementById("editFileNameInput" + fileId) as HTMLInputElement).focus(); }, 1);
    } else {
      if (parent.dataset["content"]?.trim() === text.trim()) {
        this.isEditing = this.isEditing.filter(x => x != fileId);
        return alert("no changes detected");
      }
      parent.innerText = text.trim();
      await this.editFile(fileId, text.trim());
    }
  }

  getCanEdit(userid: number) {
    return userid == this.parentRef?.user?.id;
  }
  async download(file: FileEntry, force: boolean, forceOpenMedia?: boolean) {
    if ((this.isMediaFile(file.fileName ?? "") && !force) || forceOpenMedia) {
      this.viewMediaFile = true;
      if (this.openedFiles.includes(file.id)) {
        this.openedFiles = [];
        return;
      }
      if (this.openedFiles.length > 0) {
        this.openedFiles = [];
      }
      this.openedFiles.push(file.id);

      return;
    }

    if (confirm(`Download ${file.fileName}?`)) {
      const directoryValue = this.currentDirectory;
      let target = directoryValue.replace(/\\/g, "/");
      target += (directoryValue.length > 0 && directoryValue[directoryValue.length - 1] === this.fS) ? file.fileName : directoryValue.length > 0 ? this.fS + file.fileName : file.fileName;

      try {
        this.startLoading();
        const response = await this.fileService.getFile(target, undefined, this.inputtedParentRef?.user);
        const blob = new Blob([(response?.blob)!], { type: 'application/octet-stream' });

        const a = document.createElement('a');
        a.href = window.URL.createObjectURL(blob);
        a.download = file.fileName ?? "";
        a.id = (Math.random() * 100) + "";
        a.click();

        window.URL.revokeObjectURL(a.href);
        document.getElementById(a.id)?.remove();
        this.stopLoading();
      } catch (ex) {
        console.error(ex);
      }
    }
  }

  onDragStart(event: Event, fileName: string) {
    if (!this.canDragMove) { return; }
    this.draggedFilename = fileName.trim();
    this.destinationFilename = undefined;
  }
  onDragOver(event: Event) {
    if (!this.canDragMove) { return; }

    event.preventDefault();
  }
  async onDrop(event: string) {
    if (!this.canDragMove) { return; }

    const fileName = event.trim();
    if (fileName && fileName.includes("...")) {
      const newDirectory = this.moveUpOneLevel();
      this.destinationFilename = newDirectory;
      this.moveFile(newDirectory);
    } else if (fileName && !this.isFile(fileName)) {
      this.destinationFilename = fileName;
      this.moveFile(undefined);
    } else {
      this.draggedFilename = undefined;
      this.destinationFilename = undefined;
    }
  }

  getPreviousDirectoryPath() {
    const currDir = this.currentDirectory;
    const lastSlashIndex = currDir.lastIndexOf('/');
    if (lastSlashIndex !== -1) {
      const directoryWithoutTrailingSlash = currDir.endsWith('/') ? currDir.slice(0, -1) : currDir;

      const lastSlashIndexWithoutTrailingSlash = directoryWithoutTrailingSlash.lastIndexOf('/');
      if (lastSlashIndexWithoutTrailingSlash !== -1) {
        return directoryWithoutTrailingSlash.substring(0, lastSlashIndexWithoutTrailingSlash);
      }
    }
    return "";
  }

  moveUpOneLevel(): string {
    const upDirPath = this.getPreviousDirectoryPath();
    if (upDirPath) { return upDirPath; }
    this.openedFiles = [];
    this.showCommentsInOpenedFiles = [];
    return "";
  }

  private async moveFile(specDir: string | undefined) {
    const currDir = this.currentDirectory;
    if (this.draggedFilename
      && this.draggedFilename != this.destinationFilename
      && confirm(`Move ${this.draggedFilename!.trim()} to ${specDir ?? (currDir + this.destinationFilename)}?`)) {
      const inputFile = currDir + this.draggedFilename;
      const destinationFolder = specDir ?? (currDir + this.destinationFilename);
      this.startLoading();
      try {
        const user = this.inputtedParentRef?.user ?? this.parentRef?.user;
        const userId = user?.id ?? 0;
        const draggedEntry = this.directory?.data?.find(x => x.fileName === this.draggedFilename);
        const fileIdToSend = draggedEntry?.id ?? undefined;
        const res = await this.fileService.moveFile(inputFile, destinationFolder, userId, fileIdToSend);
        this.notifyUser(res!);
        if (!res!.includes("error")) {
          this.directory!.data = this.directory!.data!.filter(x => x.fileName != this.draggedFilename);
        }
      } catch (ex) {
        console.error(ex);
        this.notifyUser(`Failed to move ${this.draggedFilename} to ${currDir + this.destinationFilename}!`);
      }
      this.stopLoading();
    } else {
      let message = "";
      if (!this.draggedFilename) message += "You must select an item to be moved!";
      if (message) alert(message);
    }
  }

  previousDirectory() {
    if (this.search && this.search.nativeElement) {
      this.search.nativeElement.value = '';
    }
    const target = this.moveUpOneLevel();
    this.goToFirstPage();
    this.currentDirectory = target;
    this.getDirectory();
  }

  setFilterOwnership(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.filter.ownership = target.value;
    this.getDirectory();
  }

  async handleUploadedFiles(files: FileEntry[]) {
    await this.getDirectory();
  }

  toggleSelectForDelete(file: FileEntry, event?: Event) {
    if (!file || !file.id) {
      return;
    }
    if (this.selectedForDelete.has(file.id)) {
      this.selectedForDelete.delete(file.id);
    } else {
      this.selectedForDelete.add(file.id);
    }
    this.selectedForDeleteChange.emit(Array.from(this.selectedForDelete));
    if (event) {
      event.stopPropagation();
    }
  }

  selectedCount(): number { return this.selectedForDelete.size; }

  getSelectedIds(): number[] { return Array.from(this.selectedForDelete); }

  clearSelection() { this.selectedForDelete.clear(); this.selectedForDeleteChange.emit([]); }

  reinitializePages() {
    this.currentPage = 1;
    this.maxResults = 50;
    this.totalPages = this.defaultTotalPages;
  }
  isMediaFile(fileName: string): boolean {
    if (fileName) {
      const mediaFileTypes = [
        'jpg', 'jpeg', 'png', 'gif', 'webp', 'tiff', 'tif', 'psd', 'raw', 'bmp', 'heif', 'heic', 'indd', 'jp2', 'j2k', 'jpf', 'jpx', 'jpm', 'mj2', // Image formats
        'mp4', 'mkv', 'flv', 'avi', 'mov', 'wmv', 'avchd', 'webm', 'mpeg', 'mpg', 'm4v', '3gp', '3g2', 'f4v', 'f4p', 'f4a', 'f4b', 'vob' // Video formats
      ];
      const lowerCaseFileName = fileName.toLowerCase();
      return mediaFileTypes.some(extension => lowerCaseFileName.endsWith(`.${extension}`));
    }
    return false;
  }
  isFile(fileName: string): boolean {
    const fileExtension = fileName.lastIndexOf('.') !== -1 ? fileName.split('.').pop() : null;
    if (!fileExtension) {
      return false;
    } else {
      return true;
    }
  }
  getFileWithoutExtension(fileName: string) {
    return this.fileService.getFileWithoutExtension(fileName);
  }
  shareFile(user?: User) {
    if (!user?.id) return;
    if (this.selectedSharedFile && this.user) {
      this.fileService.shareFile(this.user?.id ?? 0, user.id, this.selectedSharedFile!.id);
    }
    this.selectedSharedFile = undefined;
    this.shareUserListDiv.nativeElement.classList.toggle("open");
    this.closeOptionsPanel();
  }
  shareFileInitiate(file: FileEntry) {
    this.selectedSharedFile = file;
    this.closeOptionsPanel();
    setTimeout(() => {
      const parent = this.inputtedParentRef ?? this.parentRef;
      parent?.showOverlay();
      this.showShareUserList = true;
    }, 100);
  }
  closeShareUserList() {
    this.showShareUserList = false;
    this.selectedSharedFile = undefined;
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.closeOverlay();
  }
  emittedNotification(event: string) {
    this.notifyUser(event);
  }
  showOptionsPanel(file: FileEntry) {
    if (this.isOptionsPanelOpen) {
      this.closeOptionsPanel();
      return;
    }
    const parent = this.inputtedParentRef ?? this.parentRef;
    this.optionsFile = file;
    // If we're rendering the metadata inline on desktop, don't show the global overlay.
    if (parent) {
      this.isOptionsPanelOpen = true;
      parent.showOverlay();
    }
  }
  closeOptionsPanel(resetFile = true) {
    this.isOptionsPanelOpen = false;
    if (resetFile) {
      this.optionsFile = undefined;
    }
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      parent.closeOverlay();
    }
  }

  // Clear persisted system override for a file and update UI
  async clearSystemOverride(file?: FileEntry) {
    if (!file || !file.id) { return; }
    if (!confirm(`Clear system override for ${file.fileName}?`)) { return; }
    try {
      this.startLoading();
      const res = await this.romService.clearSystemOverride(file.id as number);
      if (res) {
        if (file.romMetadata) {
          (file.romMetadata as any).actualSystem = null;
        }
        if (this.optionsFile && this.optionsFile.id === file.id && this.optionsFile.romMetadata) {
          (this.optionsFile.romMetadata as any).actualSystem = null;
        }
        if (this.directory && this.directory.data) {
          const idx = this.directory.data.findIndex(d => d && d.id === file.id);
          if (idx !== -1 && this.directory.data[idx].romMetadata) {
            (this.directory.data[idx].romMetadata as any).actualSystem = null;
          }
        }
        try { this.changeDetectorRef.markForCheck(); } catch { }
        this.notifyUser('System override cleared.');
      } else {
        this.notifyUser('Failed to clear system override.');
      }
    } catch (e) {
      console.error('clearSystemOverride error', e);
      this.notifyUser('Error clearing system override');
    } finally {
      this.stopLoading();
    }
  }
  async addToFavourites(optionsFile: FileEntry) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user ?? this.user;
    if (!user || !user.id) return alert('You must be logged in to favourite files.');
    this.startLoading();
    try {
      const res: any = await this.fileService.toggleFavourite(user.id, optionsFile.id);
      if (res) {
        const added = res.action === "added";
        let currentCount = optionsFile.favouriteCount ?? 0;
        // server returns updated favourite count and whether user favourited
        optionsFile.favouriteCount = added ? (currentCount + 1) : Math.max(0, currentCount - 1);
        optionsFile.isFavourited = res.isFavourited ?? !optionsFile.isFavourited;
        // Also update the same file object in the current directory list so the UI updates
        if (this.directory?.data && Array.isArray(this.directory.data)) {
          const idx = this.directory.data.findIndex(f => f && f.id === optionsFile.id);
          if (idx !== -1) {
            this.directory.data[idx].favouriteCount = optionsFile.favouriteCount;
            this.directory.data[idx].isFavourited = optionsFile.isFavourited;
          }
        }
        // Ensure Angular picks up the changes
        try { this.changeDetectorRef.detectChanges(); } catch { }
      }
    } catch (ex) {
      console.error(ex);
    }
    this.stopLoading();
  }

  async getFavouritedBy(file: FileEntry) {
    if (this.isShowingFileFavouriters) {
      this.closeFileFavouriters();
      return;
    }
    if (this.isOptionsPanelOpen) {
      this.closeOptionsPanel();
    }
    const parent = this.inputtedParentRef ?? this.parentRef;
    try {
      const list: any[] = await this.fileService.getFavouritedBy(file.id);
      this.fileFavouriters = list;
      setTimeout(() => {
        this.isShowingFileFavouriters = true;
        parent?.showOverlay();
        this.changeDetectorRef.detectChanges();
      }, 100);
    } catch (ex) {
      console.error(ex);
      this.notifyUser('Failed to fetch favourites');
    }
  }
  shouldShowEditButton(optionsFile: any): boolean {
    if (!optionsFile?.user?.id || !this.user?.id || this.currentDirectory === 'Users/') {
      return false;
    }

    const restrictedFileNames = [
      'Users', 'Meme', 'Roms', 'Max',
      'Pictures', 'Videos', 'Files',
      'Array', 'Nexus', 'BugHosted', 'Metabots'
    ];

    return optionsFile.user.id === this.user.id &&
      !(this.currentDirectory === '' && restrictedFileNames.includes(optionsFile.fileName));
  }
  addOrRemoveIdFromOpenedComments(fileId: number, isOpen?: boolean) {
    if (isOpen) {
      this.showCommentsInOpenedFiles.push(fileId);
    } else {
      if (!this.showCommentsInOpenedFiles.includes(fileId)) {
        this.showCommentsInOpenedFiles.push(fileId);
      } else {
        this.showCommentsInOpenedFiles = this.showCommentsInOpenedFiles.filter(x => x != fileId);
      }
    }

  }
  openFileWithComments(file: FileEntry) {
    this.viewMediaFile = true;

    if (!this.showCommentsInOpenedFiles.includes(file.id)) {
      this.showCommentsInOpenedFiles.push(file.id);
    }
    if (!this.openedFiles.includes(file.id)) {
      this.openedFiles.push(file.id);
    }
  } 
  get shareLink(): string {
    const fileEntry = this.optionsFile;
    if (!fileEntry) return '';
    if (this.isInRomDirectory && this.displayRomMetadata) {
      const reloadParams: Record<string, string> = {};
      reloadParams['romname'] = fileEntry.fileName ?? "";
      reloadParams['romId'] = String(fileEntry.id);
      reloadParams['skipSaveFile'] = "false";
      return `https://bughosted.com/Emulator?${new URLSearchParams(reloadParams).toString()}`;
    }
    return `https://bughosted.com/${fileEntry.directory?.includes("Meme") ? 'Memes' : 'File'}/${fileEntry.id}`;
  } 
  openSearchPanel() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      parent.showOverlay();
    }
    this.isSearchPanelOpen = true;
    setTimeout(() => {
      this.popupSearch.nativeElement.focus();
    }, 50);
    // load trending searches for files
    this.fileService.getTrending('file', 5).then(res => {
      this.trendingSearches = Array.isArray(res) ? res.map((r: any) => r.query) : [];
    }).catch(() => { this.trendingSearches = []; });
  }
  closeSearchPanel() {
    this.isSearchPanelOpen = false;

    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      parent.closeOverlay();
    }
  }
  isDisplayingPreviousPageButton() {
    return this.totalPages > 1 && this.currentPage != 1
  }
  isDisplayingTotalPagesButton() {
    return this.totalPages > 1 && this.totalPages != this.currentPage;
  }
  async searchFiles(topic: string) {
    this.searchTerms = topic;
    this.currentPage = 1;
    this.scrollToTop();
    this.closeSearchPanel();
    await this.getDirectory();
    try {
      const user = this.inputtedParentRef?.user ?? this.parentRef?.user;
      if (topic && topic.trim() !== '') {
        await this.fileService.recordSearch(topic, 'file', user?.id);
      }
    } catch { }
  }
  async fileTopicClicked(topics: Topic[]) {
    if (topics) {
      let terms = this.searchTerms
        .split(",")
        .map(x => x.trim())
        .filter(x => x.length > 0);

      for (let topic of topics) {
        const idx = terms.indexOf(topic.topicText);
        if (idx >= 0) {
          terms.splice(idx, 1);
        } else {
          terms.push(topic.topicText);
        }
      }

      this.searchTerms = terms.join(",");
    }
    this.currentPage = 1;
    this.scrollToTop();
    this.closeOptionsPanel();
    setTimeout(async () => {
      await this.getDirectory();
    }, 200);

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
      //this.getDirectory();
    }
  }
  getDirectoryName(file: FileEntry): string {
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      return parent?.getDirectoryName(file);
    } else return '.';
  }

  toggleFileVisibility(file: FileEntry) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    file.visibility = file.visibility == "Private" ? "Public" : "Private";
    const user = parent?.user ?? new User(0, "Anonymous");
    this.fileService.updateFileVisibility(user?.id ?? 0, file.visibility == "Private" ? false : true, file.id).then(res => {
      parent?.showNotification(res ?? "File visibility updated.");
    });
  }

  async hide(file: FileEntry) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user;
    let hidden = true;
    if (parent && user && user.id) {
      await this.fileService.hideFile(file.id, user.id).then(res => {
        parent.showNotification(res);
        if (res.toLowerCase().includes("unhidden")) {
          hidden = false;
        }
      });
    }
    file.isHidden = hidden;
  }
  private replacePageTitleAndDescription() {
    if (this.directory && this.directory.data && this.directory.data.length > 0) {
      const tgtFile = this.directory.data.find((file: FileEntry) => file.id == this.fileId);
      if (tgtFile) {
        const title = tgtFile.givenFileName ?? tgtFile.fileName ?? "Bughosted File";
        const image = `https://bughosted.com/assets/Uploads/${(this.getDirectoryName(tgtFile) != '.' ? this.getDirectoryName(tgtFile) : '') + tgtFile.fileName}`;
        if (title) {
          const parent = this.inputtedParentRef ?? this.parentRef;
          if (parent) {
            parent.replacePageTitleAndDescription(title, title, image);
          }
        }
      }
    }
  }
  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    try {
      const tgt = event?.target as HTMLElement | null;

      // If editing an inline filename input, ignore (legacy specific check)
      if (tgt && tgt.id && tgt.id.includes('editFileName')) return;

      // If focus is on an input, textarea, or a contenteditable element, don't handle j/k here
      if (tgt) {
        const tag = (tgt.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tgt.isContentEditable) return;

        // Also allow nested inputs inside custom components like <app-text-input>
        const editableAncestor = tgt.closest('input, textarea, [contenteditable="true"], app-text-input');
        if (editableAncestor) return;
      }

      if (event.key === 'k' || event.key === 'K') {
        this.scrollToNext();
      } else if (event.key === 'j' || event.key === 'J') {
        this.scrollToPrevious();
      }
    } catch (e) {
      // swallow any unexpected errors to avoid breaking global key handling
      console.error('Keyboard handler error', e);
    }
  }
  scrollToTop() {
    setTimeout(() => {
      const selectors = [
        '.directoryDisplayDiv',
        '#fileContainer',
        '.inPopupComponent'
      ];

      // Helper: find nearest ancestor that is scrollable
      const getScrollParent = (node: Node | null): HTMLElement | null => {
        while (node && node !== document.body && node !== document.documentElement) {
          if (node instanceof HTMLElement) {
            const style = getComputedStyle(node);
            const overflowY = style.overflowY;
            if (overflowY === 'auto' || overflowY === 'scroll' || node.scrollHeight > node.clientHeight) {
              return node;
            }
          }
          node = node.parentNode;
        }
        return document.scrollingElement as HTMLElement | null ?? document.body;
      };

      for (const sel of selectors) {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el) continue;

        // If the element itself is scrollable, scroll it. Otherwise scroll the nearest scrollable ancestor.
        const style = getComputedStyle(el);
        const isScrollable = (style.overflowY === 'auto' || style.overflowY === 'scroll' || el.scrollHeight > el.clientHeight);
        if (isScrollable) {
          try { el.scrollTo({ top: 0, behavior: 'smooth' }); } catch { el.scrollTop = 0; }
        } else {
          const parent = getScrollParent(el.parentNode);
          if (parent) {
            try { parent.scrollTo({ top: 0, behavior: 'smooth' }); } catch { parent.scrollTop = 0; }
          } else {
            // Fallback to scrolling element into view
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
        return;
      }
    }, 100);
  }
  scrollToNext(): void {
    let allComps = document.getElementsByClassName("fileNameDiv");
    let tgtComp = undefined;
    let tgtCompIndex = 0;
    for (let x = 0; x < allComps.length; x++) {
      if (this.isElementInViewport(allComps[x] as HTMLElement)) {
        tgtComp = allComps[x];
        tgtCompIndex = x;
      }
    }
    const nextIndex = tgtCompIndex + 1;

    if (nextIndex < allComps.length) {
      allComps[nextIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      const lmrDivs = document.getElementsByClassName("loadMoreResultsDiv");
      if (lmrDivs) {
        const lmrDivElement = lmrDivs[0];
        if (lmrDivElement) {
          lmrDivElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }

  scrollToPrevious(): void {
    let allComps = document.getElementsByClassName("fileNameDiv");
    let tgtCompIndex = 0;
    let tgtComp = undefined;
    for (let x = 0; x < allComps.length; x++) {
      if (this.isElementInViewport(allComps[x] as HTMLElement)) {
        tgtComp = allComps[x];
        tgtCompIndex = x;
      }
    }
    const prevIndex = tgtCompIndex - 2;

    if (prevIndex >= 0) {
      allComps[prevIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
  getTotalCommentCount(commentList?: FileComment[]): number {
    if (!commentList || commentList.length === 0) return 0;
    let count = 0;

    const countSubComments = (comment: FileComment): number => {
      let subCount = 0;
      if (comment.comments && comment.comments.length) {
        subCount += comment.comments.length;
        for (let sub of comment.comments) {
          subCount += countSubComments(sub); // Recursively count deeper sub-comments
        }
      }
      return subCount;
    };

    for (let comment of commentList) {
      count++; // Count main comment
      count += countSubComments(comment); // Count its sub-comments
    }

    return count;
  }
  async changeSearchTermsFromPopup() {
    this.loadingSearch = true;
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      this.searchTerms = this.popupSearch.nativeElement.value.trim();
      this.goToFirstPage();
      await this.getDirectory();
      // record search as user typed and executed
      try {
        const user = this.inputtedParentRef?.user ?? this.parentRef?.user;
        if (this.searchTerms && this.searchTerms.trim() !== '') {
          await this.fileService.recordSearch(this.searchTerms, 'file', user?.id);
        }
      } catch { }
      this.scrollToTop();
      this.loadingSearch = false;
    }, 500);
  }
  changeSearchTermsFromSearchInput() {
    console.log("this.currentPage:", this.currentPage);
    this.currentPage = 1;
    this.scrollToTop();
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.searchTerms = this.search.nativeElement.value.trim();
      this.getDirectory();
    }, 500);

  }
  setSortOption(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.sortOption = target.value;
    this.getDirectory();
    setTimeout(() => {
      this.closeSearchPanel();
    }, 50);
  }
  getFileViewers(fileId: number) {
    if (this.isShowingFileViewers) {
      this.closeFileViewers();
      return;
    }
    if (this.isOptionsPanelOpen) {
      this.closeOptionsPanel();
    }
    const parent = this.inputtedParentRef ?? this.parentRef;
    this.fileService.getFileViewers(fileId).then(res => {
      this.fileViewers = res;
      setTimeout(() => {
        parent?.showOverlay();
        this.isShowingFileViewers = true;
        this.changeDetectorRef.detectChanges();
      }, 100);
    });
  }
  closeFileViewers() {
    this.isShowingFileViewers = false;
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.closeOverlay();
  }
  closeFileFavouriters() {
    this.fileFavouriters = undefined;
    this.isShowingFileFavouriters = false;
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.closeOverlay();
  }

  async showFileNotes(file: FileEntry) {
    if (this.isShowingFileNotes) {
      this.closeFileNotes();
      return;
    }
    if (this.isOptionsPanelOpen) {
      this.closeOptionsPanel(false);
    }
    this.notesFile = file;
    const parent = this.inputtedParentRef ?? this.parentRef;
    try {
      this.fileNotes = (file.notes ?? []).slice();
      setTimeout(() => {
        parent?.showOverlay();
        this.isShowingFileNotes = true;
        this.changeDetectorRef.detectChanges();
      }, 100);
    } catch (ex) {
      console.error(ex);
      this.notifyUser('Failed to fetch notes');
    }
  }

  closeFileNotes() {
    this.isShowingFileNotes = false;
    this.notesFile = undefined;
    this.fileNotes = [];
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.closeOverlay();
  }

  async addNote(textarea: HTMLTextAreaElement) {
    if (!this.user || !this.notesFile) return;
    const noteText = textarea.value.trim();
    if (!noteText) return;
    this.startLoading();
    const res = await this.fileService.addFileNote(this.user.id ?? 0, this.notesFile.id, noteText);
    if (res) {
      this.notifyUser(res);
      const existingIndex = this.fileNotes.findIndex(n => n.user?.id === this.user?.id);
      const nextNote = new FileNote(this.user, noteText);
      if (existingIndex >= 0) {
        this.fileNotes[existingIndex] = nextNote;
      } else {
        this.fileNotes.push(nextNote);
      }
      textarea.value = '';
      // Update the notes count on the file entry in the directory listing
      const local = this.directory?.data?.find(d => d.id === this.notesFile?.id);
      if (local) {
        local.notes = this.fileNotes.slice();
        local.notesCount = this.fileNotes.length;
      }
      if (this.optionsFile?.id === this.notesFile.id) {
        this.optionsFile.notes = this.fileNotes.slice();
        this.optionsFile.notesCount = this.fileNotes.length;
      }
      if (this.notesFile) {
        this.notesFile.notes = this.fileNotes.slice();
        this.notesFile.notesCount = this.fileNotes.length;
      }
    }
    this.stopLoading();
  }

  async deleteNote(targetUserId: number) {
    if (!this.user || !this.notesFile) return;
    this.startLoading();
    const res = await this.fileService.deleteFileNote(this.user.id ?? 0, this.notesFile.id, targetUserId);
    if (res) {
      this.notifyUser(res);
      this.fileNotes = this.fileNotes.filter(n => n.user?.id !== targetUserId);
      const local = this.directory?.data?.find(d => d.id === this.notesFile?.id);
      if (local) {
        local.notes = this.fileNotes.slice();
        local.notesCount = this.fileNotes.length;
      }
      if (this.optionsFile?.id === this.notesFile.id) {
        this.optionsFile.notes = this.fileNotes.slice();
        this.optionsFile.notesCount = this.fileNotes.length;
      }
      if (this.notesFile) {
        this.notesFile.notes = this.fileNotes.slice();
        this.notesFile.notesCount = this.fileNotes.length;
      }
    }
    this.stopLoading();
  }

  canDeleteNote(note: FileNote): boolean {
    if (!this.user) return false;
    // Users can delete their own notes, admin (id=1) can delete any
    return note.user?.id === this.user.id || this.user.id === 1;
  }

  isVideoFile(fileEntry: FileEntry) {
    let fileType = fileEntry.fileType ?? this.fileService.getFileExtension(fileEntry.fileName ?? '');
    fileType = fileType.replace(".", "");
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

  showPicturesToggled() {
    this.showPicturesOnly = !this.showPicturesOnly;
    this.goToFirstPage();
    if (!this.showPicturesOnly) {
      this.clearFileTypeFilter();
    } else {
      this.fileTypeFilter = this.fileService.imageFileExtensions.join(',');
      this.onFiletypeFilterChange(true);
    }
  }

  showVideosToggled() {
    this.showVideosOnly = !this.showVideosOnly;
    this.goToFirstPage();
    if (!this.showVideosOnly) {
      this.clearFileTypeFilter();
    } else {
      this.fileTypeFilter = this.fileService.videoFileExtensions.join(',');
      this.onFiletypeFilterChange(true);
    }
  }

  private get romSystemExtensions(): { [key: string]: string[] } {
    return {
      'n64': (this.fileService.n64FileExtensions && this.fileService.n64FileExtensions.length) ? this.fileService.n64FileExtensions : ['n64', 'z64', 'v64'],
      'ps1': (this.fileService.ps1FileExtensions && this.fileService.ps1FileExtensions.length) ? Array.from(new Set([...this.fileService.ps1FileExtensions, 'cue', 'iso', 'chd', 'pbp'])) : ['bin', 'cue', 'iso', 'chd', 'pbp'],
      'gba': this.fileService.getGbaFileExtensions(),
      'nds': this.fileService.getNdsFileExtensions(),
      'nes': this.fileService.getNesFileExtensions(),
      'snes': this.fileService.getSnesFileExtensions(),
      'genesis': this.fileService.getSegaFileExtensions(),
      'psp': this.fileService.getPspFileExtensions(),
      'saturn': this.fileService.getSaturnFileExtensions(),
      'gamecube': this.fileService.getRomFileExtensions(),
      'dreamcast': this.fileService.getRomFileExtensions(),
    };
  }
 
  hideBrokenImg(e: Event): void {
    const img = e?.target as HTMLImageElement | null;
    if (img) img.style.display = 'none';
  }

  unixSecondsToDate(sec?: number | null): Date | null {
    if (!sec) return null;
    return new Date(sec * 1000);
  }


  getSupportedRomSystems(): string[] {
    const candidates = Object.keys(this.romSystemExtensions);
    if (!this.allowedFileTypes || this.allowedFileTypes.length === 0) return candidates;
    const lowerAllowed = this.allowedFileTypes.map(s => s.toLowerCase());
    return candidates.filter(k => this.romSystemExtensions[k].some(ext => lowerAllowed.includes(ext)));
  }


  toggleRomSystem(key: string) {
    // Default behavior for non-Saturn systems
    const idx = this.activeRomSystems.indexOf(key);
    if (idx >= 0) {
      this.activeRomSystems.splice(idx, 1);
    } else {
      this.activeRomSystems.push(key);
    }

    if (!this.activeRomSystems || this.activeRomSystems.length === 0) {
      this.fileTypeFilter = '';
      this.onFiletypeFilterChange(true);
      return;
    }

    const exts = Array.from(new Set(this.activeRomSystems.flatMap(k => this.romSystemExtensions[k] ?? [k])));
    this.fileTypeFilter = exts.join(',');
    this.actualSystemFilter = undefined;
    this.onFiletypeFilterChange(true);
  }

  async onSystemFilterClick(key: string) {
    if (key.toLowerCase() === 'saturn' 
      || key.toLowerCase() === 'ps1' 
      || key.toLowerCase() === 'psx'
      || key.toLowerCase() === 'dreamcast'
      || key.toLowerCase() === 'gamecube'
      || key.toLowerCase() === 'psp') {
      this.activeRomSystems = [key];
      this.fileTypeFilter = '';
      this.goToFirstPage();
      this.startLoading();
      try {
        let systemKey = undefined;
        if (key.toLowerCase() === 'saturn') {
          systemKey = 'yabause';
        } else if (key.toLowerCase() === 'ps1' || key.toLowerCase() === 'psx') {
          systemKey = 'pcsx_rearmed';
        } else if (key.toLowerCase() === 'psp') {
          systemKey = 'psp';
        } else if (key.toLowerCase() === 'dreamcast') {
          systemKey = 'flycast';
        } else if (key.toLowerCase() === 'gamecube') {
          systemKey = 'dolphin';
        }
        if (systemKey) {
          await this.getDirectoryWithActualSystem(systemKey as Core); 
        } else {
          this.toggleRomSystem(key);
        }
      } finally {
        this.stopLoading();
      }
    } else {
      this.toggleRomSystem(key);
    }
  }

  async getDirectoryWithActualSystem(actualSystem: Core) {
    this.actualSystemFilter = actualSystem;
    await this.getDirectory();
    this.stopLoading();
  }

  showFavouritesToggled() {
    this.showFavouritesOnly = !this.showFavouritesOnly;
    this.goToFirstPage();
    setTimeout(() => {
      this.debounceSearch();
    }, 100);
  }

  goToFirstPage() {
    this.scrollToTop();
    this.currentPage = this.defaultCurrentPage;
  }
  notifyUser(message: string) {
    this.userNotificationEvent.emit(message);
    if (!this.captureNotifications) {
      const parent = this.inputtedParentRef ?? this.parentRef
      parent?.showNotification(message);
    }
  }
  loadMoreInView() {
    if (this.debounceTimer) {
      return;
    }
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.appendNextPage();
    }, 500);
  }
  userIsLoggedIn() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    return parent?.user?.id ? true : false;
  }
  getBreadcrumbSegments(): string[] {
    if (!this.currentDirectory || this.currentDirectory.trim() === '') {
      return [];
    }
    return this.currentDirectory.replace(/\/$/, '').split('/');
  }
  getBreadcrumbPath(index: number): string {
    const segments = this.getBreadcrumbSegments();
    return segments.slice(0, index + 1).join('/') + '/';
  }
  navigateToDirectory(directory: string): void {
    if (!this.canChangeDirectory) {
      const parent = this.inputtedParentRef ?? this.parentRef;
      parent?.showNotification("Can't change directory.");
      return;
    }
    this.goToFirstPage();
    this.currentDirectory = directory;
    this.currentDirectoryChangeEvent.emit(this.currentDirectory);
    this.getDirectory();
  }
  onFiletypeFilterChange(setFilterInput = false) {
    this.goToFirstPage();
    if (setFilterInput) {
      this.fileTypeFilterInput.nativeElement.value = this.fileTypeFilter;
    } else {
      this.fileTypeFilter = this.fileTypeFilterInput.nativeElement.value;
    }
    this.getDirectory();
  }
  clearPopupSearch() {
    try {
      if (this.popupSearch && this.popupSearch.nativeElement) {
        this.popupSearch.nativeElement.value = '';
      }
    } catch { }
    this.searchTerms = '';
    try { this.changeSearchTermsFromPopup(); } catch { }
  }

  clearFileTypeFilter() {
    try {
      if (this.fileTypeFilterInput && this.fileTypeFilterInput.nativeElement) {
        this.fileTypeFilterInput.nativeElement.value = '';
      }
    } catch { }
    this.fileTypeFilter = '';
    try { this.onFiletypeFilterChange(); } catch { }
  }

  getVisibilityIcon(vis?: string): string {
    switch ((vis || '').toLowerCase()) {
      case 'all': return '🌍';
      case 'public': return '👥';
      case 'private': return '🔒';
      default: return '❓';
    }
  }

  getOwnershipIcon(ownership?: string): string {
    switch ((ownership || '').toLowerCase()) {
      case 'all': return '🌍';
      case 'others': return '🧑‍🤝‍🧑';
      case 'own': return '👤';
      default: return '❓';
    }
  }

  async rateFile(file: FileEntry, star: number) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user ?? this.user;
    if (!user?.id) return alert('You must be logged in to rate files.');
    try {
      await this.ratingsService.submitRating(user.id, star, file.id);
      file.averageRating = file.ratingCount
        ? ((file.averageRating ?? 0) * file.ratingCount + star) / (file.ratingCount + 1)
        : star;
      file.ratingCount = (file.ratingCount ?? 0) + 1;
      this.notifyUser(`Rated ${star} star${star > 1 ? 's' : ''}!`);
    } catch (ex) {
      console.error(ex);
      this.notifyUser('Failed to submit rating.');
    }
  }

  getSystemLabel(key: string): string {
    switch (key) {
      case 'n64': return 'N64';
      case 'ps1': return 'PS1';
      case 'gba': return 'GBA';
      case 'nds': return 'NDS';
      case 'nes': return 'NES';
      case 'snes': return 'SNES';
      case 'genesis': return 'SEGA';
      default: return key.toUpperCase();
    }
  }
  getSystemIcon(key: string): SafeHtml | string {
    if (!key) return '';
    // Use the first extension for the given system (e.g. 'n64' -> 'n64')
    const exts = this.romSystemExtensions[key];
    const ext = (exts && exts.length) ? exts[0] : key;
    const style = "width:32px;height:32px;vertical-align:middle;";
    // getSystemEmoji expects a filename; pass a dummy name with the extension so FileService extracts it.
    return this.getSystemEmoji('file.' + ext, style);
  }

  /**
   * Returns the raw icon URL for a given system key (e.g. 'n64' -> '/assets/n64icon.png').
   * This is a helper for callers that need the plain src string instead of HTML.
   */
  getSystemIconUrl(key: string, actualSystem?: string): string | undefined {
    if (!key) return undefined;

    // If a DB-persisted core override exists, map it directly to an icon
    if (actualSystem) {
      const coreIconMap: { [core: string]: string } = {
        'pcsx_rearmed': '/assets/ps1icon.png',
        'mednafen_psx_hw': '/assets/ps1icon.png',
        'duckstation': '/assets/ps1icon.png',
        'mednafen_psx': '/assets/ps1icon.png',
        'ppsspp': '/assets/pspicon.png',
        'yabause': '/assets/saturnicon.png',
        'genesis_plus_gx': '/assets/segaicon.png',
        'dreamcast': '/assets/segaicon.png',
        'naomi': '/assets/segaicon.png',
        'flycast': '/assets/segaicon.png',
        'picodrive': '/assets/segaicon.png',
        'opera': '/assets/ps1icon.png',
        'mupen64plus_next': '/assets/n64icon.png',
        'melonds': '/assets/ndsicon.png',
        'mgba': '/assets/gbaicon.png',
        'gambatte': '/assets/gbicon.png',
        'fceumm': '/assets/nesicon.png',
        'snes9x': '/assets/snesicon.png',
        'mednafen_vb': '/assets/nesicon.png',
        'mame2003_plus': '/assets/atariicon.png',
        'fbneo': '/assets/atariicon.png',
        'stella2014': '/assets/atariicon.png',
        'prosystem': '/assets/atariicon.png',
        'handy': '/assets/atariicon.png',
        'virtualjaguar': '/assets/atariicon.png',
        'saturn': '/assets/saturnicon.png',
      };
      const mapped = coreIconMap[actualSystem];
      if (mapped) return mapped;
    }

    const exts = this.romSystemExtensions[key];
    const ext = (exts && exts.length) ? exts[0] : key;
    // Determine effective extension (reuse the same heuristics as getSystemEmoji)
    const fileName = 'file.' + ext;
    const rawExt = this.fileService.getFileExtension(fileName).toLowerCase();
    const ambiguousExts = new Set(['bin', 'iso', 'chd', 'cue', 'pbp']);
    // Prefer title-based guessing from FileService (covers known system-specific titles).
    const titleGuess = this.fileService.guessSystemFromTitle(fileName);
    const guessedSystem = titleGuess ?? (ambiguousExts.has(rawExt) ? this.romService.guessSystemFromFileName(fileName) : undefined);
    const effectiveExt = guessedSystem ?? rawExt;

    const iconMap: { [key: string]: string } = {
      'n64': '/assets/n64icon.png',
      'z64': '/assets/n64icon.png',
      'v64': '/assets/n64icon.png',
      'a78': '/assets/atariicon.png',
      '2600': '/assets/atariicon.png',
      '5200': '/assets/atariicon.png',
      '7800': '/assets/atariicon.png',
      'lynx': '/assets/atariicon.png',
      'jag': '/assets/atariicon.png',
      'smd': '/assets/segaicon.png',
      'gen': '/assets/segaicon.png',
      '32x': '/assets/segaicon.png',
      'gg': '/assets/segaicon.png',
      'sms': '/assets/segaicon.png',
      'md': '/assets/segaicon.png',
      'snes': '/assets/snesicon.png',
      'fig': '/assets/snesicon.png',
      'smc': '/assets/snesicon.png',
      'sfc': '/assets/snesicon.png',
      'nds': '/assets/ndsicon.png',
      'nes': '/assets/nesicon.png',
      'ps1': '/assets/ps1icon.png',
      'psp': '/assets/pspicon.png',
      'pbp': '/assets/pspicon.png',
      'psx': '/assets/ps1icon.png',
      'playstation': '/assets/ps1icon.png',
      // Sega family
      'saturn': '/assets/saturnicon.png',
      'dreamcast': '/assets/segaicon.png',
      'genesis': '/assets/segaicon.png',
      'sega': '/assets/segaicon.png',
      'gb': '/assets/gbicon.png',
      'gbc': '/assets/gbicon.png',
      'gba': '/assets/gbaicon.png'
    };

    return iconMap[effectiveExt];
  }
  getSystemEmoji(fileName?: string, styling?: string, actualSystem?: string): SafeHtml | string {
    if (!fileName) return '';
    const ext = this.fileService.getFileExtension(fileName).toLowerCase();
    const fileUrl = this.getSystemIconUrl(fileName, actualSystem);

    if (fileUrl) {
      const src = fileUrl;
      const style = styling ? styling : "width:16px;height:16px;vertical-align:middle;margin-right:6px";
      const html = `<img src="${src}" alt="${ext}" style="${style}" />`;
      return this.sanitizer.bypassSecurityTrustHtml(html);
    }

    const map: { [key: string]: string } = {
      // Nintendo family
      'gba': '🎮',
      'nes': '🕹️',
      'famicom': '🕹️',
      'vb': '🟥',
      'gb': '🟩',
      'gbc': '🟩',
      'snes': '🎛️',
      'sfc': '🎛️',
      'nds': '📱',
      'n64': '🎲',
      'z64': '🎲',
      'v64': '🎲',

      // Sega
      'smd': '🔵',
      'md': '🔵',
      'gen': '🔵',
      '32x': '🟦',
      'gg': '🔵',
      'sms': '🔵',
      'dreamcast': '🔵',
      'flycast': '🔵',
      'naomi': '🔵',

      // Atari
      'a78': '🕹️',
      '2600': '🕹️',
      '5200': '🕹️',
      '7800': '🕹️',
      'lynx': '🕹️',
      'jag': '🕹️',

      // Commodore / Amiga
      'd64': '🖥️',
      'adf': '🖥️',
      'c64': '🖥️',

      // Other / PlayStation / PSP / Arcade
      'bin': '💠',
      'cue': '🔷',
      'iso': '🔷',
      'chd': '🔷',
      'pbp': '🔷',
      'zip': '🕹️',
      'wad': '🕹️',
      'ccd': '🕹️'
    };
    return map[ext] ?? '';
  }

  /**
   * Returns an icon for a given FileEntry.
   * - For ROMs (Roms/ directory or romMetadata present) it will return the system icon via `getSystemEmoji`.
   * - For other files it returns an <img> tag if a known asset exists, otherwise falls back to an emoji.
   */
  getFileIcon(file?: FileEntry): SafeHtml | string {
    if (!file) return '';
    if (file.isFolder) return ''; // folders already show 📁 elsewhere

    // If this looks like a ROM, delegate to existing system icon logic
    const dir = this.getDirectoryName(file);
    if (dir === 'Roms/' || file.romMetadata) {
      return this.getSystemEmoji('file.' + (file.fileType ?? ''), undefined, file.romMetadata?.actualSystem);
    }

    const fileName = file.fileName ?? '';
    const ext = (this.fileService.getFileExtension(fileName) || '').toLowerCase();

    // Known extension -> asset mapping (keep empty for non-ROM files so we don't reuse emulator icons)
    // ROM/system icons are handled by `getSystemEmoji` / `getSystemIconUrl` already.
    const extAssetMap: { [key: string]: string } = {};

    const asset = extAssetMap[ext];
    if (asset) {
      const html = `<img src="${asset}" alt="${ext}" style="width:16px;height:16px;vertical-align:middle;margin-right:6px" />`;
      return this.sanitizer.bypassSecurityTrustHtml(html);
    }

    // Emoji fallback mapping for common types
    const fallback: { [key: string]: string } = {
      'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️', 'webp': '🖼️', 'svg': '🖼️',
      'pdf': '📄', 'txt': '📄', 'md': '📄', 'doc': '📄', 'docx': '📄',
      'xls': '📊', 'xlsx': '📊',
      'csv': '📑',
      'mp3': '🎵', 'wav': '🎵',
      'mp4': '🎞️', 'mov': '🎞️', 'webm': '🎞️', 'mkv': '🎞️',
      'zip': '🗜️', 'rar': '🗜️', '7z': '🗜️',
      'apk': '📦',
      'json': '🔧', 'xml': '🔧'
    };

    const emoji = fallback[ext] ?? '📎';
    return this.sanitizer.bypassSecurityTrustHtml(`<span style="margin-right:6px">${emoji}</span>`);
  }

  shouldShowRomMetadata(): boolean {
    return this.displayRomMetadata
      && this.isInRomDirectory
      && (this.isFirstLoad || (this.directory?.data ?? []).length > 0);
  }

  public safeJsonArray(value: any): string[] {
    try {
      if (!value) return [];
      if (Array.isArray(value)) return value.filter(x => typeof x === 'string');
      if (typeof value === 'string') {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : [];
      }
      return [];
    } catch {
      return [];
    }
  }

  async incrementResetVoteForOptionsFile() {
    if (!this.optionsFile || !this.optionsFile.id) return;
    try {
      const res: any = await this.romService.incrementResetVote(this.optionsFile.id);
      if (res && typeof res.resetVotes === 'number') {
        if (!this.optionsFile.romMetadata) this.optionsFile.romMetadata = {} as any;
        (this.optionsFile.romMetadata as any).resetVotes = res.resetVotes;
        this.changeDetectorRef.markForCheck();
      }
    } catch (e) {
      console.error('incrementResetVote error', e);
    }
  }
  private pickInlineThumbs(file: FileEntry): string[] {
    const md = file.romMetadata;
    if (!md) return [];

    const thumbs: string[] = [];
    if (md.coverUrl) thumbs.push(md.coverUrl);

    const ss = this.safeJsonArray(md.screenshotsJson);
    const aw = this.safeJsonArray(md.artworksJson);

    if (thumbs.length < 2 && ss.length) thumbs.push(ss[0]);
    if (thumbs.length < 2 && aw.length) thumbs.push(aw[0]);

    return thumbs.slice(0, 2);
  }

  // Hover handlers: when displaying rom metadata on desktop, create a
  // fading overlay inside the emulator's `.componentMain` so changes are
  // limited to the Emulator page and smoothly transition.
  private _hoverOverlayEl: HTMLElement | null = null;
  private _hoverOverlayHost: HTMLElement | null = null;
  private _componentMainPrevPosition: string | null = null;

  handleFileHoverEnter(ev: Event, file: FileEntry) {
    try {
      if (!this.displayRomMetadataDesktop || !this.shouldShowRomMetadata()) return;
      if (!file || file.isFolder) return;

      const img = (file.romInlineThumbs && file.romInlineThumbs.length) ? file.romInlineThumbs[0]
        : (file.romMetadata?.coverUrl ?? null);
      if (!img) return;

      const target = ev?.currentTarget as HTMLElement | null || ev?.target as HTMLElement | null;
      if (!target) {
        return;
      }

      const host = target.closest('.componentContainer') as HTMLElement | null;
      if (!host) {
        return; // unexpected
      }

      // If overlay already exists for a different host, remove it first.
      if (this._hoverOverlayEl && this._hoverOverlayHost && this._hoverOverlayHost !== host) {
        this._hoverOverlayEl.remove();
        this._hoverOverlayEl = null;
        this._hoverOverlayHost = null;
      }

      // Ensure host is positioned so absolute overlay aligns correctly
      const computed = getComputedStyle(host);
      if (computed.position === 'static') {
        this._componentMainPrevPosition = host.style.position ?? '';
        host.style.position = 'relative';
      } else {
        this._componentMainPrevPosition = null;
      }

      // Reuse overlay if present
      let overlay = this._hoverOverlayEl;
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'rom-hover-bg';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.right = '0';
        overlay.style.bottom = '0';
        overlay.style.pointerEvents = 'none';
        overlay.style.backgroundSize = 'cover';
        overlay.style.backgroundPosition = 'center center';
        overlay.style.backgroundRepeat = 'no-repeat';
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 300ms ease';
        // Place behind content
        overlay.style.zIndex = '-1';
        // Insert as first child so it sits under other content
        host.insertBefore(overlay, host.firstChild);
        this._hoverOverlayEl = overlay;
        this._hoverOverlayHost = host;
      }

      // Update image and fade in
      try {
        overlay.style.backgroundImage = `url('${img}')`;
      } catch (bgErr) {
        console.error('[HoverEnter] failed to set backgroundImage', bgErr);
      }
      // Force reflow then fade in
      void overlay.offsetWidth;
      overlay.style.opacity = '1';
    } catch (e) {
      console.error('handleFileHoverEnter failed', e);
    }
  }

  handleFileHoverLeave(ev: Event) {
    try {
      const target = ev?.currentTarget as HTMLElement | null || ev?.target as HTMLElement | null;
      const gamesContainer = target ? target.closest('.gamesContainer') : null;
      const host = gamesContainer ? gamesContainer.closest('.componentMain') as HTMLElement | null : null;

      // Only remove overlay if it belongs to this host (safety)
      if (this._hoverOverlayEl && this._hoverOverlayHost && (!host || host === this._hoverOverlayHost)) {
        const overlay = this._hoverOverlayEl;
        overlay.style.opacity = '0';
        // Remove after transition
        const cleanup = () => {
          try {
            overlay.removeEventListener('transitionend', cleanup);
            if (overlay.parentElement) {
              overlay.parentElement.removeChild(overlay);
            }
          } catch { }
          if (this._hoverOverlayHost && this._componentMainPrevPosition !== null) {
            this._hoverOverlayHost.style.position = this._componentMainPrevPosition || '';
          }
          this._hoverOverlayEl = null;
          this._hoverOverlayHost = null;
          this._componentMainPrevPosition = null;
        };
        overlay.addEventListener('transitionend', cleanup);
        // Fallback in case transitionend doesn't fire
        setTimeout(() => {
          cleanup();
        }, 400);
      }
    } catch (e) {
      console.error('handleFileHoverLeave failed', e);
    }
  }

  onVideoLinkClick(url: string, ev: Event) {
    if (this.displayRomMetadata) {
      this.parentRef?.visitExternalLink(url, false, true);
      return;
    }
    this.closeOptionsPanel();
    const videoId = this.fileService.parseYoutubeId(url);
    console.debug('onVideoLinkClick', { url, videoId, hasParent: !!this.parentRef });
    ev.preventDefault();
    setTimeout(() => {
      try {
        if (videoId && this.parentRef) {
          this.parentRef.playYoutubeVideo(videoId);
          return;
        }
      } catch (e) {
        console.error('Error handling video link click', e);
      }
    }, 500);
  }

  openImagePreview(url?: string, ev?: Event) {
    if (ev) ev.preventDefault();
    if (!url) return;
    if (this.isOptionsPanelOpen) {
      this.closeOptionsPanel();
    }
    setTimeout(() => {
      this.parentRef?.showOverlay();
      this.imagePreviewUrl = url;
      this.isShowingImagePreview = true;
    }, 50);
    this.changeDetectorRef.detectChanges();
  }

  closeImagePreview() {
    this.isShowingImagePreview = false;
    this.imagePreviewUrl = null;
    this.parentRef?.closeOverlay();
  }
}

type SlotNumber = 0 | 1 | 2 | 3 | 4 | 5;