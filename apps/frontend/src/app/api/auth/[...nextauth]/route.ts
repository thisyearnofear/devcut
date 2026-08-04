import { handlers, authEnabled } from "@/auth";

const notFound = () => new Response("auth disabled", { status: 404 });

export const GET = authEnabled ? handlers.GET : notFound;
export const POST = authEnabled ? handlers.POST : notFound;
