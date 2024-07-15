import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Contact } from '../../services/datacontracts/user/contact';
import { ContactService } from '../../services/contact.service';

@Component({
  selector: 'app-contacts',
  templateUrl: './contacts.component.html',
  styleUrl: './contacts.component.css'
})
export class ContactsComponent extends ChildComponent implements OnInit {
  contacts: Contact[] = [];
  selectedContact: Contact | undefined;
  showNewContactForm: boolean = false;
  @ViewChild('name') name!: ElementRef<HTMLInputElement>;
  @ViewChild('phone') phone!: ElementRef<HTMLInputElement>;
  @ViewChild('email') email!: ElementRef<HTMLInputElement>;
  @ViewChild('birthday') birthday!: ElementRef<HTMLInputElement>;
  @ViewChild('notes') notes!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('newContactName') newContactName!: ElementRef<HTMLInputElement>;
  @ViewChild('newContactPhone') newContactPhone!: ElementRef<HTMLInputElement>;
  @ViewChild('newContactBirthday') newContactBirthday!: ElementRef<HTMLInputElement>;
  @ViewChild('newContactNotes') newContactNotes!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('newContactEmail') newContactEmail!: ElementRef<HTMLInputElement>;

  constructor(private contactService: ContactService) { super(); }

  ngOnInit() {
    this.fetchContacts();
  }

  async fetchContacts() {
    try {
      var res = await this.contactService.getContacts(this.parentRef?.user!);
      this.contacts = res!;
    } catch (error: any) {
      console.error('Error fetching contacts:', error);
    }
  }

  async addNewContact() {
    const name = this.newContactName.nativeElement.value;
    if (!name) { return alert("Contact must have a name."); }

    var tmpContact = new Contact();
    tmpContact.name = name;
    tmpContact.phone = this.newContactPhone.nativeElement.value;
    var jsDate = this.GetJsDate(this.newContactBirthday.nativeElement.value);
    tmpContact.birthday = jsDate;
    tmpContact.notes = this.newContactNotes.nativeElement.value;
    tmpContact.email = this.newContactEmail.nativeElement.value;

    //const headers = { 'Content-Type': 'application/json' };
    try {
      await this.contactService.createContact(this.parentRef?.user!, tmpContact);
      //await this.promiseWrapper(lastValueFrom(this.http.post(`/contact/`, body, { headers })));
      this.contacts.push(tmpContact);
      this.showNewContactForm = false;
    } catch (error) {
      console.error('Error adding new contact:', error);
    }
  }

  async saveContact() {
    const name = this.name.nativeElement.value;
    if (!name) { return alert("Name cannot be empty!"); }

    if (this.selectedContact) {
      this.selectedContact.name = name;
      this.selectedContact.email = this.email.nativeElement.value != '' ? this.email.nativeElement.value : null;
      this.selectedContact.notes = this.notes.nativeElement.value != '' ? this.notes.nativeElement.value : null;
      this.selectedContact.phone = this.phone.nativeElement.value != '' ? this.phone.nativeElement.value : null;
      if (this.birthday.nativeElement.value != '') {
        var jsDate = this.GetJsDate(this.birthday.nativeElement.value);
        this.selectedContact.birthday = jsDate;
      } else {
        this.selectedContact.birthday = null;
      }

      //const headers = { 'Content-Type': 'application/json' };
      //const body = JSON.stringify(this.selectedContact);
      await this.contactService.updateContact(this.parentRef?.user!, this.selectedContact);
      //await this.promiseWrapper(lastValueFrom(this.http.put(`/contact/${this.selectedContact.id}`, body, { headers })));

      this.selectedContact = undefined;
    }
  }
  async deleteContact(id: number) {
    await this.contactService.deleteContact(this.parentRef?.user!, id);
    //await this.promiseWrapper(lastValueFrom(this.http.delete(`/contact/${id}`)));
    this.contacts = this.contacts.filter(x => x.id != id);
  }
  formatDate(date: Date | undefined | null): string | undefined {
    if (!date) return undefined;
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) return undefined;
    const formattedDate = parsedDate.toISOString().split('T')[0];
    return formattedDate;
  }
  private GetJsDate(value: string) {
    var dateParts = value.split("-");
    var jsDate = new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2].slice(0, 2)));
    return jsDate;
  }
}
