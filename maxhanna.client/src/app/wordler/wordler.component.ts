import { Component, ElementRef, OnInit, Renderer2, ViewChild } from '@angular/core';
import { ChildComponent } from '../child.component';
import { WordlerService } from '../../services/wordler.service';
import { WordlerScore } from '../../services/datacontracts/wordler-score';
import { User } from '../../services/datacontracts/user';
import { WordlerGuess } from '../../services/datacontracts/wordler-guess';
type DifficultyKey = "Easy Difficulty" | "Medium Difficulty" | "Hard Difficulty" | "Master Wordler";

@Component({
  selector: 'app-wordler',
  templateUrl: './wordler.component.html',
  styleUrls: ['./wordler.component.css']
})
export class WordlerComponent extends ChildComponent implements OnInit {
  wordToGuess: string = 'people';
  attempts: string[][] = [];
  feedback: string[][] = [];
  currentAttempt: number = 0;
  gameStarted = false;
  numberOfTries: number = 6;
  scores: WordlerScore[] = [];
  guesses: WordlerGuess[] = [];
  startTime = new Date().getTime();
  timerInterval = setInterval(this.updateTimer, 1000);
  elapsedTime = 0;
  showScores = true;
  notifications: string[] = [];
  selectedDifficulty = 0;
  disableAllInputs = false;
  guessAttempts: string[] = [];

 
  @ViewChild('difficultySelect') difficultySelect!: ElementRef<HTMLSelectElement>;

  difficultyMapping: Record<DifficultyKey, number> = {
  "Easy Difficulty": 4,
  "Medium Difficulty": 5,
  "Hard Difficulty": 6,
  "Master Wordler": 7,
};

  difficulties: DifficultyKey[] = ["Easy Difficulty", "Medium Difficulty", "Hard Difficulty", "Master Wordler"];


  constructor(private wordlerService: WordlerService, private renderer: Renderer2) { super(); }

  async ngOnInit() {
    this.getHighScores();
  }
  copyLink() {
    const link = `https://bughosted.com/Wordler`;
    navigator.clipboard.writeText(link).then(() => {
      this.notifications.push('Link copied to clipboard!');
    }).catch(err => {
      this.notifications.push('Failed to copy link!');
    });
  }
  getDifficultyByValue(value: number): DifficultyKey | undefined {
    return Object.keys(this.difficultyMapping).find(key => this.difficultyMapping[key as DifficultyKey] === value) as DifficultyKey | undefined;
  }
  onMobile() {
    return (/Mobi|Android/i.test(navigator.userAgent));
  }
   
  keyFocus(event: Event) {
    if (this.onMobile())
    event.preventDefault();
  }
  pressedKey(char: string, event: Event) {
    event.preventDefault();
    if (char == "backspace") {
      if (document.getElementById(this.findEmptyInputId(true))) {
        const previousInput = document.getElementById(this.findEmptyInputId(true)) as HTMLInputElement;
        if (previousInput) {
          previousInput.value = '';
        }
      }
    } else if (char == "enter") {
      this.checkGuess(this.currentAttempt);
    } else {
      const inputId = this.findEmptyInputId(false);
      (document.getElementById(inputId) as HTMLInputElement).value = char!;
    }
  }

  findEmptyInputId(backspace: boolean): string {
    const attemptsDiv = document.getElementById("attemptDiv" + this.currentAttempt);
    const inputs = (attemptsDiv as HTMLDivElement).getElementsByTagName("input");
    let lastInput = undefined;
    for (let x = 0; x < inputs.length; x++) {
      lastInput = inputs[x];
      if (inputs[x].value === '' && !backspace) {
        return inputs[x].id;
      }
      else if (inputs[x].value === '' && backspace && inputs[x - 1]) {
        return inputs[x - 1].id;
      }
    }
    return lastInput?.id ?? '';
  }

