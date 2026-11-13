import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { Allow, IsEmail, IsOptional, IsString, MinLength } from "class-validator";
import { AuthAccountService } from "./auth-account.service";
import { AuthService, SessionUser } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import { JwtAuthGuard } from "./jwt-auth.guard";

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

class RefreshDto {
  @IsString()
  @MinLength(20)
  refreshToken!: string;
}

class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  token!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

class CompanyParamDto {
  @IsString()
  @MinLength(1)
  companyId!: string;
}

class SignupDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  full_name?: string;

  @Allow()
  data?: Record<string, unknown>;
}

class UpdateSelfDto {
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @Allow()
  data?: Record<string, unknown>;
}

class AdminPasswordDto {
  @IsString()
  @MinLength(8)
  password!: string;
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly accounts: AuthAccountService,
  ) {}

  @Post("login")
  @HttpCode(200)
  login(@Body() body: LoginDto) {
    return this.auth.login(body.email, body.password);
  }

  @Post("refresh")
  @HttpCode(200)
  refresh(@Body() body: RefreshDto) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post("logout")
  @HttpCode(204)
  logout(@Body() body: RefreshDto) {
    return this.auth.logout(body.refreshToken);
  }

  @Post("forgot-password")
  @HttpCode(202)
  forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.auth.forgotPassword(body.email);
  }

  @Post("reset-password")
  @HttpCode(204)
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.auth.resetPassword(body.token, body.password);
  }

  @Post("signup")
  @UseGuards(JwtAuthGuard)
  signup(@CurrentUser() user: SessionUser, @Body() body: SignupDto) {
    return this.accounts.signup(user, { email: body.email, password: body.password, fullName: body.full_name, data: body.data });
  }

  @Post("password")
  @UseGuards(JwtAuthGuard)
  updateSelf(@CurrentUser() user: SessionUser, @Body() body: UpdateSelfDto) {
    return this.accounts.updateSelf(user, body);
  }

  @Post("users/:userId/password")
  @UseGuards(JwtAuthGuard)
  setPassword(@CurrentUser() user: SessionUser, @Param("userId") userId: string, @Body() body: AdminPasswordDto) {
    return this.accounts.setPassword(user, userId, body.password);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: SessionUser) {
    return user;
  }

  @Get("establishments/:establishmentId")
  @UseGuards(JwtAuthGuard)
  establishment(@CurrentUser() user: SessionUser, @Param("establishmentId") establishmentId: string) {
    return this.auth.assertEstablishment(user, establishmentId);
  }

  @Get("companies/:companyId")
  @UseGuards(JwtAuthGuard)
  company(@CurrentUser() user: SessionUser, @Param() params: CompanyParamDto) {
    this.auth.assertCompany(user, params.companyId);
    return { companyId: params.companyId };
  }
}
