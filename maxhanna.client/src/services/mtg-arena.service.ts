import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface MtwCard { id: string; name: string; imageUri?: string; typeLine?: string; oracleText?: string; manaCost?: string; }
export interface MtwDeck { id: number; name: string; cards: MtwCard[]; }
export interface MtwLobbyPlayer { id: number; username: string; ready: boolean; }
export interface MtwLobby { roomId: string; players: MtwLobbyPlayer[]; }

@Injectable({ providedIn: 'root' })
export class MtwArenaService {
  constructor(private readonly http: HttpClient) {}
  getLobby(userId: number) { return firstValueFrom(this.http.get<MtwLobby>(`/mtgarena/lobby?userId=${userId}`)); }
  getDecks(userId: number) { return firstValueFrom(this.http.get<MtwDeck[]>(`/mtgarena/decks?userId=${userId}`)); }
  createStarterDeck(userId: number) { return firstValueFrom(this.http.post<MtwDeck>('/mtgarena/decks/starter', { userId })); }
  challenge(userId: number, opponentId: number) { return firstValueFrom(this.http.post('/mtgarena/challenges', { userId, opponentId })); }
  getCard(scryfallId: string) { return firstValueFrom(this.http.get<MtwCard>(`/mtgarena/cards/${encodeURIComponent(scryfallId)}`)); }
}
