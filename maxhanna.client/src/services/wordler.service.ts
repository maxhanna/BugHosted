import { Injectable } from '@angular/core';  
import { WordlerGuess } from './datacontracts/wordler/wordler-guess';
import { WordlerScore } from './datacontracts/wordler/wordler-score';

@Injectable({
  providedIn: 'root'
})
export class WordlerService {
  async getRandomWord(difficulty: number) {
    try {
      const response = await fetch(`/wordler/getrandomword/${difficulty}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Error fetching random word: ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      console.error(error);
      return '';
    }
  }

  async getBestConsecutiveDayStreak(userId: number) {
    if (!userId) return;
    try {
      const response = await fetch(`/wordler/getbestconsecutivedaysstreak`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });

      if (!response.ok) {
        throw new Error(`Error getConsecutiveDayStreak: ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      console.error(error);
      return '';
    }
  }

  async getBestConsecutiveDayStreakOverall() { 
    try {
      const response = await fetch(`/wordler/getbestconsecutivedaysstreakoverall`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }, 
      });

      if (!response.ok) {
        throw new Error(`Error getConsecutiveDayStreak: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(error);
      return '';
    }
  }


  async getTodaysDayStreak(userId: number) {
    if (!userId) return;
    try {
      const response = await fetch(`/wordler/getcurrentstreak`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });

      if (!response.ok) {
        throw new Error(`Error getcurrentstreak: ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      console.error(error);
      return '';
    }
  }

  async getWordDefinition(word: string) {
    try {
      const response = await fetch(`/wordler/getdictionaryword/${word}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return `Error fetching random word: ${response.statusText}`;
      }

      return await response.text();
    } catch (error) {
      console.error(error);
      return '';
    }
  }

  async submitGuess(guess: WordlerGuess) {
    try {
      const response = await fetch(`/wordler/submitguess`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(guess),
      });

      if (!response.ok) {
      }

      return await response.json();
    } catch (error) {
      return (error as Error).message;
    }
  }

  async getGuesses(userId: number, difficulty: number) {
    try {
      const response = await fetch(`/wordler/getguesses/${difficulty}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId),
      });

      if (!response.ok) {
        throw new Error(`Error getting guesses: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      return (error as Error).message;
    }
  }

  async addScore(score: WordlerScore) {
    try {
      const response = await fetch(`/wordler/addscore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(score),
      });

      if (!response.ok) {
        throw new Error(`Error adding score: ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      return (error as Error).message;
    }
  }

  async getAllScores(userId?: number) {
    try {
      const response = await fetch(`/wordler/getallscores`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userId ? userId : null),
      });

      if (!response.ok) {
        throw new Error(`Error fetching all scores: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      return (error as Error).message;
    }
  }

  async checkGuess(difficulty: number, word: string) {
    try {
      const response = await fetch(`/wordler/checkguess/${difficulty}/${word}`, {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error(`Error fetching all scores: ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      console.error(error);
      return (error as Error).message;
    }
  }
}
