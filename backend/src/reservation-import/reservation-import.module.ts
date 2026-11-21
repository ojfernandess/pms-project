import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { AuthModule } from "../auth/auth.module";
import { RESERVATION_IMPORT_QUEUE } from "../queues/queue.constants";
import { ReservationImportController } from "./reservation-import.controller";
import { ReservationImportService } from "./reservation-import.service";

@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: RESERVATION_IMPORT_QUEUE })],
  controllers: [ReservationImportController],
  providers: [ReservationImportService],
  exports: [ReservationImportService],
})
export class ReservationImportModule {}
