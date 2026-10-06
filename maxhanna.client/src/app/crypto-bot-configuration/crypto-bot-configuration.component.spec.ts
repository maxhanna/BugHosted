import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CurrencySymbolPipe } from '../currency-symbol';

import { CryptoBotConfigurationComponent } from './crypto-bot-configuration.component';

describe('CryptoBotConfigurationComponent', () => {
  let component: CryptoBotConfigurationComponent;
  let fixture: ComponentFixture<CryptoBotConfigurationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CryptoBotConfigurationComponent],
      imports: [CommonModule, CurrencySymbolPipe]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CryptoBotConfigurationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('rejects a trade threshold equal to the two-sided estimated fees', () => {
    expect(component.isTradeThresholdAboveEstimatedFees(0.008)).toBeFalse();
    expect(component.isTradeThresholdAboveEstimatedFees(0.0075)).toBeFalse();
  });

  it('accepts a trade threshold above the two-sided estimated fees', () => {
    expect(component.isTradeThresholdAboveEstimatedFees(0.0085)).toBeTrue();
  });

  it('calculates the daily buy cap from the configured coin balance and percentage', () => {
    component.btcToCadPrice = 7769 / 0.09;
    component.selectedCurrency = 'USD';
    fixture.detectChanges();
    const maxBalanceInput = fixture.nativeElement.querySelector('input[title^="Set the maximum amount"]') as HTMLInputElement;
    const dailyPercentageInput = fixture.nativeElement.querySelector('input[placeholder="Blank = disabled"]') as HTMLInputElement;

    maxBalanceInput.value = '0.09';
    maxBalanceInput.dispatchEvent(new Event('input'));
    dailyPercentageInput.value = '50';
    dailyPercentageInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(component.MaxDailyBuyEnteredPrice).toBe(3884.5);
    expect(fixture.nativeElement.textContent).toContain('$3,884.50');
  });

  it('does not calculate a daily amount if the max coin balance is zero', () => {
    component.btcToCadPrice = 7769;
    fixture.detectChanges();
    const maxBalanceInput = fixture.nativeElement.querySelector('input[title^="Set the maximum amount"]') as HTMLInputElement;
    const dailyPercentageInput = fixture.nativeElement.querySelector('input[placeholder="Blank = disabled"]') as HTMLInputElement;

    maxBalanceInput.value = '0';
    maxBalanceInput.dispatchEvent(new Event('input'));
    dailyPercentageInput.value = '50';
    dailyPercentageInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(component.MaxDailyBuyEnteredPrice).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Set a non-zero Max Balance to calculate the daily amount.');
  });
});
