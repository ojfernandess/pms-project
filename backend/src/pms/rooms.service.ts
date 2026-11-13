import { Injectable } from "@nestjs/common";
import { AuthService, SessionUser } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { roomPublicSelect } from "./company.select";

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async list(user: SessionUser, establishmentId: string) {
    await this.auth.assertEstablishment(user, establishmentId);
    return this.prisma.rooms.findMany({
      where: { establishment_id: establishmentId },
      select: roomPublicSelect,
      orderBy: { room_number: "asc" },
    });
  }
}
