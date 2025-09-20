import { Component, OnInit } from '@angular/core';
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
  isMenuPanelOpen = false; 
  colors = COLORS;
  sequence: string[] = [];
  guesses: MastermindGuess[] = [];
  currentGuess: string[] = Array(SEQUENCE_LENGTH).fill('');
  triesLeft = MAX_TRIES;
  gameOver = false;
  gameWon = false;  
  bestScores: any[] = [];

  constructor(private mastermindService: MastermindService) { super(); }

  ngOnInit() {
    this.startNewGame();
  }

  startNewGame() {
    this.guesses = [];
    this.currentGuess = Array(SEQUENCE_LENGTH).fill('');
    this.triesLeft = MAX_TRIES;
    this.gameOver = false;
    this.gameWon = false;
    this.isLoading = true;
    this.mastermindService.getSequence().subscribe(seq => {
      this.sequence = seq;
      this.isLoading = false;
    }, err => {
      // fallback to local sequence if backend fails
      this.sequence = this.generateRandomSequence();
      this.isLoading = false;
    });
  }

  generateRandomSequence(): string[] {
    const seq = [];
    for (let i = 0; i < SEQUENCE_LENGTH; i++) {
      seq.push(this.colors[Math.floor(Math.random() * this.colors.length)]);
    }
    return seq;
  }

  submitGuess() {
    if (this.gameOver) return;
    if (this.currentGuess.some(c => !c)) return;
    this.isLoading = true;
    this.mastermindService.submitGuess(this.currentGuess, this.sequence).subscribe(feedback => {
      this.guesses.push({ colors: [...this.currentGuess], feedback });
      this.triesLeft--;
      if (feedback.black === SEQUENCE_LENGTH) {
        this.gameWon = true;
        this.gameOver = true;
      } else if (this.triesLeft === 0) {
        this.gameOver = true;
      }
      this.currentGuess = Array(SEQUENCE_LENGTH).fill('');
      this.isLoading = false;
    }, err => {
      // fallback to local feedback if backend fails
      const feedback = this.getFeedback(this.currentGuess, this.sequence);
      this.guesses.push({ colors: [...this.currentGuess], feedback });
      this.triesLeft--;
      if (feedback.black === SEQUENCE_LENGTH) {
        this.gameWon = true;
        this.gameOver = true;
      } else if (this.triesLeft === 0) {
        this.gameOver = true;
      }
      this.currentGuess = Array(SEQUENCE_LENGTH).fill('');
      this.isLoading = false;
    });
  }

  getFeedback(guess: string[], sequence: string[]): { black: number; white: number } {
    let black = 0, white = 0;
    const seqCopy = [...sequence];
    const guessCopy = [...guess];
    for (let i = 0; i < SEQUENCE_LENGTH; i++) {
      if (guessCopy[i] === seqCopy[i]) {
        black++;
        seqCopy[i] = guessCopy[i] = '__REMOVED__';
      }
    }
    for (let i = 0; i < SEQUENCE_LENGTH; i++) {
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
}