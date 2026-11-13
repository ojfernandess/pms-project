import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { reservation_status } from "@prisma/client";
import { IsIn, IsOptional, Matches } from "class-validator";
import { SessionUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { EstablishmentsService } from "./establishments.service";
import { ReservationsService } from "./reservations.service";
import { RoomsService } from "./rooms.service";

const STATUSES = Object.values(reservation_status);

class ReservationQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: reservation_status;
}

@Controller("establishments")
@UseGuards(JwtAuthGuard)
export class EstablishmentsController {
  constructor(
    private readonly establishmentsService: EstablishmentsService,
    private readonly reservationsService: ReservationsService,
    private readonly roomsService: RoomsService,
  ) {}

  @Get(":establishmentId")
  get(@CurrentUser() user: SessionUser, @Param("establishmentId") establishmentId: string) {
    return this.establishmentsService.get(user, establishmentId);
  }

  @Get(":establishmentId/rooms")
  rooms(@CurrentUser() user: SessionUser, @Param("establishmentId") establishmentId: string) {
    return this.roomsService.list(user, establishmentId);
  }

  @Get(":establishmentId/reservations")
  reservations(
    @CurrentUser() user: SessionUser,
    @Param("establishmentId") establishmentId: string,
    @Query() query: ReservationQueryDto,
  ) {
    return this.reservationsService.list(user, establishmentId, query);
  }
}
