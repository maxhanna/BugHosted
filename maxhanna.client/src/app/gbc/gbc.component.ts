import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
  
@Component({
  selector: 'app-gbc',
  templateUrl: './gbc.component.html',
  styleUrl: './gbc.component.css'
})
export class GbcComponent extends ChildComponent implements OnInit {
  @ViewChild('localFileOpen') localFileOpen!: ElementRef<HTMLInputElement>;
  constructor() { super(); }
  ngOnInit() { }
  fileChanged() { }

} 
