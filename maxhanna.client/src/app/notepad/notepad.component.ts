import { AfterViewInit, Component, ElementRef, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Note } from '../../services/datacontracts/note';
import { NotepadService } from '../../services/notepad.service'; 
import { UserService } from '../../services/user.service';
import { UserEventService } from '../../services/user-event.service';
import { User } from '../../services/datacontracts/user/user';
import { NotificationService } from '../../services/notification.service';
import { TextInputComponent } from '../text-input/text-input.component';

@Component({
    selector: 'app-notepad',
    templateUrl: './notepad.component.html',
    styleUrl: './notepad.component.css',
    standalone: false
})
export class NotepadComponent extends ChildComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('noteTextInput') noteTextInput!: TextInputComponent;
  @ViewChild('noteId') noteId!: ElementRef<HTMLInputElement>;
  private _inputListenerCleanup: (() => void) | null = null;
  @ViewChild('newNoteButton') newNoteButton!: ElementRef<HTMLInputElement>;
  @ViewChild('shareNoteButton') shareNoteButton!: ElementRef<HTMLInputElement>;
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  @ViewChild('notesCarousel') notesCarousel!: ElementRef<HTMLDivElement>;
   
  @Input() inputtedSearch?: string;

  isPanelExpanded: boolean = false;
  notes: Array<Note> = [];
  isCarouselPopped: boolean = false;
  users: User[] = [];
  selectedNote?: Note;
  splitNoteOwnershipUsers: User[] = []; 
  showAllCollaborators = false;
  readonly MAX_COLLAPSED_COLLABORATORS = 5; 
  showAutoSyncPrompt: boolean = false; 
  lastSyncedAt?: Date; 
  isEditing: boolean = false;
  currentNoteText: string = '';
  private sharedNotePollTimer?: any;  
  private loadedNote?: string; 
  private readonly SHARED_NOTE_POLL_INTERVAL = 60000; 
  constructor(private notepadService: NotepadService, private userService: UserService, private notificationService: NotificationService, private userEventService: UserEventService) {
    super();
  }
  async ngOnInit() {
    await this.getNotepad();
    if (this.inputtedSearch) {
      this.search();
    }
    this.clearInputs();
  }
  ngOnDestroy() {  
    this.stopSharedNotePolling(); 
    this._detachInputListener();
  }

  private _detachInputListener() {
    if (this._inputListenerCleanup) {
      this._inputListenerCleanup();
      this._inputListenerCleanup = null;
    }
  }
  toggleEdit() {
    this.isEditing = !this.isEditing;
    if (this.isEditing) {
      setTimeout(() => {
        if (this.noteTextInput?.textarea) {
          this.noteTextInput.textarea.value = this.currentNoteText;
          this.noteTextInput.textarea.focus();
        }
      }, 50);
    } else {
      if (this.noteTextInput?.textarea) {
        this.currentNoteText = this.noteTextInput.textarea.value;
      }
    }
  }

  async onNoteContentPosted(event: { results: any, content: any, originalContent: string }) {
    await this.addNote();
  }

  // Voice input supplement: append captured speech to the note textarea.
  onVoiceInput(text?: string) {
    if (!text) return;
    const ta = this.noteTextInput?.textarea;
    if (!ta) return;
    const separator = ta.value && !ta.value.endsWith(' ') ? ' ' : '';
    ta.value = ta.value + separator + text;
    ta.focus();
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  clearInputs() {
    if (this.noteTextInput?.textarea) {
      this.noteTextInput.textarea.value = "";
    }
    this.currentNoteText = "";
    this.noteId.nativeElement.value = "";
    this.newNoteButton.nativeElement.style.display = "none";
    this.shareNoteButton.nativeElement.style.display = "none"; 
    this.stopSharedNotePolling();
    this.isEditing = false;
  }
  ngAfterViewInit() {
    this._attachInputListener();
  }

  private _attachInputListener() {
    this._detachInputListener();
    const textarea = this.noteTextInput?.textarea;
    if (!textarea) {
      setTimeout(() => this._attachInputListener(), 200);
      return;
    }
    const handler = () => {
      this.currentNoteText = textarea.value;
    };
    textarea.addEventListener('input', handler);
    this._inputListenerCleanup = () => textarea.removeEventListener('input', handler);
  }
  async getUsers() {
    this.users = await this.userService.getAllUsers(this.parentRef?.user?.id) ?? [];
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

  onNotesWheel(event: WheelEvent) {
    try {
      // If shiftKey is held, let default horizontal scroll happen
      if (event.shiftKey) return;
      const el = this.notesCarousel?.nativeElement;
      if (!el) return;
      // Prevent vertical page scroll and translate to horizontal scroll
      event.preventDefault();
      // Use deltaY (vertical wheel) primarily; invert for natural feel
      const delta = event.deltaY || event.deltaX || 0;
      // Adjust sensitivity if needed
      const SCROLL_MULTIPLIER = 1;
      el.scrollBy({ left: delta * SCROLL_MULTIPLIER, behavior: 'auto' });
    } catch (e) {
      // swallow errors
    }
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
      this.currentNoteText = res.note ?? '';
      if (this.noteTextInput?.textarea) {
        this.noteTextInput.textarea.value = this.currentNoteText;
      }
      if (this.noteId) {
        this.noteId.nativeElement.value = id + "";
      }
      this.isEditing = false;
      this.isPanelExpanded = false;
      this.selectedNote = res; 
      this.splitNoteOwnership(); 
      this.newNoteButton.nativeElement.style.display = "inline-block";
      this.shareNoteButton.nativeElement.style.display = "inline-block";
      this.lastSyncedAt = undefined;
      this.stopSharedNotePolling();
      const ownership = this.selectedNote?.ownership ?? '';
      if (ownership.includes(",")) {
        this.startSharedNotePolling();
        this.loadedNote = res.note;
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
    const text = this.noteTextInput?.textarea?.value ?? '';
    if (!text || text.trim() === '') {
      return alert('Note cannot be empty!');
    }

    try {
      let noteId: number | undefined;
      if (this.noteId.nativeElement.value !== '' && this.parentRef?.user?.id) {
        // Update existing note
        await this.notepadService.updateNote(this.parentRef.user.id, text, parseInt(this.noteId.nativeElement.value));
        noteId = parseInt(this.noteId.nativeElement.value);
      } else if (this.parentRef?.user?.id) {
        // Create new note
        noteId = await this.notepadService.addNote(this.parentRef.user.id, text);
        if (noteId) {
          this.noteId.nativeElement.value = noteId.toString();
        }
      }
      // Record user event for saving note
      if (this.parentRef?.user?.id && noteId) {
        await this.userEventService.insertUserEvent(this.parentRef.user.id, 'notepad', 'save_note', noteId);
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
  // Number of collaborators a note is shared with (excluding the current user)
  getNoteSharedCount(note?: Note): number {
    if (!note?.ownership) { return 0; }
    const me = this.parentRef?.user?.id;
    return note.ownership.split(',')
      .map(s => s.trim())
      .filter(x => x !== '' && (!me || parseInt(x) !== me))
      .length;
  }
  async splitNoteOwnership() {
    const ids = this.selectedNote?.ownership?.split(',').filter(x => parseInt(x) != this.parentRef?.user?.id);
    this.splitNoteOwnershipUsers = [];
    this.showAllCollaborators = false;
    ids?.forEach(async id => {
      await this.userService.getUserById(parseInt(id), this.parentRef?.userCache).then((res: User | null) => { 
        if (res && res != null) {
          this.splitNoteOwnershipUsers.push(res); 
        }
      });
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
      await this.notepadService.unshareNote(this.parentRef.user.id, userId, this.selectedNote.id!);
      const ownership = (this.selectedNote.ownership ?? '').split(',').map(s => s.trim()).filter(x => x !== '' && parseInt(x) !== userId);
      this.selectedNote.ownership = ownership.join(',');
      this.splitNoteOwnership();
      this.parentRef?.showNotification('Note unshared.'); 
    } catch (err) {
      console.error('Error unsharing note:', err);
      this.parentRef?.showNotification('Failed to unshare note.');
    }
  }
 
  private startSharedNotePolling() { 
    this.stopSharedNotePolling();
    this.sharedNotePollTimer = setInterval(async () => {
      await this.attemptFetchLatestSelectedNote();
    }, this.SHARED_NOTE_POLL_INTERVAL);
  }

  private stopSharedNotePolling() {
    if (this.sharedNotePollTimer) {
      clearInterval(this.sharedNotePollTimer);
      this.sharedNotePollTimer = undefined;
    }
  }
  private async attemptFetchLatestSelectedNote() {
    const currentText = this.noteTextInput?.textarea?.value ?? this.currentNoteText;
    if (this.loadedNote != currentText) {
      this.showAutoSyncPrompt = true;
      this.parentRef?.showOverlay();  
    } else {
      await this.fetchLatestSelectedNote();
    }
  }
  private async fetchLatestSelectedNote() { 
    try {
      if (!this.selectedNote || !this.parentRef?.user?.id) { return; } 
      const res = await this.notepadService.getNote(this.parentRef?.user.id, this.selectedNote.id!);
      this.currentNoteText = res.note ?? '';
      this.loadedNote = res.note;
      if (this.noteTextInput?.textarea) {
        this.noteTextInput.textarea.value = this.currentNoteText;
      }
      this.setLastSynced(new Date());
    } catch (error) {
      console.error('Error polling shared note:', error);
    }
  }

  private setLastSynced(d: Date) {
    this.lastSyncedAt = d; 
  }
 
  
  async autoSyncSaveNow() {
    try {
      // Save current note (addNote handles create vs update)
      await this.addNote();
      // After save, refresh selected note from server to ensure canonical state
      await this.fetchLatestSelectedNote();
      this.setLastSynced(new Date());
    } catch (err) { console.error('Auto-sync save failed', err); }
    this.dismissAutoSyncPrompt();
  }

  // User chose to skip saving and let server overwrite local content
  async autoSyncDontSave() {
    try {
      await this.fetchLatestSelectedNote();
      this.setLastSynced(new Date());
    } catch (err) { console.error('Auto-sync fetch failed', err); }
    this.dismissAutoSyncPrompt();
  }

  // User cancelled the auto-sync prompt (do nothing now)
  dismissAutoSyncPrompt() {
    try { this.showAutoSyncPrompt = false; } catch { this.showAutoSyncPrompt = false; }
    try { this.parentRef?.closeOverlay(); } catch { }
  }
}
