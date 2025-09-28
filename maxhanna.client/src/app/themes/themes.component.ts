import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { FileEntry } from '../../services/datacontracts/file/file-entry';
import { Theme } from '../../services/datacontracts/user/theme';
import { UserService } from '../../services/user.service';
import { FileService } from '../../services/file.service';
import { MediaSelectorComponent } from '../media-selector/media-selector.component';

@Component({
    selector: 'app-themes',
    templateUrl: './themes.component.html',
    styleUrls: ['./themes.component.css'],
    standalone: false
})
export class ThemesComponent extends ChildComponent implements OnInit, OnDestroy {
  @ViewChild('backgroundColor') backgroundColor!: ElementRef;
  @ViewChild('componentBackgroundColor') componentBackgroundColor!: ElementRef;
  @ViewChild('secondaryComponentBackgroundColor') secondaryComponentBackgroundColor!: ElementRef;
  @ViewChild('fontColor') fontColor!: ElementRef;
  @ViewChild('secondaryFontColor') secondaryFontColor!: ElementRef;
  @ViewChild('thirdFontColor') thirdFontColor!: ElementRef;
  @ViewChild('mainHighlightColor') mainHighlightColor!: ElementRef;
  @ViewChild('mainHighlightColorQuarterOpacity') mainHighlightColorQuarterOpacity!: ElementRef;
  @ViewChild('linkColor') linkColor!: ElementRef;
  @ViewChild('fontSize') fontSize!: ElementRef;
  @ViewChild('themeNameInput') themeNameInput!: ElementRef<HTMLInputElement>;
  @ViewChild('themeSearchInput') themeSearchInput!: ElementRef<HTMLInputElement>;
  @ViewChild('mediaSelector') mediaSelector!: MediaSelectorComponent;
  attachedFiles?: FileEntry[];
  userSelectedTheme?: Theme;
  allThemes?: Theme[];
  myThemes?: Theme[];
 
