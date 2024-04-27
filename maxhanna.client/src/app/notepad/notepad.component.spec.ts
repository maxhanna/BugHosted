import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NotepadComponent } from './notepad.component';

describe('NotepadComponent', () => {
  let component: NotepadComponent;
  let fixture: ComponentFixture<NotepadComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NotepadComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(NotepadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
