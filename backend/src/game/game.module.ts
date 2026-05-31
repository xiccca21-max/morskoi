import { forwardRef, Module } from '@nestjs/common';
import { GameService } from './game.service';
import { GameGateway } from './game.gateway';
import { GameController } from './game.controller';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { MatchEventsService } from '../common/match-events.service';
import { BotsService } from '../bots/bots.service';

@Module({
  imports: [forwardRef(() => MatchmakingModule)],
  providers: [GameService, GameGateway, MatchEventsService, BotsService],
  controllers: [GameController],
  exports: [GameService, MatchEventsService, BotsService],
})
export class GameModule {}