  startTimer() {
    this.elapsedTime = 0;
    this.startTime = Date.now();
    this.timerInterval = setInterval(this.updateTimer, 1000); // Update every second
  }
  updateTimer() {
    this.elapsedTime = Math.floor((Date.now() - this.startTime) / 1000);
  }
  stopTimer() {
    clearInterval(this.timerInterval);
    this.elapsedTime = Math.floor((Date.now() - this.startTime) / 1000);
  }

  async addScore(score: WordlerScore) {
    try {

      if (this.parentRef && this.parentRef.user) {
        const res = await this.wordlerService.addScore(score);
        if (res) {
          this.notifications.push(res);
        }
      }
      this.scores = await this.wordlerService.getAllScores();
    } catch { console.log("failed to add score"); }
  }

  async resetGame() {
    if (!this.difficultySelect.nativeElement.value) {
      return alert("You must select a difficulty!");
    }
    this.disableAllInputs = false;
    this.selectedDifficulty = parseInt(this.difficultySelect.nativeElement.value);

    this.wordToGuess = (await this.wordlerService.getRandomWord(this.selectedDifficulty)).toUpperCase();
    await this.reloadGuesses();

    this.gameStarted = true;
    this.showScores = false;
    this.startTimer();
    this.attempts = Array.from({ length: this.numberOfTries }, () => Array(this.selectedDifficulty).fill(''));
    this.feedback = Array.from({ length: this.numberOfTries }, () => Array(this.selectedDifficulty).fill(''));
    this.currentAttempt = 0;

    if (!this.onMobile()) {
      setTimeout(() => document.getElementById('inputIdRow' + 0 + 'Letter' + 0)!.focus(), 1);
    }
  }

  private async reloadGuesses() {
    if (this.parentRef && this.parentRef.user) {
      try {
        const res = await this.wordlerService.getGuesses(this.parentRef?.user!, this.selectedDifficulty) as WordlerGuess[];
        setTimeout(() => {
          if (res) {
            this.guesses = res;
            var startTime = new Date(res[0].date!).getTime() ?? 0;
            var endTime = new Date(res[res.length - 1].date!).getTime() ?? 0;
            var timeCumul = endTime - startTime;
            this.elapsedTime += timeCumul;
            let skipChecks = false;
            for (var x = 0; x < this.numberOfTries; x++) {
              var word = '';
              var numberOfGreens = 0;
              for (var y = 0; y < this.selectedDifficulty; y++) {
                if (res && res[x] && res[x].guess && res[x].guess[y]) {
                  // REINSERT the guess into the inputs
                  (document.getElementById('inputIdRow' + x + 'Letter' + y) as HTMLInputElement).value = res[x].guess[y]; 
                  word += res[x].guess[y];
                  (document.getElementById('inputIdRow' + x + 'Letter' + y) as HTMLInputElement).classList.add("grey");
                } 
                if (word.length == this.selectedDifficulty) {
                  this.guessAttempts.push(word);
                  this.provideFeedback(word, this.currentAttempt);
                  for (var y = 0; y < this.selectedDifficulty; y++) {
                    if (res && res[x] && res[x].guess && res[x].guess[y]) {
                      if ((document.getElementById('inputIdRow' + x + 'Letter' + y) as HTMLInputElement).classList.contains("green")) {
                        numberOfGreens++;
                      }
                    }
                  }
                  this.currentAttempt++; 
                  if (numberOfGreens >= this.selectedDifficulty && !skipChecks) {
                    setTimeout(() => {
                     // alert(`Congratulations, you have defeated the Wordler!`);
                      //const mode = this.selectedDifficulty == '4' ?
                      setTimeout(() => {
                        const inputs = document.getElementById("attemptDiv" + (this.currentAttempt - 1))?.getElementsByTagName("input");
                          if (inputs) {
                            Array.from(inputs).forEach(input => {
                              input.classList.add("toss");
                            });
                          }
                        }, 1000);  // Delay to let the flip animations complete
                      
                      this.notifications.push(`Congratulations, the Wordler has been defeated on ${this.getDifficultyByValue(this.selectedDifficulty)}! Try another difficulty?`);
                    }, 1);
                    skipChecks = true;
                    this.disableAllInputs = true;
                  }
                  if (this.currentAttempt >= this.numberOfTries && !skipChecks) {
                    this.notifications.push(`Game over! The word was: ${this.wordToGuess}. Try another difficulty?`);
                    this.showScores = true;
                    alert(`Game over! The word was: ${this.wordToGuess}. Try another difficulty?`);
                    skipChecks = true;
                    this.disableAllInputs = true;
                  }
                }
              }
            } 
          }
        }, 1);
      } catch (e) { console.log("no guesses, or error fetching: " + e); }
    }
    else {
      this.notifications.push("You should log in to track your scores and save your guesses!");
    }
  }

