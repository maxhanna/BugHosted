import { Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Note } from '../../services/datacontracts/note';
import { NotepadService } from '../../services/notepad.service'; 
import { UserService } from '../../services/user.service';
import { User } from '../../services/datacontracts/user/user';
import { NotificationService } from '../../services/notification.service';

@Component({
    selector: 'app-notepad',
    templateUrl: './notepad.component.html',
    styleUrl: './notepad.component.css',
    standalone: false
})
export class NotepadComponent extends ChildComponent implements OnInit, OnDestroy {
  notes: Array<Note> = [];
  @ViewChild('noteInput') noteInput!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('noteId') noteId!: ElementRef<HTMLInputElement>;
  @ViewChild('noteAddButton') noteAddButton!: ElementRef<HTMLInputElement>;
  @ViewChild('newNoteButton') newNoteButton!: ElementRef<HTMLInputElement>;
  @ViewChild('shareNoteButton') shareNoteButton!: ElementRef<HTMLInputElement>;
  @ViewChild('deleteNoteButton') deleteNoteButton!: ElementRef<HTMLInputElement>;
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
   
  @Input() inputtedSearch?: string;

  noteInputValue: string = ''; // Initialize with an empty string
  isPanelExpanded: boolean = false;
  // whether the notes carousel is popped out as a popup
  isCarouselPopped: boolean = false;
  users: User[] = [];
  selectedNote?: Note;
  splitNoteOwnershipUsers: User[] = [];
  constructor(private notepadService: NotepadService, private userService: UserService, private notificationService: NotificationService) {
    super();
  }
  async ngOnInit() {
    this.parentRef?.addResizeListener();
    await this.getNotepad();
    if (this.inputtedSearch) {
      this.search();
    }
    this.clearInputs();
  }
  ngOnDestroy() { 
    this.parentRef?.removeResizeListener();
  }
  clearInputs() {
    if (!this.noteInput) { return; }
    this.noteInput.nativeElement.value = "";
    this.noteId.nativeElement.value = "";
    this.newNoteButton.nativeElement.style.display = "none";
    this.shareNoteButton.nativeElement.style.display = "none";
    this.deleteNoteButton.nativeElement.style.display = "none";
  }
  handleNoteInputChange() {
    this.noteAddButton.nativeElement.disabled = false;
    this.noteInputValue = this.noteInput.nativeElement.value.trim();
  }
  async getUsers() {
    this.users = await this.userService.getAllUsers(this.parentRef?.user?.id);
  }
  shareNoteButtonClick() {
    this.isPanelExpanded = !this.isPanelExpanded;
    this.parentRef?.showOverlay();
    this.getUsers(); 
  }

  toggleCarouselPopup() {
    this.isCarouselPopped = !this.isCarouselPopped;
    try {
      if (this.isCarouselPopped) {
        this.parentRef?.showOverlay();
      } else {
        this.parentRef?.closeOverlay();
      }
    } catch { }
  }
  async shareNote(withUser?: User) {
    if (!withUser?.id || !this.parentRef?.user?.id) {
      this.isPanelExpanded = false;
      this.parentRef?.closeOverlay();
      return;
    }
    if (confirm(`Share note with ${withUser.username}?`)) {
      this.notepadService.shareNote(this.parentRef?.user?.id, withUser.id, parseInt(this.noteId.nativeElement.value));
      this.isPanelExpanded = false;
      this.parentRef?.showNotification(`Shared note with ${withUser.username}.`);
      if (this.parentRef?.user) {
        this.notificationService.createNotifications(
          { fromUserId: this.parentRef.user?.id ?? 0, toUserIds: [withUser.id ?? 0], message: `${this.parentRef.user.username} Shared a note with you.` });      
      }     
    }
  }
  async getNote(id: number) {
    if (!id || !this.parentRef?.user?.id) { return; }
    try {
      const res = await this.notepadService.getNote(this.parentRef?.user.id, id);
      if (this.noteInput) {
        this.noteInput.nativeElement.value = res.note!;
      }
      if (this.noteId) {
        this.noteId.nativeElement.value = id + "";
      }
      this.isPanelExpanded = false;
      this.selectedNote = res;
      this.splitNoteOwnership(); 

      this.newNoteButton.nativeElement.style.display = "inline-block";
      this.shareNoteButton.nativeElement.style.display = "inline-block";
      this.deleteNoteButton.nativeElement.style.display = "inline-block";
       
    } catch (error) {
      console.error(`Error fetching notepad entry (${id}): ${error}`);
    }
  }
  async getNotepad() {
    if (!this.parentRef?.user?.id) { return alert("You must be logged in to save notes."); }
    try {
      let search = this.inputtedSearch;
      if (!search && this.searchInput && this.searchInput.nativeElement) {
        search = this.searchInput.nativeElement.value;
      }
      this.notes = await this.notepadService.getNotes(this.parentRef.user.id, search);
    } catch (error) {
      console.error("Error fetching notepad entries:", error);
    }
    if (this.inputtedSearch) {
      setTimeout(() => {
        document.getElementsByClassName("notesCarousel")[0].getElementsByTagName("label")[0].click();
        this.search();
      }, 50);
      this.inputtedSearch = undefined;
    }
  }
  async addNote() {
    const text = this.noteInput.nativeElement.value;
    if (!text || text.trim() == "") {
      return alert("Note cannot be empty!");
    }

    try {
      if (this.noteId.nativeElement.value != "" && this.parentRef?.user?.id) {
        await this.notepadService.updateNote(this.parentRef.user.id, text, parseInt(this.noteId.nativeElement.value));
      } else {
        if (this.parentRef?.user?.id) {
          await this.notepadService.addNote(this.parentRef.user.id, text); 
        }
      }
    } catch (e) {
      console.error(e);
    }
    this.parentRef?.showNotification(`Note saved.`);
    this.getNotepad();
  }
  async deleteNote() {
    if (!this.parentRef?.user?.id || !confirm("Confirm note deletion.")) { return; }
    try {
      const id = this.noteId.nativeElement.value;
      await this.notepadService.deleteNote(this.parentRef.user?.id, parseInt(id));
      this.notes = this.notes.filter(e => e.id+"" != id);
      this.clearInputs();
    } catch (error) {
      console.error(error);
    }
    this.parentRef?.showNotification(`Note deleted.`);
  } 
  async search() {
    this.getNotepad();
  }
  async splitNoteOwnership() {
    const ids = this.selectedNote?.ownership?.split(',').filter(x => parseInt(x) != this.parentRef?.user?.id);
    this.splitNoteOwnershipUsers = [];
    ids?.forEach(async id => {
      await this.userService.getUserById(parseInt(id)).then((res: User) => { this.splitNoteOwnershipUsers.push(res); });
    }); 
  } 
}
