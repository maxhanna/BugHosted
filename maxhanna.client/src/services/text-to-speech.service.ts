// user.service.ts
import { Injectable } from '@angular/core'; 

@Injectable({
  providedIn: 'root'
})
export class TextToSpeechService {
  isSpeaking = false;
  
  speakMessage(message: string) {
    if ('speechSynthesis' in window) {
      this.isSpeaking = true;
      //console.log("Speech synthesis is supported! ", message);
      let cleanMessage = message.replace(/<\/?[^>]+(>|$)/g, "").replace(/[^\x20-\x7E]/g, "");

      // Replace "e.g.", "eg.", or "ex." (case-insensitive) with "example".
      cleanMessage = cleanMessage.replace(/\b(e\.g\.|eg\.|ex\.)\b/gi, "example");

      // Remove parentheses and their contents.
      cleanMessage = cleanMessage.replace(/\(.*?\)/g, '');

      // Split the message into segments based on punctuation.
      // This regular expression captures groups of characters ending with punctuation.
      const segments: string[] = [];
      const regex = /[^,;:\-\.]+[,:;\-\.]*/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(cleanMessage)) !== null) {
        segments.push(match[0].trim());
      }

      // Function to speak the segments sequentially.
      const speakSegments = (index: number) => {
        if (index >= segments.length) {
          //console.log("Finished speaking all segments.");
          this.isSpeaking = false;
          return;
        }

        const segment = segments[index];
        const utterance = new SpeechSynthesisUtterance(segment);
        utterance.lang = 'en-US';
        utterance.pitch = 0.8; // Lower than the default for a more natural tone.
        utterance.rate = 1.2;    // Normal speaking rate.
        utterance.volume = 1;

        // Choose a preferred voice if available.
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
          const naturalVoice = voices.find(voice =>
            voice.name.toLowerCase().includes('mark') ||
            voice.name.toLowerCase().includes('zira') ||
            voice.name.toLowerCase().includes('microsoft')
          );
          utterance.voice = naturalVoice || voices[0];
        }

        utterance.onend = () => {

          setTimeout(() => speakSegments(index + 1), 0);

        };

        window.speechSynthesis.speak(utterance);
      };

      // Start the recursive speaking of segments.
      speakSegments(0);
    } else {
      console.log("Speech synthesis is NOT supported in this browser.");
    }
  }
  stopSpeaking() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      // console.log("Speech stopped");
      this.isSpeaking = false;
    }
  }
}
