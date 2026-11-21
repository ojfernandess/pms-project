import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionUser } from "../auth/auth.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ReservationImportService } from "./reservation-import.service";
import type { ReservationImportPayload } from "./reservation-import.types";

class ExportQuery {
  @IsUUID()
  establishmentId!: string;

  @IsOptional()
  @IsString()
  checkinFrom?: string;

  @IsOptional()
  @IsString()
  checkinTo?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

class CreateJobBody {
  @IsUUID()
  establishmentId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  batchSize?: number;

  @IsObject()
  payload!: ReservationImportPayload;
}

class JobQuery {
  @IsOptional()
  @IsUUID()
  establishmentId?: string;
}

@Controller("reservation-import")
@UseGuards(JwtAuthGuard)
export class ReservationImportController {
  constructor(private readonly service: ReservationImportService) {}

  @Get("example")
  example() {
    return this.service.getExample();
  }

  @Get("export")
  export(@Query() query: ExportQuery) {
    return this.service.exportReservations({
      establishmentId: query.establishmentId,
      checkinFrom: query.checkinFrom,
      checkinTo: query.checkinTo,
      status: query.status,
    });
  }

  @Post("jobs")
  createJob(@Body() body: CreateJobBody, @CurrentUser() user: SessionUser) {
    return this.service.createJob({
      establishmentId: body.establishmentId,
      userId: user?.id || null,
      batchSize: body.batchSize,
      payload: body.payload,
    });
  }

  @Get("jobs/:id")
  getJob(@Param("id") id: string, @Query() query: JobQuery) {
    return this.service.getJob(id, query.establishmentId);
  }
}
