'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { apiFetch, apiUpload, fileUrl } from '@/lib/api';
import { tokenStore } from '@/lib/auth';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { PageMediaItem } from './PageMediaBlock';
import { Icon } from './Icon';

const KINDS = ['image', 'video', 'audio'] as const;

// One editable attachment row: inline caption/transcript (saved on blur),
// delete, and a drag handle for reordering.
function MediaRow({
  m,
  onPatch,
  onDelete,
  onFill
}: {
  m: PageMediaItem;
  onPatch: (id: string, body: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onFill: (id: string, file: File) => void;
}) {
  const t = useTranslations('courses');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.id });
  const [caption, setCaption] = useState(m.caption ?? '');
  const [transcript, setTranscript] = useState(m.transcript ?? '');
  return (
    <li
      ref={setNodeRef}
      className="media-row"
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
    >
      <button type="button" className="drag-handle" aria-label={t('reorder')} {...attributes} {...listeners}>⠿</button>
      <span className="media-kind">{m.kind}</span>
      {m.url ? (
        <a className="link" href={fileUrl(m.url)} target="_blank" rel="noreferrer" aria-label={m.url}>↗</a>
      ) : (
        <label className="media-slot-fill" title={t('mediaPending')}>
          {t('mediaPending')}
          <input type="file" accept="image/*,video/*,audio/*" onChange={(e) => e.target.files?.[0] && onFill(m.id, e.target.files[0])} />
        </label>
      )}
      <input
        className="media-caption"
        placeholder={t('caption')}
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        onBlur={() => caption !== (m.caption ?? '') && onPatch(m.id, { caption })}
      />
      {m.kind === 'audio' && (
        <textarea
          className="media-transcript"
          placeholder={t('transcript')}
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          onBlur={() => transcript !== (m.transcript ?? '') && onPatch(m.id, { transcript })}
        />
      )}
      <button type="button" className="ghost" aria-label={t('del')} onClick={() => onDelete(m.id)}>
        <Icon name="close" />
      </button>
    </li>
  );
}

// The media block on a page in the editor: add (upload or URL) + a reorderable
// list of attachments with captions/transcripts (ФТ-К302/К303).
export function PageMediaEditor({
  pageId,
  media,
  onChanged
}: {
  pageId: string;
  media: PageMediaItem[];
  onChanged: () => void;
}) {
  const t = useTranslations('courses');
  const locale = useLocale();
  const [kind, setKind] = useState<string>('image');
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [transcript, setTranscript] = useState('');
  const [busy, setBusy] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function upload(file: File) {
    const token = tokenStore.get();
    if (!token) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiUpload<{ url: string }>('/materials/upload', fd, { token, locale });
      setUrl(res.url);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const token = tokenStore.get();
    if (!token || !url) return;
    setBusy(true);
    try {
      await apiFetch(`/content/pages/${pageId}/media`, {
        method: 'POST',
        token,
        locale,
        body: { kind, url, caption: caption || undefined, transcript: transcript || undefined }
      });
      setUrl('');
      setCaption('');
      setTranscript('');
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  function patch(id: string, body: Record<string, unknown>) {
    const token = tokenStore.get();
    if (!token) return;
    void apiFetch(`/content/media/${id}`, { method: 'PATCH', token, locale, body })
      .then(onChanged)
      .catch(() => undefined);
  }

  function del(id: string) {
    const token = tokenStore.get();
    if (!token) return;
    void apiFetch(`/content/media/${id}`, { method: 'DELETE', token, locale })
      .then(onChanged)
      .catch(() => undefined);
  }

  // Fill an empty AI slot with an uploaded file (ФТ-К407).
  async function fill(id: string, file: File) {
    const token = tokenStore.get();
    if (!token) return;
    const fd = new FormData();
    fd.append('file', file);
    const res = await apiUpload<{ url: string }>('/materials/upload', fd, { token, locale }).catch(() => null);
    if (res?.url) patch(id, { url: res.url });
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = media.map((m) => m.id);
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    const token = tokenStore.get();
    if (!token) return;
    void apiFetch(`/content/pages/${pageId}/media/reorder`, { method: 'POST', token, locale, body: { ids: next } })
      .then(onChanged)
      .catch(() => undefined);
  }

  return (
    <div className="media-editor">
      <span className="muted">{t('media')}</span>
      {media.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={media.map((m) => m.id)} strategy={verticalListSortingStrategy}>
            <ul className="media-list">
              {media.map((m) => (
                <MediaRow key={m.id} m={m} onPatch={patch} onDelete={del} onFill={fill} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      <div className="media-add">
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t('media')}>
          {KINDS.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
        <input
          type="file"
          accept="image/*,video/*,audio/*"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <input placeholder={t('mediaUrl')} value={url} onChange={(e) => setUrl(e.target.value)} />
        <input placeholder={t('caption')} value={caption} onChange={(e) => setCaption(e.target.value)} />
        {kind === 'audio' && (
          <textarea placeholder={t('transcript')} value={transcript} onChange={(e) => setTranscript(e.target.value)} />
        )}
        <button type="button" disabled={busy || !url} onClick={add}>{t('addMedia')}</button>
      </div>
    </div>
  );
}
