import { CommonModule } from '@angular/common';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';

import { SocialService } from '../../services/social.service';
import { SocialComponent } from './social.component';

describe('SocialComponent', () => {
  let component: SocialComponent;
  let fixture: ComponentFixture<SocialComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [SocialComponent],
      imports: [CommonModule, FormsModule, HttpClientTestingModule],
      // The component is a shell over many child components; this test only
      // verifies that the shell can be constructed.
      schemas: [NO_ERRORS_SCHEMA]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(SocialComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(component.showRightSideBar).toBeTrue();
  });

  it('skips sidebar data requests when showRightSideBar is false', async () => {
    component.showRightSideBar = false;
    const socialService = TestBed.inject(SocialService);
    const sidebarSpy = spyOn(socialService, 'getSidebar').and.resolveTo({ popularThreads: [] } as any);
    const moderatorSpy = spyOn(component, 'loadTopicModerators').and.resolveTo(undefined);

    await component.loadSocialSidebar();

    expect(sidebarSpy).not.toHaveBeenCalled();
    expect(moderatorSpy).not.toHaveBeenCalled();
    expect(component.socialSidebarLoading).toBeFalse();
  });

  it('removes the sidebar and collapses the social grid when disabled', () => {
    component.showRightSideBar = false;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.socialSidebar')).toBeNull();
    const layout = fixture.nativeElement.querySelector('.socialLayout') as HTMLElement;
    expect(layout.classList.contains('socialLayoutNoSidebar')).toBeTrue();
  });
});
