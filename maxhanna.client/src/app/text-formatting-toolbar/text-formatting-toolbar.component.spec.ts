import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TextFormattingToolbarComponent } from './text-formatting-toolbar.component';

describe('TextFormattingToolbarComponent', () => {
  let component: TextFormattingToolbarComponent;
  let fixture: ComponentFixture<TextFormattingToolbarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TextFormattingToolbarComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TextFormattingToolbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
