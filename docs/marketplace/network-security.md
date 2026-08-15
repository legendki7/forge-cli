# Network Security

Only the backend Marketplace client performs requests. React and community plugins cannot access it
or provide fetch targets. Provider configuration supplies an exact host allowlist; requests use HTTPS
on the standard port, no cookies/credentials/referrer, fixed Accept headers, a 10-second timeout,
bounded bodies, and at most three redirects.

Every initial and redirected URL is revalidated. Localhost, userinfo, non-HTTPS schemes, private,
loopback, link-local, carrier-grade NAT, IPv4-mapped IPv6, unique-local IPv6, and DNS results in those
ranges are rejected. Production endpoints remain disabled until real owned infrastructure and public
roots are configured.
