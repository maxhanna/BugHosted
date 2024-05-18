import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { FileService } from '../../services/file.service';

@Component({
  selector: 'app-game',
  templateUrl: './game.component.html',
  styleUrl: './game.component.css'
})
export class GameComponent extends ChildComponent implements OnInit {
  
  constructor(private fileService: FileService) {
    super();
  } 

  async ngOnInit() {
  }
}
