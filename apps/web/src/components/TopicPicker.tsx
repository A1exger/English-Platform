'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Sentinel for the "new topic" row. A value no topic can have, because a topic
 * is trimmed text and this one is bracketed.
 */
const NEW_TOPIC = '<new>';

/**
 * Choose which shelf of the word bank a word goes on: one of the topics that
 * already exist, or a new one.
 *
 * Both halves matter. Typing the name again by hand was how "Business" and
 * "business" became two topics splitting one shelf — and a list of existing
 * topics cannot be where the first topic comes from, so "New topic…" opens a
 * text field.
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
  const [typing, setTyping] = useState(false);

  // A topic that has just been created arrives back in `topics` once the caller
  // reloads. That is the moment it stops being a name being typed and becomes
  // one of the existing ones, so the field collapses back to the list.
  useEffect(() => {
    if (typing && value && topics.includes(value)) setTyping(false);
  }, [topics, value, typing]);

  return (
    <>
      <label>
        {t('topic')}
        <select
          value={typing ? NEW_TOPIC : value}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.value === NEW_TOPIC) {
              setTyping(true);
              onChange('');
              return;
            }
            setTyping(false);
            onChange(e.target.value);
          }}
        >
          <option value="">{t('noTopic')}</option>
          {topics.map((tp) => (
            <option key={tp} value={tp}>{tp}</option>
          ))}
          <option value={NEW_TOPIC}>{t('newTopic')}</option>
        </select>
      </label>
      {typing && (
        <label>
          {t('topicName')}
          <input
            autoFocus
            value={value}
            placeholder={t('topicHint')}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      )}
    </>
  );
}
