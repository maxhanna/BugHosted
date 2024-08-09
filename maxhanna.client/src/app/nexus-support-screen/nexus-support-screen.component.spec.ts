import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NexusSupportScreenComponent } from './nexus-support-screen.component';

describe('NexusSupportScreenComponent', () => {
  let component: NexusSupportScreenComponent;
  let fixture: ComponentFixture<NexusSupportScreenComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NexusSupportScreenComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NexusSupportScreenComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
