import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NexusReportsComponent } from './nexus-reports.component';

describe('NexusReportsComponent', () => {
  let component: NexusReportsComponent;
  let fixture: ComponentFixture<NexusReportsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NexusReportsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NexusReportsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
