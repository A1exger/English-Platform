# Telegram notifications — setup

The same events that go out by email can also arrive in Telegram: new homework,
feedback on a submitted piece, a lesson reminder, a payment waiting for the
tutor's confirmation.

You set this up **once**. After that every user — including everyone who signs
up later — gets a **Connect Telegram** button in their Settings and links their
own chat in one tap. You never handle a chat id by hand.

---

## Why each person still has to press the button

Telegram does not let a bot message someone who has never opened a chat with it.
That is a platform rule, not a limitation of this app: there is no way to
pre-connect a student from the admin side. What the setup below buys you is that
the button exists and works for everyone, forever, without further admin work.

Email needs no such step, so treat Telegram as the extra channel and email as
the one that always reaches everybody.

---

## Step 1 — create the bot

In Telegram, open **@BotFather** and send `/newbot`. It asks for two things:

- a **display name** — anything, e.g. `English Spark Studio`;
- a **username** — must end in `bot`, e.g. `english_spark_studio_bot`. This one
  has to be globally unique, so expect a couple of tries.

BotFather replies with a **token** that looks like
`123456789:AAF-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.

Two values to keep:

| Value | Where it came from |
|---|---|
| `TELEGRAM_BOT_TOKEN` | the token BotFather sent |
| `TELEGRAM_BOT_USERNAME` | the username you chose, with or without `@` |

Optional polish, also via BotFather: `/setdescription`, `/setuserpic`,
`/setcommands`. None of it affects delivery.

**The token is a password.** Anyone holding it can post as your bot. Keep it in
`.env.prod` only, never in the repository. If it leaks, `/revoke` in BotFather
issues a new one.

---

## Step 2 — pick a webhook secret

Any long random string of your own choosing:

```bash
openssl rand -hex 32
```

That becomes `TELEGRAM_WEBHOOK_SECRET`. The webhook endpoint is public — it has
to be, Telegram calls it — and its payload is what links a chat to an account.
The secret is what stops anyone else from posting to it. Set it in production.

---

## Step 3 — fill in `.env.prod`

```bash
TELEGRAM_BOT_TOKEN=123456789:AAF-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_BOT_USERNAME=english_spark_studio_bot
TELEGRAM_WEBHOOK_SECRET=<the string from step 2>
```

Then redeploy so the API picks them up:

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

`TELEGRAM_BOT_USERNAME` is easy to forget, and forgetting it is quiet: the API
builds each user's connect link from it, so without it the button never appears
in Settings even though the token is set.

---

## Step 4 — point the bot at your server

Once, from any machine:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://<your-domain>/api/v1/notifications/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

A good reply looks like:

```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

Requirements Telegram enforces here: the URL must be **HTTPS**, on a real
domain, with a certificate it trusts. A `localhost` address or a self-signed
certificate will be refused — which is why this step is production-only.

If it answers

```json
{"ok":false,"error_code":400,"description":"Bad Request: bad webhook: Failed to resolve host: Name or service not known"}
```

then Telegram could not resolve the domain in `url` — in practice, a typo in it.
Telegram never says which part it disliked, so check the spelling character by
character before looking anywhere else:

```bash
getent hosts <your-domain>   # silence = that name does not exist in DNS
```

Check it any time:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

`pending_update_count` climbing or a non-empty `last_error_message` means
Telegram is reaching out and your server is not answering — see Troubleshooting.

---

## Step 5 — connect one account and test

1. Sign in as any user → **Settings**.
2. Press **Connect Telegram**. It opens a chat with your bot carrying a
   one-time payload signed for that account.
3. Press **Start** in Telegram.
4. The bot replies `English Spark Studio: notifications are on.` and Settings
   now shows the connection with a **Disconnect** button.

To see a real notification, have a tutor assign homework to that student. The
queue is drained every 30 seconds, so give it up to a minute.

---

## What each person gets

| Event | Who receives it |
|---|---|
| New homework assigned | student |
| Feedback on submitted homework | student |
| Lesson booked / lesson reminder | student |
| Payment confirmed, lessons credited | student |
| Homework handed in | tutor |
| Payment reported, awaiting confirmation | tutor |

Every one of these also goes out by email and appears in the in-app bell.
Telegram is additive: connecting or disconnecting it never changes what the
other two channels do.

---

## Troubleshooting

**No "Connect Telegram" button in Settings.** `TELEGRAM_BOT_USERNAME` is unset
or the container has not been restarted since it was added. The button is hidden
rather than shown broken when the app cannot build a valid link.

**The button opens Telegram, but pressing Start does nothing.** The webhook is
not reaching you. Run `getWebhookInfo`: an error there points at the URL, the
certificate, or a firewall. A `secret_token` that does not match what the API
has in `TELEGRAM_WEBHOOK_SECRET` makes the endpoint reject the call — re-run
`setWebhook` with the exact value from `.env.prod`.

**Connected, but nothing ever arrives.** The token is wrong or was revoked.
Sends fail softly by design — a bad token never breaks the action that triggered
the notification, so the failure only shows up as silence. Test the token
directly:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getMe"
```

**Everything is configured but you want it off temporarily.** Clear
`TELEGRAM_BOT_TOKEN` and redeploy: sends become no-ops, email and the in-app
bell carry on. `NOTIFY_DISPATCH=off` stops all three.

---

## Cost

Free. The Telegram Bot API has no charge and no subscription; the practical
limit is roughly 30 messages per second, far above what a tutoring platform
sends.

---

## Related

- Email setup: `docs/08-email-setup.md`
- All variables in one place: `.env.prod.example`
