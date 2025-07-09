import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CryptoBotConfigurationComponent } from './crypto-bot-configuration.component';

describe('CryptoBotConfigurationComponent', () => {
  let component: CryptoBotConfigurationComponent;
  let fixture: ComponentFixture<CryptoBotConfigurationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CryptoBotConfigurationComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CryptoBotConfigurationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
