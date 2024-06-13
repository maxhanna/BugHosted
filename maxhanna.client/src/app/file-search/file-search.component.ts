 
import { Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { User } from '../../services/datacontracts/user';
import { FileService } from '../../services/file.service';
import { FileEntry } from '../../services/datacontracts/file-entry';
import { DirectoryResults } from '../../services/datacontracts/directory-results';
import { ChildComponent } from '../child.component';
import { MediaViewerComponent } from '../media-viewer/media-viewer.component';
import { FileData } from '../../services/datacontracts/file-data';
import { ActivatedRoute } from '@angular/router';
import { AppComponent } from '../app.component';


@Component({
  selector: 'app-file-search',
  templateUrl: './file-search.component.html',
  styleUrl: './file-search.component.css'
})
export class FileSearchComponent extends ChildComponent implements OnInit {
  @Input() currentDirectory = '';
  @Input() clearAfterSelectFile = false;
  @Input() allowedFileTypes: string[] = [];
  @Input() user?: User;
  @Input() showPrivatePublicOption: boolean = true;
  @Input() maxResults: number = 50;
  @Input() maxHeight: string = "100px";
  @Input() canChangeDirectory: boolean = true;
  @Input() displayFileType: boolean = true;
  @Input() displayFileData: boolean = true;
  @Input() displayFileActions: boolean = true;
  @Input() displayComments: boolean = true;
  @Input() canDragMove: boolean = true;
  @Input() inputtedParentRef?: AppComponent;
  @Output() selectFileEvent = new EventEmitter<FileEntry>();
  @Output() currentDirectoryChangeEvent = new EventEmitter<string>();

  showData = true;
  notifications: string[] = [];
  debounceTimer: any;
  fileId: string | null = null;

  directory: DirectoryResults | undefined;
  defaultCurrentPage = 1;
  defaultTotalPages = 1;
  defaultItemsPerPage = this.maxResults;
  currentPage = this.defaultCurrentPage;
  itemsPerPage = this.defaultItemsPerPage;
  totalPages = this.defaultTotalPages;
  showUpFolderRow: boolean = true;
  draggedFilename: string | undefined;
  destinationFilename: string | undefined;
  fS = '/';
  viewMediaFile = false;
  isEditing: number[] = [];
  openedFiles: number[] = [];

  filter = {
    visibility: 'all',
    ownership: 'all'
  };

  @ViewChild('search') search!: ElementRef<HTMLInputElement>;
  @ViewChild('folderVisibility') folderVisibility!: ElementRef<HTMLSelectElement>;
  @ViewChild(MediaViewerComponent) mediaViewerComponent!: MediaViewerComponent;

  constructor(private fileService: FileService, private route: ActivatedRoute) {
    super();
  }

  async ngOnInit() {
    this.allowedFileTypes = this.allowedFileTypes.map(type => type.toLowerCase());
    await this.getDirectory(); 
    this.route.paramMap.subscribe(params => {
      this.fileId = params.get('fileId');
      if (this.fileId) {
        setTimeout(() => { this.scrollToFile(this.fileId!); }, 500);
      }
    }); 
  }
  scrollToFile(fileId: string) {
    setTimeout(() => {
      const element = document.getElementById('fileIdTd' + fileId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.click();
      }
    }, 0);
  }
  async upvoteFile(file: FileEntry) {
    const res = await this.fileService.upvoteFile(this.user!, file.id); 
    if (res.toLowerCase().includes("error")) {
      this.notifications.push("Error upvoting, are you logged in?");
    } else {
      this.notifications.push(res);
      file.upvotes++;
    }
  }
  async downvoteFile(file: FileEntry) {
    const res = await this.fileService.downvoteFile(this.user!, file.id);
    if (res.toLowerCase().includes("error")) {
      this.notifications.push("Error downvoting, are you logged in?");
    } else {
      this.notifications.push(res);
      file.downvotes++;
    }
  }
  async delete(file: FileEntry) {
    if (confirm(`Delete : ${file.fileName} ?`)) {
      this.startLoading();
      try {
        const response = await this.fileService.deleteFile(this.user!, file);
        if (response) {
          this.notifications.push(response);
          if (response.includes("successfully")) {
            this.directory!.data = this.directory?.data!.filter(res => res.fileName != file.fileName);
          }
        }
      } catch (ex) {
        this.notifications.push(`Failed to delete ${file.fileName}!`);
      }
      this.stopLoading();
    }
  }
  async getDirectory(file?: string) {
    this.currentDirectoryChangeEvent.emit(this.currentDirectory);
    this.showData = true;
    this.showUpFolderRow = this.currentDirectory.includes('/') ? true : false;
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      this.isLoading = true;
      try {
        const res = await this.fileService.getDirectory(
          this.currentDirectory,
          this.filter.visibility,
          this.filter.ownership,
          this.user,
          this.currentPage,
          this.itemsPerPage,
          this.search && this.search.nativeElement.value != '' ? this.search.nativeElement.value : undefined
        );
        this.directory = res;
        if (this.directory && this.directory.totalCount) {
          this.totalPages = Math.ceil(this.directory.totalCount / this.itemsPerPage);
          if (this.allowedFileTypes && this.allowedFileTypes.length > 0) {
            this.directory.data = this.directory.data!.filter(x => this.allowedFileTypes.includes(this.getFileExtension(x.fileName).toLowerCase()));
          }
        }
      } catch (error) {
        this.notifications.push((error as Error).message);
      }
      (document.getElementsByClassName("tableDiv")[0] as HTMLDivElement).style.maxHeight = this.maxHeight;

      this.isLoading = false;
    }, 500);
  }

  getFileExtension(filename: string) {
    return this.fileService.getFileExtension(filename);
  }
  selectFile(file: FileEntry) {
    this.selectFileEvent.emit(file);
    if (this.clearAfterSelectFile) {
      this.showData = false;
      this.search.nativeElement.value = file.fileName;
    } else {
      if (!file.isFolder) {
        this.download(file, false);
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

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.getDirectory();
    }
  }

  searchDirectory() {
    this.reinitializePages();
    this.getDirectory();
  }

  setFilterVisibility(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.filter.visibility = target.value;
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

    if (!text || text.trim() == '') { return; }
    const fileData = new FileData(fileId, text, '', new Date());
    const res = await this.fileService.updateFileData(this.user, fileData);
    if (document.getElementById("fileIdTd" + fileId) != null) {
      document.getElementById("fileIdTd" + fileId)!.innerText = text;
    }
    if (res) {
      this.notifications.push(res);
      this.isEditing = this.isEditing.filter(x => x != fileId);
    }
  }
  async startEditing(fileId: number, event: MouseEvent) {
    event.stopPropagation();
    const parent = document.getElementById("fileIdTd" + fileId)!;
    const text = parent.getElementsByTagName("input")[0].value!;

    if (this.isEditing.includes(fileId) && text.trim() == '') {
      this.isEditing = this.isEditing.filter(x => x != fileId);
      return;
    }

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
  async download(file: FileEntry, force: boolean) {
    if (this.isMediaFile(file.fileName) && !force) {
      this.viewMediaFile = true;
      if (this.openedFiles.includes(file.id)) {
        this.openedFiles = [];
        return;
      }
      if (this.openedFiles.length > 0) {
        this.openedFiles = [];
      }
      this.openedFiles.push(file.id);

      setTimeout(() => {
        this.mediaViewerComponent.setFileSrc(file.fileName, this.currentDirectory);
        this.mediaViewerComponent.selectedFile = file;
      }, 1);
      return;
    }
    if (!confirm(`Download ${file.fileName}?`)) {
      return;
    }

    const directoryValue = this.currentDirectory;
    let target = directoryValue.replace(/\\/g, "/");
    target += (directoryValue.length > 0 && directoryValue[directoryValue.length - 1] === this.fS) ? file.fileName : directoryValue.length > 0 ? this.fS + file.fileName : file.fileName;

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

  moveUpOneLevel(): string {
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
        this.notifications.push(res!);
        if (!res!.includes("error")) {
          this.directory!.data = this.directory!.data!.filter(x => x.fileName != this.draggedFilename);
        }
      } catch (ex) {
        console.error(ex);
        this.notifications.push(`Failed to move ${this.draggedFilename} to ${currDir + this.destinationFilename}!`);
      }
      this.stopLoading();
    } else {
      let message = "";
      if (!this.draggedFilename) message += "You must select an item to be moved!";
      if (message) alert(message);
    }
  }

  previousDirectory() {
    this.search.nativeElement.value = '';
    const target = this.moveUpOneLevel();
    this.currentPage = this.defaultCurrentPage;
    const parts = target.split(this.fS);
    const parentDirectory = parts.slice(0, -1).join(this.fS);
    this.currentDirectory = parentDirectory;
    this.getDirectory();
  }

  setFilterOwnership(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.filter.ownership = target.value;
    this.getDirectory();
  }
  handleUploadedFiles(files: FileEntry[]) {
    if (this.directory) {
      this.directory.data!.push(...files);
    }
  }
  reinitializePages() {
    this.currentPage = this.defaultCurrentPage;
    this.itemsPerPage = this.defaultItemsPerPage;
    this.totalPages = this.defaultTotalPages;
  }
  isMediaFile(fileName: string): boolean {
    const mediaFileTypes = [
      'jpg', 'jpeg', 'png', 'gif', 'webp', 'tiff', 'tif', 'psd', 'raw', 'bmp', 'heif', 'heic', 'indd', 'jp2', 'j2k', 'jpf', 'jpx', 'jpm', 'mj2', // Image formats
      'mp4', 'mkv', 'flv', 'avi', 'mov', 'wmv', 'avchd', 'webm', 'mpeg', 'mpg', 'm4v', '3gp', '3g2', 'f4v', 'f4p', 'f4a', 'f4b', 'vob' // Video formats
    ];
    const lowerCaseFileName = fileName.toLowerCase();
    return mediaFileTypes.some(extension => lowerCaseFileName.endsWith(`.${extension}`));
  }
  isFile(fileName: string): boolean {
    const fileExtension = fileName.lastIndexOf('.') !== -1 ? fileName.split('.').pop() : null;
    if (!fileExtension) {
      return false;
    } else {
      return true;
    }
  }
}
