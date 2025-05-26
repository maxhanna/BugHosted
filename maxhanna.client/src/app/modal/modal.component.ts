import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';

@Component({
    selector: 'app-modal',
    templateUrl: './modal.component.html',
    styleUrl: './modal.component.css',
    standalone: false
})
export class ModalComponent {
  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<void>();
  @Input() isCloseButtonVisible: boolean = false;
  @Input() modalTitle: string = "";
  @Input() isModal: boolean = true;
  @Input() hasConfirmButton: boolean = false;
  
  @ViewChild('modalBody') modalBody!: ElementRef<HTMLDivElement>;

  setModalBody(msg: any) {  
    this.modalBody.nativeElement.innerHTML = msg;
  }
  closeModal() { 
    this.close.emit();
  }
  confirmAction() { 
    this.confirm.emit();
  }
  setModalFont(fontFamily?: string) {
    if (this.modalBody) {
      // If no font is provided, reset to the default or initial font
      if (!fontFamily) {
        this.modalBody.nativeElement.style.removeProperty('font-family');
      } else {
        this.modalBody.nativeElement.style.fontFamily = fontFamily;
      }
    }
  }
  removeCloseButton() {
    this.isCloseButtonVisible = false;
  }
}
