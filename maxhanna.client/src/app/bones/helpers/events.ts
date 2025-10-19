class Events {
  callbacks: any[] = [];
  nextId: number = 0;

  //emit events
  emit(eventName: string, value?: any) {
    this.callbacks.forEach(stored => {
      if (stored.eventName === eventName) {
        stored.callback(value);
      } 
    })
  }

  // subscribe to something happening
  on(eventName: string, caller: any, callback: any) {
    this.nextId += 1;
    this.callbacks.push({
      id: this.nextId,
      eventName,
      caller,
      callback,
    });
    return this.nextId;
  }

  // remove the subscription
  off(id: number) {
    this.callbacks = this.callbacks.filter((stored) => stored.id !== id);
  }

  unsubscribe(caller: any) {
    this.callbacks = this.callbacks.filter((stored) => stored.caller !== caller);
  }

}
export const events = new Events();
