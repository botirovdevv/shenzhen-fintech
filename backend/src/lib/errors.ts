// Every error leaves the API as { error: { code, message } } (PLAN.md §11).
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new ApiError(404, 'NOT_FOUND', `${what} not found.`);
