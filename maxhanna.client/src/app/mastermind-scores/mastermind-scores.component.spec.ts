import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MastermindScoresComponent } from './mastermind-scores.component';

describe('MastermindScoresComponent', () => {
  let component: MastermindScoresComponent;
  let fixture: ComponentFixture<MastermindScoresComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [MastermindScoresComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MastermindScoresComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
