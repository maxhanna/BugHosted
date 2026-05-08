import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SigIntComponent } from './sig-int.component';

describe('SigIntComponent', () => {
  let component: SigIntComponent;
  let fixture: ComponentFixture<SigIntComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SigIntComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SigIntComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
