# Customer accounts: staged activation

The customer interface uses the current light/dark palette, Inter font, rounded compact controls and gradient primary action. Generation processors and timestamps are unchanged.

## Before activation

1. Deploy this commit with CUSTOMER_AUTH_ENABLED unset/false. Existing demo connections continue to work.
2. Confirm the database schema synchronization adds CustomerSession, RecoveryToken, CustomerResource and User.passwordHash. No demo data is reassigned to a customer.
3. Configure RESEND_API_KEY and AUTH_EMAIL_FROM with a verified email sender. Recovery will report unavailable until configured.
4. Set APP_URL to the canonical app origin. The origin guard uses RENDER_EXTERNAL_URL when present; custom domains need matching configuration before use.
5. Enable CUSTOMER_AUTH_ENABLED=true and redeploy only for the controlled two-customer acceptance test.
6. Test account registration/login/logout/recovery, connect providers, upload/generate/play/caption/export, schedule/run/cancel, and verify the other account cannot access any resource or job. Complete this live test before inviting customers.

## Limits requiring production verification

- Automated tests use an in-memory database double, not production PostgreSQL or live provider callbacks.
- Provider public-access approval is still required (later project steps).
- Existing Cloudinary assets use public URLs. App routes enforce ownership, but an already-known public Cloudinary URL remains accessible. Private Cloudinary delivery must be configured before promising private source/video storage to customers.
- Email delivery and password recovery require a configured sender; they must be tested end to end.
- Existing demo-owned accounts and projects are retained; customers must reconnect under their own sign-in. Do not automatically claim legacy accounts by email or query parameters.
- Request rate limiting is per web process. Multi-instance deployment requires a shared limit.
- Customer account deletion and durable private storage retention need separate implementation before public release.

No customer mode has been enabled in production by this change.
