import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NexusAttackScreenComponent } from './nexus-attack-screen.component';

describe('NexusAttackScreenComponent', () => {
  let component: NexusAttackScreenComponent;
  let fixture: ComponentFixture<NexusAttackScreenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NexusAttackScreenComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NexusAttackScreenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
