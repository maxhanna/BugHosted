import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NexusBasesComponent } from './nexus-bases.component';

describe('NexusBasesComponent', () => {
  let component: NexusBasesComponent;
  let fixture: ComponentFixture<NexusBasesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NexusBasesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NexusBasesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
