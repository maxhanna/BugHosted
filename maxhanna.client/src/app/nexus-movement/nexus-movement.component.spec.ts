import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NexusMovementComponent } from './nexus-movement.component';

describe('NexusMovementComponent', () => {
  let component: NexusMovementComponent;
  let fixture: ComponentFixture<NexusMovementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NexusMovementComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NexusMovementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
