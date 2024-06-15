import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UpdateUserSettingsComponent } from './update-user-settings.component';

describe('UpdateUserSettingsComponent', () => {
  let component: UpdateUserSettingsComponent;
  let fixture: ComponentFixture<UpdateUserSettingsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [UpdateUserSettingsComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(UpdateUserSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
