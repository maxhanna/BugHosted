import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NexusComponent } from './nexus.component';

describe('NexusComponent', () => {
  let component: NexusComponent;
  let fixture: ComponentFixture<NexusComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NexusComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NexusComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
