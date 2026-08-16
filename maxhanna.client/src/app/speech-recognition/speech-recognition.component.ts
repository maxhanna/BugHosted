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
  // Inline style applied to the mic/stop buttons, so each consumer controls the
  // button's appearance (size, colour, spacing) instead of this component
  // hardcoding it.
  @Input() buttonStyle = '';
  // Keep the microphone open across utterances. Defaults to false because the
  // Web Speech API has no raw audio access — leaving it continuous makes the
  // mic pick up the assistant's own speech unless the host stops it in time.
  @Input() continuous = false;
  // Fired on every recognition update with the live partial transcript, so
  // consumers can show words appearing as the user speaks instead of waiting
  // for a finalized chunk.
  @Output() speechInterimEvent = new EventEmitter<string>();
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
    this.recognition.continuous = this.continuous;
    this.recognition.interimResults = true;
    this.recognition.start();

    this.recognition.onresult = (event: any) => {
      let interimTranscript = '';
      const finalSegments: string[] = [];

      // Only process results that are new since the last event, so finalized
      // utterances are emitted exactly once and interim text never duplicates.
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = (result[0]?.transcript ?? '').trim();
        if (!text) continue;
        if (result.isFinal) {
          finalSegments.push(text);
        } else {
          interimTranscript += (interimTranscript ? ' ' : '') + text;
        }
      }

      this.zone.run(() => {
        // Stream the live partial so words appear as they're spoken, instead of
        // the whole phrase popping in when the recognizer finalizes a chunk.
        if (interimTranscript.trim()) {
          this.speechInterimEvent.emit(interimTranscript.trim());
        }

        for (const finalText of finalSegments) {
          this.speechRecognitionEvent.emit(finalText);
          onResult(finalText);
          this.lastSpokenMessages.push({ message: finalText.toLowerCase() });
          if (this.lastSpokenMessages.length > this.MAX_HISTORY) {
            this.lastSpokenMessages.shift();
          }
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
