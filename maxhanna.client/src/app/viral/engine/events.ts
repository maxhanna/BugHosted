type EventCallback = (...args: any[]) => void;

class EventSystem {
  private listeners: { [event: string]: EventCallback[] } = {};

  on(event: string, callback: EventCallback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  emit(event: string, ...args: any[]) {
    if (this.listeners[event]) {
      for (const cb of this.listeners[event]) {
        cb(...args);
      }
    }
  }

  off(event: string, callback: EventCallback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }
}

export const events = new EventSystem();
