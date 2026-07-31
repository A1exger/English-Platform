'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import '@livekit/components-styles';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  ControlBar,
  ParticipantTile,
  useTracks,
  useLocalParticipant
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import { apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';

interface Join {
  roomName: string;
  url: string;
  token: string;
}

// Custom call layout (replaces LiveKit's VideoConference grid, which forced an
// equal split + its own control bar and cropped inside the corner PiP). The
// OTHER participant fills the stage; your own camera rides along as a small
// overlay in the bottom-right, like a normal 1:1 video call. In `compact` mode
// (board on → corner PiP) we drop the self-view and controls so only the remote
// video shows, filling the small window without cropping.
function CallLayout({ compact }: { compact: boolean }) {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false }
    ],
    { onlySubscribed: false }
  );
  const { localParticipant } = useLocalParticipant();

  const isLocal = (t: (typeof tracks)[number]) =>
    t.participant.identity === localParticipant.identity;
  const remote = tracks.filter((t) => !isLocal(t));
  const selfCam = tracks.find((t) => isLocal(t) && t.source === Track.Source.Camera);

  // The other person fills the stage. Alone in the room? Show your own camera so
  // the stage is never an empty black box.
  const main = remote.length > 0 ? remote : selfCam ? [selfCam] : [];
  const showSelf = !compact && remote.length > 0 && !!selfCam;

  return (
    <div className={`call${compact ? ' call-compact' : ''}`}>
      <div className={`call-main${main.length > 1 ? ' call-main-grid' : ''}`}>
        {main.map((tr) => (
          <ParticipantTile key={`${tr.participant.identity}:${tr.source}`} trackRef={tr} />
        ))}
      </div>
      {showSelf && (
        <div className="call-self">
          <ParticipantTile trackRef={selfCam} disableSpeakingIndicator />
        </div>
      )}
      {!compact && (
        <ControlBar
          variation="minimal"
          controls={{
            microphone: true,
            camera: true,
            screenShare: true,
            chat: false,
            leave: false,
            settings: false
          }}
        />
      )}
    </div>
  );
}

// Video client for the lesson room. Fetches a LiveKit access token from the API
// (POST /lessons/:id/join) and connects to LiveKit at the server URL it returns
// — set LIVEKIT_URL/keys in the backend for real connections. `compact` renders
// the corner-PiP variant (remote only).
export function VideoRoom({ lessonId, compact = false }: { lessonId: string; compact?: boolean }) {
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
        <CallLayout compact={compact} />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}
