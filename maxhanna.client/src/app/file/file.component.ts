import { Component, ElementRef, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { HttpClient, HttpParams } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-file',
  templateUrl: './file.component.html',
  styleUrl: './file.component.css'
})
export class FileComponent extends ChildComponent {
  constructor(private http: HttpClient) {
    super();
  }
  fS = "/";
  directoryContents: Array<string> = [];
  errorMessage: string | null = null;
  @ViewChild('directoryInput') directoryInput!: ElementRef<HTMLInputElement>;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;


  async ngOnInit() {
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

      console.log("Changing directory to : " + target);
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
    if (confirm(`Upload : ${directoryInput}/${fileNames.join(',')} ?`))
    {
      try {
        const formData = new FormData();
        for (let i = 0; i < files!.length; i++) {
          formData.append('files', files!.item(i)!);
        }
        if (directoryInput && directoryInput != '') {
          await this.promiseWrapper(this.http.post(`/file/upload?folderPath=${directoryInput}`, formData).toPromise());
        } else {
          await this.promiseWrapper(this.http.post('/file/upload', formData).toPromise()).then(res => alert(res));
        }
      } catch (ex) {
        console.log(ex);
      }
      this.ngOnInit();
    }
  }
  async download(fileName: string) {
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
      a.id = (Math.random()*100) + "";
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(a.href);
      document.getElementById(a.id)?.remove();
      this.stopLoading();
    } catch (ex) {
      console.log(ex);
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
    const ogTarget = target;
    const originalTargetFolder = this.findTargetOriginalFolder(ogTarget);

    target = '"' + target + '"';
    if (confirm(`Create directory : ${target} ?`)) {
      const headers = { "Content-Type": "application/json" };
      this.startLoading();
      try {
        await this.http.request('post', '/file/makedirectory', { body: target, headers }).subscribe();
      } catch (ex) {
        console.log(ex);
      }
      this.directoryContents.push(originalTargetFolder);

      const index = this.directoryInput.nativeElement.value.indexOf(originalTargetFolder);

      // Extract the substring up to the first occurrence of ogTargetFolder
      this.directoryInput.nativeElement.value = index !== -1 ? this.directoryInput.nativeElement.value.substring(0, index) : '';

      this.stopLoading();
    }
  }
  private findTargetOriginalFolder(choice: string) {
    const folders = choice.split('/');

    for (const folder of this.directoryContents) {
      if (folders.some(part => folder.includes(part))) {
        return folder;
      }
    }
    return folders[0];
  }

  async delete(name: string) {
    const directoryValue = this.directoryInput?.nativeElement?.value;
    console.log("delete with directoryValue :" + directoryValue);
    const target = directoryValue + ((directoryValue.length > 0 && directoryValue[directoryValue.length - 1] === this.fS) ? name : this.fS + name);
    console.log("targete :" + target);

    if (confirm(`Delete : ${target} ?`)) {
      const headers = { "Content-Type": "application/json" };
      const requestBody = '"' + target + '"';
      this.startLoading();
      try {
        this.promiseWrapper(await this.http.request('delete', '/file/delete', { body: requestBody, headers }).toPromise());
      } catch (ex) {
        console.log(ex);
      }
      this.stopLoading();
      this.directoryContents = this.directoryContents.filter(res => res != name);
    }
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
  handleFileClick(fileName: string) {
    if (!fileName || fileName == "") {
      return alert("No file? Try again");
    }
    if (this.isFile(fileName)) {
      console.log("downloading: " + fileName);
      this.download(fileName);
    }
    else {
      this.changeDirectory(fileName);
    }
  }
}

