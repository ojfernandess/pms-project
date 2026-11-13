import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { DataController } from "./data.controller";
import { DataService } from "./data.service";
import { StorageService } from "./storage.service";

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [DataController],
  providers: [DataService, StorageService],
  exports: [StorageService],
})
export class DataModule {}
