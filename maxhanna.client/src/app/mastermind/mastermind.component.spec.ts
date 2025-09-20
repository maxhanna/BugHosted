import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MastermindComponent } from './mastermind.component';

describe('MastermindComponent', () => {
  let component: MastermindComponent;
  let fixture: ComponentFixture<MastermindComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [MastermindComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MastermindComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