  isSearching = false
  originalThemeId = 0;
  warnUserToSave = false;
  blockWarnThemeChange = true;
  fontFamilyExpanded = false;
  fonts = [
    // Sans-Serif
    { label: 'Arial', value: 'Arial, sans-serif' },
    { label: 'Arial Black', value: '"Arial Black", Gadget, sans-serif' },
    { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
    { label: 'Verdana', value: 'Verdana, sans-serif' },
    { label: 'Verdana (Alt)', value: 'Verdana, Geneva, sans-serif' },
    { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
    { label: 'Trebuchet MS', value: '"Trebuchet MS", Helvetica, sans-serif' },
    { label: 'Lucida Sans', value: '"Lucida Sans Unicode", "Lucida Grande", sans-serif' },
    { label: 'Sans-serif (Default)', value: 'Arial, sans-serif' },

    // Serif
    { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
    { label: 'Georgia', value: 'Georgia, serif' },
    { label: 'Palatino', value: '"Palatino Linotype", "Book Antiqua", Palatino, serif' },
    { label: 'Garamond', value: 'Garamond, serif' },

    // Monospace
    { label: 'Courier New', value: '"Courier New", monospace' },
    { label: 'Courier', value: 'Courier, monospace' },
    { label: 'Courier New (Alt)', value: '"Courier New", Courier, monospace' },
    { label: 'Lucida Console', value: '"Lucida Console", Monaco, monospace' },
    { label: 'Consolas', value: 'Consolas, monospace' },
    { label: 'Monaco', value: 'Monaco, monospace' },

    // Cursive
    { label: 'Comic Sans MS', value: '"Comic Sans MS", cursive, sans-serif' },
    { label: 'Brush Script MT', value: '"Brush Script MT", cursive' },

    // Fantasy
    { label: 'Impact', value: 'Impact, Charcoal, sans-serif' },
    { label: 'Papyrus', value: 'Papyrus, fantasy' }
  ];

  constructor(private userService: UserService, private fileService: FileService) {
    super();
    setTimeout(() => { this.blockWarnThemeChange = false; }, 150);
  }

  ngOnInit() {
    if (this.parentRef?.user?.id) {
      this.userService.getTheme(this.parentRef.user.id).then(res => {
        if (res) {
          this.userSelectedTheme = res;
          this.originalThemeId = this.userSelectedTheme?.id ?? 0;
          this.themeNameInput.nativeElement.value = (this.userSelectedTheme?.name ? this.userSelectedTheme.name : "Default");
          
          this.replenishBackroundImageSelection(res, true);
        }
      });

      this.userService.getAllThemes().then(res => {
        if (res) {
          this.allThemes = res;
        } else {
          this.allThemes = [];
        }
      });

      this.userService.getAllUserThemes(this.parentRef.user.id).then(res => {
        if (res && !res.message ) {
          this.myThemes = res;
        } else {
          this.myThemes = [];
        }
      });
    }
  }

  ngOnDestroy() {
    if (this.warnUserToSave) {
      if (confirm("Save theme before leaving?")) {
        this.saveTheme();
      } else {
        this.changeThemeById(this.originalThemeId);
      }
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
    if (!this.blockWarnThemeChange) { 
      this.warnUserToSave = true;
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
    if (!user || !user?.id) return alert("You must be logged in to save your theme.");

    const name = this.themeNameInput.nativeElement.value;
    if (name.toLowerCase() == "default" && this.warnUserToSave) {
      this.themeNameInput.nativeElement.focus();
      return alert("Please enter a valid theme name.");
    }
    // Handle file attachment (background image)
    let tmpFileId = undefined;
    if (this.attachedFiles && this.attachedFiles[0] && this.attachedFiles[0].id) {
      tmpFileId = this.attachedFiles[0].id;
    } 

    const theme: any = {
      id: this.userSelectedTheme?.id,
      backgroundImage: tmpFileId,
      backgroundColor: this.backgroundColor.nativeElement.value,
      componentBackgroundColor: this.componentBackgroundColor.nativeElement.value,
      secondaryComponentBackgroundColor: this.secondaryComponentBackgroundColor.nativeElement.value,
      fontColor: this.fontColor.nativeElement.value,
      secondaryFontColor: this.secondaryFontColor.nativeElement.value,
      thirdFontColor: this.thirdFontColor.nativeElement.value,
      mainHighlightColor: this.mainHighlightColor.nativeElement.value,
      mainHighlightColorQuarterOpacity: this.mainHighlightColorQuarterOpacity.nativeElement.value,
      linkColor: this.linkColor.nativeElement.value,
      fontSize: this.fontSize.nativeElement.value,
      fontFamily: this.getComputedStyleValue('--main-font-family'),
      name: name,
    };

    this.warnUserToSave = false;
    //this.originalThemeId = 

    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      try {
        this.userService.updateTheme(user.id ?? 0, theme).then(res => {
          if (res) {
            if (!this.myThemes) {
              this.myThemes = [];
            }
            this.myThemes.push(theme as Theme);
            this.parentRef?.showNotification(res);
          }
        });
      } catch (error) {
        console.error('Error saving theme:', error);
      }
    }, 500);
  }

  deleteTheme() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      try {
        const user = this.parentRef?.user;
        if (!this.userSelectedTheme?.id) return alert("No theme selected.");
        if (!user || !user.id) return alert("You must be logged in to delete a theme.");
        if (confirm("Are you sure you want to delete this theme?")) {
          this.userService.deleteUserTheme(user.id, this.userSelectedTheme.id).then((res: any) => {
            if (res) {
              this.parentRef?.showNotification(res.message);
            }
          });
        } 
      } catch (error) {
        console.error('Error saving theme:', error);
      }
    }, 500);
  }

