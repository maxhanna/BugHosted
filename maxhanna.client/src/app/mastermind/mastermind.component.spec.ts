import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MastermindComponent } from './mastermind.component';
import { TitleBarComponent } from '../title-bar/title-bar.component';
import { ShareButtonComponent } from '../share-button/share-button.component';
import { MastermindScoresComponent } from '../mastermind-scores/mastermind-scores.component';

beforeEach(async () => {
  await TestBed.configureTestingModule({
    declarations: [
      MastermindComponent,
      TitleBarComponent,
      ShareButtonComponent,
      MastermindScoresComponent,
    ]
  }).compileComponents();
});

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
