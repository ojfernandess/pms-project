import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";
import { EstablishmentsController } from "./establishments.controller";
import { EstablishmentsService } from "./establishments.service";
import { OperationsController } from "./operations.controller";
import { RatesService } from "./rates.service";
import { ReservationsService } from "./reservations.service";
import { RoomsService } from "./rooms.service";

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [CompaniesController, EstablishmentsController, OperationsController],
  providers: [CompaniesService, EstablishmentsService, ReservationsService, RoomsService, RatesService],
})
export class PmsModule {}
