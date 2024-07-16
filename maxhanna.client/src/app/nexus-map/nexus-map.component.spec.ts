import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NexusMapComponent } from './nexus-map.component';

describe('NexusMapComponent', () => {
  let component: NexusMapComponent;
  let fixture: ComponentFixture<NexusMapComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NexusMapComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NexusMapComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
