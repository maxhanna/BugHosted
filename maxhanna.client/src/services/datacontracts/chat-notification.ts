export class ChatNotification {
  senderId: number;
  count: number;

  constructor(senderId: number, count: number) {
    this.senderId = senderId;
    this.count = count;
  }
}
