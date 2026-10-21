# Email notifications — setup

The platform sends notifications (new homework, tutor feedback, submitted
homework, a payment awaiting confirmation, a credited payment) by email in
addition to the in-app bell.

**You configure one sending mailbox, once.** Recipients are never configured:
each message goes to the address the account registered with, so a new student
receives mail the moment their account exists.

If `SMTP_HOST` is empty, no mail is sent and everything else keeps working.

---

## Do I need a separate mailbox?

You need *some* mailbox that the platform authenticates as. You can use your own
address, but a dedicated one is better:

- students reply to notifications, and those replies land somewhere sensible;
- if the password leaks, only that mailbox is affected;
- your personal inbox does not carry the platform's sending reputation.

A free Gmail/Yandex/Mail.ru account is fine — e.g. `spark.studio.mail@gmail.com`.

---

## Option A — Gmail (simplest)

Works with a free `@gmail.com` account or Google Workspace.

1. **Turn on 2-Step Verification** on the account:
   Google Account → Security → 2-Step Verification.
   App passwords do not exist without it.
2. **Create an app password**:
   Google Account → Security → App passwords → name it "English Spark Studio".
   You get 16 characters like `abcd efgh ijkl mnop`.
3. **Fill `.env.prod`** (paste the app password *without* spaces):

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=
SMTP_USER=spark.studio.mail@gmail.com
SMTP_PASS=abcdefghijklmnop
MAIL_FROM=
```

`MAIL_FROM` is left empty on purpose: mail then goes out as `SMTP_USER`, which
is the only From Gmail accepts. Setting `MAIL_FROM=no-reply@yourdomain.com`
will **not** work with a plain Gmail account — Gmail rewrites it back. To use
your own domain, first add it in Gmail under
Settings → Accounts → "Send mail as", verify it, and only then set `MAIL_FROM`
to exactly that address.

**Limits:** ~500 messages/day (free) or ~2000 (Workspace). Far beyond what a
tutoring practice sends.

---

## Option B — Yandex / Mail.ru

Same idea, different host, and both also require an app password
(«Пароли приложений») rather than the account password.

```env
# Yandex
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=you@yandex.ru
SMTP_PASS=<app password>

# Mail.ru
SMTP_HOST=smtp.mail.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=you@mail.ru
SMTP_PASS=<app password>
```

Note `SMTP_SECURE=true` with port 465 (implicit TLS). Port 587 uses STARTTLS
and wants `SMTP_SECURE` empty.

---

## Option C — a transactional provider (best deliverability)

If notifications start landing in spam, or you want your own domain as the
sender, use a service built for it — Resend, Brevo, Mailgun and Postmark all
have free tiers that cover this workload. They give you an SMTP host, a
username and a password that drop straight into the same variables, and you
verify your domain with them so `MAIL_FROM=no-reply@yourdomain.com` is allowed.

```env
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=<api key>
MAIL_FROM="English Spark Studio <no-reply@yourdomain.com>"
```

---

## Apply and check

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Then trigger a real notification — assign homework to a test student, or leave
feedback — and watch the API log:

```bash
docker compose -f docker-compose.prod.yml logs -f api | grep -i mail
```

- nothing logged and the mail arrives → working;
- `Email send failed: Invalid login` → wrong password; with Gmail this almost
  always means the account password was used instead of an app password;
- `Email send failed: getaddrinfo`/timeout → wrong host/port, or the provider
  blocks outbound SMTP from your server;
- no attempt at all → `SMTP_HOST` is empty, or the container did not pick up
  the new `.env.prod` (rebuild).

The queue is drained every 30 seconds, so allow up to a minute before assuming
something is wrong.

---

## Related

- Telegram (opt-in per user, one tap in Settings): `docs/09-telegram-setup.md`.
- Turn off the built-in dispatcher with `NOTIFY_DISPATCH=off` if you ever run an
  external worker instead.
