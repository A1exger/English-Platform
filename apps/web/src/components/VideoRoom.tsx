'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import '@livekit/components-styles';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  ControlBar,
  ParticipantTile,
  TrackToggle,
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
// equal split + its own control bar and cropped inside the corner PiP).
//
// Normal call: the OTHER participant fills the stage and your own camera rides
// along as a small overlay in the bottom-right, like any 1:1 video call.
//
// Screen share: the shared screen takes the whole stage, and BOTH cameras
// (theirs + yours) drop into the bottom-right as two equal windows.
//
// `compact` (board on → corner PiP) shows only the remote video plus a tiny
// mic/camera bar, so nothing overflows the small window.
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
  const cameras = tracks.filter((t) => t.source === Track.Source.Camera);
  const share = tracks.find((t) => t.source === Track.Source.ScreenShare);
  const remoteCams = cameras.filter((t) => !isLocal(t));
  const selfCam = cameras.find(isLocal);

  // What fills the stage: the shared screen if someone is sharing, otherwise the
  // other person. Alone and not sharing? Show your own camera so the stage is
  // never an empty black box.
  const main = share ? [share] : remoteCams.length > 0 ? remoteCams : selfCam ? [selfCam] : [];
  // While sharing, both cameras sit in the corner as equal windows; otherwise
  // only your own self-view does (the remote already fills the stage).
  const corner = compact
    ? []
    : share
      ? cameras
      : remoteCams.length > 0 && selfCam
        ? [selfCam]
        : [];

  return (
    <div className={`call${compact ? ' call-compact' : ''}${share ? ' call-sharing' : ''}`}>
      <div className={`call-main${main.length > 1 ? ' call-main-grid' : ''}`}>
        {main.map((tr) => (
          <ParticipantTile key={`${tr.participant.identity}:${tr.source}`} trackRef={tr} />
        ))}
      </div>
      {corner.length > 0 && (
        <div className="call-corner">
          {corner.map((tr) => (
            <div className="call-self" key={`${tr.participant.identity}:${tr.source}`}>
              <ParticipantTile trackRef={tr} disableSpeakingIndicator />
            </div>
          ))}
        </div>
      )}
      {compact ? (
        // Corner PiP: just mic + camera, so the lesson can be muted without
        // switching back to the video stage.
        <div className="call-mini-bar">
          <TrackToggle source={Track.Source.Microphone} />
          <TrackToggle source={Track.Source.Camera} />
        </div>
      ) : (
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
