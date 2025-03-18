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
    if (this.parentRef && this.parentRef.user) {
      try {
        let res = await this.contactService.getContacts(this.parentRef.user);
        this.contacts = res!;
      } catch (error: any) {
        console.error('Error fetching contacts:', error);
      }
    }
  }

  async addNewContact() {
    const name = this.newContactName.nativeElement.value;
    if (!name) { return alert("Contact must have a name."); }

    let tmpContact = new Contact();
    tmpContact.name = name;
    tmpContact.phone = this.newContactPhone.nativeElement.value;
    let jsDate = this.GetJsDate(this.newContactBirthday.nativeElement.value);
    tmpContact.birthday = jsDate;
    tmpContact.notes = this.newContactNotes.nativeElement.value;
    tmpContact.email = this.newContactEmail.nativeElement.value;

    try {
      await this.contactService.createContact(this.parentRef?.user!, tmpContact);
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
      await this.contactService.updateContact(this.parentRef?.user!, this.selectedContact);

      this.selectedContact = undefined;
    }
  }
  async deleteContact(id: number) {
    await this.contactService.deleteContact(this.parentRef?.user!, id);
    this.contacts = this.contacts.filter(x => x.id != id);
  }
  formatDate(date: Date | undefined | null): string | undefined {
    if (!date) return undefined;
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) return undefined;
    const formattedDate = parsedDate.toISOString().split('T')[0];
    return formattedDate;
  }
  selectContact(contact: Contact) {
    if (this.selectedContact && this.selectedContact == contact) {
      this.selectedContact = undefined;
    } else {
      this.selectedContact = contact;
    } 
    setTimeout(() => {
      const el = document.getElementsByClassName("editContactForm")[0] as HTMLElement;
      if (el && !this.isElementInViewport(el)) { 
        document.getElementsByClassName("editContactForm")[0].scrollIntoView({ behavior: "smooth" });
      }
    }, 50);
  }
  getContactEmail(contact: Contact) {
    return contact.user?.about?.email ? contact.user.about.email : contact.email;
  }
  getContactNotes(contact: Contact) {
    return contact.user?.about?.description ? contact.user.about.description : contact.notes;
  }
  getContactBirthday(contact: Contact) {
    return contact.user?.about?.birthday ? contact.user.about.birthday : contact.birthday ? contact.birthday : undefined;
  }
  getContactPhone(contact: Contact) {
    return contact.user?.about?.phone ? contact.user.about.phone : contact.phone;
  }
  private GetJsDate(value: string) {
    let dateParts = value.split("-");
    let jsDate = new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2].slice(0, 2)));
    return jsDate;
  }
}