  selectFile(files?: FileEntry[]) {
    this.attachedFiles = files;
    const fileId = this.attachedFiles && this.attachedFiles[0] ? this.attachedFiles[0].id : null;
    if (fileId) {
      const requesterId = this.parentRef?.user?.id;
      this.fileService.getFileEntryById(fileId, requesterId).then(res => {
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

  restoreDefaultSettings(updateServer = true) {
    if (!this.parentRef?.navigationComponent.defaultTheme) return;
    document.documentElement.style.setProperty('--main-background-image-url', this.parentRef.navigationComponent.defaultTheme.backgroundImage);
    document.body.style.backgroundImage = ``;
    document.documentElement.style.setProperty('--main-bg-color', this.parentRef.navigationComponent.defaultTheme.backgroundColor);
    document.documentElement.style.setProperty('--component-background-color', this.parentRef.navigationComponent.defaultTheme.componentBackgroundColor);
    document.documentElement.style.setProperty('--secondary-component-background-color', this.parentRef.navigationComponent.defaultTheme.secondaryComponentBackgroundColor);
    document.documentElement.style.setProperty('--main-font-color', this.parentRef.navigationComponent.defaultTheme.fontColor);
    document.documentElement.style.setProperty('--secondary-font-color', this.parentRef.navigationComponent.defaultTheme.secondaryFontColor);
    document.documentElement.style.setProperty('--third-font-color', this.parentRef.navigationComponent.defaultTheme.thirdFontColor);
    document.documentElement.style.setProperty('--main-highlight-color', this.parentRef.navigationComponent.defaultTheme.mainHighlightColor);
    document.documentElement.style.setProperty('--main-highlight-color-quarter-opacity', this.parentRef.navigationComponent.defaultTheme.mainHighlightColorQuarterOpacity);
    document.documentElement.style.setProperty('--main-link-color', this.parentRef.navigationComponent.defaultTheme.linkColor);
    document.documentElement.style.setProperty('--main-font-size', `${this.parentRef.navigationComponent.defaultTheme.fontSize}px`);
    document.documentElement.style.setProperty('--main-font-family', this.parentRef.navigationComponent.defaultTheme.fontFamily);
    this.themeNameInput.nativeElement.value = this.parentRef.navigationComponent.defaultTheme.name;

    this.attachedFiles = [];
    this.mediaSelector.selectedFiles = [];
    this.themeNameInput.nativeElement.value = "Default";
    this.backgroundColor.nativeElement.value = this.parentRef.navigationComponent.defaultTheme.backgroundColor;
    this.componentBackgroundColor.nativeElement.value = this.parentRef.navigationComponent.defaultTheme.componentBackgroundColor;
    this.secondaryComponentBackgroundColor.nativeElement.value = this.parentRef.navigationComponent.defaultTheme.secondaryComponentBackgroundColor;
    this.fontColor.nativeElement.value = this.parentRef.navigationComponent.defaultTheme.fontColor;
    this.secondaryFontColor.nativeElement.value = this.parentRef.navigationComponent.defaultTheme.secondaryFontColor; 
    this.mainHighlightColor.nativeElement.value = this.parentRef.navigationComponent.defaultTheme.mainHighlightColor;
    this.mainHighlightColorQuarterOpacity.nativeElement.value = this.parentRef.navigationComponent.defaultTheme.mainHighlightColorQuarterOpacity;
    this.fontSize.nativeElement.value = this.parentRef.navigationComponent.defaultTheme.fontSize; 

    const thirdFontColorHex = this.getHexFromColorName(this.parentRef.navigationComponent.defaultTheme.thirdFontColor);
    this.thirdFontColor.nativeElement.value = thirdFontColorHex;

    const linkHex = this.getHexFromColorName(this.parentRef.navigationComponent.defaultTheme.linkColor); 
    this.linkColor.nativeElement.value = linkHex;


    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      const user = this.parentRef?.user;
      if (user && user.id && updateServer) { 
        this.userService.deleteUserSelectedTheme(user.id).then(res => {
          if (res) {
            this.parentRef?.showNotification(res.message);
          }
        });
      }
    }, 500);
  }
  getHexFromColorName(color: string) {
    if (color && !color.startsWith("#")) {
      const ctx = document.createElement("canvas").getContext("2d");
      if (ctx) {
        ctx.fillStyle = color;
        return ctx.fillStyle; // This will return the hex equivalent of a named color
      }
    }
    return '';
  }
  getDirectoryName(file: FileEntry): string {
    const parent = this.parentRef;
    if (parent) {
      return parent?.getDirectoryName(file);
    } else return '.';
  }

  onThemeChange(event: any): void {
    const selectedId = event.target.value; 
    this.changeThemeById(selectedId, event.target.id);

  }

  changeThemeById(selectedId: number, targetId?: string) { 
    let selectedTheme = this.myThemes?.find(theme => theme.id == selectedId);
    if (!selectedTheme) {
      selectedTheme = this.allThemes?.find(theme => theme.id == selectedId);
    }
    this.userSelectedTheme = selectedTheme;
    if (!selectedTheme) {
      this.restoreDefaultSettings(false);
      return
    };

    if (targetId == "myThemesDropdown" && document.getElementById("allThemesDropdown")) {
      (document.getElementById("allThemesDropdown") as HTMLSelectElement).selectedIndex = 0;
    } else if (targetId == "allThemesDropdown" && document.getElementById("myThemesDropdown")) {
      (document.getElementById("myThemesDropdown") as HTMLSelectElement).selectedIndex = 0;
    }

    const search = this.themeSearchInput.nativeElement.value;
    if (search) {
      this.userService.getAllThemes().then(res => {
        if (res) {
          this.allThemes = res;
        } else {
          this.allThemes = [];
        }
      });

    }
    this.themeSearchInput.nativeElement.value = '';
    this.themeNameInput.nativeElement.value = selectedTheme.name ?? '';
    this.isSearching = false;

    // Apply all theme properties
    this.updateCSS('--main-bg-color', undefined, selectedTheme.backgroundColor);
    this.updateCSS('--component-background-color', undefined, selectedTheme.componentBackgroundColor);
    this.updateCSS('--secondary-component-background-color', undefined, selectedTheme.secondaryComponentBackgroundColor);
    this.updateCSS('--main-font-color', undefined, selectedTheme.fontColor);
    this.updateCSS('--secondary-font-color', undefined, selectedTheme.secondaryFontColor);
    this.updateCSS('--third-font-color', undefined, selectedTheme.thirdFontColor);
    this.updateCSS('--main-highlight-color', undefined, selectedTheme.mainHighlightColor);
    this.updateCSS('--main-highlight-color-quarter-opacity', undefined, selectedTheme.mainHighlightColorQuarterOpacity);
    this.updateCSS('--main-link-color', undefined, selectedTheme.linkColor);
    this.updateCSS('--main-font-size', undefined, `${selectedTheme.fontSize}px`);
    this.updateCSS('--main-font-family', undefined, selectedTheme.fontFamily);

    // Handle background image
    if (selectedTheme.backgroundImage) {
      const requesterId = this.parentRef?.user?.id;
      this.fileService.getFileEntryById(selectedTheme.backgroundImage, requesterId).then(res => {
        if (res) {
          this.selectBackgroundImage(res);
          const directLink = `https://bughosted.com/assets/Uploads/${(this.getDirectoryName(res) != '.' ? this.getDirectoryName(res) : '')}${res.fileName}`;
          this.updateCSS('--main-background-image-url', undefined, directLink);
          setTimeout(() => {
            document.body.style.backgroundImage = `url(${directLink})`;
          }, 10);
        }
      });
    } else {
      this.updateCSS('--main-background-image-url', undefined, '');
      this.attachedFiles = [];
      this.mediaSelector.selectedFiles = [];
      setTimeout(() => {
        document.body.style.backgroundImage = ``;
      }, 10);
    }
    setTimeout(() => {
      this.warnUserToSave = (this.userSelectedTheme?.id !== this.originalThemeId);   
    }, 50); // timeout to make sure this is done after updateCSS. 
  }
  openFontFamily() {
    this.parentRef?.showOverlay();
    this.fontFamilyExpanded = true;
  }
  closeFontFamily() {
    this.parentRef?.closeOverlay();
    this.fontFamilyExpanded = false;
  }

  themeSearch() {
    const search = this.themeSearchInput.nativeElement.value;
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => { 
      if (search) {
        this.userService.getAllThemes(search).then((res: any)=> {
          if (res && !res.message) { 
            this.allThemes = res;
          } else {
            if (res.message) {
              this.parentRef?.showNotification(res.message);
            }
            this.allThemes = [];
          }
        });
        this.isSearching = true;
      }
      else {
        this.userService.getAllThemes('').then(res => {
          if (res && !res.message) {
            this.allThemes = res;
          } else {
            if (res.message) {
              this.parentRef?.showNotification(res.message);
            }
            this.allThemes = [];
          }
        });
        this.isSearching = false;
      }
    }, 500);  
  }

  private replenishBackroundImageSelection(res: any, blockSavePrompt = false) {
    if (res.backgroundImage) {
      const requesterId = this.parentRef?.user?.id;
      this.fileService.getFileEntryById(res.backgroundImage, requesterId).then(feRes => {
        if (feRes) {
          this.selectBackgroundImage(feRes, blockSavePrompt);
        }
      });
    }
  }

  private selectBackgroundImage(feRes: FileEntry, blockSavePrompt: boolean = false) { 
    this.attachedFiles = [];
    this.mediaSelector.selectedFiles = [];
    this.mediaSelector.selectFile(feRes);
    if (blockSavePrompt) {
      setTimeout(() => {
        this.warnUserToSave = false;
      }, 1000);
    }
    setTimeout(() => {
      document.getElementById("closeOverlay")?.click();
    }, 5);
  }
}
