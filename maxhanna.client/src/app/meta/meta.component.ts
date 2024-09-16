import { Component, OnInit } from '@angular/core';
import { ChildComponent } from '../child.component';

@Component({
  selector: 'app-meta',
  templateUrl: './meta.component.html',
  styleUrl: './meta.component.css'
})
export class MetaComponent extends ChildComponent implements OnInit {
  constructor() { super(); }

  ngOnInit() {

  }
}
