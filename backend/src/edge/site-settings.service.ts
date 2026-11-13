import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SITE_SETTINGS_ID } from "./robots.service";

const emptySettings = {
  site_title: "",
  site_description: "",
  meta_description: "",
  og_title: "",
  og_description: "",
  og_image: null,
};

@Injectable()
export class SiteSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const settings = await this.prisma.site_settings.findUnique({ where: { id: SITE_SETTINGS_ID } });
    return settings ?? emptySettings;
  }
}
