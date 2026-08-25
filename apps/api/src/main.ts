import { existsSync, mkdirSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { UPLOADS_DIR, isInlineType, storedMimeFor } from './common/constants/uploads';

async function bootstrap(): Promise<void> {
  // rawBody: true preserves the raw request body so payment webhooks can verify
  // provider signatures (BillingController).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // One trusted hop: in production Caddy is in front (see Caddyfile), and
  // without this every request looks like it comes from the proxy — which would
  // make the sign-in throttle count the whole world as one client, and let
  // anyone lock a named account out. Express takes the address the trusted hop
  // recorded, so it cannot be spoofed by the caller.
  app.set('trust proxy', 1);

  app.setGlobalPrefix('api/v1');
  // CORS for the web app (and other clients). CORS_ORIGIN is a comma-separated
  // allow-list; defaults to reflecting any origin for an easy first deploy.
  const corsOrigin = process.env.CORS_ORIGIN;
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',').map((o) => o.trim()) : true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Baseline response headers. No dependency: these are four fixed strings,
  // and a header set here also covers /uploads below.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    // Never let the browser second-guess a declared Content-Type — that is how
    // a "picture" becomes a page.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(self), camera=(self)');
    next();
  });

  // Serve uploaded materials (mount ./uploads as a volume in production).
  if (!existsSync(UPLOADS_DIR)) {
    mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  app.useStaticAssets(UPLOADS_DIR, {
    prefix: '/uploads/',
    // Second line of defence behind the upload filter, and the one that does not
    // depend on guessing which extensions a browser will run. Pictures, audio,
    // video and PDFs are still shown in place; anything else downloads, and
    // nothing at all is allowed to act as a page on this origin.
    setHeaders: (res, filePath) => {
      const mime = storedMimeFor(filePath);
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      if (!isInlineType(mime)) {
        res.setHeader('Content-Disposition', 'attachment');
      }
    },
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}/api/v1`);
}

void bootstrap();
