export class Inventory {
  character: any;
  partyMembers: any[];
  items: any[] = [];
  constructor(config: { character: any, partyMembers?: any[] }) {
    this.character = config.character;
    this.partyMembers = config.partyMembers || [];
  }
  removeFromInventory(id: any) {
    this.items = this.items.filter(item => item.id !== id);
  }
  renderParty() {}
  destroy() {}
}
