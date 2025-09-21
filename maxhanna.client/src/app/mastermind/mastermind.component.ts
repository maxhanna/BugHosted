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
  styleUrls: ['./mastermind.component.css'], 
  standalone: false
})
export class MastermindComponent extends ChildComponent implements OnInit {
  exitGame() {
    // Call backend to delete unfinished game for this user
    this.mastermindService.exitGame(this.userId).subscribe(() => {
      // Reset frontend state
      this.sequence = [];
      this.guesses = [];
      this.triesLeft = MAX_TRIES;
      this.gameOver = false;
      this.gameWon = false;
      this.currentGuess = Array(this.sequenceLength).fill('');
      this.gameStarted = false;
    });
  }
  @ViewChild('difficultyDropdown') difficultyDropdown!: ElementRef<HTMLSelectElement>;
  isMenuPanelOpen = false; 
  colors = COLORS;
  sequence: string[] = [];
  guesses: MastermindGuess[] = [];
  triesLeft = MAX_TRIES;
  gameOver = false;
  gameWon = false;  
  bestScores: any[] = [];
  selectedDifficulty: string = 'easy';
  sequenceLength: number = SEQUENCE_LENGTH;
  currentGuess: string[] = Array(SEQUENCE_LENGTH).fill('');
  gameStarted = false; // Added gameStarted variable


  constructor(private mastermindService: MastermindService) { super(); }

  userId = 1; // TODO: Replace with actual user id from auth

  ngOnInit() {
    this.mastermindService.loadGameState(this.userId).subscribe((state: any) => {
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
    });
  }

  startNewGame() {
    this.guesses = [];
    this.currentGuess = Array(this.sequenceLength).fill('');
    this.triesLeft = MAX_TRIES;
    this.gameOver = false;
    this.gameWon = false;
    this.isLoading = true;
    this.mastermindService.getSequence(this.selectedDifficulty, this.sequenceLength).subscribe(seq => {
      this.sequence = seq.slice(0, this.sequenceLength);
      this.isLoading = false;
    }, err => {
      // fallback to local sequence if backend fails
      this.sequence = this.generateRandomSequence();
      this.isLoading = false;
    });
    this.gameStarted = true;
  }

  generateRandomSequence(): string[] {
    const seq = [];
    for (let i = 0; i < this.sequenceLength; i++) {
      seq.push(this.colors[Math.floor(Math.random() * this.colors.length)]);
    }
    return seq;
  }

  submitGuess() {
    if (this.gameOver) return;
    if (this.currentGuess.some(c => !c)) return;
    this.isLoading = true;
  this.mastermindService.submitGuess(this.currentGuess, this.sequence, this.userId, this.triesLeft, this.selectedDifficulty, this.sequenceLength).subscribe(feedback => {
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

      // Save game state after guess
      this.mastermindService.saveGameState({
        userId: this.userId,
        sequence: this.sequence,
        guesses: this.guesses.map(g => ({ colors: g.colors, black: g.feedback.black, white: g.feedback.white })),
        isFinished: this.gameOver,
        lastUpdated: new Date().toISOString(),
        difficulty: this.selectedDifficulty,
        sequenceLength: this.sequenceLength
      }).subscribe();
    }, err => {
      // fallback to local feedback if backend fails
      const feedback = this.getFeedback(this.currentGuess, this.sequence);
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
      // Save game state after guess
      this.mastermindService.saveGameState({
        userId: this.userId,
        sequence: this.sequence,
        guesses: this.guesses.map(g => ({ colors: g.colors, black: g.feedback.black, white: g.feedback.white })),
        isFinished: this.gameOver,
        lastUpdated: new Date().toISOString(),
        difficulty: this.selectedDifficulty,
        sequenceLength: this.sequenceLength
      }).subscribe();
    });
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
    this.fetchBestScores();
  }

  fetchBestScores() {
    this.mastermindService.getBestScores().subscribe(scores => {
      this.bestScores = scores;
    }, err => {
      this.bestScores = [];
    });
  }

  closeMenuPanel() {
    this.isMenuPanelOpen = false;
  }

  cycleColor(index: number) {
    const current = this.currentGuess[index];
    let currentIdx = this.colors.indexOf(current);
    // If blank, start at first color
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
}