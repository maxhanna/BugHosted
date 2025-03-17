
import { Component, ElementRef, EventEmitter, HostListener, Input, OnInit, Output, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { FileService } from '../../services/file.service';
import { DirectoryResults } from '../../services/datacontracts/file/directory-results';
import { ChildComponent } from '../child.component';
import { MediaViewerComponent } from '../media-viewer/media-viewer.component';
import { ActivatedRoute } from '@angular/router';
import { AppComponent } from '../app.component';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { User } from '../../services/datacontracts/user/user';
import { Topic } from '../../services/datacontracts/topics/topic';
import { Meta, Title } from '@angular/platform-browser';
import { UserService } from '../../services/user.service';


@Component({
  selector: 'app-file-search',
  templateUrl: './file-search.component.html',
  styleUrl: './file-search.component.css'
})
export class FileSearchComponent extends ChildComponent implements OnInit {
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
  @Input() fileId: string | null = null;
  @Input() displayTotal = true;
  @Input() showFileSearchOptions = true;
  @Input() showSpaceForNotifications = false;
  @Input() showHiddenFiles: boolean = true;
  @Input() showTopics: boolean = true;
  @Input() currentPage = this.defaultCurrentPage;
  @Output() selectFileEvent = new EventEmitter<FileEntry>();
  @Output() currentDirectoryChangeEvent = new EventEmitter<string>();
  @Output() userNotificationEvent = new EventEmitter<string>();
  @Output() expandClickedEvent = new EventEmitter<FileEntry>();
 

  showData = true;
  showShareUserList = false;
  isSearchPanelOpen = false;
  isSearchOptionsPanelOpen = false;
  isOptionsPanelOpen = false;
  showCommentsInOpenedFiles: number[] = [];

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

  @ViewChild('search') search!: ElementRef<HTMLInputElement>;
  @ViewChild('popupSearch') popupSearch!: ElementRef<HTMLInputElement>;
  @ViewChild('folderVisibility') folderVisibility!: ElementRef<HTMLSelectElement>;
  @ViewChild('shareUserListDiv') shareUserListDiv!: ElementRef<HTMLDivElement>;
  @ViewChildren('fileNameDiv') fileHeaders!: QueryList<ElementRef>;
  @ViewChildren('nsfwCheckmark') nsfwCheckmark!: ElementRef<HTMLInputElement>;

  @ViewChild(MediaViewerComponent) mediaViewerComponent!: MediaViewerComponent;


  constructor(private fileService: FileService, private userService: UserService, private route: ActivatedRoute) {
    super(); 
  }

  async ngOnInit() {
    const user = this.inputtedParentRef?.user ?? this.parentRef?.user;
    if (user) {
      this.userService.getUserSettings(user).then(res => {
        if (res) {
          this.isDisplayingNSFW = res.nsfwEnabled ?? false; 
        }
      });
    }

    this.allowedFileTypes = this.allowedFileTypes.map(type => type.toLowerCase());
    if (this.fileId) {
      await this.getDirectory(undefined, parseInt(this.fileId));
      this.replacePageTitleAndDescription();
      return;
    }

    this.route.paramMap.subscribe(async params => {
      this.fileId = params.get('fileId');
      if (this.fileId && this.fileId != null) {
        await this.getDirectory(undefined, parseInt(this.fileId));
        this.replacePageTitleAndDescription();
        return;
      }
    });
    await this.getDirectory();
  } 

  scrollToFile(fileId: string) {
    setTimeout(() => { 
      const element = document.getElementById('fileIdName' + fileId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        element.click();
      }
    }, 1000);
  }
  async delete(file: FileEntry) {
    if (confirm(`Delete : ${file.fileName} ?`)) {
      this.startLoading();
      try {
        const response = await this.fileService.deleteFile(this.user!, file);
        if (response) {
          this.userNotificationEvent.emit(response);
          if (response.includes("successfully")) {
            this.directory!.data = this.directory?.data!.filter(res => res.fileName != file.fileName);
          }
        }
      } catch (ex) {
        this.userNotificationEvent.emit(`Failed to delete ${file.fileName}!`);
      }
      this.stopLoading();
      this.closeOptionsPanel();
    }
  }

  async getDirectory(file?: string, fileId?: number, append?: boolean) {
    this.startLoading(); 
    this.determineSearchTerms();
    this.showData = true;
    try {
      const res = await this.fileService.getDirectory(
        this.currentDirectory,
        this.filter.visibility,
        this.filter.ownership,
        this.user,
        this.currentPage,
        this.maxResults,
        this.searchTerms,
        fileId,
        (this.allowedFileTypes && this.allowedFileTypes.length > 0 ? this.allowedFileTypes : new Array<string>()),
        this.filter.hidden == 'all' ? true : false,
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

          if (this.directory && this.directory.page) {
            this.currentPage = this.directory.page!;
          }
          if (this.directory && this.directory.totalCount) {
            this.totalPages = Math.ceil(this.directory.totalCount / this.maxResults);
          }

          if (this.fileId && this.fileId !== null && this.fileId !== '0' && this.directory && this.directory.data!.find(x => x.id == parseInt(this.fileId!))) {
            this.scrollToFile(this.fileId!);
          }

          if (this.currentDirectory.toLowerCase() !== "meme/"
            && this.currentDirectory.toLowerCase() !== "roms/"
            && this.directory && this.directory.data)
          {
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
      this.userNotificationEvent.emit((error as Error).message);
    }
    this.stopLoading();
  }

  debounceSearch() {
    clearTimeout(this.debounceTimer);  
    this.debounceTimer = setTimeout(() => {
      this.getDirectory();   
    }, 500); 
  }


  private determineSearchTerms() {
    const popupSearchTerm = this.popupSearch && this.popupSearch.nativeElement.value.trim() != '' ? this.popupSearch.nativeElement.value.trim() : undefined;
    this.searchTerms = popupSearchTerm ?? "";
    if (this.search && this.search.nativeElement.value.trim() != '') {
      if (this.searchTerms) {
        this.searchTerms = this.searchTerms + ',';
      }
      this.searchTerms += this.search.nativeElement.value.trim();
    }
    if (this.tmpSearchTerms) {
      if (this.searchTerms) {
        this.searchTerms = this.searchTerms + ',';
      }
      this.searchTerms += this.tmpSearchTerms.trim();
      this.tmpSearchTerms = "";
    }
    console.log(this.searchTerms);
  }

  getFileExtension(filename: string) {
    return this.fileService.getFileExtension(filename);
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
        this.currentDirectory += file.fileName + "/";
        this.getDirectory(file.fileName);
      }
    }
  }
  previousPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.getDirectory();
    }
  }

  async nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      await this.getDirectory();
    }
  }
  async appendNextPage() {
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
  editFileKeyUp(event: KeyboardEvent, fileId: number) {
    const text = (event.target as HTMLInputElement).value;
    if (event.key === 'Enter') {
      this.editFile(fileId, text);
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

    const res = await this.fileService.updateFileData(this.user, { FileId: fileId, GivenFileName: text, Description: '', LastUpdatedBy: this.user || this.inputtedParentRef?.user || new User(0, "Anonymous") });
    if (res) {
      this.userNotificationEvent.emit(res);
      this.isEditing = this.isEditing.filter(x => x != fileId);
    }
    setTimeout(() => {
      if (document.getElementById("fileIdName" + fileId) != null) {
        document.getElementById("fileIdName" + fileId)!.innerText = text;
      }
    }, 100);
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
        const response = await this.fileService.getFile(target, undefined, this.user);
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
        const res = await this.fileService.moveFile(this.user!, inputFile, destinationFolder);
        this.userNotificationEvent.emit(res!);
        if (!res!.includes("error")) {
          this.directory!.data = this.directory!.data!.filter(x => x.fileName != this.draggedFilename);
        }
      } catch (ex) {
        console.error(ex);
        this.userNotificationEvent.emit(`Failed to move ${this.draggedFilename} to ${currDir + this.destinationFilename}!`);
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
  reinitializePages() {
    this.currentPage = this.defaultCurrentPage;
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
  formatFileSize(bytes: number, decimalPoint: number = 2): string {
    return this.fileService.formatFileSize(bytes, decimalPoint);
  }
  shareFile(user?: User) {
    if (!user) return;
    if (this.selectedSharedFile && this.user) {
      this.fileService.shareFile(this.user, user, this.selectedSharedFile!.id);
    }
    this.selectedSharedFile = undefined;
    this.shareUserListDiv.nativeElement.classList.toggle("open");
    this.closeOptionsPanel();
  }
  shareFileInitiate(file: FileEntry) {
    this.showShareUserList = true;
    this.selectedSharedFile = file;
    this.shareUserListDiv.nativeElement.classList.toggle("open");
    this.closeOptionsPanel();
  }
  emittedNotification(event: string) {
    this.userNotificationEvent.emit(event);
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
    this.tmpSearchTerms = topic;
    await this.getDirectory();
  }
  async fileTopicClicked(topic: Topic[]) {
    this.tmpSearchTerms = topic.map(t => t.topicText).join(',');

    this.closeOptionsPanel();
    await this.getDirectory();
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
    file.visibility = file.visibility == "Private" ? "Public" : "Private";
    const user = this.inputtedParentRef?.user ?? this.parentRef?.user ?? new User(0, "Anonymous");
    this.fileService.updateFileVisibility(user, file.visibility == "Private" ? false : true, file.id);
  }
  hide(file: FileEntry) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user;
    if (parent && user && user.id) {
      this.fileService.hideFile(file.id, user.id);
    }
  }
  private replacePageTitleAndDescription() {
    if (this.directory && this.directory.data && this.directory.data.length > 0) {
      const tgtFile = this.directory.data.find((file: FileEntry) => file.id == parseInt(this.fileId!));
      if (tgtFile) {
        const title = tgtFile.givenFileName ?? tgtFile.fileName ?? "Bughosted File";
        if (title) {
          const parent = this.inputtedParentRef ?? this.parentRef;
          if (parent) {
            parent.replacePageTitleAndDescription(title, title);
          } 
        }
      }
    }
  }
  async updateNSFW(event: Event) {
    const parent = this.inputtedParentRef ?? this.parentRef;
    const user = parent?.user;
    if (!user) return alert("You must be logged in to view NSFW content.");
    const isChecked = (event.target as HTMLInputElement).checked;
    this.isDisplayingNSFW = isChecked;
    this.userService.updateNSFW(user, isChecked).then(res => {
      if (res) {
        parent.showNotification(res);
        this.getDirectory();   
      }
    });
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
}
