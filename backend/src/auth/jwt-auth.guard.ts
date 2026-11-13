import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Request } from "express";
import { AuthService } from "./auth.service";
import { StaffIdentityService } from "./staff-identity.service";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly identity: StaffIdentityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const userId = await this.identity.resolve(request.headers.authorization);
    if (!userId) throw new UnauthorizedException("Invalid login credentials");
    request.user = await this.auth.me(userId);
    return true;
  }
}
