import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { SessionUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RatesService } from "./rates.service";
import { ReservationsService } from "./reservations.service";

@Controller()
export class OperationsController {
  constructor(
    private readonly reservations: ReservationsService,
    private readonly rates: RatesService,
  ) {}

  @Post("reservations/lock")
  create(@Body() body: {
    p_reservation_data: Record<string, unknown>;
    p_checkin_date: string;
    p_checkout_date: string;
    p_establishment_id: string;
    p_room_id?: string | null;
    p_category_id?: string | null;
  }) {
    return this.reservations.createWithLock(body);
  }

  @Post("rates/quote")
  quote(@Body() body: {
    p_establishment_id: string;
    p_category_id: string;
    p_pricing_plan_id: string;
    p_date: string;
    p_adults?: number;
    p_children?: number;
  }) {
    return this.rates.quote(body);
  }

  @Post("reservations/:reservationId/check-in")
  @UseGuards(JwtAuthGuard)
  checkIn(
    @CurrentUser() user: SessionUser,
    @Param("reservationId") reservationId: string,
    @Body() body: { roomId?: string },
  ) {
    return this.reservations.checkIn(user, reservationId, body?.roomId);
  }

  @Post("reservations/:reservationId/check-out")
  @UseGuards(JwtAuthGuard)
  checkOut(@CurrentUser() user: SessionUser, @Param("reservationId") reservationId: string) {
    return this.reservations.checkOut(user, reservationId);
  }
}
