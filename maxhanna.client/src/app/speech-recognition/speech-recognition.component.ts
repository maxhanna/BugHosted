import { Component, EventEmitter, Output } from '@angular/core';
import { Injectable, NgZone } from '@angular/core'; 

@Component({
  selector: 'app-speech-recognition',
  standalone: false,
  templateUrl: './speech-recognition.component.html',
  styleUrl: './speech-recognition.component.css'
})
export class SpeechRecognitionComponent {
  recognition: any;
  isListening = false;
  lastSpokenMessages: { message: string }[] = []; 
  readonly MAX_HISTORY = 8;

  @Output() speechRecognitionEvent = new EventEmitter<string | undefined>();
  @Output() speechRecognitionStopListeningEvent = new EventEmitter<void>();
  constructor(private zone: NgZone) {
    const SpeechRecognitionConstructor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognitionConstructor) {
      this.recognition = new SpeechRecognitionConstructor();
      this.recognition.lang = 'en-US';
      this.recognition.interimResults = false;
      this.recognition.maxAlternatives = 1;
    } else {
      console.error('SpeechRecognition not supported in this browser.');
    }
  }
  onResult(transcript: string) { 
    console.log('Recognized text: ', transcript);
  }
  startListening(onResult: (transcript: string) => void) {
    if (this.isListening) return;

    this.isListening = true;
    this.recognition.start();

    this.recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      const normalized = transcript.toLowerCase();
      const now = new Date();

      for (const entry of this.lastSpokenMessages) {
        const similarity = this.getSimilarity(normalized, entry.message);
        const wordRatio = this.getPartialWordMatchRatio(entry.message, normalized);
        console.log("Checking against previous message:", entry.message, normalized, { similarity, wordRatio });
        if (similarity > 0.2 || wordRatio > 0.2) {
          console.log("Filtered echo-like input:", normalized, { similarity, wordRatio });
          return;
        }
      }

      this.zone.run(() => {
        this.speechRecognitionEvent.emit(transcript); 
        onResult(transcript);
        this.lastSpokenMessages.push({ message: normalized });
        if (this.lastSpokenMessages.length > this.MAX_HISTORY) {
          this.lastSpokenMessages.shift();
        }
      });
    };
    this.recognition.onend = () => {
      this.isListening = false;
    };

    this.recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      this.isListening = false;
    };
  }

  stopListening() {
    this.recognition.stop();
    this.isListening = false;
    this.lastSpokenMessages = [];
    this.speechRecognitionStopListeningEvent.emit();
  }

  private getSimilarity(a: string, b: string): number {
    const distance = this.levenshteinDistance(a, b);
    const maxLen = Math.max(a.length, b.length);
    return maxLen === 0 ? 1 : (1 - distance / maxLen);
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
      Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return matrix[a.length][b.length];
  }
  private getPartialWordMatchRatio(a: string, b: string): number {
    const wordsA = a.split(/\s+/);
    const wordsB = b.split(/\s+/);

    const matchCount = wordsA.filter(word => wordsB.includes(word)).length;
    return wordsA.length === 0 ? 0 : matchCount / wordsA.length;
  }

}
