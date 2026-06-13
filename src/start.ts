import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Block popups from iframes at the browser policy level
const securityMiddleware = createMiddleware().server(async ({ next }) => {
  const response = await next();
  if (response instanceof Response) {
    response.headers.set(
      "Permissions-Policy",
      "popups=(self), popups-to-escape-sandbox=()"
    );
  }
  return response;
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, securityMiddleware],
}));
