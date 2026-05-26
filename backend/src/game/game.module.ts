import { forwardRef, Module } from '@nestjs/common';
import { GameService } from './game.service';
import { GameGateway } from './game.gateway';
import { GameController } from './game.controller';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';

@Module({
  imports: [forwardRef(() => MatchmakingModule)],
  providers: [GameService, GameGateway],
  controllers: [GameController],
  exports: [GameService],
})
export class GameModule {}
