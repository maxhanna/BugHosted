import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { FileService } from '../../services/file.service';

@Component({
  selector: 'app-meme',
  templateUrl: './meme.component.html',
  styleUrl: './meme.component.css'
})
export class MemeComponent extends ChildComponent implements OnInit {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  constructor(private fileService: FileService) { super(); }
  ngOnInit() {

  }
  async upload() {
    if (!this.fileInput) { return alert("weird bug, cant find fileInput"); }

    const files = this.fileInput.nativeElement.files;
    if (!files || !files.length) {
      return alert("No file to upload!");
    }

    const filesArray = Array.from(files);
    const isPublic = true;

    const directoryInput = "/Memes";
    const fileNames = Array.from(files).map(file => file.name);

    //if (confirm(`Upload : ${directoryInput}/${fileNames.join(',')} ?`)) {
    //  this.startLoading();
    //  try {
    //    const formData = new FormData();
    //    filesArray.forEach(file => formData.append('files', file));

    //    // Use HttpClient to track the upload progress
    //    const uploadReq = this.fileService.uploadFileWithProgress(this.parentRef?.user!, formData, directoryInput || undefined, isPublic);
    //    uploadReq.subscribe((event) => {
    //      if (event.type === HttpEventType.UploadProgress) {
    //        this.uploadProgress = Math.round(100 * (event.loaded / event.total!));
    //      } else if (event.type === HttpEventType.Response) {
    //        this.uploadProgress = 0;
    //        this.notifications.push(`${directoryInput}/${fileNames.join(',')} uploaded successfully`);
    //        this.cancelMakeDirectoryOrFile();
    //        this.ngOnInit();
    //      }
    //    });
    //  } catch (ex) {
    //    this.uploadProgress = 0;
    //    this.notifications.push(`${directoryInput}/${fileNames.join(',')} failed to upload!`);
    //    this.cancelMakeDirectoryOrFile();
    //    this.ngOnInit();
    //  }
    //  this.stopLoading();
    //}
  }
}
