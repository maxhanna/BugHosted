import { Component, EventEmitter, Input, Output } from '@angular/core';
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
  speechRecognitionUnavailable = false;
  
  @Input() disabled = false;
  @Output() speechRecognitionEvent = new EventEmitter<string | undefined>();
  @Output() speechRecognitionStopListeningEvent = new EventEmitter<void>();
  @Output() speechRecognitionNotSupportedEvent = new EventEmitter<boolean>();
  constructor(private zone: NgZone) {
    const SpeechRecognitionConstructor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognitionConstructor) {
      this.recognition = new SpeechRecognitionConstructor();
      this.recognition.lang = 'en-US';
      this.recognition.interimResults = false;
      this.recognition.maxAlternatives = 1;
      this.speechRecognitionNotSupportedEvent.emit(false);
    } else {
      this.speechRecognitionNotSupportedEvent.emit(true);
      this.speechRecognitionUnavailable = true;
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
      this.speechRecognitionEvent.emit();
    };
  }

  stopListening() {
    if (this.recognition) { 
      this.recognition.stop();
    }
    this.isListening = false;
    this.lastSpokenMessages = [];
    this.speechRecognitionStopListeningEvent.emit();
  } 
}
