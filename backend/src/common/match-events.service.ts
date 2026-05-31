import { Injectable } from '@nestjs/common';

/** Мост между matchmaking cron и GameGateway (socket + bot push). */
@Injectable()
export class MatchEventsService {
  private handler: ((matchId: string) => Promise<void>) | null = null;

  setHandler(fn: (matchId: string) => Promise<void>) {
    this.handler = fn;
  }

  notifyMatchFound(matchId: string) {
    return this.handler?.(matchId) ?? Promise.resolve();
  }
}
