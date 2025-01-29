import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HostAiComponent } from './host-ai.component';

describe('HostAiComponent', () => {
  let component: HostAiComponent;
  let fixture: ComponentFixture<HostAiComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HostAiComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HostAiComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
