import { Component, ElementRef, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { UserService } from '../../services/user.service';
import { FileService } from '../../services/file.service';
import { MediaSelectorComponent } from '../media-selector/media-selector.component';

@Component({
  selector: 'app-themes',
  templateUrl: './themes.component.html',
  styleUrls: ['./themes.component.css']
})
export class ThemesComponent extends ChildComponent {
  @ViewChild('backgroundColor') backgroundColor!: ElementRef;
  @ViewChild('fontColor') fontColor!: ElementRef;
  @ViewChild('fontSize') fontSize!: ElementRef;
  @ViewChild('fontFamily') fontFamily!: ElementRef;
  @ViewChild('mediaSelector') mediaSelector!: MediaSelectorComponent;
  attachedFiles?: FileEntry[];

  defaultTheme = {
    backgroundColor: '#0e0e0e',
    fontColor: '#b0c2b1',
    fontSize: 16,  
    fontFamily: 'Helvetica, Arial',
    backgroundImage: '', 
  };

  constructor(private userService: UserService, private fileService: FileService) {
    super();
  }

  // Update CSS variables dynamically
  updateCSS(variable: string, event?: Event, variableValue?: any) {
    if (!event && !variableValue) return;

    const target = event?.target as HTMLInputElement;
    if (target || variableValue) {
      let value = variableValue ?? target.value;

      // Ensure font size includes 'px' if not already present
      if (variable === "--main-font-size" && !value.endsWith('px')) {
        value += "px";
      }
      if (variable === "--main-font-size" && !value.endsWith('px')) {
        value += "px";
      }

      document.documentElement.style.setProperty(variable, value);
    } else {
      document.documentElement.style.removeProperty(variable);
    }
  }

  // Get computed style value of a given CSS variable
  getComputedStyleValue(variable: string) {
    return window.getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  }

  // Get the current font size
  getFontSize() {
    const fontSize = this.getComputedStyleValue('--main-font-size');
    return fontSize ? parseInt(fontSize) : 16; // Default to 16 if not set
  }

  // Save theme to the server
  async saveTheme() {
    const user = this.parentRef?.user;
    if (!user) return alert("You must be logged in to save your theme.");

    // Handle file attachment (background image)
    let tmpFileId = undefined;
    if (this.attachedFiles && this.attachedFiles[0] && this.attachedFiles[0].id) {
      tmpFileId = this.attachedFiles[0].id;
    }
    console.log(tmpFileId);
    // Prepare theme object with form input values
    const theme: any = {
      backgroundImage: tmpFileId,
      backgroundColor: this.backgroundColor.nativeElement.value,
      fontColor: this.fontColor.nativeElement.value,
      fontSize: this.fontSize.nativeElement.value,
      fontFamily: this.fontFamily.nativeElement.value,
    };

    try { 
      this.userService.updateTheme(user, theme).then(res => {
        if (res) {
          this.parentRef?.showNotification(res);
        }
      }); 
    } catch (error) {
      console.error('Error saving theme:', error); 
    }
  }
   
  selectFile(files?: FileEntry[]) {
    this.attachedFiles = files;
    const fileId = this.attachedFiles && this.attachedFiles[0] ? this.attachedFiles[0].id : null;
    if (fileId) {
      this.fileService.getFileEntryById(fileId).then(res => {
        if (res && res instanceof FileEntry) {
          const directLink = `https://bughosted.com/assets/Uploads/${(this.getDirectoryName(res) != '.' ? this.getDirectoryName(res) : '')}${res.fileName}`; 
          this.updateCSS('--main-background-image-url', undefined, directLink)
          document.body.style.backgroundImage = `url(${directLink})`;
        }
      });
    } else { 
      this.updateCSS('--main-background-image-url', undefined, fileId);
      document.body.style.backgroundImage = ``;
    }
  }

  restoreDefaultSettings() { 
    document.documentElement.style.setProperty('--main-background-image-url', this.defaultTheme.backgroundImage); 
    document.body.style.backgroundImage = ``;
    document.documentElement.style.setProperty('--main-bg-color', this.defaultTheme.backgroundColor);
    document.documentElement.style.setProperty('--main-font-color', this.defaultTheme.fontColor);
    document.documentElement.style.setProperty('--main-font-size', `${this.defaultTheme.fontSize}px`);
    document.documentElement.style.setProperty('--main-font-family', this.defaultTheme.fontFamily);
     
    this.attachedFiles = [];
    this.mediaSelector.selectedFiles = [];
    this.backgroundColor.nativeElement.value = this.defaultTheme.backgroundColor;
    this.fontColor.nativeElement.value = this.defaultTheme.fontColor;
    this.fontSize.nativeElement.value = this.defaultTheme.fontSize;
    this.fontFamily.nativeElement.value = this.defaultTheme.fontFamily;
    if (this.parentRef?.user) { 
      this.userService.deleteTheme(this.parentRef?.user).then(res => {
        if (res) { 
          this.parentRef?.showNotification(res.message);
        }
      });
    }
  }
  getDirectoryName(file: FileEntry): string {
    const parent = this.parentRef;
    if (parent) {
      return parent?.getDirectoryName(file);
    } else return '.';
  }
}
