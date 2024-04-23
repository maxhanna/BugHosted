import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MiningRigsComponent } from './mining-rigs.component';

describe('MiningRigsComponent', () => {
  let component: MiningRigsComponent;
  let fixture: ComponentFixture<MiningRigsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [MiningRigsComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(MiningRigsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
