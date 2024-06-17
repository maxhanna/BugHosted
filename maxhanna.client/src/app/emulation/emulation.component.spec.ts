import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EmulationComponent } from './emulation.component';

describe('EmulationComponent', () => {
  let component: EmulationComponent;
  let fixture: ComponentFixture<EmulationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [EmulationComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(EmulationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
