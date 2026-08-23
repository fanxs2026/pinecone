import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RealtimeGateway } from './realtime.gateway';
import { getSecret } from '../../common/config/env-secrets';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: getSecret('JWT_ACCESS_SECRET', 32),
      }),
    }),
  ],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
