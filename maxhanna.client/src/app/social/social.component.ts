import { Component, OnInit } from '@angular/core';
import { ChildComponent } from '../child.component';

@Component({
  selector: 'app-social',
  templateUrl: './social.component.html',
  styleUrl: './social.component.css'
})
export class SocialComponent extends ChildComponent implements OnInit {
  constructor() { super(); }
  ngOnInit() { }
}
