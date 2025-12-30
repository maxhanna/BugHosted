import { Component, OnInit } from '@angular/core';
import { ViewChild, ElementRef } from '@angular/core';
import { MastermindService } from '../../services/mastermind.service';
import { ChildComponent } from '../child.component';

const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
const SEQUENCE_LENGTH = 4;
const MAX_TRIES = 10;

interface MastermindGuess {
  colors: string[];
  feedback: { black: number; white: number };
}

@Component({
  selector: 'app-mastermind',
  templateUrl: './mastermind.component.html',
  styleUrl: './mastermind.component.css',
  standalone: false
})
export class MastermindComponent extends ChildComponent implements OnInit {
  @ViewChild('difficultyDropdown') difficultyDropdown!: ElementRef<HTMLSelectElement>;

  isMenuPanelOpen = false;
  colors = COLORS;
  sequence: string[] = [];
  guesses: MastermindGuess[] = [];
  triesLeft = MAX_TRIES;
  gameOver = false;
  gameWon = false;
  selectedDifficulty: string = 'easy';
  sequenceLength: number = SEQUENCE_LENGTH;
  currentGuess: string[] = Array(SEQUENCE_LENGTH).fill('');
  gameStarted = false;
  emojiSet: 'circle' | 'square' | 'none' = 'none';
  readonly colorEmojis = ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣'];
  readonly squareEmojis = ['🟥', '🟧', '🟨', '🟩', '🟦', '🟪'];
  readonly colorNames = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
  readonly blackPegEmoji = '⚫️';

  constructor(private mastermindService: MastermindService) {
    super();
  }

  async ngOnInit() {
    this.detectEmojiSupport();
    const userId = this.parentRef?.user?.id ?? 0;
    try {
      const state = await this.mastermindService.loadGameState(userId);
      if (state && state.sequence && state.guesses && state.sequence.length > 0) {
        this.sequence = state.sequence;
        this.guesses = state.guesses.map((g: any) => ({ colors: g.colors, feedback: { black: g.black, white: g.white } }));
        this.triesLeft = MAX_TRIES - this.guesses.length;
        this.gameOver = state.isFinished;
        this.gameWon = false;
        this.selectedDifficulty = state.difficulty || 'easy';
        this.sequenceLength = state.sequenceLength || 4;
        this.currentGuess = Array(this.sequenceLength).fill('');
        this.gameStarted = true;
      } else {
        this.gameStarted = false;
      }
    } catch {
      this.gameStarted = false;
    }
  }

  async startNewGame() {
    this.guesses = [];
    this.currentGuess = Array(this.sequenceLength).fill('');
    this.triesLeft = MAX_TRIES;
    this.gameOver = false;
    this.gameWon = false;
    this.isLoading = true;

    try {
      const seq = await this.mastermindService.getSequence(this.selectedDifficulty, this.sequenceLength);
      this.sequence = seq.slice(0, this.sequenceLength);
    } catch {
      this.sequence = this.generateRandomSequence();
    }
    this.isLoading = false;
    this.gameStarted = true;
  }

  generateRandomSequence(): string[] {
    const seq = [];
    for (let i = 0; i < this.sequenceLength; i++) {
      seq.push(this.colors[Math.floor(Math.random() * this.colors.length)]);
    }
    return seq;
  }

  async submitGuess() {
    if (this.gameOver) return;
    if (this.currentGuess.some(c => !c)) return;
    this.isLoading = true;
    let feedback;
    const userId = this.parentRef?.user?.id ?? 0;
    try {
      feedback = await this.mastermindService.submitGuess(this.currentGuess, this.sequence, userId, this.triesLeft, this.selectedDifficulty, this.sequenceLength);
    } catch {
      feedback = this.getFeedback(this.currentGuess, this.sequence);
    }
    this.guesses.push({ colors: [...this.currentGuess], feedback });
    this.triesLeft--;
    if (feedback.black === this.sequenceLength) {
      this.gameWon = true;
      this.gameOver = true;
    } else if (this.triesLeft === 0) {
      this.gameOver = true;
    }
    this.currentGuess = Array(this.sequenceLength).fill('');
    this.isLoading = false;
    try {
      await this.mastermindService.saveGameState({
        userId: userId,
        sequence: this.sequence,
        guesses: this.guesses.map(g => ({ colors: g.colors, black: g.feedback.black, white: g.feedback.white })),
        isFinished: this.gameOver,
        lastUpdated: new Date().toISOString(),
        difficulty: this.selectedDifficulty,
        sequenceLength: this.sequenceLength
      });
    } catch { }
  }

