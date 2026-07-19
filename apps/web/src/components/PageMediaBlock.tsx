'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { fileUrl } from '@/lib/api';

export interface PageMediaItem {
  id: string;
  kind: string; // "image" | "video" | "audio"
  url: string;
  caption?: string | null;
  transcript?: string | null;
  order?: number;
}

// Listening audio: an <audio> player plus a transcript the learner can reveal
// (ФТ-К303).
function AudioItem({ m }: { m: PageMediaItem }) {
  const t = useTranslations('courses');
  const [show, setShow] = useState(false);
  return (
    <figure className="page-media-item">
      <audio controls src={fileUrl(m.url)} className="audio-full" />
      {m.transcript && (
        <>
          <button type="button" className="link transcript-toggle" onClick={() => setShow((v) => !v)}>
            {show ? t('hideTranscript') : t('showTranscript')}
          </button>
          {show && <div className="transcript">{m.transcript}</div>}
        </>
      )}
      {m.caption && <figcaption className="muted">{m.caption}</figcaption>}
    </figure>
  );
}

// The read-only media block shown on a lesson page (player + preview).
export function PageMediaBlock({ media }: { media?: PageMediaItem[] | null }) {
  if (!media || media.length === 0) return null;
  return (
    <div className="page-media">
      {media.map((m) =>
        m.kind === 'audio' ? (
          <AudioItem key={m.id} m={m} />
        ) : m.kind === 'video' ? (
          <figure key={m.id} className="page-media-item">
            <video controls src={fileUrl(m.url)} className="page-media-video" />
            {m.caption && <figcaption className="muted">{m.caption}</figcaption>}
          </figure>
        ) : (
          <figure key={m.id} className="page-media-item">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileUrl(m.url)} alt={m.caption ?? ''} className="page-media-img" loading="lazy" />
            {m.caption && <figcaption className="muted">{m.caption}</figcaption>}
          </figure>
        )
      )}
    </div>
  );
}
