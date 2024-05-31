import { Component, ElementRef, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { HttpClient, HttpEventType, HttpParams } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { FileService } from '../../services/file.service';
import { FileEntry } from '../../services/datacontracts/file-entry';
import { User } from '../../services/datacontracts/user';

@Component({
  selector: 'app-file',
  templateUrl: './file.component.html',
  styleUrls: ['./file.component.css']
})
export class FileComponent extends ChildComponent {
  constructor(private fileService: FileService) {
    super();
  }
  fS = "/";
  directoryContents: Array<FileEntry> = [];
  errorMessage: string | null = null;
  thumbnailSrc: string | null = null;
  thumbnailFileName: string | null = null;
  showThumbnail: boolean = false;
  showUpFolderRow: boolean = true;
  draggedFilename: string | undefined;
  destinationFilename: string | undefined;
  notifications: Array<string> = [];
  showMakeDirectoryPrompt = false;
  isUploadInitiate = false;
  uploadFileList: Array<File> = [];
  isDisabled = false;
  isSharePanelExpanded = false;
  fileBeingShared = 0;
  filter = {
    visibility: 'all',
    ownership: 'all'
  };
  createVisibility = 'public';
  uploadProgress: number = 0;
  showUploadPrivacySelection = false;

  @ViewChild('directoryInput') directoryInput!: ElementRef<HTMLInputElement>;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('folderVisibility') folderVisibility!: ElementRef<HTMLSelectElement>;
  @ViewChild('makeFolderName') makeFolderName!: ElementRef<HTMLInputElement>;


  async ngOnInit() {
    this.changeDirectory();
    this.draggedFilename = undefined;
    this.destinationFilename = undefined;
    this.showMakeDirectoryPrompt = false;
    this.isSharePanelExpanded = false;
  }

  async shareFile(userToShareWith: User) {
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

  setFilterVisibility(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.filter.visibility = target.value;
    this.changeDirectory();
  }

  setFilterOwnership(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.filter.ownership = target.value;
    this.changeDirectory();
  }
  async changeDirectory(folder?: string) {
    try {
      if (folder && this.isFile(folder)) {
        return;
      }
      const ogDirectoryInput = this.directoryInput?.nativeElement?.value;
      let target = "";
      if (ogDirectoryInput && ogDirectoryInput != "") {
        target = ogDirectoryInput;
      }

      if (folder) {
        target += ogDirectoryInput.length > 0 ? "/" + folder : folder;
        this.directoryInput.nativeElement.value = target;
      }
      this.showUpFolderRow = target ? true : false;
      this.startLoading();
      this.directoryContents = await this.fileService.getDirectory(this.parentRef?.user!, target, this.filter.visibility, this.filter.ownership);
      this.stopLoading();
    } catch (error) {
      console.error("Error fetching directory entries:", error);
    }
  }
  uploadNotification(event: string) {
    this.notifications.push(event);
    if (event == "OK") { 
      this.ngOnInit();
    }
  }
  uploadInitiate() {
    this.notifications = [];
    //this.isDisabled = true;
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
    this.isDisabled = false;
  }
  createVisibilityOnChange() {
    this.createVisibility = this.folderVisibility.nativeElement.value;
    console.log(this.createVisibility);
  }
  async upload() {
    if (!this.fileInput) { return alert("weird bug, cant find fileInput"); }

    const files = this.fileInput.nativeElement.files;
    if (!files || !files.length) {
      return alert("No file to upload!");
    }
    
    const filesArray = Array.from(files);
    const isPublic = this.createVisibility.toLowerCase() != "public" ? false : true;

    const directoryInput = this.directoryInput?.nativeElement?.value || '';
    const fileNames = Array.from(files).map(file => file.name);

    if (confirm(`Upload : ${directoryInput}/${fileNames.join(',')} ?`)) {
      this.startLoading();
      try {
        const formData = new FormData();
        filesArray.forEach(file => formData.append('files', file));

        // Use HttpClient to track the upload progress
        const uploadReq = this.fileService.uploadFileWithProgress(this.parentRef?.user!, formData, directoryInput || undefined, isPublic);
        uploadReq.subscribe((event) => {
          if (event.type === HttpEventType.UploadProgress) {
            this.uploadProgress = Math.round(100 * (event.loaded / event.total!));
          } else if (event.type === HttpEventType.Response) {
            this.uploadProgress = 0;
            this.notifications.push(`${directoryInput}/${fileNames.join(',')} uploaded successfully`);
            this.cancelMakeDirectoryOrFile();
            this.ngOnInit();
          }
        });
      } catch (ex) {
        this.uploadProgress = 0;
        this.notifications.push(`${directoryInput}/${fileNames.join(',')} failed to upload!`);
        this.cancelMakeDirectoryOrFile();
        this.ngOnInit();
      }
      this.stopLoading();
    }
  }
  async displayPictureThumbnail(fileName: string) {
    const fileExt = fileName.lastIndexOf('.') !== -1 ? fileName.substring(fileName.lastIndexOf('.') + 1) : '';
    const directoryValue = this.directoryInput?.nativeElement?.value ?? "";
    let target = directoryValue.replace(/\\/g, "/");
    target += (directoryValue.length > 0 && directoryValue[directoryValue.length - 1] === this.fS) ? fileName : directoryValue.length > 0 ? this.fS + fileName : fileName;

    this.startLoading();
    try {
      const response = await this.fileService.getFile(this.parentRef?.user!, target);
      const blob = new Blob([response!], { type: `image/${fileExt}` });
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        this.thumbnailSrc = reader.result as string;
        this.thumbnailFileName = fileName;
        this.showThumbnail = true;
      };
    } catch (ex) {
      console.error(ex);
    }
    this.stopLoading();
  }
  async downloadThumbnail() {
    if (!this.thumbnailFileName) { return alert("No thumbnail specified!"); }
    await this.download(this.thumbnailFileName!, true);
  }
  async download(fileName: string, force: boolean) {
    if (this.isPictureFile(fileName) && !force) {
      return this.displayPictureThumbnail(fileName);
    }
    if (!confirm(`Download ${fileName}?`)) {
      return;
    }

    const directoryValue = this.directoryInput?.nativeElement?.value ?? "";
    let target = directoryValue.replace(/\\/g, "/");
    target += (directoryValue.length > 0 && directoryValue[directoryValue.length - 1] === this.fS) ? fileName : directoryValue.length > 0 ? this.fS + fileName : fileName;

    try {
      this.startLoading();
      const response = await this.fileService.getFile(this.parentRef?.user!, target);
      const blob = new Blob([response!], { type: 'application/octet-stream' });

      const a = document.createElement('a');
      a.href = window.URL.createObjectURL(blob);
      a.download = fileName;
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
  async makeDirectory() {
    this.notifications = [];
    const choice = this.makeFolderName.nativeElement.value;
    if (!choice || choice == "") {
      return alert("Folder name cannot be empty!");
    }

    const isPublic = this.createVisibility.toLowerCase() == "public" ? true : false; 

    const directoryValue = this.directoryInput?.nativeElement?.value ?? "";
    let target = directoryValue.replace(/\\/g, "/");
    target += (directoryValue.length > 0 && directoryValue[directoryValue.length - 1] === this.fS) ? choice : directoryValue.length > 0 ? this.fS + choice : choice;

    if (confirm(`Create directory : ${target} ?`)) {
      const headers = { "Content-Type": "application/json" };
      this.startLoading();
      try {
        const res = await this.fileService.createDirectory(this.parentRef?.user!, target, isPublic);
        this.notifications.push(res!);

        if (!res?.toLowerCase().includes("already exists")) {
          this.changeDirectory();
          this.cancelMakeDirectoryOrFile();
        }
      } catch (ex) {
        console.error(ex);
      }
     
      this.stopLoading();
    }
  }
  async delete(name: string) {
    const target = this.getCurrentDirectory() + name;

    if (confirm(`Delete : ${target} ?`)) {
      const headers = { "Content-Type": "application/json" };
      const requestBody = '"' + target + '"';
      this.startLoading();
      try {
        const response = this.fileService.deleteFile(this.parentRef?.user!, target);
        //const response = await this.http.request('delete', '/file/delete', { body: requestBody, headers, responseType: 'text' }).toPromise();
        this.notifications.push(`Deleted ${target} successfully`);
      } catch (ex) {
        console.error(ex);
        this.notifications.push(`Failed to delete ${target}!`);
      }
      this.stopLoading();
      this.directoryContents = this.directoryContents.filter(res => res.name != name);
    }
  }
  private getCurrentDirectory() {
    const directoryValue = this.directoryInput?.nativeElement?.value;
    const target = directoryValue + ((directoryValue.length > 0 && directoryValue[directoryValue.length - 1] === this.fS) ? '' : this.fS);
    return target;
  }

  previousDirectory() {
    const target = this.directoryInput.nativeElement.value;
    const parts = target.split(this.fS);
    const parentDirectory = parts.slice(0, -1).join(this.fS);
    this.directoryInput.nativeElement.value = parentDirectory;
    this.changeDirectory();
  }
  isFile(fileName: string): boolean {
    const fileExtension = fileName.lastIndexOf('.') !== -1 ? fileName.split('.').pop() : null;
    if (!fileExtension) {
      return false;
    } else {
      return true;
    }
  }
  isPictureFile(fileName: string) {
    const pictureFileTypes = ['jpg', 'png', 'gif', 'webp', 'tiff', 'psd', 'raw', 'bmp', 'heif', 'indd', 'jpeg 2000'];
    const lowerCaseFileName = fileName.toLowerCase();
    return pictureFileTypes.some(extension => lowerCaseFileName.includes(extension));
  }
  handleFileClick(fileName: string) {
    if (!fileName || fileName == "") {
      return alert("No file? Try again");
    }

    if (this.isFile(fileName)) {
      this.download(fileName, false);
    } else {
      this.changeDirectory(fileName);
    }
  }
  onDragStart(event: DragEvent, fileName: string) {
    this.draggedFilename = (event.target as HTMLTableRowElement).innerText.trim();
    this.destinationFilename = undefined;
  }
  onDragOver(event: DragEvent) {
    event.preventDefault();
  }
  async onDrop(event: DragEvent) {
    const fileName = (event.target as HTMLTableRowElement).innerText.trim();
    if (fileName && fileName.includes("...")) {
      console.log("moving one directory up!");
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
    const currDir = this.getCurrentDirectory();
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
    const currDir = this.getCurrentDirectory();
    console.log("destination: " + this.destinationFilename);
    console.log("draggedFilename: " + this.draggedFilename)
    if (this.draggedFilename 
      && this.draggedFilename != this.destinationFilename
      && confirm(`Move ${this.draggedFilename!.trim()} to ${specDir ?? (currDir + this.destinationFilename)}?`)) {
      const inputFile = currDir + this.draggedFilename;
      const destinationFolder = specDir ?? (currDir + this.destinationFilename);
      this.startLoading();
      try {
        const res = await this.fileService.moveFile(this.parentRef?.user!, inputFile, destinationFolder);
        this.notifications.push(res!);
        if (!res!.includes("error")) {
          this.directoryContents = this.directoryContents.filter(x => x.name != this.draggedFilename);
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
}