  getFeedback(guess: string[], sequence: string[]): { black: number; white: number } {
    let black = 0, white = 0;
    const seqCopy = [...sequence];
    const guessCopy = [...guess];
    for (let i = 0; i < this.sequenceLength; i++) {
      if (guessCopy[i] === seqCopy[i]) {
        black++;
        seqCopy[i] = guessCopy[i] = '__REMOVED__';
      }
    }
    for (let i = 0; i < this.sequenceLength; i++) {
      if (guessCopy[i] !== '__REMOVED__' && seqCopy.includes(guessCopy[i])) {
        white++;
        seqCopy[seqCopy.indexOf(guessCopy[i])] = '__REMOVED__';
      }
    }
    return { black, white };
  }

  setGuessColor(index: number, event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    this.currentGuess[index] = value;
  }

  showMenuPanel() {
    if (this.isMenuPanelOpen) {
      this.closeMenuPanel();
      return;
    }
    this.isMenuPanelOpen = true;
    this.parentRef?.showOverlay();
  }

  closeMenuPanel() {
    this.isMenuPanelOpen = false;
    this.parentRef?.closeOverlay();
  }

  cycleColor(index: number) {
    const current = this.currentGuess[index];
    let currentIdx = this.colors.indexOf(current);
    if (currentIdx === -1) {
      this.currentGuess[index] = this.colors[0];
    } else {
      const nextIdx = (currentIdx + 1) % this.colors.length;
      this.currentGuess[index] = this.colors[nextIdx];
    }
  }
  onDifficultyChange(event: any) {
    this.selectedDifficulty = event.target.value;
    switch (this.selectedDifficulty) {
      case 'easy':
        this.sequenceLength = 4;
        break;
      case 'medium':
        this.sequenceLength = 5;
        break;
      case 'hard':
        this.sequenceLength = 6;
        break;
      default:
        this.sequenceLength = 4;
    }
    this.currentGuess = Array(this.sequenceLength).fill('');
  }

  async exitGame() {
    if (!this.gameOver && !confirm("Are you sure you wish to quit the game?")) {
      return;
    }
    const userId = this.parentRef?.user?.id ?? 0;
    try {
      await this.mastermindService.exitGame(userId);
    } catch { }
    this.sequence = [];
    this.guesses = [];
    this.triesLeft = MAX_TRIES;
    this.gameOver = false;
    this.gameWon = false;
    this.currentGuess = Array(this.sequenceLength).fill('');
    this.gameStarted = false;
  }

  getFeedbackPegs(black: number, white: number): string[] {
    // Black pegs first, then white pegs
    return Array(black).fill('black')
      .concat(Array(white).fill('white'));
  }

  getPegRow(idx: number, total: number): number {
    // Max 2 rows, fill first row then second
    const perRow = Math.ceil(total / 2);
    return idx < perRow ? 1 : 2;
  }

  getPegCol(idx: number, total: number): number {
    const perRow = Math.ceil(total / 2);
    return (idx % perRow) + 1;
  }

  detectEmojiSupport() {
    const testDiv = document.createElement('div');
    testDiv.innerText = this.colorEmojis.join('');
    document.body.appendChild(testDiv);
    const circleSupported = testDiv.innerText === this.colorEmojis.join('');
    testDiv.innerText = this.squareEmojis.join('');
    const squareSupported = testDiv.innerText === this.squareEmojis.join('');
    document.body.removeChild(testDiv);
    if (circleSupported) this.emojiSet = 'circle';
    else if (squareSupported) this.emojiSet = 'square';
    else this.emojiSet = 'none';
  }

  getColorEmoji(color: string): string {
    const idx = this.colorNames.indexOf(color);
    if (idx === -1) return '';
    if (this.emojiSet === 'circle') return this.colorEmojis[idx];
    if (this.emojiSet === 'square') return this.squareEmojis[idx];
    return '';
  }
}