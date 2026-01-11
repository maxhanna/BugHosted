
import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, QueryList, ViewChild, ViewChildren } from '@angular/core';
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
  @Input() showPrivatePublicOption: boolean = true;
  @Input() maxResults: number = 50;
  @Input() fileSearchMode: boolean = false;
  @Input() canChangeDirectory: boolean = true;
  @Input() displayFileType: boolean = true;
  @Input() displayFileSize: boolean = true;
  @Input() displayFileData: boolean = true;
  @Input() displayFileActions: boolean = true;
  @Input() displayComments: boolean = true;
  @Input() displayReactions: boolean = true;
  @Input() autoload: boolean = false;
  @Input() canDragMove: boolean = true;
  @Input() fileId?: number | undefined = undefined;
  @Input() commentId?: number;
  @Input() displayTotal = true;
  @Input() showFileSearchOptions = true;
  @Input() showSpaceForNotifications = false;
  @Input() showHiddenFiles: boolean = false; // default: do not show hidden files unless user toggles or user setting enables it
  @Input() showTopics: boolean = true;
  @Input() captureNotifications: boolean = false;
  @Input() currentPage = this.defaultCurrentPage;
  @Input() massDeleteMode: boolean = false;
  @Input() disabled = false;
  @Output() selectedForDeleteChange = new EventEmitter<number[]>();
  @Output() selectFileEvent = new EventEmitter<FileEntry>();
  @Output() currentDirectoryChangeEvent = new EventEmitter<string>();
  @Output() userNotificationEvent = new EventEmitter<string>();
  @Output() expandClickedEvent = new EventEmitter<FileEntry>();

  selectedForDelete: Set<number> = new Set<number>();
  showFavouritesOnly = false;
  trendingSearches: string[] = [];
  sortOption: string = 'Latest';
  showData = true;
  showShareUserList = false;
  isSearchPanelOpen = false;
  isSearchOptionsPanelOpen = false;
  isOptionsPanelOpen = false;
  isShowingFileViewers = false;
  isShowingFileFavouriters = false;
  showCommentsInOpenedFiles: number[] = [];
  fileViewers?: User[] | undefined;
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

  @ViewChild(MediaViewerComponent) mediaViewerComponent!: MediaViewerComponent;


  constructor(private fileService: FileService, private userService: UserService, private todoService: TodoService, private route: ActivatedRoute) {
    super();
    this.previousComponent = "Files";
    this.windowScrollHandler = this.debounce(this.onWindowScroll.bind(this), 200);
    this.containerScrollHandler = this.debounce(this.onContainerScroll.bind(this), 200);
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

  async ngOnInit() {
    const user = this.inputtedParentRef?.user ?? this.parentRef?.user;
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
    if (this.fileId) {
      await this.getDirectory(undefined, this.fileId);
      this.replacePageTitleAndDescription();
      return;
    }

    this.route.paramMap.subscribe(async (params: any) => {
      this.fileId = +params.get('fileId');
      if (this.fileId && this.fileId != null) {
        await this.getDirectory(undefined, this.fileId);
        this.replacePageTitleAndDescription();
        return;
      }
    });
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
        element.click();
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
    this.startLoading();
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
      await this.fileService.getDirectory(
        this.currentDirectory,
        this.filter.visibility,
        this.filter.ownership,
        this.user,
        this.currentPage,
        this.maxResults,
        this.searchTerms,
        fileId,
        fileTypes,
        this.filter.hidden == 'all' ? true : false,
        this.sortOption,
        this.showFavouritesOnly
      ).then(res => {
        if (append && this.directory && this.directory.data) {
          this.directory.data = this.directory.data.concat(
            res.data.filter(
              (d: FileEntry) =>
                !this.directory?.data?.some(
                  (existingData) => existingData.id === d.id
                )
            )
          );
        } else {
          this.directory = res;

          if (this.directory && this.directory.currentDirectory) {
            this.currentDirectory = this.directory.currentDirectory;
          } else {
            this.currentDirectory = '';
          }
          this.currentDirectoryChangeEvent.emit(this.currentDirectory);
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

            if (this.fileId && this.fileId !== null && this.fileId !== 0 && this.directory.data!.find(x => x.id == this.fileId!)) {
              this.scrollToFile(this.fileId!);
            }
          }


          if (this.currentDirectory.toLowerCase() !== "meme/"
            && this.currentDirectory.toLowerCase() !== "roms/"
            && this.directory && this.directory.data) {
            this.directory.data.sort((a, b) => {
              if (a.isFolder !== b.isFolder) {
                return a.isFolder ? -1 : 1;
              }
              return (a.date ?? new Date()) > (b.date ?? new Date()) ? 1 : (a.date ?? new Date()) < (b.date ?? new Date()) ? -1 : 0;
            });
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

      });
    } catch (error) {
      this.notifyUser((error as Error).message);
    }
    this.stopLoading();
  }

  debounceSearch() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.getDirectory();
    }, 1000);
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
        this.currentPage = this.defaultCurrentPage;
        this.currentDirectory += file.fileName + "/";
        this.getDirectory(file.fileName);
      }
    }
  }
  previousPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.getDirectory().then(() => { this.scrollToTop(); });
    }
  }

  async nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      await this.getDirectory().then(() => { this.scrollToTop(); });

    }
  }
  async appendNextPage() {
    if (this.currentPage < this.totalPages) {
      console.log("Appending next page...");
      this.currentPage++;
      this.getDirectory(undefined, undefined, true);
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

  updateNSFW(event: Event) {
    const user = this.inputtedParentRef?.user ?? this.parentRef?.user;
    if (!user?.id) {
      alert('You must be logged in to view NSFW content.');
      (event.target as HTMLInputElement).checked = false;
      return;
    }
    const isChecked = (event.target as HTMLInputElement).checked;
    this.isDisplayingNSFW = isChecked;
    this.userService.updateNSFW(user.id, isChecked).then(res => {
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
    this.currentPage = this.defaultCurrentPage;
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
    this.isOptionsPanelOpen = true;
    this.optionsFile = file;
    const parent = this.inputtedParentRef ?? this.parentRef;

    if (parent) {
      parent.showOverlay();
    }
  }
  closeOptionsPanel() {
    this.isOptionsPanelOpen = false;
    this.optionsFile = undefined;
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      parent.closeOverlay();
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
        // server returns updated favourite count and whether user favourited
        optionsFile.favouriteCount = res.favouriteCount ?? optionsFile.favouriteCount ?? 0;
        optionsFile.isFavourited = res.isFavourited ?? !optionsFile.isFavourited;
      }
    } catch (ex) {
      console.error(ex);
    }
    this.stopLoading();
  }

  async getFavouritedBy(file: FileEntry) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.closeOverlay();
    try {
      const list: any[] = await this.fileService.getFavouritedBy(file.id);
      parent?.showOverlay();
      this.fileFavouriters = list;
      this.isShowingFileFavouriters = true;
    } catch (ex) {
      console.error(ex);
      parent?.showOverlay();
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
  shareLink(fileEntry: FileEntry) {
    const link = `https://bughosted.com/${fileEntry.directory?.includes("Meme") ? 'Memes' : 'File'}/${fileEntry.id}`;
    try {
      navigator.clipboard.writeText(link);
      this.emittedNotification(`${link} copied to clipboard!`);
    } catch {
      this.emittedNotification("Error: Unable to share link!");
      console.log("Error: Unable to share link!");
    }
    this.closeOptionsPanel();
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
  openSearchOptionsPanel() {
    const parent = this.inputtedParentRef ?? this.parentRef;
    if (parent) {
      parent.showOverlay();
    }
    this.isSearchOptionsPanelOpen = true;
  }
  closeSearchOptionsPanel() {
    this.isSearchOptionsPanelOpen = false;

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
    await this.getDirectory();
    try {
      const user = this.inputtedParentRef?.user ?? this.parentRef?.user;
      await this.fileService.recordSearch(topic, 'file', user?.id);
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
  updateFileVisibility(file: FileEntry) {
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
    if ((event?.target as HTMLDivElement).id.includes("editFileName")) return;

    if (event.key === 'k' || event.key === 'K') {
      this.scrollToNext();
    } else if (event.key === 'j' || event.key === 'J') {
      this.scrollToPrevious();
    }
  }
  scrollToTop() {
    setTimeout(() => {
      const container2 = document.getElementsByClassName("smallerDataDiv")[0];
      if (container2) {
        container2.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      const container = document.getElementsByClassName("directoryDisplayDiv")[0];
      if (container) {
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      this.searchTerms = this.popupSearch.nativeElement.value.trim();
      this.currentPage = this.defaultCurrentPage;
      await this.getDirectory();
      // record search as user typed and executed
      try {
        const user = this.inputtedParentRef?.user ?? this.parentRef?.user;
        await this.fileService.recordSearch(this.searchTerms, 'file', user?.id);
      } catch { }
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
  closeFileFavouriters() {
    this.fileFavouriters = undefined;
    this.isShowingFileFavouriters = false;
    const parent = this.inputtedParentRef ?? this.parentRef;
    parent?.closeOverlay();
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
  showFavouritesToggled() {
    this.showFavouritesOnly = !this.showFavouritesOnly;
    this.debounceSearch();
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
    this.currentPage = this.defaultCurrentPage;
    this.currentDirectory = directory;
    this.currentDirectoryChangeEvent.emit(this.currentDirectory);
    this.getDirectory();
  }
  onFiletypeFilterChange() {
    this.fileTypeFilter = this.fileTypeFilterInput.nativeElement.value;
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
}




