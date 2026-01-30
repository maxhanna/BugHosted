import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { Contact } from '../../services/datacontracts/user/contact';
import { ContactService } from '../../services/contact.service';
import { UserService } from '../../services/user.service';
import { User } from '../../services/datacontracts/user/user';

@Component({
    selector: 'app-contacts',
    templateUrl: './contacts.component.html',
    styleUrl: './contacts.component.css',
    standalone: false
})
export class ContactsComponent extends ChildComponent implements OnInit {
  contacts: Contact[] = [];
  selectedContact: Contact | undefined;
  showNewContactForm: boolean = false;
  usersList: User[] = [];
  selectedImportUserId?: number;
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

  constructor(private contactService: ContactService, private userService: UserService) { super(); }

  ngOnInit() {
    this.fetchContacts();
    this.fetchUsersForImport();
  }

  async fetchContacts() {
    if (this.parentRef && this.parentRef.user?.id) {
      try {
        let res = await this.contactService.getContacts(this.parentRef.user.id);
        this.contacts = res!;
      } catch (error: any) {
        console.error('Error fetching contacts:', error);
      }
    }
  }

  async addNewContact() {
    const userId = this.parentRef?.user?.id;
    if (!userId || userId == 0) { return alert("You must be logged in to add a contact."); }
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
      await this.contactService.createContact(userId, tmpContact);
      this.contacts.push(tmpContact);
      this.showNewContactForm = false;
    } catch (error) {
      console.error('Error adding new contact:', error);
    }
  }

  async fetchUsersForImport() {
    if (this.parentRef && this.parentRef.user?.id) {
      try {
        const res = await this.userService.getAllUsers(this.parentRef.user.id);
        this.usersList = res ?? [];
      } catch (error: any) {
        console.error('Error fetching users for import:', error);
      }
    }
  }

  async importSelectedUser() {
    if (!this.selectedImportUserId) return;
    const user = this.usersList.find(u => u.id === this.selectedImportUserId);
    if (!user) return;

    // show the new contact form and populate fields from selected user
    this.showNewContactForm = true;
    setTimeout(() => {
      if (this.newContactName) this.newContactName.nativeElement.value = user.username ?? '';
      if (this.newContactEmail) this.newContactEmail.nativeElement.value = user.about?.email ?? '';
      if (this.newContactPhone) this.newContactPhone.nativeElement.value = user.about?.phone ?? '';
      if (this.newContactBirthday) this.newContactBirthday.nativeElement.value = this.formatDate(user.about?.birthday ?? undefined) ?? '';
      if (this.newContactNotes) this.newContactNotes.nativeElement.value = user.about?.description ?? '';
    }, 50);
  }

  async saveContact() {
    const userId = this.parentRef?.user?.id;
    if (!userId || userId == 0) { return alert("You must be logged in to add a contact."); }
    const name = this.name.nativeElement.value;
    if (!name) { return alert("Name cannot be empty!"); }

    this.startLoading();
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
      await this.contactService.updateContact(userId, this.selectedContact);

      this.selectedContact = undefined;
      this.parentRef?.closeOverlay();
    }
    this.stopLoading();
  }
  async deleteContact(id: number) {
    const userId = this.parentRef?.user?.id;
    if (!userId || userId == 0) { return alert("You must be logged in to delete a contact."); }
    this.startLoading();
    await this.contactService.deleteContact(userId, id);
    this.contacts = this.contacts.filter(x => x.id != id);
    this.stopLoading();
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
      this.parentRef?.closeOverlay();
    } else {
      this.selectedContact = contact;
      this.parentRef?.showOverlay();
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
