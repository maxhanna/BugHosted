import { Component, ElementRef, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { HttpClient } from '@angular/common/http';
import { Note } from '../note';
import { lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-notepad',
  templateUrl: './notepad.component.html',
  styleUrl: './notepad.component.css'
})
export class NotepadComponent extends ChildComponent {
  notes: Array<Note> = [];
  @ViewChild('noteInput') noteInput!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('noteId') noteId!: ElementRef<HTMLInputElement>;
  @ViewChild('noteAddButton') noteAddButton!: ElementRef<HTMLInputElement>;
  @ViewChild('newNoteButton') newNoteButton!: ElementRef<HTMLInputElement>;
  @ViewChild('deleteNoteButton') deleteNoteButton!: ElementRef<HTMLInputElement>;
  noteInputValue: string = ''; // Initialize with an empty string

  constructor(private http: HttpClient) {
    super();
  }
  async ngOnInit() {
    await this.getNotepad();
    this.clearInputs();
  }
  clearInputs() {
    if (!this.noteInput) { return; }
    this.noteInput.nativeElement.value = "";
    this.noteId.nativeElement.value = "";
    this.newNoteButton.nativeElement.style.display = "none";
    this.deleteNoteButton.nativeElement.style.display = "none";
  }
  handleNoteInputChange() {
    console.log("handleNoteInputChange");
    this.noteInputValue = this.noteInput.nativeElement.value.trim();
  }
  async noteOnChange() { 
  }
  async getNote(id: number) {
    if (!id) { return; }
    try {
      await this.promiseWrapper(await lastValueFrom(await this.http.get<Note>(`/notepad/${id}`, {}))
        .then(res => {
          console.log(res);
          if (this.noteInput)
            this.noteInput.nativeElement.value = res.note!;
          if (this.noteId)
            this.noteId.nativeElement.value = id + "";

          this.newNoteButton.nativeElement.style.display = "inline-block";
          this.deleteNoteButton.nativeElement.style.display = "inline-block";
        }));
    } catch (error) {
      console.error(`Error fetching notepad entry (${id}): ${error}`);
    }
  }
  async getNotepad() {
    try {
      await this.promiseWrapper(await lastValueFrom(await this.http.get<Array<Note>>('/notepad', {})).then(res => this.notes = res));
    } catch (error) {
      console.error("Error fetching notepad entries:", error);
    }
  }
  async addNote() {
    const text = this.noteInput.nativeElement.value;
    if (!text || text.trim() == "") {
      return alert("Note cannot be empty!");
    }

    const headers = { 'Content-Type': 'application/json' };
    const body = JSON.stringify(text);
    try {
      if (this.noteId.nativeElement.value != "") {
        await this.promiseWrapper(await lastValueFrom(this.http.post(`/notepad/update/${this.noteId.nativeElement.value}`, body, { headers })));
      } else {
        await this.promiseWrapper(await lastValueFrom(this.http.post(`/notepad/`, body, { headers })));
      }
    } catch (e) {
      console.error(e);
    }
    this.ngOnInit();
  }
  async deleteNote() {
    if (!confirm("Confirm note deletion.")) { return; }
    try {
      const id = this.noteId.nativeElement.value;
      await this.promiseWrapper(await lastValueFrom(this.http.delete(`/notepad/${id}`)));
      this.notes = this.notes.filter(e => e.id+"" != id);
      this.clearInputs();
    } catch (error) {
      console.error(error);
    }
  }
}
