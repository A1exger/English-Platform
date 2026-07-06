'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import '@livekit/components-styles';
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer
} from '@livekit/components-react';
import { apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';

interface Join {
  roomName: string;
  url: string;
  token: string;
}

// Video client for the lesson room. Fetches a LiveKit access token from the API
// (POST /lessons/:id/join) and renders the full conference UI (camera, mic,
// screen share, chat, participant grid) from @livekit/components-react.
// Connects to LiveKit Cloud at the server URL returned by the API — set
// LIVEKIT_URL/keys in the backend for real connections.
export function VideoRoom({ lessonId }: { lessonId: string }) {
  const t = useTranslations('room');
  const [join, setJoin] = useState<Join | null>(null);
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');

  useEffect(() => {
    const token = tokenStore.get();
    if (!token) {
      setState('error');
      return;
    }
    apiFetch<Join>(`/lessons/${lessonId}/join`, { method: 'POST', token })
      .then((j) => {
        setJoin(j);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, [lessonId]);

  if (state === 'loading') {
    return (
      <div className="video-panel">
        <p className="note">{t('connecting')}</p>
      </div>
    );
  }
  if (state === 'error' || !join) {
    return (
      <div className="video-panel">
        <p className="error">{t('connectError')}</p>
      </div>
    );
  }

  return (
    <div className="video-panel" data-lk-theme="default">
      <LiveKitRoom
        token={join.token}
        serverUrl={join.url}
        connect
        audio
        video
        style={{ height: '100%' }}
        onError={(e) => console.error('LiveKit error', e)}
      >
        <VideoConference />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}
