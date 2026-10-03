/**
 * DSN for the `intelligence_app` database — shared by the credential vault, the
 * organizer thread list, hackathon thread links and lazy user seeding.
 *
 * Production sets INTELLIGENCE_PG_URL in /opt/gen-ui/.env. The fallback below is a
 * local-dev default matching deployment/docker-compose.yml; the prod password was
 * rotated out of this repository on 2026-10-03, so this string never authenticates prod.
 */
export const intelligencePgUrl =
  process.env.INTELLIGENCE_PG_URL ??
  `postgres://intelligence:${process.env.POSTGRES_PASSWORD ?? "intelligence"}@localhost:${process.env.POSTGRES_HOST_PORT ?? "5433"}/intelligence_app`;
