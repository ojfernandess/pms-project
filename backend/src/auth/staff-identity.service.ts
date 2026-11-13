import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

@Injectable()
export class StaffIdentityService {
  constructor(private readonly jwt: JwtService) {}

  async resolve(authorization?: string): Promise<string | null> {
    const token = readBearer(authorization);
    if (!token) return null;
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string }>(token);
      return payload.sub ?? null;
    } catch {
      return null;
    }
  }
}

function readBearer(authorization?: string): string {
  if (!authorization?.startsWith("Bearer ")) return "";
  return authorization.slice("Bearer ".length).trim();
}
