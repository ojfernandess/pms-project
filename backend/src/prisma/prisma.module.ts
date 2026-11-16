import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { SchemaReadinessService } from "./schema-readiness.service";

@Global()
@Module({
  providers: [PrismaService, SchemaReadinessService],
  exports: [PrismaService, SchemaReadinessService],
})
export class PrismaModule {}
