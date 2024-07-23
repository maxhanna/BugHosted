import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NexusBaseUnitsComponent } from './nexus-base-units.component';

describe('NexusBaseUnitsComponent', () => {
  let component: NexusBaseUnitsComponent;
  let fixture: ComponentFixture<NexusBaseUnitsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NexusBaseUnitsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NexusBaseUnitsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
