# TLS Domain Reissue Guide (Railway)

1. Go to Railway dashboard.
2. Open the Web service.
3. Open Settings.
4. Open Domains.
5. Remove apex domain `epost.pk`.
6. Re-add apex domain `epost.pk`.
7. Wait for certificate reissue.
8. Verify SSL is active.
9. Test `https://epost.pk`.

This resolves apex TLS mismatch when certificate principal is stale.
