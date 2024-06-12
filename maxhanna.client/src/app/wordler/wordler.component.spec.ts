import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WordlerComponent } from './wordler.component';

describe('WordlerComponent', () => {
  let component: WordlerComponent;
  let fixture: ComponentFixture<WordlerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [WordlerComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(WordlerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