  async checkGuess(attemptIndex: number) {
    if (attemptIndex !== this.currentAttempt) return; //<--not sure what this does anymore
    var guessLetters: string[] = [];
    const letters = document.getElementById("attemptDiv" + this.currentAttempt) as HTMLDivElement;
    const letterInputs = letters.getElementsByTagName("input");
    for (var x = 0; x < letterInputs.length; x++) {
      guessLetters.push(letterInputs[x].value);
    }
    const guess = guessLetters.join('');


    if (guess.length === this.selectedDifficulty) { //if the user filled the guess
      if (this.guessAttempts.includes(guess) || this.guesses.filter(x => x.guess == guess).length > 0) {
        this.notifications.push("The Wordler says: 'Hah! Trying again? You're as persistent as you are predictable.'");
        this.shakeCurrentAttempt();
        return;
      }
      this.guessAttempts.push(guess);

      let newGuess: WordlerGuess = {
        user: this.parentRef?.user ?? new User(0, "Unknown"),
        attemptNumber: this.currentAttempt,
        difficulty: this.selectedDifficulty,
        guess: guess,
      }
      
      //first check if valid word
      const validityRes = await this.wordlerService.checkGuess(this.selectedDifficulty, guess);
      if (validityRes && validityRes[0] == "0") {
        const message = validityRes.substring(1, validityRes.length).trim() ?? '';
        if (message && message.trim() != '') {
          this.notifications.push("Thats not a real word, try again, The Wordler raises his brow at your choices.");
        } else {
          this.notifications.push("Thats not a real word, try again! The Wordler laughs at your despair!");
        } 
        this.shakeCurrentAttempt();
        return;
      } else if (validityRes && validityRes[0] == "1") {
        const message = validityRes.substring(1, validityRes.length).trim();
        if (message && message.trim() != '') {
          this.notifications.push(validityRes.substring(1, validityRes.length).trim());
        }
      }
      this.currentAttempt++;
      this.provideFeedback(guess, attemptIndex);
      
      this.guesses.push(newGuess);
 
      if (this.parentRef && this.parentRef.user && this.parentRef.user.id != 0) { 
        try {
          await this.wordlerService.submitGuess(newGuess);
        } catch { } 
      }
     
      if (guess === this.wordToGuess) {
        await this.winningScenario(guess); 
        this.showScores = true; 
      } else if (this.currentAttempt < this.numberOfTries) {
        if (!this.onMobile()) {
          setTimeout(() => document.getElementById("inputIdRow" + this.currentAttempt + "Letter0")?.focus(), 1);
        }
      } else {
        this.stopTimer();
        const message = `Game over! The word was: ${this.wordToGuess}; Time elapsed: ${this.elapsedTime}`;
        this.notifications.push(message);
        this.showScores = true;
        alert(message); 
        const definition = await this.wordlerService.getWordDefinition(guess);
        if (definition) {
          this.notifications.push(`Word definition: ${definition}`);
        }
      }
    }
  }
   
  async winningScenario(guess: string) {
    this.stopTimer();
    alert(`Congratulations, the Wordler has been defeated on ${this.getDifficultyByValue(this.selectedDifficulty)}! Time Elapsed: ${this.elapsedTime}`);
    let tmpScore: WordlerScore = { score: this.currentAttempt, user: this.parentRef?.user ?? new User(0, "Anonymous"), time: this.elapsedTime, difficulty: this.selectedDifficulty };
    await this.wordlerService.addScore(tmpScore);
    await this.getHighScores();
    const definition = await this.wordlerService.getWordDefinition(guess);
    if (definition) {
      this.notifications.push(`Word definition: ${definition}`);
    }
    this.showScores = true;
    this.disableAllInputs = true;
  }

