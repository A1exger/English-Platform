'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { apiFetch } from '@/lib/api';
import { tokenStore } from '@/lib/auth';

const LEVELS = ['Beginner', 'Elementary', 'PreIntermediate', 'Intermediate', 'UpperIntermediate', 'Advanced'];
const ASPECTS = ['Grammar', 'Reading', 'Listening', 'Vocabulary', 'Speaking', 'Writing'];

interface Job {
  id: string;
  status: string;
  courseId: string | null;
  error: string | null;
}

// The teacher-in-the-loop AI entry point (ФТ-К401/К404): submit a brief, poll
// the job, then open the materialised draft in the normal editor.
export function GenerateCourseForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations('courses');
  const locale = useLocale();
  const router = useRouter();
  const [form, setForm] = useState({ topic: '', level: 'Intermediate', units: 3, lessonsPerUnit: 3, notes: '' });
  const [aspects, setAspects] = useState<string[]>(['Grammar']);
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);

  async function poll(id: string) {
    const token = tokenStore.get();
    if (!token) return;
    const j = await apiFetch<Job>(`/content/generate/${id}`, { token, locale }).catch(() => null);
    if (!j) return;
    setJob(j);
    if (j.status === 'generating') setTimeout(() => void poll(id), 2000);
    else onDone();
  }

  async function generate() {
    const token = tokenStore.get();
    if (!token || !form.topic.trim()) return;
    setBusy(true);
    try {
      const j = await apiFetch<Job>('/content/generate', { method: 'POST', token, locale, body: { ...form, aspects } });
      setJob(j);
      setTimeout(() => void poll(j.id), 1500);
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    const token = tokenStore.get();
    if (!token || !job) return;
    await apiFetch(`/content/generate/${job.id}`, { method: 'DELETE', token, locale }).catch(() => undefined);
    setJob(null);
    onDone();
  }

  if (job && job.status !== 'generating') {
    return (
      <div className="form-grid">
        <strong>{t('generate')}</strong>
        {job.status === 'ready_for_review' && job.courseId ? (
          <>
            <p className="note">{t('aiReady')}</p>
            <button type="button" onClick={() => router.push(`/courses/${job.courseId}`)}>{t('aiOpenDraft')}</button>
            <button type="button" className="ghost" onClick={discard}>{t('del')}</button>
          </>
        ) : (
          <>
            <p className="error">{t('aiFailed')}{job.error ? `: ${job.error}` : ''}</p>
            <button type="button" className="ghost" onClick={discard}>{t('del')}</button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="form-grid">
      <strong>{t('generate')}</strong>
      {job ? (
        <p className="note">{t('aiGenerating')}</p>
      ) : (
        <>
          <label>{t('aiTopic')}<input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} /></label>
          <label>
            {t('level')}
            <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
              {LEVELS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </label>
          <div className="two-col">
            <label>{t('aiUnits')}<input type="number" min={1} max={12} value={form.units} onChange={(e) => setForm({ ...form, units: Number(e.target.value) })} /></label>
            <label>{t('aiLessons')}<input type="number" min={1} max={10} value={form.lessonsPerUnit} onChange={(e) => setForm({ ...form, lessonsPerUnit: Number(e.target.value) })} /></label>
          </div>
          <div className="field">
            <span>{t('aiAspects')}</span>
            <div className="tabs tabs-inline filter-chips">
              {ASPECTS.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={aspects.includes(a) ? 'active' : ''}
                  onClick={() => setAspects((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]))}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          <label>{t('aiNotes')}<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          <button type="button" disabled={busy || !form.topic.trim()} onClick={generate}>{t('aiGenerate')}</button>
        </>
      )}
    </div>
  );
}
