import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
 import { FileService } from '../../services/file.service'; 
import { FileSearchComponent } from '../file-search/file-search.component';
import { User } from '../../services/datacontracts/user/user';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
  
@Component({
  selector: 'app-file',
  templateUrl: './file.component.html',
  styleUrls: ['./file.component.css']
})
export class FileComponent extends ChildComponent {
  constructor(private fileService: FileService) {
    super();
  }
  @Input() user?: User;
  @Input() fileId: string | null = null;
  fS = "/"; 
  errorMessage: string | null = null;
  thumbnailSrc: string | null = null;
  thumbnailFileName: string | null = null;
  showThumbnail: boolean = false;
  showUpFolderRow: boolean = true;
  draggedFilename: string | undefined;
  destinationFilename: string | undefined;
  notifications: Array<string> = [];
  showMakeDirectoryPrompt = false;
  currentDirectory = '';
  isUploadInitiate = false;
  uploadFileList: Array<File> = []; 
  isSharePanelExpanded = false;
  fileBeingShared = 0;
  filter = {
    visibility: 'all',
    ownership: 'all'
  };
  createVisibility = 'public';
  uploadProgress: number = 0;
  showUploadPrivacySelection = false;
  videoFileExtensions = ["mp4", "mov", "avi", "wmv", "webm", "flv"];
  loading = false;
  selectedThumbnailFileExtension = "";
  selectedThumbnail = "";
  selectedFileType = "";
  abortThumbnailRequestController: AbortController | null = null;

  @ViewChild('directoryInput') directoryInput!: ElementRef<HTMLInputElement>;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('folderVisibility') folderVisibility!: ElementRef<HTMLSelectElement>;
  @ViewChild('makeFolderName') makeFolderName!: ElementRef<HTMLInputElement>;
  @ViewChild('thumbnailContainer', { static: false }) thumbnailContainer!: ElementRef;
  @ViewChild(FileSearchComponent) fileSearchComponent!: FileSearchComponent;


  async ngOnInit() {
    this.draggedFilename = undefined;
    this.destinationFilename = undefined;
    this.showMakeDirectoryPrompt = false;
    this.isSharePanelExpanded = false;
  }
  uploadFinished(newFiles: FileEntry[]) {
    this.fileSearchComponent.handleUploadedFiles(newFiles.flatMap(fileArray => fileArray)); 
  }
  async shareFile(userToShareWith?: User) {
    if (!userToShareWith) return;
    try {
      await this.fileService.shareFile(this.parentRef?.user!, userToShareWith, this.fileBeingShared);
      this.fileBeingShared = 0;
      this.isSharePanelExpanded = false;
      this.notifications.push("File sharing has succeeded.");
    } catch {
      this.notifications.push("File sharing has failed.");
    }
  }

  shareFileOpenUser(fileId: number) {
    this.fileBeingShared = fileId;
  }
  changeDirectoryEvent(event: string) {
    this.currentDirectory = event;
  } 
  uploadNotification(event: string) {
    if (event != '0') {
      this.notifications.push(event);
    }
  }
  uploadInitiate() {
    this.notifications = []; 
    this.showMakeDirectoryPrompt = false;
    this.isUploadInitiate = true;
    if (this.fileInput && this.fileInput.nativeElement && this.fileInput.nativeElement.files) {
      this.uploadFileList = Array.from(this.fileInput.nativeElement.files as FileList);
    }
  }
  cancelMakeDirectoryOrFile() {
    this.showMakeDirectoryPrompt = false;
    this.isUploadInitiate = false;
    if (this.fileInput)
      this.fileInput.nativeElement.value = '';
    this.uploadFileList = []; 
  }
  createVisibilityOnChange() {
    this.createVisibility = this.folderVisibility.nativeElement.value;
  }
  

  getFileExtension(filePath: string) {
    return filePath.split('.').pop();
  }

  //getFileExtensionFromContentDisposition(contentDisposition: string | null): string {
  //  if (!contentDisposition) return '';

  //  // Match the filename pattern
  //  const filenameMatch = contentDisposition.match(/filename\*?=['"]?([^'";\s]+)['"]?/);
  //  if (filenameMatch && filenameMatch[1]) {
  //    const filename = filenameMatch[1];
  //    return filename.split('.').pop() || '';
  //  }
  //  return '';
  //}
  setThumbnailSrc(url: string) {
    if (this.thumbnailContainer && this.thumbnailContainer.nativeElement) {
      this.thumbnailContainer.nativeElement.src = url;
    }
  }

  //async displayPictureThumbnail(fileName: string) {
  //  const directoryValue = this.currentDirectory  ?? "";
  //  let target = directoryValue.replace(/\\/g, "/");
  //  target += (directoryValue.length > 0 && directoryValue[directoryValue.length - 1] === this.fS) ? fileName : directoryValue.length > 0 ? this.fS + fileName : fileName;
  //  this.selectedThumbnail = target;
  //  this.loading = true;
  //  this.startLoading();
  //  try {
  //    // Cancel any ongoing thumbnail request
  //    if (this.abortThumbnailRequestController) {
  //      this.abortThumbnailRequestController.abort();
  //    }

  //    // Create a new AbortController for the thumbnail request
  //    this.abortThumbnailRequestController = new AbortController();

  //    const response = await this.fileService.getFile(target, {
  //      signal: this.abortThumbnailRequestController.signal
  //    }, this.parentRef?.user);

  //    if (!response || response == null) return;
  //    const contentDisposition = response.headers["content-disposition"];
  //    this.selectedThumbnailFileExtension = this.getFileExtensionFromContentDisposition(contentDisposition);
  //    const type = this.selectedFileType = this.videoFileExtensions.includes(this.selectedThumbnailFileExtension)
  //      ? `video/${this.selectedThumbnailFileExtension}`
  //      : `image/${this.selectedThumbnailFileExtension}`;

  //    const blob = new Blob([response.blob], { type });
  //    const reader = new FileReader();
  //    reader.readAsDataURL(blob);
  //    reader.onloadend = () => {
  //      this.showThumbnail = true;
  //      setTimeout(() => { this.setThumbnailSrc(reader.result as string); }, 1);
  //      this.thumbnailFileName = fileName;
  //    };


  //  } catch (ex) {
  //    console.error(ex);
  //  }
  //  this.loading = false;
  //  this.stopLoading();
  //}

  
  async makeDirectory() {
    this.notifications = [];
    const choice = this.makeFolderName.nativeElement.value;
    if (!choice || choice == "") {
      return alert("Folder name cannot be empty!");
    }

    const isPublic = this.createVisibility.toLowerCase() == "public" ? true : false;

    const directoryValue = this.currentDirectory ?? "";
    let target = directoryValue.replace(/\\/g, "/");
    target += (directoryValue.length > 0 && directoryValue[directoryValue.length - 1] === this.fS) ? choice : directoryValue.length > 0 ? this.fS + choice : choice;

    if (confirm(`Create directory : ${target} ?`)) { 
      this.startLoading();
      try {
        const res = await this.fileService.createDirectory(this.parentRef?.user!, target, isPublic);
        this.notifications.push("Created folder " + target);

        if (!res?.toLowerCase().includes("already exists")) {
          this.cancelMakeDirectoryOrFile();
          let tmpFileEntry =
            new FileEntry(parseInt(res!), choice, directoryValue, this.createVisibility.toLowerCase(), "",
              this.parentRef?.user!, true, [], new Date(), 0, "", [], undefined);
          this.uploadFinished([tmpFileEntry]);
        }
      } catch (ex) {
        console.error(ex);
      }

      this.stopLoading();
    }
  } 
}
