import { randomUUID } from "crypto";
import { ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SessionUser } from "./auth.service";
import { hashPassword } from "./password";

@Injectable()
export class AuthAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async signup(actor: SessionUser, input: { email: string; password: string; fullName?: string; data?: Record<string, unknown> }) {
    if (!actor.isSuperAdmin) throw new ForbiddenException("Apenas o super admin pode criar contas");
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.auth_users.findFirst({ where: { email: { equals: email, mode: "insensitive" }, deleted_at: null }, select: { id: true } });
    if (existing) throw new ForbiddenException("User already registered");
    const userId = randomUUID();
    const instance = await this.prisma.instances.findFirst({ select: { id: true } });
    const now = new Date();
    const metadata = { ...(input.data ?? {}), full_name: input.fullName?.trim() || input.data?.full_name };
    await this.prisma.auth_users.create({
      data: {
        id: userId,
        instance_id: instance?.id,
        aud: "authenticated",
        role: "authenticated",
        email,
        encrypted_password: await hashPassword(input.password),
        email_confirmed_at: now,
        confirmation_token: "",
        raw_app_meta_data: { provider: "email", providers: ["email"] },
        raw_user_meta_data: metadata as Prisma.InputJsonValue,
        created_at: now,
        updated_at: now,
        is_sso_user: false,
        is_anonymous: false,
        identities: {
          create: {
            provider: "email",
            provider_id: userId,
            identity_data: { sub: userId, email, email_verified: true, full_name: input.fullName?.trim() || null } as Prisma.InputJsonValue,
            created_at: now,
            updated_at: now,
          },
        },
      },
    });
    return { id: userId, email };
  }

  async updateSelf(user: SessionUser, input: { password?: string; email?: string; data?: Record<string, unknown> }) {
    const current = await this.prisma.auth_users.findUnique({ where: { id: user.id }, select: { raw_user_meta_data: true } });
    const currentMeta = current?.raw_user_meta_data && typeof current.raw_user_meta_data === "object" && !Array.isArray(current.raw_user_meta_data)
      ? current.raw_user_meta_data as Record<string, unknown>
      : {};
    const metadata = input.data ? { ...currentMeta, ...input.data } : undefined;
    await this.prisma.auth_users.update({
      where: { id: user.id },
      data: {
        encrypted_password: input.password ? await hashPassword(input.password) : undefined,
        email: input.email?.trim().toLowerCase() || undefined,
        raw_user_meta_data: metadata as Prisma.InputJsonValue | undefined,
        updated_at: new Date(),
      },
    });
    return { id: user.id, email: input.email?.trim().toLowerCase() || user.email };
  }

  async setPassword(actor: SessionUser, userId: string, password: string) {
    if (!actor.isSuperAdmin) throw new ForbiddenException("Apenas o super admin pode alterar esta senha");
    await this.prisma.auth_users.update({
      where: { id: userId },
      data: { encrypted_password: await hashPassword(password), updated_at: new Date() },
    });
  }
}
