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
import { FollowService } from '../../services/follow.service';
import { OfflineFileInfo } from '../../services/local-rom.service';
import { FileAccessLog } from '../../services/datacontracts/file/file-access-log';
import { FileNote } from '../../services/datacontracts/file/file-note';
import { Core, CoreDescriptor } from '../emulator/emulator-types';
import { BooksService } from '../../services/books.service';

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
  @Input() inputtedParentRef?: AppComponent;
  @Input() displayPrivatePublicOption: boolean = true;
  @Input() maxResults: number = 10;
  @Input() fileSearchMode: boolean = false;
  /** Enables the book view filters (My library / Community). They only render
   *  while this flag is set AND the browsed directory is inside Books/ — other
   *  file-search usages never see them, even inside the Books tree. */
  @Input() isBookView: boolean = false;
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
  @Input() displayAsTable: boolean = true;
  @Input() displayRomMetadataDesktop: boolean = false;
  /** Render the first page of PDF files as thumbnails when this browser is used
   *  for book management. The normal file browser keeps its lightweight icon
   *  placeholders unless explicitly opted in. */
  @Input() showPdfFirstPageCovers: boolean = false;
  @Input() autoload: boolean = false;
  @Input() canDragMove: boolean = true;
  @Input() fileId?: number | undefined = undefined;
  @Input() commentId?: number;
  @Input() displayTotal = true;
  @Input() showSpaceForNotifications = false;
  @Input() forceSearchSameDirectory: boolean = false;
  @Input() showHiddenFiles: boolean = false; // default: do not show hidden files unless user toggles or user setting enables it
  @Input() showTopics: boolean = true;
  @Input() captureNotifications: boolean = false;
  @Input() currentPage = this.defaultCurrentPage;
  @Input() massDeleteMode: boolean = false;
  @Input() disabled = false;
  @Input() searchButtonSlot = 2 as SlotNumber;
  // Local copies that can be played offline (exact file names), plus where
  // each copy lives: a real file in the user's folder, or browser (IndexedDB)
  // storage. Matching rows get a small badge showing the source.
  @Input() offlineFiles: OfflineFileInfo[] = [];
  @Output() selectedForDeleteChange = new EventEmitter<number[]>();
  @Output() selectFileEvent = new EventEmitter<FileEntry>();
  @Output() currentDirectoryChangeEvent = new EventEmitter<string>();
  @Output() userNotificationEvent = new EventEmitter<string>();
  @Output() expandClickedEvent = new EventEmitter<FileEntry>();
  @Output() tableViewClickedEvent = new EventEmitter<boolean>();

  selectedForDelete: Set<number> = new Set<number>();
  showFavouritesOnly = false;
  showPicturesOnly = false;
  showVideosOnly = false;
  /** Book-scoped view filter (only shown while browsing the Books tree):
   *  'all' = everything in the folder, 'library' = my registered books plus
   *  books shared with me, 'community' = public/shared community books.
   *  Mirrors the old eBooks library/catalog tabs, server-side via bookFilter. */
  bookFilter: 'all' | 'library' | 'community' = 'all';
  trendingSearches: string[] = [];
  sortOption: string = '';
  actualCoreFilter?: string[];
  showData = true;
  showShareUserList = false;
  isSearchPanelOpen = false;
  isOptionsPanelOpen = false;
  isShowingFileViewers = false;
  isShowingFileFavouriters = false;
  isShowingImagePreview = false;
  imagePreviewUrl?: string | null = null;
  isGridMediaExpanded = false;
  gridMediaFile: FileEntry | undefined;
  /** All expandable media files in the current listing, for prev/next flipping. */
  gridMediaFiles: FileEntry[] = [];
  gridMediaIndex = 0;
  isVisibilityDropdownOpen = false;
  visibilityDropdownFile: FileEntry | null = null;
  showCommentsInOpenedFiles: number[] = [];
  fileViewers?: FileAccessLog[] | undefined;
  fileFavouriters?: number[] | undefined;
  optionsFile: FileEntry | undefined;
  imagePreviewFile: FileEntry | undefined;
  favouritersFile: FileEntry | undefined;
  systemSelectFile: FileEntry | undefined;
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
  // Debounced natural-aspect application: while grid thumbs render in bursts
  // (fast scrolling) their aspect ratios are collected and applied in a single
  // reflow once the grid settles, instead of re-laying-out per image.
  private pendingGridAspects = new Map<number, number>();
  private gridAspectDebounceTimer: number | null = null;
  private gridAspectFirstPendingAt = 0;
  private readonly gridAspectDebounceMs = 300;
  private readonly gridAspectMaxWaitMs = 1200;
  // Persisted natural-aspect cache: revisited directories get correctly sized
  // thumbs immediately, before their media loads and reports again.
  private cachedMediaAspects: Record<string, number> | null = null;
  private static readonly MEDIA_ASPECTS_STORAGE_KEY = 'fileSearchMediaAspects';
  private static readonly MEDIA_ASPECTS_MAX_ENTRIES = 2000;
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
  isHidingFile = false;
  isDeletingFile = false;
  isDownloadingFile = false;
  isClearingSystemOverride = false;
  isSettingSystemOverride = false;
  isShowingFileNotes = false;
  fileNotes: FileNote[] = [];
  notesFile: FileEntry | undefined;
  isCommentsPopupOpen = false;
  fileCommentsPopup: FileComment[] = [];
  commentsPopupFile: FileEntry | undefined;
  isSystemSelectPanelOpen: boolean = false;
  systemCandidates: Array<{ label: string; core?: string }> = [];
  selectedSystemCore: string | null = null;
  isFirstLoad = true;
  isAddingToFavourites = false;
  isAddingToMusicPlaylist = false;
  isAddingToLibrary = false;
  isRemovingFromLibrary = false;
  isFileInMyLibraryCache: Map<number, boolean | null> = new Map<number, boolean | null>();
  isFollowingFile: { [key: number]: boolean } = {};
  isRatingPanelOpen = false;
  pageLocked = false;
  appending = false;
  imageIndex: number = 0;

  private controllerIndex: number = -1;
  private getDirectoryAbortController: AbortController | null = null;
  private _hoverOverlayEl: HTMLElement | null = null;
  private _hoverOverlayHost: HTMLElement | null = null;
  private _componentMainPrevPosition: string | null = null;
  private _savedDirectoryBeforeFileIdSearch: string | null = null;
  private windowScrollHandler: Function;
  private containerScrollHandler: Function;
  private scrollWatchInterval: any;
  private pdfCoverUrls = new Map<number, string>();
  private pdfCoverRequests = new Set<number>();

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
    private followService: FollowService,
    private route: ActivatedRoute,
    private changeDetectorRef: ChangeDetectorRef,
    private sanitizer: DomSanitizer,
    private booksService: BooksService) {
    super();
    this.windowScrollHandler = this.debounce(this.onWindowScroll.bind(this), 200);
    this.containerScrollHandler = this.debounce(this.onContainerScroll.bind(this), 200);
  }

  async ngOnInit() {
    if (this.inputtedParentRef) {
      this.parentRef = this.inputtedParentRef;
    }
    const user = this.currentUser;
    if (user?.id) {
      await this.userService.getUserSettings(user.id).then(res => {
        if (res) {
          this.isDisplayingNSFW = res.nsfwEnabled ?? false;
          if (res.showHiddenFiles !== undefined) {
            this.showHiddenFiles = res.showHiddenFiles;
            this.filter.hidden = this.showHiddenFiles ? 'all' : 'unhidden';
          }
          if (res.showFavouritesOnly !== undefined) {
            this.showFavouritesOnly = res.showFavouritesOnly;
          }
          // Load saved page size
          if (res.pageSize && res.pageSize > 0) {
            this.maxResults = res.pageSize;
          }
        }
      });
    }

    this.allowedFileTypes = this.allowedFileTypes.map(type => type.toLowerCase());
    if (this.fileId && this.fileId != null) {
      this.fileIdFilter = this.fileId;
      await this.loadFileByIdOnce(this.fileId);
      this.replacePageTitleAndDescription();
      return;
    }

    const routeFileIdParam = this.route.snapshot.paramMap.get('fileId');
    const routeFileId = routeFileIdParam ? +routeFileIdParam : undefined;
    if (routeFileId) {
      this.fileId = routeFileId;
      this.fileIdFilter = this.fileId;
      await this.loadFileByIdOnce(this.fileId);
      this.replacePageTitleAndDescription();
      return;
    }

    this.route.paramMap.subscribe(async (params: any) => {
      const paramFileId = +params.get('fileId');
      if (paramFileId && paramFileId != null) {
        this.fileId = paramFileId;
        this.fileIdFilter = this.fileId;
        await this.loadFileByIdOnce(this.fileId);
        this.replacePageTitleAndDescription();
        return;
      }
    });

    // No route fileId -> load directory normally
    await this.getDirectory();
  }

  ngAfterViewInit() {
    window.addEventListener('scroll', this.windowScrollHandler as EventListener);

    if (this.fileContainer?.nativeElement) {
      this.fileContainer.nativeElement.addEventListener('scroll', this.containerScrollHandler as EventListener);
    }

    setTimeout(() => {
      const dir = this.directoryDisplayDivRef?.nativeElement;
      if (dir) {
        let lastTop = dir.scrollTop;
        this.scrollWatchInterval = setInterval(() => {
          if (dir.scrollTop !== lastTop) {
            lastTop = dir.scrollTop;
          }
        }, 100);
      }
    }, 1000);

    this.adjustMaxHeightOnce();
    this.updateDisplayRomMetadataDesktop();
  }

  private _maxHeightAdjusted = false;

  private adjustMaxHeightOnce() {
    if (this._maxHeightAdjusted) return;
    const el = this.directoryDisplayDivRef?.nativeElement;
    if (!el) return;
    const computed = window.getComputedStyle(el);
    let maxHeight = computed.getPropertyValue('max-height');
    if (maxHeight && maxHeight.endsWith('px')) {
      let px = parseFloat(maxHeight);
      if (!isNaN(px)) {
        if (this.showUpFolderRow && this.canChangeDirectory && !this.fileSearchMode) {
          el.style.setProperty('max-height', (px - 50) + 'px', 'important');
          this._maxHeightAdjusted = true;
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

  /** True while browsing Books/ or any of its subfolders. */
  isInBooksDirectory(): boolean {
    const dir = (this.currentDirectory ?? '').replace(/\\/g, '/').toLowerCase().replace(/^\/+|\/+$/g, '');
    return dir === 'books' || dir.startsWith('books/');
  }

  /** True while at the Books/ root itself (not one of its subfolders). */
  isBooksRootDirectory(): boolean {
    const dir = (this.currentDirectory ?? '').replace(/\\/g, '/').toLowerCase().replace(/^\/+|\/+$/g, '');
    return dir === 'books';
  }

  /** Reset the book view filter when navigation leaves the Books tree. */
  private syncBookFilterToDirectory() {
    if (!this.isInBooksDirectory()) {
      this.bookFilter = 'all';
    }
  }

  setBookFilter(mode: 'all' | 'library' | 'community') {
    if (mode === this.bookFilter) return;
    this.bookFilter = mode;
    this.goToFirstPage();
    this.getDirectory();
  }

  onBookFilterChange(event: Event) {
    const mode = (event.target as HTMLSelectElement).value as 'all' | 'library' | 'community';
    this.setBookFilter(mode);
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
    // Book view filter
    if (this.bookFilter !== 'all') return true;
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
    window.removeEventListener('scroll', this.windowScrollHandler as EventListener);

    if (this.fileContainer?.nativeElement) {
      this.fileContainer.nativeElement.removeEventListener('scroll', this.containerScrollHandler as EventListener);
    }

    if (this.scrollWatchInterval) {
      clearInterval(this.scrollWatchInterval);
      this.scrollWatchInterval = null;
    }

    if (this.gridAspectDebounceTimer) {
      clearTimeout(this.gridAspectDebounceTimer);
      this.gridAspectDebounceTimer = null;
    }

    this.getDirectoryAbortController?.abort();
  }

  onWindowScroll() {
    const threshold = 100;
    const atBottom =
      window.innerHeight + window.scrollY >=
      document.documentElement.scrollHeight - threshold;

    if (atBottom && !this.isLoading && this.currentPage < this.totalPages) {
      this.appendNextPage();
    }
  }

  onContainerScroll() {
    const element = this.fileContainer.nativeElement;
    const threshold = 100;
    const atBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + threshold;

    if (atBottom && !this.isLoading && this.currentPage < this.totalPages) {
      this.appendNextPage();
    }
  }

  scrollToFile(fileId: number) {
    setTimeout(() => {
      const element = document.getElementById('fileIdName' + fileId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 1000);
  }

  async delete(file?: FileEntry) {
    if (!file || !file.id) return;
    const user = this.currentUser;

    if (confirm(`Delete : ${file.fileName} ?`)) {
      this.startLoading();
      this.isDeletingFile = true;
      this.changeDetectorRef.detectChanges();
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
      } finally {
        this.isDeletingFile = false;
      }
      this.stopLoading();
      this.closeOptionsPanel();
    }
  }

  async getDirectory(file?: string, fileId?: number, append?: boolean) {
    if (this.isLoading || this.pageLocked) return;
    this.startLoading();
    this.pageLocked = true;
    if (!append) {
      this.resetControllerHover(true);
    }
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
      this.getDirectoryAbortController = new AbortController();

      const effectiveFileId = (fileId ?? this.fileIdFilter) as number | undefined;

      const isFileIdSearch = !!effectiveFileId;
      if (isFileIdSearch && this._savedDirectoryBeforeFileIdSearch == null) {
        this._savedDirectoryBeforeFileIdSearch = this.currentDirectory;
      }

      const includeRomMetadata = this.shouldShowRomMetadata();

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
        this.currentUser,
        this.currentPage,
        this.maxResults,
        this.searchTerms,
        effectiveFileId,
        fileTypes,
        this.filter.hidden == 'all' ? true : false,
        sortToUse,
        this.showFavouritesOnly,
        this.forceSearchSameDirectory,
        includeRomMetadata,
        this.actualCoreFilter,
        this.isDisplayingNSFW,
        this.getDirectoryAbortController.signal,
        this.isBookView && this.bookFilter !== 'all' ? this.bookFilter : undefined,
        // Book view always keeps folders visible — folders carry no file_type,
        // so the book-types filter would otherwise hide them entirely.
        this.isBookView,
      ).then(async res => {
        const noData = !res;
        if (res && append && this.directory && this.directory.data) {
          this.startAppendingMode();
          const newItems = (res.data || []).filter((d: FileEntry) =>
            !this.directory?.data?.some((existingData) => existingData.id === d.id)
          );
          if (res.currentDirectory) {
            for (const f of newItems) { f.directory = res.currentDirectory; }
          }
          this.directory.data = this.directory.data.concat(newItems);
          this.applyCachedMediaAspects();
          if (this.isInRomDirectory) {
            for (let x = 0; x < this.directory.data.length; x++) {
              if (this.directory.data[x].notes) { continue; }
              const fRes = await this.fileService.getFileEntryById(this.directory.data[x].id, this.parentRef?.user?.id, this.parentRef?.fileCache, true);
              if (fRes) {
                Object.assign(this.directory.data[x], fRes);
                this.normalizeRomMetadata(this.directory.data[x]);
                this.changeDetectorRef.detectChanges();
              }
            }
          }

          if (this.optionsFile) {
            const linked = this.directory.data.find(d => d.id === this.optionsFile?.id);
            if (linked) {
              this.optionsFile = linked;
              try { this.changeDetectorRef.detectChanges(); } catch { }
            }
          }
        } else if (res) {
          this.directory = res;
          this.applyCachedMediaAspects();

          if (this.shouldShowRomMetadata() && this.directory?.data?.length) {
            for (let x = 0; x < this.directory.data.length; x++) {
              if (this.directory.data[x].notes) { continue; }
              const fRes = await this.fileService.getFileEntryById(this.directory.data[x].id, this.parentRef?.user?.id, this.parentRef?.fileCache, true);
              if (fRes) {
                Object.assign(this.directory.data[x], fRes);
                this.normalizeRomMetadata(this.directory.data[x]);
                this.changeDetectorRef.detectChanges();
              }
            }
          }

          if (!isFileIdSearch && this.fileIdFilter == null) {
            if (this.directory && this.directory.currentDirectory) {
              this.currentDirectory = this.directory.currentDirectory;
              for (const f of this.directory.data ?? []) {
                f.directory = this.directory.currentDirectory;
              }
            } else if (!noData) {
              this.currentDirectory = '';
            }
            this.syncBookFilterToDirectory();
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
    void this.preloadLibraryCache();
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

  /** Insert newly uploaded files at the top of the current directory listing.
   *  Keeps folders at the absolute top and avoids duplicating existing items.
   */
  public placeNewFilesOnTop(files?: FileEntry[] | null): void {
    if (!files || files.length === 0) return;
    if (!this.directory || !Array.isArray(this.directory.data)) return;
    this.goToFirstPage();

    const existing: FileEntry[] = this.directory.data || [];
    const existingIds = new Set<number | undefined>(existing.map(f => f?.id));
    const newFiles = files.filter(f => f && !existingIds.has(f.id));
    if (!newFiles.length) return;

    // Normalize rom metadata for new files when appropriate
    if (this.shouldShowRomMetadata()) {
      for (const f of newFiles) {
        try { this.normalizeRomMetadata(f); } catch { }
      }
    }

    // Ensure date fields are Date objects and normalized to local time (same logic as getDirectory)
    for (const data of newFiles) {
      try {
        if (!data.date) { data.date = new Date(); }
        if (typeof data.date === 'string') { data.date = new Date(data.date); }
        data.date = new Date((data.date as Date).getTime() - (data.date as Date).getTimezoneOffset() * 60000);

        if (!data.lastAccess) { data.lastAccess = new Date(); }
        if (typeof data.lastAccess === 'string') { data.lastAccess = new Date(data.lastAccess as any); }
        data.lastAccess = new Date((data.lastAccess as Date).getTime() - (data.lastAccess as Date).getTimezoneOffset() * 60000);

        if (!data.lastUpdated) { data.lastUpdated = new Date(); }
        if (typeof data.lastUpdated === 'string') { data.lastUpdated = new Date(data.lastUpdated as any); }
        data.lastUpdated = new Date((data.lastUpdated as Date).getTime() - (data.lastUpdated as Date).getTimezoneOffset() * 60000);
      } catch { /* ignore date conversion errors for robustness */ }
    }

    const folders = existing.filter(d => d.isFolder);
    const others = existing.filter(d => !d.isFolder);
    this.directory.data = folders.concat(newFiles, others);

    try { this.changeDetectorRef.detectChanges(); } catch { }
  }

  refreshDirectory() {
    this.debounceSearch();
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
    const savedSort = this.sortOption;
    this.sortOption = '';
    await this.getDirectory(undefined, id);
    this.sortOption = savedSort;
  }

  getFileExtension(filename: string) {
    return this.fileService.getFileExtension(filename);
  }
  selectFileNoPropagation(event: any, file: FileEntry) {
    if (!this.fileSearchMode) return;
    event.stopPropagation();
    return this.selectFile(file);
  }

  /** Whether the current directory is anywhere inside the ROMs tree (incl. system subfolders). */
  private isInRomTree(): boolean {
    return /\broms?\b/i.test(this.currentDirectory ?? '');
  }

  /**
   * Grid view click handler. Images/videos (outside the ROM tree) open an
   * expanded preview popup. In book view, folders navigate into the folder
   * (matching table behavior) so the Books file manager is browseable from the
   * grid view too.
   */
  onGridItemClick(file: FileEntry) {
    if (file.isFolder) {
      if (this.isBookView && this.canChangeDirectory) {
        this.selectFile(file);
        return;
      }
      return;
    }
    if (!this.isInRomTree() && this.isMediaFile(file.fileName ?? '')) {
      this.openGridMediaExpand(file);
      return;
    }
    this.selectFile(file);
  }

  openGridMediaExpand(file: FileEntry) {
    // Build the flip list from the current listing: media files (outside the ROM tree), deduped by id.
    this.gridMediaFiles = (this.directory?.data ?? [])
      .filter(f => !f.isFolder && !this.isInRomTree() && this.isMediaFile(f.fileName ?? ''))
      .filter((f, i, arr) => arr.findIndex(x => x.id === f.id) === i);
    const idx = this.gridMediaFiles.findIndex(f => f.id === file.id);
    this.gridMediaIndex = idx >= 0 ? idx : 0;
    this.gridMediaFile = file;
    this.isGridMediaExpanded = true;
    this.parentRef?.showOverlay();
    try { this.changeDetectorRef.detectChanges(); } catch { }
  }

  showGridMediaPrev() {
    if (this.gridMediaFiles.length <= 1) return;
    this.gridMediaIndex = (this.gridMediaIndex - 1 + this.gridMediaFiles.length) % this.gridMediaFiles.length;
    this.setGridMediaFile(this.gridMediaFiles[this.gridMediaIndex]);
  }

  showGridMediaNext() {
    if (this.gridMediaFiles.length <= 1) return;
    this.gridMediaIndex = (this.gridMediaIndex + 1) % this.gridMediaFiles.length;
    this.setGridMediaFile(this.gridMediaFiles[this.gridMediaIndex]);
  }

  private setGridMediaFile(file: FileEntry) {
    this.gridMediaFile = file;
    // media-viewer reloads when its fileId input changes (OnChanges), so flipping the
    // file object is enough to load the next/previous media.
    try { this.changeDetectorRef.detectChanges(); } catch { }
  }

  closeGridMediaExpand() {
    this.isGridMediaExpanded = false;
    this.gridMediaFile = undefined;
    this.gridMediaFiles = [];
    this.gridMediaIndex = 0;
    this.parentRef?.closeOverlay();
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
        this.pageLocked = false;
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
    const user = this.currentUser;
    if (user?.id) {
      this.userService.updateUserSettings(user.id, [
        { settingName: 'show_hidden_files', value: isChecked }
      ]).then(res => {
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
    const user = this.currentUser;
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
    const user = this.currentUser;
    if (!user?.id) {
      alert('You must be logged in to view NSFW content.');
      this.isDisplayingNSFW = false;
      return;
    }
    this.isDisplayingNSFW = !this.isDisplayingNSFW;
    this.userService.updateUserSettings(user.id, [{ settingName: 'nsfw_enabled', value: this.isDisplayingNSFW }]).then(res => {
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
      event.preventDefault();
      await this.editFile(fileId, text);
      this.isEditing = [];
    } else {
      event.stopPropagation();
    }
  }
  async editFile(fileId: number, text: string) {
    if (!this.currentUser.id) { return alert("You must be logged in to use this feature!"); }

    if (!text || text.trim() == '') {
      this.isEditing = this.isEditing.filter(x => x != fileId);
      return;
    }
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      if (this.currentUser) {
        const res = await this.fileService.updateFileData(this.currentUser.id ?? 0, { FileId: fileId, GivenFileName: text, Description: '', LastUpdatedBy: this.currentUser });
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
  async startEditingFileName(fileId?: number) {
    if (!fileId) return;
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
    return userid == this.currentUser?.id;
  }
  async download(file?: FileEntry, force?: boolean, forceOpenMedia?: boolean) {
    if (!file || !file.id) return;
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
      try {
        this.startLoading();
        this.isDownloadingFile = true;
        this.changeDetectorRef.detectChanges();
        this.getDirectoryAbortController = new AbortController();
        // Download by file id: the server resolves the authoritative path from the
        // database, exactly like the inline preview does. Reconstructing a path from
        // currentDirectory breaks for search results (files can live in any directory),
        // which produced 404s that surfaced as "empty file" downloads.
        const parent = this.parentRef ?? this.inputtedParentRef;
        const sessionToken = await parent?.getSessionToken();
        const response = await this.fileService.getFileById(file.id, sessionToken ?? "", { signal: this.getDirectoryAbortController.signal }, parent?.user?.id);
        // response.blob is already a Blob with the server's content type — re-wrapping it
        // would stringify it to "[object Blob]" and corrupt the download.
        const blob = response?.blob;
        if (!blob) throw new Error('No file data received');
        if (blob.size === 0) throw new Error('Empty file content');

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
        this.stopLoading();
        // Surface the failure to the user instead of failing silently — the confirm()
        // dialog already closed, so without a toast the download just "does nothing".
        this.parentRef?.showNotification(
          ex instanceof Error && ex.message === 'No file data received'
            ? `Download failed: no data received for ${file.fileName}.`
            : ex instanceof Error && ex.message === 'Empty file content'
              ? `Download failed: the server returned empty content for ${file.fileName}.`
              : `Download failed for ${file.fileName}. Please try again.`);
      } finally {
        this.isDownloadingFile = false;
      }
    }
  }

  onDragStart(event: Event, fileName: string) {
    if (!this.canDragMove) { return; }
    this.draggedFilename = fileName.trim();
    this.destinationFilename = undefined;

    // In book view, prevent dragging book files out of the Books tree into other
    // filesystem areas. The actual drop is still allowed inside Books/ subfolders.
    if (this.isBookView && this.draggedFilename) {
      const currentFile = this.directory?.data?.find(f => f.fileName === this.draggedFilename);
      if (currentFile && !currentFile.isFolder && this.isInBooksDirectory()) {
        (event.currentTarget as HTMLElement)?.setAttribute('data-book-drag', 'true');
      }
    }
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

  /** In book view, block moving book files (non-folders) out of the Books tree.
   *  Folders can still be reorganized inside Books/; only book-format files are
   *  protected from being dragged to arbitrary filesystem locations. */
  private canDropFileInBookView(draggedFile: FileEntry | undefined, destinationFolder: string): boolean {
    if (!this.isBookView) return true;
    if (!draggedFile || draggedFile.isFolder) return true;
    // Allow drops inside any Books/ path (current or target).
    const destNormalized = destinationFolder.replace(/\\/g, '/').toLowerCase().replace(/^\/+|\/+$/g, '');
    const booksMarker = destNormalized.indexOf('books');
    if (booksMarker < 0) return false;
    // Also keep the source in Books/ — if the dragged file is already in Books/,
    // only allow moves that stay inside Books/.
    const currentNormalized = (this.currentDirectory ?? '').replace(/\\/g, '/').toLowerCase().replace(/^\/+|\/+$/g, '');
    const currentInBooks = currentNormalized.indexOf('books') === 0;
    if (currentInBooks) {
      // Accept if destination is Books/ or a Books/ subfolder.
      return destNormalized === 'books' || destNormalized.startsWith('books/');
    }
    return destNormalized === 'books' || destNormalized.startsWith('books/');
  }

  private buildBookViewMoveDeniedMessage(draggedFile: FileEntry | undefined, destinationFolder: string): string {
    if (!draggedFile) return 'That move is not allowed in the book view.';
    const folderName = destinationFolder || this.currentDirectory;
    return `Book files can only be moved within the Books tree. “${draggedFile.givenFileName ?? draggedFile.fileName}” cannot be moved to “${folderName}” because that location is outside Books/.`;
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
    if (!this.draggedFilename || this.draggedFilename == this.destinationFilename) {
      let message = "";
      if (!this.draggedFilename) message += "You must select an item to be moved!";
      if (message) alert(message);
      return;
    }

    const destinationFolder = specDir ?? (currDir + this.destinationFilename);
    const draggedFile = this.directory?.data?.find(x => x.fileName === this.draggedFilename);

    if (!this.canDropFileInBookView(draggedFile, destinationFolder)) {
      this.draggedFilename = undefined;
      this.destinationFilename = undefined;
      this.parentRef?.showNotification(this.buildBookViewMoveDeniedMessage(draggedFile, destinationFolder));
      return;
    }

    if (!confirm(`Move ${this.draggedFilename!.trim()} to ${destinationFolder}?`)) {
      return;
    }

    const inputFile = currDir + this.draggedFilename;
    this.startLoading();
    try {
      const user = this.currentUser;
      const userId = user?.id ?? 0;
      const fileIdToSend = draggedFile?.id ?? undefined;
      const res = await this.fileService.moveFile(inputFile, destinationFolder, userId, fileIdToSend);
      this.notifyUser(res!);
      if (!res!.includes("error")) {
        this.directory!.data = this.directory!.data!.filter(x => x.fileName != this.draggedFilename);
      }
    } catch (ex) {
      console.error(ex);
      this.notifyUser(`Failed to move ${this.draggedFilename} to ${destinationFolder}!`);
    }
    this.stopLoading();
  }

  previousDirectory() {
    if (this.search && this.search.nativeElement) {
      this.search.nativeElement.value = '';
    }
    const target = this.moveUpOneLevel();
    this.goToFirstPage();
    this.currentDirectory = target;
    this.syncBookFilterToDirectory();
    this.pageLocked = false;
    this.getDirectory();
  }

  setFilterOwnership(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.filter.ownership = target.value;
    this.getDirectory();
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
    this.maxResults = 10;
    this.totalPages = this.defaultTotalPages;
  }

  isPdfFile(fileName?: string): boolean {
    return !!fileName && fileName.toLowerCase().endsWith('.pdf');
  }

  /** Returns a cached first-page PDF cover and starts one deduplicated render
   *  when the file first appears in a grid. */
  pdfCoverSrc(file: FileEntry): string {
    if (!this.showPdfFirstPageCovers || file.isFolder || !this.isPdfFile(file.fileName) || !file.id) return '';
    const cached = this.pdfCoverUrls.get(file.id);
    if (cached) return cached;
    if (!this.pdfCoverRequests.has(file.id)) {
      this.pdfCoverRequests.add(file.id);
      void this.booksService.getPdfThumbnail(file.id).then(url => {
        if (url) this.pdfCoverUrls.set(file.id, url);
        try { this.changeDetectorRef.detectChanges(); } catch { }
      });
    }
    return '';
  }

  isMediaFile(fileName?: string): boolean {
    if (fileName) {
      const mediaFileTypes = this.fileService.audioFileExtensions.concat(this.fileService.videoFileExtensions).concat(this.fileService.imageFileExtensions);
      const lowerCaseFileName = fileName.toLowerCase();
      return mediaFileTypes.some(extension => lowerCaseFileName.endsWith(`.${extension}`));
    }
    return false;
  }

  /** True only for video files (excludes audio — isVideoFile() includes audio). */
  isVideoFileOnly(fileName?: string): boolean {
    if (!fileName) return false;
    const lower = fileName.toLowerCase();
    return this.fileService.videoFileExtensions.some(ext => lower.endsWith(`.${ext}`));
  }

  /** Stores the duration reported by a grid thumb's media-viewer on the matching file entry. */
  onVideoMetadataEvent(event: { fileId: number; duration: number }) {
    if (!event || !event.fileId || !isFinite(event.duration) || event.duration <= 0) return;
    const file = this.directory?.data?.find(f => f.id === event.fileId);
    if (file) {
      file.videoDuration = event.duration;
      try { this.changeDetectorRef.detectChanges(); } catch { }
    }
  }

  /** Called once a grid thumb's media actually renders (image load or
   *  video/audio canplay). Records the natural proportions per file, then
   *  debounces the actual layout application: while thumbs stream in (fast
   *  scrolling) the grid stays put, and all collected aspects are applied in
   *  a single reflow once rendering settles (or after a max-wait so a long
   *  scroll still updates periodically). */
  onGridMediaRendered(event: { fileId?: number; width?: number; height?: number }) {
    if (!event || !event.fileId || !event.width || !event.height || !isFinite(event.width) || !isFinite(event.height)) return;
    const first = this.pendingGridAspects.size === 0;
    // Clamp extreme panoramas/portraits so a single cell can't dominate its row.
    this.pendingGridAspects.set(event.fileId, Math.min(2.2, Math.max(0.45, event.width / event.height)));
    if (first) {
      this.gridAspectFirstPendingAt = Date.now();
    }
    this.scheduleGridAspectApply();
  }

  private scheduleGridAspectApply() {
    if (this.gridAspectDebounceTimer) {
      clearTimeout(this.gridAspectDebounceTimer);
    }
    // Fire on the quiet debounce window since the last render, or no later
    // than the max-wait boundary since the first pending render — whichever
    // comes first.
    const sinceFirst = Date.now() - this.gridAspectFirstPendingAt;
    const delay = Math.max(0, Math.min(this.gridAspectDebounceMs, this.gridAspectMaxWaitMs - sinceFirst));
    this.gridAspectDebounceTimer = window.setTimeout(() => this.applyPendingGridAspects(), delay);
  }

  private applyPendingGridAspects() {
    this.gridAspectDebounceTimer = null;
    if (this.pendingGridAspects.size === 0) return;
    const data = this.directory?.data;
    if (data) {
      let changed = false;
      this.pendingGridAspects.forEach((aspect, fileId) => {
        const file = data.find(f => f.id === fileId);
        if (file && file.mediaAspect !== aspect) {
          file.mediaAspect = aspect;
          changed = true;
        }
      });
      if (changed) {
        // One reflow for the whole batch once the grid settles.
        try { this.changeDetectorRef.detectChanges(); } catch { }
      }
    }    this.persistMediaAspects();
    this.pendingGridAspects.clear();
  }

  private loadCachedMediaAspects(): Record<string, number> {
    if (this.cachedMediaAspects) return this.cachedMediaAspects;
    let loaded: Record<string, number> = {};
    try {
      const raw = localStorage.getItem(FileSearchComponent.MEDIA_ASPECTS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === 'object') loaded = parsed;
    } catch { }
    this.cachedMediaAspects = loaded;
    return loaded;
  }

  /** Applies any persisted aspect ratios to the freshly loaded listing so
   *  revisited directories render correctly sized thumbs immediately, without
   *  waiting for each media element to load and report its size again. */
  private applyCachedMediaAspects() {
    const cache = this.loadCachedMediaAspects();
    const data = this.directory?.data;
    if (!data || Object.keys(cache).length === 0) return;
    let changed = false;
    for (const file of data) {
      const aspect = cache[String(file.id)];
      if (aspect && file.mediaAspect !== aspect) {
        file.mediaAspect = aspect;
        changed = true;
      }
    }
    if (changed) {
      try { this.changeDetectorRef.detectChanges(); } catch { }
    }
  }

  private persistMediaAspects() {
    if (this.pendingGridAspects.size === 0) return;
    const cache = this.loadCachedMediaAspects();
    this.pendingGridAspects.forEach((aspect, fileId) => {
      cache[String(fileId)] = aspect;
    });
    // Cap the cache so it can't grow unbounded.
    const keys = Object.keys(cache);
    if (keys.length > FileSearchComponent.MEDIA_ASPECTS_MAX_ENTRIES) {
      for (let i = 0; i < keys.length - FileSearchComponent.MEDIA_ASPECTS_MAX_ENTRIES; i++) {
        delete cache[keys[i]];
      }
    }
    try {
      localStorage.setItem(FileSearchComponent.MEDIA_ASPECTS_STORAGE_KEY, JSON.stringify(cache));
    } catch { }
  }




  /** Formats a duration in seconds as m:ss (or h:mm:ss for long videos). */
  formatVideoDuration(seconds: number): string {
    if (!isFinite(seconds) || seconds <= 0) return '';
    const total = Math.round(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  /** Check if a file is an image file based on its extension */
  isImageFile(fileName?: string): boolean {
    if (fileName) {
      const imageFileTypes = this.fileService.imageFileExtensions;
      const lowerCaseFileName = fileName.toLowerCase();
      return imageFileTypes.some(extension => lowerCaseFileName.endsWith(`.${extension}`));
    }
    return false;
  }

  /** Get the URL to display for an image file in grid view */
  getImageUrl(file: FileEntry): string {
    // For now return a placeholder - in a production environment this would fetch the actual image
    if (!file || !file.fileName) return '';

    // This would normally call a thumbnail service
    return `/assets/images/file-type-image.png`;
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

  /** Badge info for a file with a local copy, or null when none exists. */
  offlineBadgeFor(fileName?: string): { icon: string; title: string; cls: string } | null {
    if (!fileName) return null;
    const info = this.offlineFiles.find(f => f.name === fileName);
    if (!info) return null;
    if (info.source === 'folder') {
      return { icon: '💾', title: 'Real file in your ROM folder — playable offline', cls: 'offlineBadge offlineBadgeFolder' };
    }
    return { icon: '📴', title: 'Browser-stored copy (IndexedDB) — playable offline', cls: 'offlineBadge offlineBadgeBrowser' };
  }

  getFileEmoji(fileName: string): string {
    const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
      'pdf': '📄', 'doc': '📝', 'docx': '📝', 'xls': '📊', 'xlsx': '📊', 'ppt': '📽️', 'pptx': '📽️',
      'zip': '📦', 'rar': '📦', '7z': '📦', 'tar': '📦', 'gz': '📦',
      'txt': '📃', 'json': '📋', 'xml': '📋', 'csv': '📋', 'log': '📋',
      'exe': '⚙️', 'dll': '⚙️', 'apk': '📱', 'iso': '💿',
      'mp3': '🎵', 'wav': '🎵', 'flac': '🎵', 'ogg': '🎵', 'aac': '🎵',
      'mp4': '🎬', 'avi': '🎬', 'mkv': '🎬', 'mov': '🎬', 'webm': '🎬',
      'html': '🌐', 'css': '🎨', 'js': '📜', 'ts': '📜', 'py': '🐍', 'java': '☕', 'cs': '🔷',
      'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️', 'svg': '🖼️', 'webp': '🖼️', 'bmp': '🖼️',
      'bin': '📁', 'dat': '📁', 'rom': '🎮', 'nes': '🎮', 'smc': '🎮', 'sfc': '🎮',
      'gb': '🎮', 'gbc': '🎮', 'gba': '🎮', 'n64': '🎮', 'nds': '🎮',
    };
    return map[ext] || '📄';
  }
  shareFile(user?: User) {
    if (!user?.id) return;
    if (this.selectedSharedFile && this.currentUser.id) {
      this.fileService.shareFile(this.currentUser.id, user.id, this.selectedSharedFile!.id);
    }
    this.selectedSharedFile = undefined;
    this.shareUserListDiv.nativeElement.classList.toggle("open");
    this.closeOptionsPanel();
  }
  shareFileInitiate(file: FileEntry) {
    this.selectedSharedFile = file;
    this.closeOptionsPanel();
    setTimeout(() => {
      this.parentRef?.showOverlay();
      this.showShareUserList = true;
    }, 100);
  }

  shareFileCallback = () => {
    if (this.optionsFile) {
      this.shareFileInitiate(this.optionsFile);
    }
  }
  closeShareUserList(toggleOverlay = true) {
    this.showShareUserList = false;
    this.selectedSharedFile = undefined;
    if (toggleOverlay) {
      this.parentRef?.closeOverlay();
    }
  }
  emittedNotification(event: string) {
    this.notifyUser(event);
  }
  async toggleFollowFile(file: FileEntry) {
    const userId = this.parentRef?.user?.id;
    if (!userId || !file.id) {
      this.parentRef?.showNotification('You must be logged in to follow files.');
      return;
    }
    const result = await this.followService.toggleFollow(userId, 'file', file.id);
    if (result) {
      this.isFollowingFile[file.id] = result.following;
      this.parentRef?.showNotification(result.message);
    }
  }

  showOptionsPanel(file: FileEntry) {
    if (this.isOptionsPanelOpen) {
      this.closeOptionsPanel();
      console.log('Options panel already open, closing it instead of opening a new one.');
      return;
    }
    this.optionsFile = file;
    this.isOptionsPanelOpen = true;
    this.parentRef?.showOverlay();
    if ((!file.topics || file.topics.length === 0) && file.id) {
      this.loadFileTopics(file);
    }
    if (file.id) {
      this.loadFileCommentCount(file);
    }
    if (file.id && this.parentRef?.user?.id) {
      this.followService.checkFollow(this.parentRef.user.id, 'file', file.id).then(following => {
        this.isFollowingFile[file.id!] = following;
      });
    }
  }

  private async loadFileTopics(file: FileEntry) { 
    if (file.topics) return;
    file.topics = await this.fileService.getTopics(file.id) ?? []; 
  }

  private async loadFileCommentCount(file: FileEntry) {
    if (!file.id) return;
    file.commentsCount = await this.fileService.getFileCommentCount(file.id);
    try { this.changeDetectorRef.detectChanges(); } catch { }
  }

  closeOptionsPanel(resetFile = true) {
    this.isOptionsPanelOpen = false;
    if (resetFile) {
      this.optionsFile = undefined;
    }
    this.parentRef?.closeOverlay();
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
  /** Whether the current user already has this file registered in their own book
   *  library (books share a fileId per upload, so a registered book’s identity is
   *  the uploaded file, not the per-user bookId). */
  async getIsFileInMyLibrary(file: FileEntry | undefined): Promise<boolean> {
    if (!file?.id || !this.currentUser?.id) return false;
    try {
      const token = await this.parentRef?.getSessionToken();
      const entries = await this.booksService.getMyLibrary(this.currentUser.id, token);
      // Only explicit registrations count — unregistered uploads (bookId 0)
      // must show "Add to My Library", even when owned by the viewer.
      return entries.some(e => e.fileId === file.id && (e.bookId ?? 0) > 0);
    } catch (e) {
      console.error('Error checking book library membership:', e);
      return false;
    }
  }
  
  async addToFavourites(optionsFile?: FileEntry) {
    if (!optionsFile || !optionsFile.id) return;

    const user = this.currentUser;
    if (!user || !user.id) return alert('You must be logged in to favourite files.');
    this.isAddingToFavourites = true;
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
    } finally {
      this.isAddingToFavourites = false;
      this.stopLoading();
    }
  }

  async getFavouritedBy(file?: FileEntry) {
    if (!file || !file.id) return;
    this.favouritersFile = file;
    if (this.isShowingFileFavouriters) {
      this.closeFileFavouriters();
      return;
    }
    if (this.isOptionsPanelOpen) {
      this.closeOptionsPanel();
    }
    const parent = this.inputtedParentRef ?? this.parentRef;
    try {
      const list: any[] = await this.fileService.getFavouritedBy(this.favouritersFile.id);
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
    if (!optionsFile?.user?.id || !this.currentUser?.id || this.currentDirectory === 'Users/') {
      return false;
    }

    const restrictedFileNames = [
      'Users', 'Meme', 'Roms', 'Max',
      'Pictures', 'Videos', 'Files',
      'Array', 'Nexus', 'BugHosted', 'Metabots'
    ];

    return optionsFile.user.id === this.currentUser.id &&
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
      const user = this.currentUser;
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
    const user = this.currentUser;
    if (user) {
      file.topics = file.topics?.filter(x => x.id != topic.id);
      await this.fileService.editTopics(user, file, file.topics ?? []);
    }
  }
  editFileTopic(file?: FileEntry) {
    if (!file) return;
    if (this.editingTopics.includes(file.id)) {
      this.editingTopics = this.editingTopics.filter(x => x != file.id);
    } else {
      this.editingTopics.push(file.id);
    }
  }
  async editFileTopicInDB(topics: Topic[], file: FileEntry) {
    const user = this.currentUser;
    if (user) {
      await this.fileService.editTopics(user, file, topics);
      this.editingTopics = this.editingTopics.filter(x => x != file.id);
      file.topics = topics;
      //this.getDirectory();
    }
  }
  getDirectoryName(file?: FileEntry): string {
    if (!file) return '.';
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      return parent?.getDirectoryName(file);
    } else return '.';
  }

  toggleFileVisibility(file?: FileEntry) {
    if (!file || !file.id) return;
    const parent = this.inputtedParentRef ?? this.parentRef;
    file.visibility = file.visibility == "Private" ? "Public" : "Private";
    const user = parent?.user ?? new User(0, "Anonymous");
    this.fileService.updateFileVisibility(user?.id ?? 0, file.visibility == "Private" ? false : true, file.id).then(res => {
      parent?.showNotification(res ?? "File visibility updated.");
    });
  }

  async hide(file?: FileEntry) {
    if (!file || !file.id) return;
    this.isHidingFile = true;
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user;
    let hidden = true;
    try {
      if (parent && user && user.id) {
        await this.fileService.hideFile(file.id, user.id).then(res => {
          parent.showNotification(res);
          if (res.toLowerCase().includes("unhidden")) {
            hidden = false;
          }
        });
      }
      file.isHidden = hidden;
    } finally {
      this.isHidingFile = false;
    }
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
    const tgt = event.target as HTMLElement;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;

    switch (event.key) {
      case 'ArrowDown':
      case 'j':
      case 'J':
        this.scrollToNext();
        event.preventDefault();
        break;

      case 'ArrowUp':
      case 'k':
      case 'K':
        this.scrollToPrevious();
        event.preventDefault();
        break;

      case 'Enter':
        this.activateHoveredFile();
        event.preventDefault();
        break;

      // Grid media expand popup navigation
      case 'ArrowLeft':
        if (this.isGridMediaExpanded) { this.showGridMediaPrev(); event.preventDefault(); }
        break;
      case 'ArrowRight':
        if (this.isGridMediaExpanded) { this.showGridMediaNext(); event.preventDefault(); }
        break;
      case 'Escape':
        if (this.isGridMediaExpanded) { this.closeGridMediaExpand(); event.preventDefault(); }
        break;
    }
  }
  private get scrollBehavior(): ScrollBehavior {
    return this.onMobile() ? 'auto' : 'smooth';
  }

  scrollToTop() {
    if (this.appending) {
      return;
    }
    setTimeout(() => {
      const selectors = [
        '.directoryDisplayDiv',
        '#fileContainer',
        '.inPopupComponent'
      ];

      const behavior = this.scrollBehavior;

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
          try { el.scrollTo({ top: 0, behavior }); } catch { el.scrollTop = 0; }
        } else {
          const parent = getScrollParent(el.parentNode);
          if (parent) {
            try { parent.scrollTo({ top: 0, behavior }); } catch { parent.scrollTop = 0; }
          } else {
            el.scrollIntoView({ behavior, block: 'start' });
          }
        }
        return;
      }
    }, 100);
  }

  scrollToNext(): void {
    const els = this.getFileElements();
    if (!els.length) return;

    if (this.controllerIndex < els.length - 1) {
      this.controllerIndex++;
    } else {
      this.controllerIndex = els.length - 1;
    }

    this.updateControllerHover();
  }



  scrollToPrevious(): void {
    const els = this.getFileElements();
    if (!els.length) return;

    if (this.controllerIndex > 0) {
      this.controllerIndex--;
    } else {
      this.controllerIndex = 0;
    }

    this.updateControllerHover();
  }

  activateHoveredFile(): void {
    const els = this.getFileElements();
    if (this.controllerIndex < 0 || this.controllerIndex >= els.length) return;

    const el = els[this.controllerIndex];

    // Prefer clicking the name span (avoids icons/options)
    const clickTarget =
      el.querySelector('.fileFolderNameSpan') ||
      el.querySelector('#' + el.id.replace('Div', 'Name')) ||
      el;

    (clickTarget as HTMLElement)?.click();
  }


  private getFileElements(): HTMLElement[] {
    return Array.from(
      document.getElementsByClassName('fileNameDiv')
    ) as HTMLElement[];
  }

  private updateControllerHover(noScroll?: boolean): void { 
    const els = this.getFileElements();
    els.forEach(el => el.classList.remove('controller-hover'));

    if (this.controllerIndex < 0 || this.controllerIndex >= els.length) {
      return;
    }

    const el = els[this.controllerIndex];
    el.classList.add('controller-hover');
    if (noScroll) {
      return;
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Update background overlay for controller-hovered file, matching
    // the mouse-hover behavior in handleFileHoverEnter/handleFileHoverLeave.
    const file = this.directory?.data?.[this.controllerIndex];
    if (file && !file.isFolder && this.displayRomMetadataDesktop && this.shouldShowRomMetadata()) {
      this.handleFileHoverEnter({ currentTarget: el } as unknown as Event, file);
    } else {
      if (this._hoverOverlayEl) {
        this.handleFileHoverLeave({ currentTarget: el } as unknown as Event);
      }
    }
  }

  private resetControllerHover(noScroll?: boolean): void {
    this.controllerIndex = -1;
    setTimeout(() => this.updateControllerHover(noScroll), 30);
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
    this.changeDetectorRef.detectChanges();
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      this.searchTerms = this.popupSearch.nativeElement.value.trim();
      this.goToFirstPage();
      await this.getDirectory();
      // record search as user typed and executed
      try {
        const user = this.currentUser;
        if (this.searchTerms && this.searchTerms.trim() !== '') {
          await this.fileService.recordSearch(this.searchTerms, 'file', user?.id);
        }
      } catch { }
      this.scrollToTop();
      this.loadingSearch = false;
    }, 500);
  }
  changeSearchTermsFromSearchInput() { 
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
  getFileViewers(fileId?: number) {
    if (!fileId) return;
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
    this.favouritersFile = undefined;
    this.isShowingFileFavouriters = false;
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.closeOverlay();
  }

  onPageSizeChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.maxResults = parseInt(value);
    // Save to user settings
    const user = this.currentUser;
    if (user?.id) {
      this.userService.updateUserSettings(user.id, [
        { settingName: 'page_size', value: value }
      ]).catch(() => { });
    }
  }

  async showFileNotes(file?: FileEntry) {
    if (!file || !file.id) return;
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

  async showFileCommentsPopup(file?: FileEntry) {
    if (!file || !file.id) return;
    if (this.isCommentsPopupOpen) {
      this.closeFileCommentsPopup();
      return;
    }
    if (this.isOptionsPanelOpen) {
      this.closeOptionsPanel(false);
    }
    this.commentsPopupFile = file;
    const parent = this.inputtedParentRef ?? this.parentRef;
    try {
      const comments = await this.fileService.getComments(file.id);
      this.fileCommentsPopup = Array.isArray(comments) ? comments : [];
      setTimeout(() => {
        parent?.showOverlay();
        this.isCommentsPopupOpen = true;
        this.changeDetectorRef.detectChanges();
      }, 100);
    } catch (ex) {
      console.error(ex);
      this.notifyUser('Failed to fetch comments');
    }
  }

  closeFileCommentsPopup() {
    this.isCommentsPopupOpen = false;
    this.commentsPopupFile = undefined;
    this.fileCommentsPopup = [];
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.closeOverlay();
  }

  async addNote(textarea: HTMLTextAreaElement) {
    if (!this.currentUser.id || !this.notesFile) return;
    const noteText = textarea.value.trim();
    if (!noteText) return;
    this.startLoading();
    const res = await this.fileService.addFileNote(this.currentUser.id, this.notesFile.id, noteText);
    if (res) {
      this.notifyUser(res);
      const existingIndex = this.fileNotes.findIndex(n => n.user?.id === this.currentUser.id);
      const nextNote = new FileNote(this.currentUser, noteText);
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
    if (!this.currentUser.id || !this.notesFile) return;
    this.startLoading();
    const res = await this.fileService.deleteFileNote(this.currentUser.id, this.notesFile.id, targetUserId);
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
    if (!this.currentUser.id) return false;
    // Users can delete their own notes, admin (id=1) can delete any
    return note.user?.id === this.currentUser.id || this.currentUser.id === 1;
  }

  isVideoFile(fileEntry?: FileEntry) {
    if (!fileEntry) return false;
    let fileType = fileEntry.fileType ?? this.fileService.getFileExtension(fileEntry.fileName ?? '');
    fileType = fileType.replace(".", "");
    return this.fileService.videoFileExtensions.includes(fileType) || this.fileService.audioFileExtensions.includes(fileType);
  }
  async addFileToMusicPlaylist(fileEntry?: FileEntry) {
    if (!this.currentUser.id || !fileEntry || !fileEntry.id) {
      return alert("Error: Cannot add file to music playlist without logging in or a valid file entry.");
    }
    this.isAddingToMusicPlaylist = true;
    try {
      let tmpTodo = new Todo();
      tmpTodo.type = "music";
      tmpTodo.todo = (fileEntry.givenFileName ?? fileEntry.fileName ?? `Video ID:${fileEntry.id}`).trim();
      tmpTodo.fileId = fileEntry.id;
      tmpTodo.date = new Date();
      const resTodo = await this.todoService.createTodo(this.currentUser.id, tmpTodo);
      if (resTodo) {
        this.parentRef?.showNotification(`Added ${tmpTodo.todo} to music playlist.`);
      }
    } finally {
      this.isAddingToMusicPlaylist = false;
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

  get isDirectoryEmpty(): boolean {
    return !this.directory || !this.directory.data || this.directory.data.length === 0;
  }

  private get romSystemExtensions(): { [key: string]: string[] } {
    return {
      'n64': (this.fileService.n64FileExtensions && this.fileService.n64FileExtensions.length) ? this.fileService.n64FileExtensions : ['n64', 'z64', 'v64'],
      'ps1': (this.fileService.ps1FileExtensions && this.fileService.ps1FileExtensions.length) ? Array.from(new Set([...this.fileService.ps1FileExtensions, 'cue', 'iso', 'chd', 'pbp'])) : ['bin', 'cue', 'iso', 'chd', 'pbp'],
      'gba': this.fileService.getGbaFileExtensions(),
      'nds': this.fileService.getNdsFileExtensions(),
      '3ds': this.fileService.getNdsFileExtensions(),
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
    if (!this.allowedFileTypes || this.allowedFileTypes.length === 0) {
      return candidates;
    }
    const lowerAllowed = this.allowedFileTypes.map(s => s.toLowerCase());
    return candidates.filter(k => this.romSystemExtensions[k].some(ext => lowerAllowed.includes(ext)));
  }

  async onSystemFilterClick(key: string) {
    this.startLoading();
    try {
      const systemKey = this.fileService.getSystemCoreFromKey(key);
      if (systemKey) {
        this.setActualCoreFilter(systemKey as Core);
      }
    } finally {
      const idx = this.activeRomSystems.indexOf(key);
      if (idx >= 0) {
        this.activeRomSystems.splice(idx, 1);
      } else {
        this.activeRomSystems.push(key);
      }
      this.stopLoading();
    }
  }

  setActualCoreFilter(coreToAdd: Core) {
    if (this.actualCoreFilter?.includes(coreToAdd)) {
      this.actualCoreFilter = this.actualCoreFilter.filter(s => s !== coreToAdd);
    } else {
      if (!this.actualCoreFilter) {
        this.actualCoreFilter = [];
      }
      this.actualCoreFilter?.push(coreToAdd);
    }
  }

  toggleDisplayAsTable() {
    this.displayAsTable = !this.displayAsTable;
    this.tableViewClickedEvent.emit(this.displayAsTable);
  }

  forceSearchSameDirectoryToggled() {
    this.forceSearchSameDirectory = !this.forceSearchSameDirectory;
  }

  showFavouritesToggled() {
    this.showFavouritesOnly = !this.showFavouritesOnly;
    // Persist the setting to backend
    const user = this.currentUser;
    if (user && user.id) {
      this.userService.updateUserSettings(user.id, [
        { settingName: 'show_favourites_only', value: this.showFavouritesOnly }
      ]).catch(() => { }); // Optionally handle error
    }
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
    this.syncBookFilterToDirectory();
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
    if (this.popupSearch && this.popupSearch.nativeElement) {
      this.popupSearch.nativeElement.value = '';
    }
    this.searchTerms = '';
    this.actualCoreFilter = [];
    this.activeRomSystems = [];
    this.changeSearchTermsFromPopup();
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

  get currentUser(): User {
    return this.parentRef?.user ?? new User(0, "Anonymous");
  }

  getSystemLabel(key: string): { label: string, title: string } {
    switch (key) {
      case 'n64':
        return { label: 'N64', title: 'Nintendo 64' };
      case 'ps1':
        return { label: 'PS1', title: 'PlayStation 1' };
      case 'gba':
        return { label: 'GBA', title: 'Game Boy Advance' };
      case 'nds':
        return { label: 'NDS', title: 'Nintendo DS' };
      case 'nes':
        return { label: 'NES', title: 'Nintendo Entertainment System' };
      case 'snes':
        return { label: 'SNES', title: 'Super Nintendo Entertainment System' };
      case 'genesis':
        return { label: 'SEGA', title: 'Sega Genesis' };
      case 'dreamcast':
        return { label: 'DC', title: 'Sega Dreamcast' };
      case 'gamecube':
        return { label: 'GC', title: 'Nintendo GameCube' };
      default:
        return { label: key.toUpperCase(), title: key };
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
  getSystemIconUrl(extension: string, actualSystem?: string): string | undefined {
    let base = '/assets/';
    // If a DB-persisted core override exists, map it directly to an icon
    if (actualSystem) {
      const coreIconMap: { [core: string]: string } = {
        'pcsx_rearmed': base + 'ps1icon.png',
        'mednafen_psx_hw': base + 'ps1icon.png',
        'duckstation': base + 'ps1icon.png',
        'mednafen_psx': base + 'ps1icon.png',
        'ppsspp': base + 'pspicon.png',
        'yabause': base + 'saturnicon.png',
        'beetle_saturn': base + 'saturnicon.png',
        'kronos_saturn': base + 'saturnicon.png',
        'genesis_plus_gx': base + 'segaicon.png',
        'dreamcast': base + 'dreamcasticon.png',
        'naomi': base + 'dreamcasticon.png',
        'flycast': base + 'dreamcasticon.png',
        'picodrive': base + 'segaicon.png',
        'opera': base + 'ps1icon.png',
        'mupen64plus_next': base + 'n64Icon.png',
        'parallel_n64': base + 'n64Icon.png',
        'melonds': base + 'ndsicon.png',
        'mgba': base + 'gbaicon.png',
        'gambatte': base + 'gbicon.png',
        'fceumm': base + 'nesicon.png',
        'snes9x': base + 'snesicon.png',
        'mednafen_vb': base + 'nesicon.png',
        'mame2003_plus': base + 'atariicon.png',
        'fbneo': base + 'atariicon.png',
        'stella2014': base + 'atariicon.png',
        'prosystem': base + 'atariicon.png',
        'handy': base + 'atariicon.png',
        'virtualjaguar': base + 'atariicon.png',
        'saturn': base + 'saturnicon.png',
        'gamecube': base + 'gcicon.png',
        'dolphin': base + 'gcicon.png',
        'n64': base + 'n64Icon.png',
        'ps1': base + 'ps1icon.png',
        'gba': base + 'gbaicon.png',
        '3ds': base + 'ndsicon.png',
        'azahar': base + 'ndsicon.png',
        'nds': base + 'ndsicon.png',
        'nes': base + 'nesicon.png',
        'snes': base + 'snesicon.png',
        'genesis': base + 'segaicon.png',
        'psp': base + 'pspicon.png'
      };
      const mapped = coreIconMap[actualSystem];
      if (mapped) return mapped;
    }
    if (!extension) return undefined;
    // Extension -> console icon lives on the shared FileService so the emulator,
    // file search and nav suggestions all show the same system icon.
    return this.fileService.getSystemIconUrl(extension);
  }

  getSystemEmoji(fileName?: string, styling?: string, actualSystem?: string): SafeHtml | string {
    if (!fileName) return '';
    const ext = this.fileService.getFileExtension(fileName).toLowerCase();
    const fileUrl = this.getSystemIconUrl(ext, actualSystem);

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

    const dir = this.getDirectoryName(file);
    if (dir === 'Roms/' || file.romMetadata) {
      return this.getSystemEmoji('file.' + (file.fileType ?? ''), undefined, file.romMetadata?.actualSystem);
    }

    const fileName = file.fileName ?? '';
    const ext = (this.fileService.getFileExtension(fileName) || '').toLowerCase();

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

  openSystemOverridePanel(): void {
    if (!this.optionsFile || !this.optionsFile.fileName) return;
    const candidates: CoreDescriptor[] = this.fileService.buildCoreRegistry();
    const ext = this.fileService.getFileExtension(this.optionsFile.fileName).toLowerCase();
    this.systemCandidates = this.fileService.sortCandidatesByExt(ext, candidates);
    this.selectedSystemCore = null;
    this.systemSelectFile = this.optionsFile;
    this.closeOptionsPanel();
    setTimeout(() => {
      this.isSystemSelectPanelOpen = true;
      this.parentRef?.showOverlay();
    }, 10);
  }

  onSystemSelectChange(ev: Event): void {
    const val = (ev.target as HTMLSelectElement).value;
    this.selectedSystemCore = val || null;
  }

  async confirmSystemSelection(): Promise<void> {
    if (!this.systemSelectFile || !this.selectedSystemCore) return;
    this.isSettingSystemOverride = true;
    this.changeDetectorRef.detectChanges();
    try {
      await this.romService.setSystemOverride(this.systemSelectFile.id, this.selectedSystemCore);
      if (this.systemSelectFile.romMetadata) {
        (this.systemSelectFile.romMetadata as any).actualSystem = this.selectedSystemCore;
      }
      this.notifyUser('System override set.');
      this.isSystemSelectPanelOpen = false;
      this.systemSelectFile = undefined;
      this.parentRef?.closeOverlay();
    } catch (e) {
      this.notifyUser('Failed to set system override.');
    } finally {
      this.isSettingSystemOverride = false;
    }
  }

  async setUserPreferredCore(file: FileEntry, core: string): Promise<void> {
    if (!file || !file.id) return;
    this.isSettingSystemOverride = true;
    this.changeDetectorRef.detectChanges();
    try {
      const res = await this.romService.setUserPreferredCore(file.id, core);
      if (res && res.ok) {
        this.notifyUser('Preferred core set.');
      } else {
        this.notifyUser('Failed to set preferred core.');
      }
    } catch (e) {
      this.notifyUser('Failed to set preferred core.');
    } finally {
      this.isSettingSystemOverride = false;
    }
  }

  async getUserPreferredCore(file: FileEntry): Promise<string | null> {
    if (!file || !file.id || !this.currentUser?.id) return null;
    try {
      return await this.romService.getUserPreferredCore(file.id, this.currentUser.id);
    } catch (e) {
      return null;
    }
  }

  cancelSystemSelection(): void {
    this.isSystemSelectPanelOpen = false;
    this.systemSelectFile = undefined;
    this.parentRef?.closeOverlay();
  }

  openImagePreview(url?: string, ev?: Event) {
    if (ev) ev.preventDefault();
    if (!url) return;
    if (this.isOptionsPanelOpen && this.optionsFile) {
      const md = this.optionsFile.romMetadata as any;
      const allImgs: string[] = [];
      if (md?.coverUrl) allImgs.push(md.coverUrl);
      const ss = this.safeJsonArray(md?.screenshotsJson);
      const aw = this.safeJsonArray(md?.artworksJson);
      allImgs.push(...ss, ...aw);
      this.imagePreviewFile = { ...this.optionsFile, romInlineThumbs: allImgs };
      this.imageIndex = allImgs.indexOf(url);
      if (this.imageIndex === -1) this.imageIndex = 0;
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
    this.imagePreviewFile = undefined;
    this.imageIndex = 0;
    this.parentRef?.closeOverlay();
  }
  previousPreviewImage() {
    console.log('previousPreviewImage : ', this.imagePreviewFile?.romInlineThumbs);
    if (!this.imagePreviewFile || !this.imagePreviewFile.romInlineThumbs) return;
    this.imagePreviewUrl = this.imagePreviewFile.romInlineThumbs[--this.imageIndex];
    this.changeDetectorRef.detectChanges();
  }
  nextPreviewImage() {
    console.log('next preview image: ', this.imagePreviewFile?.romInlineThumbs);
    if (!this.imagePreviewFile || !this.imagePreviewFile.romInlineThumbs) return;
    this.imagePreviewUrl = this.imagePreviewFile.romInlineThumbs[++this.imageIndex];
    this.changeDetectorRef.detectChanges();
  }
  private startAppendingMode() {
    this.appending = true;    setTimeout(() => {
      this.appending = false;
    }, 1000);
  }
 
  /** Remove the current user’s library registration for a book (the uploaded
   *  file itself is untouched). */
  async removeFromLibrary(file?: FileEntry) {
    if (!file || !file.id || !this.currentUser?.id) return;
    const token = await this.parentRef?.getSessionToken();
    const inLibrary = await this.getIsFileInMyLibrary(file);
    if (!inLibrary) {
      this.parentRef?.showNotification('This book is not in your library.');
      return;
    }
    this.isRemovingFromLibrary = true;
    try {
      const entries = await this.booksService.getMyLibrary(this.currentUser.id, token);
      const entry = entries.find(e => e.fileId === file.id && (e.bookId ?? 0) > 0);
      if (!entry) {
        this.parentRef?.showNotification('This book is not in your library.');
        this.isFileInMyLibraryCache.set(file.id, false);
        return;
      }
      const ok = await this.booksService.removeBook({
        userId: this.currentUser.id,
        bookId: entry.bookId,
      }, token);
      if (ok) {
        this.parentRef?.showNotification('Removed book from your library.');
        this.isFileInMyLibraryCache.set(file.id, false);
      } else {
        this.parentRef?.showNotification('Failed to remove book from your library.');
      }
    } catch (e) {
      console.error('Error removing book from library:', e);
      this.parentRef?.showNotification('Failed to remove book from library.');
    } finally {
      this.isRemovingFromLibrary = false;
    }
  }

  /** Add a folder to the current user's library by registering it as a book with
   *  the folder name as the title and a folder file type marker. */
  async addFolderToLibrary(folder?: FileEntry) {
    if (!folder || !folder.id || !this.currentUser?.id) return;
    this.isAddingToLibrary = true;
    try {
      const token = await this.parentRef?.getSessionToken();
      const title = folder.givenFileName ?? folder.fileName ?? 'Untitled folder';
      const result = await this.booksService.registerBook({
        userId: this.currentUser.id,
        fileId: folder.id,
        title,
        description: undefined,
        isPublic: (folder.visibility ?? '').toLowerCase() === 'public',
      }, token);
      if (result) {
        this.parentRef?.showNotification(`Added folder “${title}” to your library.`);
        this.isFileInMyLibraryCache.set(folder.id, true);
      } else {
        this.parentRef?.showNotification(`Could not add folder “${title}” to your library.`);
      }
    } catch (e) {
      console.error('Error adding folder to library:', e);
      this.parentRef?.showNotification('Failed to add folder to library.');
    } finally {
      this.isAddingToLibrary = false;
    }
  }

  /** Refresh the in-memory library membership state for a file so the book view
   *  buttons reflect the latest add/remove result without a full page reload. */
  private async refreshLibraryState(file: FileEntry) {
    if (!file?.id || !this.currentUser?.id) return;
    try {
      const token = await this.parentRef?.getSessionToken();
      const entries = await this.booksService.getMyLibrary(this.currentUser.id, token);
      const inLibrary = (entries ?? []).some(e => e.fileId === file.id && (e.bookId ?? 0) > 0);
      this.isFileInMyLibraryCache.set(file.id, inLibrary);
      try { this.changeDetectorRef.detectChanges(); } catch { }
    } catch (e) {
      console.error('Error refreshing book library state:', e);
    }
  }

  /** Fetch the user's book library once and mark every listed file's membership
   *  in `isFileInMyLibraryCache`, so the book-view buttons show Add vs Remove
   *  without per-row (and per-change-detection) requests. */
  private async preloadLibraryCache(): Promise<void> {
    try {
      if (!this.isBookView || !this.userIsLoggedIn()) return;
      const files = this.directory?.data?.filter(f => f && f.id != null) ?? [];
      if (!files.length || !this.currentUser?.id) return;
      const token = await this.parentRef?.getSessionToken();
      const entries = await this.booksService.getMyLibrary(this.currentUser.id, token);
      const libraryFileIds = new Set((entries ?? []).filter(e => (e.bookId ?? 0) > 0).map(e => e.fileId));
      for (const f of files) {
        this.isFileInMyLibraryCache.set(f.id, libraryFileIds.has(f.id));
      }
      try { this.changeDetectorRef.detectChanges(); } catch { }
    } catch (e) {
      console.error('Error preloading book library state:', e);
    }
  }

  // ---- book view helpers (display only) ----

  /** Sync read of the library membership cache for templates: true when the
   *  file (or folder) is known to be in the current user's book library. */
  isInMyLibrary(file: FileEntry): boolean {
    if (!file || file.id == null) return false;
    return this.isFileInMyLibraryCache.get(file.id) === true;
  }

  /** Single entry point for the book-view Add/Remove library buttons. Files
   *  and folders both toggle: members are removed, non-members are added. */
  async toggleLibrary(file: FileEntry, event?: Event) {
    if (event) event.stopPropagation();
    if (!file || file.id == null) return;
    if (!this.currentUser?.id) {
      this.parentRef?.showNotification('You must be logged in to build your library.');
      return;
    }
    if (this.isInMyLibrary(file)) {
      await this.removeFromLibrary(file);
    } else if (file.isFolder) {
      await this.addFolderToLibrary(file);
    } else {
      await this.addToLibrary(file);
    }
  }

  async isFileInMyLibrary(file: FileEntry): Promise<boolean> {
    if (!file?.id) return false;
    const cached = this.isFileInMyLibraryCache.get(file.id);
    if (cached !== undefined) return !!cached;
    const result = await this.getIsFileInMyLibrary(file);
    this.isFileInMyLibraryCache.set(file.id, result);
    return result;
  }

  async addToLibrary(file?: FileEntry) {
    if (!file || !file.id) return;
    const user = this.currentUser;
    if (!user?.id) {
      this.parentRef?.showNotification('You must be logged in to add books to your library.');
      return;
    }
    if (file.isFolder) {
      await this.addFolderToLibrary(file);
      return;
    }
    this.isAddingToLibrary = true;
    try {
      const token = await this.parentRef?.getSessionToken();
      const title = file.givenFileName ?? file.fileName ?? 'Untitled book';
      const result = await this.booksService.registerBook({
        userId: user.id,
        fileId: file.id,
        title,
        description: undefined,
        isPublic: (file.visibility ?? '').toLowerCase() === 'public',
      }, token);
      if (result) {
        this.parentRef?.showNotification(`Added “${title}” to your library.`);
        this.isFileInMyLibraryCache.set(file.id, true);
      } else {
        this.parentRef?.showNotification(`Could not add “${title}” to your library.`);
      }
    } catch (e) {
      console.error('Error adding book to library:', e);
      this.parentRef?.showNotification('Failed to add book to library.');
    } finally {
      this.isAddingToLibrary = false;
    }
  } 
}

type SlotNumber = 0 | 1 | 2 | 3 | 4 | 5;
