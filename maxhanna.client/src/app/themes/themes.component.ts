import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
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
export class ThemesComponent extends ChildComponent implements OnInit {
  @ViewChild('backgroundColor') backgroundColor!: ElementRef;
  @ViewChild('componentBackgroundColor') componentBackgroundColor!: ElementRef;
  @ViewChild('fontColor') fontColor!: ElementRef;
  @ViewChild('linkColor') linkColor!: ElementRef;
  @ViewChild('fontSize') fontSize!: ElementRef;
  @ViewChild('fontFamily') fontFamily!: ElementRef;
  @ViewChild('mediaSelector') mediaSelector!: MediaSelectorComponent;
  attachedFiles?: FileEntry[]; 

  defaultTheme = {
    backgroundColor: '#0e0e0e',
    componentBackgroundColor: '#202020',
    fontColor: '#b0c2b1',
    linkColor: 'chartreuse',
    fontSize: 16,  
    fontFamily: 'Helvetica, Arial',
    backgroundImage: '', 
  };

  constructor(private userService: UserService, private fileService: FileService) {
    super(); 
  }

  ngOnInit() {
    if (this.parentRef?.user) {
      this.userService.getTheme(this.parentRef.user).then(res => { 
        if (res) { 
          this.replenishBackroundImageSelection(res);
        }
      });
    }
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
   
  getComputedStyleValue(variable: string) {
    return window.getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  }

  getComputedStyleValueForColor(variable: string): string {
    let color = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();

    // Convert named colors to hex if necessary
    if (color && !color.startsWith("#")) {
      const ctx = document.createElement("canvas").getContext("2d");
      if (ctx) {
        ctx.fillStyle = color;
        return ctx.fillStyle; // This will return the hex equivalent of a named color
      }
    }

    return color || "#000000"; // Default fallback
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
    // Prepare theme object with form input values
    const theme: any = {
      backgroundImage: tmpFileId,
      backgroundColor: this.backgroundColor.nativeElement.value,
      componentBackgroundColor: this.componentBackgroundColor.nativeElement.value,
      fontColor: this.fontColor.nativeElement.value,
      linkColor: this.linkColor.nativeElement.value,
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
        if (res) {
          const directLink = `https://bughosted.com/assets/Uploads/${(this.getDirectoryName(res) != '.' ? this.getDirectoryName(res) : '')}${res.fileName}`; 
          this.updateCSS('--main-background-image-url', undefined, directLink);
          setTimeout(() => { 
            document.body.style.backgroundImage = `url(${directLink})`;
          }, 10);
        }
      });
    } else { 
      this.updateCSS('--main-background-image-url', undefined, fileId);
      setTimeout(() => {
        document.body.style.backgroundImage = ``;
      }, 10);
    }
  }

  restoreDefaultSettings() { 
    document.documentElement.style.setProperty('--main-background-image-url', this.defaultTheme.backgroundImage); 
    document.body.style.backgroundImage = ``;
    document.documentElement.style.setProperty('--main-bg-color', this.defaultTheme.backgroundColor);
    document.documentElement.style.setProperty('--main-bg-color-quarter-opacity', this.defaultTheme.componentBackgroundColor);
    document.documentElement.style.setProperty('--main-font-color', this.defaultTheme.fontColor);
    document.documentElement.style.setProperty('--main-link-color', this.defaultTheme.linkColor);
    document.documentElement.style.setProperty('--main-font-size', `${this.defaultTheme.fontSize}px`);
    document.documentElement.style.setProperty('--main-font-family', this.defaultTheme.fontFamily);
     
    this.attachedFiles = [];
    this.mediaSelector.selectedFiles = [];
    this.backgroundColor.nativeElement.value = this.defaultTheme.backgroundColor;
    this.componentBackgroundColor.nativeElement.value = this.defaultTheme.componentBackgroundColor;
    this.fontColor.nativeElement.value = this.defaultTheme.fontColor;
    this.linkColor.nativeElement.value = this.defaultTheme.linkColor;
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
  private replenishBackroundImageSelection(res: any) {
    if (res.backgroundImage) {
      this.fileService.getFileEntryById(res.backgroundImage).then(feRes => {
        if (feRes) {
          this.mediaSelector.selectFile(feRes);
          setTimeout(() => {
            document.getElementById("closeOverlay")?.click();
          }, 5);
        }
      });
    }
  }
}
