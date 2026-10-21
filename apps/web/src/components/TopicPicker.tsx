'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Choose which shelf of the word bank a word goes on: one of the topics that
 * already exist, or a new one.
 *
 * Both halves matter. Typing the name again by hand was how "Business" and
 * "business" became two topics splitting one shelf — and a list of existing
 * topics cannot be where the first topic comes from, so a new one has to be
 * reachable too.
 *
 * Creating one is its own button rather than a row at the bottom of the list.
 * It was that row first, and with thirty topics above it, it sat below the fold
 * of the dropdown: the only way to find it was to already know it was there.
 *
 * One component for every place a word is filed (bulk import, and a single word
 * added in the lesson room), so the two cannot drift apart.
 */
export function TopicPicker({
  topics,
  value,
  onChange,
  disabled
}: {
  /** The topics the bank already has. */
  topics: string[];
  /** The chosen topic; empty means none. */
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('dictionary');
  const [naming, setNaming] = useState(false);

  // A topic that has just been created arrives back in `topics` once the caller
  // reloads. That is the moment it stops being a name being typed and becomes
  // one of the existing ones, so the field collapses back to the list.
  useEffect(() => {
    if (naming && value && topics.includes(value)) setNaming(false);
  }, [topics, value, naming]);

  return (
    <>
      <label>
        {t('topic')}
        {naming ? (
          <input
            autoFocus
            value={value}
            placeholder={t('topicHint')}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
            <option value="">{t('noTopic')}</option>
            {topics.map((tp) => (
              <option key={tp} value={tp}>{tp}</option>
            ))}
          </select>
        )}
      </label>
      <button
        type="button"
        className="link-button topic-picker-toggle"
        disabled={disabled}
        onClick={() => {
          onChange('');
          setNaming((was) => !was);
        }}
      >
        {naming ? t('topicFromList') : `+ ${t('newTopic')}`}
      </button>
    </>
  );
}
