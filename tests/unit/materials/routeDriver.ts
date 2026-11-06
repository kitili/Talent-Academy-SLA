/**
 * Runs a route module's real handlers, guards included, with no server and no database: the module registers on this
 * stand-in for Express, and `call` walks the handlers in order. The guards behave as those in `server/routes.ts`.
 */
type Handler = (req: any, res: any, next: () => void) => unknown;

export const guards = {
  isAuthenticated: (req: any, res: any, next: () => void) => (req.user ? next() : res.status(401).json({ message: "Unauthorized" })),
  isAuthenticatedAny: (req: any, res: any, next: () => void) => (req.user || req.session?.teacherId ? next() : res.status(401).json({ message: "Unauthorized" })),
  isTrainer: (req: any, res: any, next: () => void) => (req.user?.role === "admin" || req.user?.role === "trainer" ? next() : res.status(403).json({ message: "Forbidden" })),
  isAdmin: (req: any, res: any, next: () => void) => (req.user?.role === "admin" ? next() : res.status(403).json({ message: "Forbidden" })),
  isTeacherAuthenticated: (req: any, res: any, next: () => void) => {
    if (!req.session?.teacherId) return res.status(401).json({ message: "Unauthorized" });
    req.teacherId = req.session.teacherId;
    next();
  },
};

export function routeDriver() {
  const routes = new Map<string, Handler[]>();
  const add = (verb: string) => (path: string, ...handlers: Handler[]) => routes.set(`${verb} ${path}`, handlers);
  const app = { get: add("GET"), post: add("POST"), delete: add("DELETE") } as any;

  async function call(verb: string, path: string, req: { user?: unknown; session?: unknown; params?: unknown; body?: unknown } = {}) {
    const handlers = routes.get(`${verb} ${path}`);
    if (!handlers) throw new Error(`${verb} ${path} is not registered`);
    const answer: { status: number; body?: any } = { status: 200 };
    const res = {
      status(code: number) {
        answer.status = code;
        return res;
      },
      json(body: unknown) {
        answer.body = body;
        return res;
      },
      sendStatus(code: number) {
        answer.status = code;
        return res;
      },
    };
    const request = { params: {}, ...req };
    for (const handler of handlers) {
      let passed = false;
      await handler(request, res, () => {
        passed = true;
      });
      if (!passed) break;
    }
    return answer;
  }

  return { app, call };
}
