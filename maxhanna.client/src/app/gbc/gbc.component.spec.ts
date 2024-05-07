import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GbcComponent } from './gbc.component';

describe('GbcComponent', () => {
  let component: GbcComponent;
  let fixture: ComponentFixture<GbcComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [GbcComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(GbcComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
