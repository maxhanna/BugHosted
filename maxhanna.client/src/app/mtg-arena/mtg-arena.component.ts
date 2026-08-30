import { Component, OnDestroy, OnInit } from '@angular/core';
import { MtwArenaService, MtwCard, MtwDeck, MtwLobby } from '../../services/mtg-arena.service';
import { ChildComponent } from '../child.component';

@Component({ selector: 'app-mtg-arena', templateUrl: './mtg-arena.component.html', styleUrl: './mtg-arena.component.css', standalone: false })
export class MtwArenaComponent extends ChildComponent implements OnInit, OnDestroy {
  lobby?: MtwLobby;
  cards: MtwCard[] = [];
  decks: MtwDeck[] = [];
  selectedDeck?: MtwDeck;
  status = 'Connecting to the arena…';
  private poll?: ReturnType<typeof setInterval>;

  constructor(private readonly arena: MtwArenaService) { super(); }
  async ngOnInit() { await this.refresh(); this.poll = setInterval(() => void this.refresh(), 5000); }
  ngOnDestroy() { if (this.poll) clearInterval(this.poll); }
  async refresh() { try { const userId = Number(this.parentRef?.user?.id ?? 0); this.lobby = await this.arena.getLobby(userId); this.decks = await this.arena.getDecks(userId); this.status = 'Ready. Challenge a player or the arena bot.'; } catch { this.status = 'Arena service unavailable.'; } }
  async challenge(opponentId: number) { const userId = Number(this.parentRef?.user?.id ?? 0); this.status = 'Sending challenge…'; await this.arena.challenge(userId, opponentId); await this.refresh(); }
  async createStarterDeck() { const userId = Number(this.parentRef?.user?.id ?? 0); this.selectedDeck = await this.arena.createStarterDeck(userId); this.decks = [...this.decks.filter(d => d.id !== this.selectedDeck?.id), this.selectedDeck]; }
}
