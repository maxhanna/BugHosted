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
  private completeTranscript = '';
  private speechTimeout: any = null;
  
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
      this.recognition.interimResults = true; // Enable interim results for better sentence detection
      this.recognition.maxAlternatives = 1;
      this.speechRecognitionNotSupportedEvent.emit(false);
    } else {
      this.speechRecognitionNotSupportedEvent.emit(true);
      this.speechRecognitionUnavailable = true;
    }
  }
  onResult(transcript: string) { 
   // console.log('Recognized text: ', transcript);
  }
  startListening(onResult: (transcript: string) => void) {
    if (this.isListening) return;

    this.isListening = true;
    this.recognition.start();

    this.recognition.onresult = (event: any) => {
      // Clear previous timeout
      if (this.speechTimeout) {
        clearTimeout(this.speechTimeout);
      }
      
      let transcript = '';
      
      // Handle both interim and final results
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          transcript += result[0].transcript + ' ';
        } else {
          // Show interim results for better user experience
          transcript += result[0].transcript;
        }
      }
      
      // Only emit final results
      if (event.results[0].isFinal) {
        this.completeTranscript = transcript.trim();
        
        this.zone.run(() => {
          this.speechRecognitionEvent.emit(this.completeTranscript); 
          onResult(this.completeTranscript);
          this.lastSpokenMessages.push({ message: this.completeTranscript.toLowerCase() });
          if (this.lastSpokenMessages.length > this.MAX_HISTORY) {
            this.lastSpokenMessages.shift();
          }
        });
        
        // Set timeout to send the message after a brief pause
        this.speechTimeout = setTimeout(() => {
          // Message will be sent by HostAI component upon receiving this event
        }, 500);
      }
    };
    this.recognition.onend = () => {
      this.isListening = false;
      // Clear any pending timeouts when recognition ends
      if (this.speechTimeout) {
        clearTimeout(this.speechTimeout);
      }
    };

    this.recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      this.isListening = false;
      this.speechRecognitionEvent.emit();
       // Clear any pending timeouts when error occurs
      if (this.speechTimeout) {
        clearTimeout(this.speechTimeout);
      }
    };
  }

  stopListening() {
    if (this.recognition) { 
      this.recognition.stop();
    }
    this.isListening = false;
    this.lastSpokenMessages = [];
    this.speechRecognitionStopListeningEvent.emit();
    // Clear any pending timeouts
    if (this.speechTimeout) {
      clearTimeout(this.speechTimeout);
    }
  } 
}
