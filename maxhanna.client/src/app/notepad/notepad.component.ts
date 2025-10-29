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
  notes: Array<Note> = [];
  isCarouselPopped: boolean = false;
  users: User[] = [];
  selectedNote?: Note;
  splitNoteOwnershipUsers: User[] = [];
  // Polling timer id for shared note refresh
  private sharedNotePollTimer?: any;
  // Poll interval in ms
  private readonly SHARED_NOTE_POLL_INTERVAL = 5000;
  // Timestamp when the selected note was last auto-synced from server
  lastSyncedAt?: Date; 
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
    // stop polling when component is destroyed
    this.stopSharedNotePolling();
    this.parentRef?.removeResizeListener();
  }
  clearInputs() {
    if (!this.noteInput) { return; }
    this.noteInput.nativeElement.value = "";
    this.noteId.nativeElement.value = "";
    this.newNoteButton.nativeElement.style.display = "none";
    this.shareNoteButton.nativeElement.style.display = "none";
    this.deleteNoteButton.nativeElement.style.display = "none";
    // stop any polling when inputs are cleared
    this.stopSharedNotePolling();
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
  closeCarouselPopup() {
    this.isCarouselPopped = false; 
    this.parentRef?.closeOverlay(); 
  }
  async shareNote(withUser?: User) {
    if (!withUser?.id || !this.parentRef?.user?.id) {
      this.isPanelExpanded = false;
      this.parentRef?.closeOverlay();
      return;
    }
    if (confirm(`Share note with ${withUser.username}?`)) {
      try {
        // await the share call in case it returns a promise
        await this.notepadService.shareNote(this.parentRef?.user?.id, withUser.id, parseInt(this.noteId.nativeElement.value));
        // update local ownership string so UI updates immediately
        if (this.selectedNote) {
          const ownerStr = this.selectedNote.ownership ?? '';
          const ids = ownerStr.split(',').map(s => s.trim()).filter(x => x !== '');
          const idStr = (withUser.id ?? 0).toString();
          if (!ids.includes(idStr)) {
            ids.push(idStr);
            this.selectedNote.ownership = ids.join(',');
            // refresh displayed split ownership users
            this.splitNoteOwnership();
          }
        }
        this.isPanelExpanded = false;
        this.parentRef?.showNotification(`Shared note with ${withUser.username}.`);
        if (this.parentRef?.user) {
          this.notificationService.createNotifications(
            { fromUserId: this.parentRef.user?.id ?? 0, toUserIds: [withUser.id ?? 0], message: `${this.parentRef.user.username} Shared a note with you.` });      
        }
      } catch (err) {
        console.error('Error sharing note:', err);
        this.parentRef?.showNotification('Failed to share note.');
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
      this.lastSyncedAt = undefined;
      this.stopSharedNotePolling();
      const ownership = this.selectedNote?.ownership ?? '';
      if (ownership.includes(",")) {
        this.startSharedNotePolling();
      } 
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

  // Return true if the current user is the original owner (first id in ownership list)
  isOriginalOwner(): boolean {
    if (!this.selectedNote || !this.parentRef?.user?.id) { return false; }
    const ownership = (this.selectedNote.ownership ?? '').split(',').map(s => s.trim()).filter(x => x !== '');
    if (ownership.length === 0) { return false; }
    return parseInt(ownership[0]) === this.parentRef.user.id;
  }

  async unshareUser(userId?: number) {
    // accept possibly-undefined userId (template may pass user.id which can be undefined)
    if (!userId) { return; }
    if (!this.selectedNote || !this.parentRef?.user?.id) { return; }
    if (!confirm('Unshare this note with selected user?')) { return; }
    try {
      const res = await this.notepadService.unshareNote(this.parentRef.user.id, userId, this.selectedNote.id!);
      // assume success if res is truthy
      if (res) {
        // remove the user id from the ownership string locally
        const ownership = (this.selectedNote.ownership ?? '').split(',').map(s => s.trim()).filter(x => x !== '' && parseInt(x) !== userId);
        this.selectedNote.ownership = ownership.join(',');
        this.splitNoteOwnership();
        this.parentRef?.showNotification('Note unshared.');
      } else {
        this.parentRef?.showNotification('Failed to unshare note.');
      }
    } catch (err) {
      console.error('Error unsharing note:', err);
      this.parentRef?.showNotification('Failed to unshare note.');
    }
  }

  // Polling helpers for shared notes
  private startSharedNotePolling() {
    // ensure any existing timer is cleared first
    this.stopSharedNotePolling();
    this.sharedNotePollTimer = setInterval(async () => {
      await this.fetchLatestSelectedNote();
    }, this.SHARED_NOTE_POLL_INTERVAL);
  }

  private stopSharedNotePolling() {
    if (this.sharedNotePollTimer) {
      clearInterval(this.sharedNotePollTimer);
      this.sharedNotePollTimer = undefined;
    }
  }

  private async fetchLatestSelectedNote() {
    try {
      if (!this.selectedNote || !this.parentRef?.user?.id) { return; }
      await this.notepadService.getNote(this.parentRef.user.id, this.selectedNote.id!); 
      this.setLastSynced(new Date());
    } catch (error) {
      console.error('Error polling shared note:', error);
    }
  }

  private setLastSynced(d: Date) {
    this.lastSyncedAt = d; 
  }
}
