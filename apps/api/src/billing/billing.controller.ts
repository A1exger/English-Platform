import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { BillingService } from './billing.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { SubmitReferenceDto } from './dto/submit-reference.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload';
import { CheckoutProvider } from '../common/constants/enums';

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('packages')
  listPackages(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.listPackages(user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tutor', 'admin')
  @Delete('packages/:id')
  deletePackage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.billing.deletePackage(user, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('tutor', 'admin')
  @Post('packages')
  createPackage(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePackageDto,
  ) {
    return this.billing.createPackage(user, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  @Get('balance')
  getBalance(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.getBalance(user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('transactions')
  listTransactions(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.listTransactions(user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('invoices')
  listInvoices(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.listInvoices(user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  @Post('checkout')
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.billing.createCheckout(user, dto);
  }

  // --- Western Union / MoneyGram (manual transfers) ---

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  @Post('transfer')
  createTransfer(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTransferDto,
  ) {
    return this.billing.createTransfer(user, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('student')
  @Post('transfer/:id/reference')
  submitReference(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SubmitReferenceDto,
  ) {
    return this.billing.submitTransferReference(user, id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Get('transfers/pending')
  pendingTransfers() {
    return this.billing.listPendingTransfers();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @Post('transfer/:id/confirm')
  confirmTransfer(@Param('id') id: string) {
    return this.billing.confirmTransfer(id);
  }

  /**
   * Provider webhook. Unauthenticated: trust is established by verifying the
   * signature over the raw request body (see provider adapters). Requires the
   * app to be created with `{ rawBody: true }`.
   */
  @Post('webhook/:provider')
  webhook(
    @Param('provider') provider: CheckoutProvider,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const rawBody = req.rawBody?.toString('utf8') ?? '';
    const signature =
      (req.headers['x-webhook-signature'] as string | undefined) ?? '';
    return this.billing.handleWebhook(provider, rawBody, signature);
  }
}
