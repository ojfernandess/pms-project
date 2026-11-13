import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AUTH_DIRECTORY, SESSION_STORE } from "./auth.tokens";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { AuthAccountService } from "./auth-account.service";
import { PrismaAuthDirectory } from "./prisma-auth.directory";
import { RedisSessionStore } from "./redis-session.store";
import { StaffIdentityService } from "./staff-identity.service";

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: { expiresIn: config.get<string>("JWT_ACCESS_TTL") ?? "15m" },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    PrismaAuthDirectory,
    RedisSessionStore,
    AuthAccountService,
    { provide: AUTH_DIRECTORY, useExisting: PrismaAuthDirectory },
    { provide: SESSION_STORE, useExisting: RedisSessionStore },
    AuthService,
    JwtAuthGuard,
    StaffIdentityService,
  ],
  exports: [AuthService, JwtAuthGuard, JwtModule, StaffIdentityService],
})
export class AuthModule {}
