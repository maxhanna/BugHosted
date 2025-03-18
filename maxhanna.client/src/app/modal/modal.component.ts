import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';

@Component({
  selector: 'app-modal',
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.css'
})
export class ModalComponent {
  @Output() close = new EventEmitter<void>();
  @Input() isCloseButtonVisible: boolean = false;
  @Input() isModal: boolean = false;
  
  @ViewChild('modalBody') modalBody!: ElementRef<HTMLDivElement>;

  setModalBody(msg: any) {  
    this.modalBody.nativeElement.innerHTML = msg;
  }
  closeModal() {
    this.close.emit();
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
}
