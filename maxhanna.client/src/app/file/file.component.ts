import { Component, ElementRef, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { HttpClient, HttpParams } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-file',
  templateUrl: './file.component.html',
  styleUrls: ['./file.component.css']
})
export class FileComponent extends ChildComponent {
  constructor(private http: HttpClient) {
    super();
  }
  fS = "/";
  directoryContents: Array<string> = [];
  errorMessage: string | null = null;
  thumbnailSrc: string | null = null;
  thumbnailFileName: string | null = null;
  showThumbnail: boolean = false;
  showUpFolderRow: boolean = true;
  draggedFilename: string | undefined;
  destinationFilename: string | undefined;
  notifications: Array<string> = [];

  @ViewChild('directoryInput') directoryInput!: ElementRef<HTMLInputElement>;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;


  async ngOnInit() {
    this.changeDirectory();
    this.draggedFilename = undefined;
    this.destinationFilename = undefined;
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
      const params = new HttpParams().set('directory', target);
      this.startLoading();
      await lastValueFrom(await this.http.get<Array<string>>('/file/getdirectory', { params })).then(res => this.directoryContents = res);
      this.stopLoading();
    } catch (error) {
      console.error("Error fetching directory entries:", error);
    }
  }
  async upload() {
    if (!this.fileInput.nativeElement.files || this.fileInput.nativeElement.files.length === 0) {
      return alert("No file to upload!");
    }
    const directoryInput = this.directoryInput?.nativeElement?.value;
    const files = this.fileInput.nativeElement.files;
    var fileNames = [];
    for (let x = 0; x < files!.length; x++) {
      fileNames.push(files![x].name);
    }
    if (confirm(`Upload : ${directoryInput}/${fileNames.join(',')} ?`)) {
      this.startLoading();
      try {
        const formData = new FormData();
        for (let i = 0; i < files!.length; i++) {
          formData.append('files', files!.item(i)!);
        }
        if (directoryInput && directoryInput != '') {
          await this.http.post(`/file/upload?folderPath=${directoryInput}`, formData, { responseType: 'text' }).toPromise();
        } else {
          await this.http.post('/file/upload', formData, { responseType: 'text' }).toPromise();
        }
        this.notifications.push(`${directoryInput}/${fileNames.join(',')} uploaded successfully`);
      } catch (ex) {
        this.notifications.push(`${directoryInput}/${fileNames.join(',')} failed to upload!`);
      }
      this.stopLoading();

      this.ngOnInit();
    }
  }
  async displayPictureThumbnail(fileName: string) {
    const fileExt = fileName.lastIndexOf('.') !== -1 ? fileName.substring(fileName.lastIndexOf('.') + 1) : '';
    const directoryValue = this.directoryInput?.nativeElement?.value ?? "";
    let target = directoryValue.replace(/\\/g, "/");
    target += (directoryValue.length > 0 && directoryValue[directoryValue.length - 1] === this.fS) ? fileName : directoryValue.length > 0 ? this.fS + fileName : fileName;

    this.startLoading();
    try {
      const response = await this.http.get(`/file/getfile/${encodeURIComponent(target)}`, { responseType: 'blob' }).toPromise();
      const blob = new Blob([response!], { type: ('image/' + fileExt) });
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
      const response = await this.http.get(`/file/getfile/${encodeURIComponent(target)}`, { responseType: 'blob' }).toPromise();
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
    const choice = prompt("Folder name:");
    if (!choice || choice == "") {
      return alert("Folder name cannot be empty!");
    }
    const directoryValue = this.directoryInput?.nativeElement?.value ?? "";
    let target = directoryValue.replace(/\\/g, "/");
    target += (directoryValue.length > 0 && directoryValue[directoryValue.length - 1] === this.fS) ? choice : directoryValue.length > 0 ? this.fS + choice : choice;
    target = '"' + target + '"';

    if (confirm(`Create directory : ${target} ?`)) {
      const headers = { "Content-Type": "application/json" };
      this.startLoading();
      try {
        await this.http.request('post', '/file/makedirectory', { body: target, headers, responseType: 'text' }).toPromise();
      } catch (ex) {
        console.error(ex);
      }
      this.directoryContents.push(choice);
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
        const response = await this.http.request('delete', '/file/delete', { body: requestBody, headers, responseType: 'text' }).toPromise();
        this.notifications.push(`Deleted ${target} successfully`);
      } catch (ex) {
        console.error(ex);
        this.notifications.push(`Failed to delete ${target}!`);
      }
      this.stopLoading();
      this.directoryContents = this.directoryContents.filter(res => res != name);
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
    if (this.draggedFilename
      && ((!this.destinationFilename && !this.isFile(this.draggedFilename)) || this.destinationFilename)
      && this.draggedFilename != this.destinationFilename
      && confirm(`Move ${this.draggedFilename.trim()} to ${specDir ?? (currDir + this.destinationFilename)}?`)) {
      const inputFile = currDir + this.draggedFilename;
      const destinationFolder = specDir ?? (currDir + this.destinationFilename);

      const headers = { "Content-Type": "text/plain" };
      this.startLoading();
      try {
        const response = await this.http.post(`/file/move?inputFile=${encodeURI(inputFile)}&destinationFolder=${encodeURI(destinationFolder)}`, null, { headers, responseType: 'text' }).toPromise();
        if (response && response.toLowerCase().includes("successfully")) {
          this.notifications.push(`Moved ${this.draggedFilename} to ${currDir + this.destinationFilename} successfully`);
          this.directoryContents = this.directoryContents.filter(x => x != this.draggedFilename);
        } else {
          this.notifications.push(`Failed to move ${this.draggedFilename} to ${currDir + this.destinationFilename}! Unexpected response: ${response}`);
        }
      } catch (ex) {
        console.error(ex);
        this.notifications.push(`Failed to move ${this.draggedFilename} to ${currDir + this.destinationFilename}!`);
      }
      this.stopLoading();
    } else {
      let message = "";
      if (!this.draggedFilename) message += "You must select an item to be moved!";
      if (!this.destinationFilename) message += "You must select a destination!";
      if (message) alert(message);
    }
  }
}
