import { createHmac } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface LiveKitGrantOptions {
  room: string;
  identity: string;
  name?: string;
  /** Tutors/students publish; observers (e.g. a parent) may be subscribe-only. */
  canPublish?: boolean;
  ttlSeconds?: number;
}

function b64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

/**
 * Issues LiveKit access tokens for joining a room. We target LiveKit Cloud
 * (managed SFU) for the MVP. A LiveKit token is just an HS256 JWT signed with
 * the API secret and carrying a `video` grant — generated here without the
 * livekit-server-sdk dependency to keep the backend lean. Swap in the SDK if
 * you need egress/recording/webhook helpers.
 */
@Injectable()
export class LiveKitService {
  constructor(private readonly config: ConfigService) {}

  get url(): string {
    return (
      this.config.get<string>('LIVEKIT_URL') ?? 'wss://example.livekit.cloud'
    );
  }

  roomNameForLesson(lessonId: string): string {
    return `lesson_${lessonId}`;
  }

  createToken(opts: LiveKitGrantOptions): string {
    const apiKey = this.config.get<string>('LIVEKIT_API_KEY') ?? 'devkey';
    const apiSecret =
      this.config.get<string>('LIVEKIT_API_SECRET') ?? 'devsecret';
    const now = Math.floor(Date.now() / 1000);
    const ttl = opts.ttlSeconds ?? 60 * 60;

    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      iss: apiKey,
      sub: opts.identity,
      name: opts.name,
      nbf: now,
      exp: now + ttl,
      video: {
        room: opts.room,
        roomJoin: true,
        canPublish: opts.canPublish ?? true,
        canSubscribe: true,
        canPublishData: true,
      },
    };

    const signingInput = `${b64url(JSON.stringify(header))}.${b64url(
      JSON.stringify(payload),
    )}`;
    const signature = createHmac('sha256', apiSecret)
      .update(signingInput)
      .digest('base64url');
    return `${signingInput}.${signature}`;
  }
}
