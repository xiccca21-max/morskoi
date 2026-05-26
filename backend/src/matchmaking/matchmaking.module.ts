import { forwardRef, Module } from '@nestjs/common';
import { MatchmakingService } from './matchmaking.service';
import { LobbyService } from './lobby.service';
import { MatchmakingController } from './matchmaking.controller';
import { GameModule } from '../game/game.module';

@Module({
  imports: [forwardRef(() => GameModule)],
  providers: [MatchmakingService, LobbyService],
  controllers: [MatchmakingController],
  exports: [MatchmakingService, LobbyService],
})
export class MatchmakingModule {}