  moveToNextInput(attemptIndex: number, letterIndex: number, event: KeyboardEvent) {
    const input = document.getElementById(`inputIdRow${attemptIndex}Letter${letterIndex}`) as HTMLInputElement;

    // Check if the key pressed is a letter (a-z)
    if (event.key.length === 1 && event.key.match(/[a-zA-Z]/)) {
      input.value = event.key.toUpperCase();

      const nextLetterIndex = letterIndex + 1;
      const nextInputId = `inputIdRow${attemptIndex}Letter${nextLetterIndex}`;
      const nextInputElement = document.getElementById(nextInputId) as HTMLInputElement;

      if (nextInputElement) {
        nextInputElement.focus();
      }
    } else {
      // If the key is not a letter, prevent the default behavior and return
      event.preventDefault();
      return;
    }
  }


  provideFeedback(guess: string, attemptIndex: number) { 
    const guessArray = guess.split('');
    const wordArray = this.wordToGuess.split('');
    var correctLetters: string[] = [];
    var halfCorrectLetters: string[] = [];

    guessArray.forEach((letter, index) => {
      if (letter === wordArray[index]) {
        const button = document.getElementById(letter.toLowerCase() + "Button");
        const input = document.getElementById("attemptDiv" + attemptIndex)?.getElementsByTagName("input")[index];

        if (button) button.classList.add("green");
        if (input) {
          input.classList.add("green");
          input.classList.add("flip");
          setTimeout(() => input.classList.remove("flip"), 600);
        }
        correctLetters.push(letter);
      }
    });

    guessArray.forEach((letter, index) => {
      if (wordArray.includes(letter)) {
        const button = document.getElementById(letter.toLowerCase() + "Button");
        const input = document.getElementById("attemptDiv" + attemptIndex)?.getElementsByTagName("input")[index];

        if (button && !button.classList.contains("green")) {
          button.classList.add("yellow");
        }
        var dupeLetterCount = wordArray.filter(x => x == letter).length;
        if ((halfCorrectLetters.filter(x => x == letter).length + correctLetters.filter(x => x == letter).length) < dupeLetterCount) {
          if (input) {
            input.classList.add("yellow");
            input.classList.add("flip");
            setTimeout(() => input.classList.remove("flip"), 600);
          }
          halfCorrectLetters.push(letter);
        }
      }
    });

    guessArray.forEach((letter, index) => {
      if (!wordArray.includes(letter)) {
        const button = document.getElementById(letter.toLowerCase() + "Button");
        const input = document.getElementById("attemptDiv" + attemptIndex)?.getElementsByTagName("input")[index];

        if (button) button.classList.add("grey");
        if (input) {
          input.classList.add("flip");
          setTimeout(() => input.classList.remove("flip"), 600);
        }
      } 
    });

    if (guess === this.wordToGuess) {
      setTimeout(() => {
        const inputs = document.getElementById("attemptDiv" + attemptIndex)?.getElementsByTagName("input");
        if (inputs) {
          Array.from(inputs).forEach(input => {
            input.classList.add("toss");
          });
        }
      }, 1000);
    }
  }
  shakeCurrentAttempt() {
    const attemptDiv = document.getElementById('attemptDiv' + this.currentAttempt);
    if (attemptDiv) {
      this.renderer.addClass(attemptDiv, 'shake');
      attemptDiv.addEventListener('animationend', () => {
        this.renderer.removeClass(attemptDiv, 'shake');
      }, { once: true });
    }
  }
  async getHighScores() {
    this.scores = await this.wordlerService.getAllScores();
  }

  giveUp() {
    if (confirm("Are you sure ?")) {
      this.showScores = true; 
      this.gameStarted = false;
      this.currentAttempt = 0;
      this.wordToGuess = '';
      this.stopTimer();
      this.disableAllInputs = true;
    }
  } 
}
