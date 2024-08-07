import { Component, ElementRef, EventEmitter, Output, ViewChild } from '@angular/core';

@Component({
  selector: 'app-modal',
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.css'
})
export class ModalComponent {
  @Output() close = new EventEmitter<void>();
  @ViewChild('modalBody') modalBody!: ElementRef<HTMLDivElement>;

  setModalBody(msg: any) {
    console.log("setting modal body");
    console.log(msg);
    this.modalBody.nativeElement.innerHTML = msg;
  }
  closeModal() {
    this.close.emit();
  }
}
