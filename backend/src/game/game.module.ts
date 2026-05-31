import { forwardRef, Module } from '@nestjs/common';
import { GameService } from './game.service';
import { GameGateway } from './game.gateway';
import { GameController } from './game.controller';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { MatchEventsService } from '../common/match-events.service';

@Module({
  imports: [forwardRef(() => MatchmakingModule)],
  providers: [GameService, GameGateway, MatchEventsService],
  controllers: [GameController],
  exports: [GameService, MatchEventsService],
})
export class GameModule {}
