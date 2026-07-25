import { UserId, UserInfo } from "@dagda/shared/src/auth/types";
import { Express, NextFunction, Request, Response, Router } from "express";
import * as session from "express-session";
import { createHash, randomBytes } from "node:crypto";
import { renderLoginPage } from "./login.page";
import { UserStore } from "./users";

/**
 * Authentication (FEATURES §7).
 *
 * Local accounts only: one form, one password, no external provider. This
 * replaces the passport setup of v1 entirely — `initialize()`, `session()`,
 * `serializeUser` and `authenticate()` amount to a password check and a user id
 * in the session, which is what this does. Four packages left the dependency
 * list with it; `express-session` stays.
 */

declare module "express-session" {
    interface SessionData {
        /** Set once the credentials were accepted. The whole of the login state */
        userId?: UserId;
    }
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            /** The authenticated user, set by the gate on every request that got through */
            user?: UserInfo;
        }
    }
}

/** How long a session survives without activity */
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24;

export interface AuthHandlerParams {
    app: Express;
    users: UserStore;
    /**
     * Bootstrap secret signing the session cookies.
     *
     * Given, the sessions survive a restart, which is what makes development
     * with a watching server bearable. Absent, a random one is drawn and every
     * restart logs everyone out.
     */
    secretKey?: string;
    log?: (message: string) => void;
}

export class AuthHandler {

    protected readonly _router: Router = Router();
    protected readonly _users: UserStore;
    protected readonly _log: (message: string) => void;

    public constructor(params: AuthHandlerParams) {
        this._users = params.users;
        this._log = params.log ?? ((message: string) => console.log(message));
        this._initialize(params.app, params.secretKey);
    }

    protected _initialize(app: Express, secretKey: string | undefined): void {
        app.use(session.default({
            store: new session.MemoryStore(),
            secret: deriveSessionSecret(secretKey),
            resave: false,
            // No session is written before someone logs in, so an anonymous
            // visitor never receives a cookie.
            saveUninitialized: false,
            cookie: {
                maxAge: SESSION_MAX_AGE_MS,
                httpOnly: true,
                sameSite: "lax"
            }
        }));

        // The form posts to /login, so it has to be parsed before the routes.
        app.use(this._router);

        // -- Resolve the user of the session ---------------------------------
        this._router.use((req: Request, _res: Response, next: NextFunction) => {
            const userId = req.session.userId;
            if (userId == null) {
                next();
                return;
            }
            // Read on every request rather than cached in the session: an
            // account disabled by an administrator must stop working now, not
            // when its session expires.
            this._users.getById(userId).then((user) => {
                if (user != null && user.enabled) {
                    req.user = user;
                } else {
                    // The account went away or was disabled under the session.
                    delete req.session.userId;
                }
                next();
            }).catch(next);
        });

        this._registerRoutes();

        // -- Refuse anything else --------------------------------------------
        app.use((req: Request, res: Response, next: NextFunction) => {
            if (req.user != null) {
                next();
            } else if (req.path.startsWith("/login") || req.path === "/logout") {
                next();
            } else {
                res.redirect("/login");
            }
        });
    }

    protected _registerRoutes(): void {
        this._router.get("/login", (req: Request, res: Response) => {
            if (req.user != null) {
                res.redirect("/");
                return;
            }
            res.type("html").send(renderLoginPage({}));
        });

        this._router.post("/login", (req: Request, res: Response, next: NextFunction) => {
            // The form is urlencoded; express.json() would not read it.
            const body = req.body as { login?: string, password?: string } | undefined;
            const login = String(body?.login ?? "");
            const password = String(body?.password ?? "");

            this._users.authenticate(login, password).then((user) => {
                if (user == null) {
                    // One message for every failure. Saying "unknown account"
                    // would tell whoever is probing which logins exist.
                    this._log(`Failed login attempt for "${login}".`);
                    res.status(401).type("html").send(renderLoginPage({
                        login,
                        error: "Identifiant ou mot de passe incorrect."
                    }));
                    return;
                }
                // A new session id on login, so a session fixed before it cannot
                // be reused after.
                req.session.regenerate((error) => {
                    if (error != null) {
                        next(error);
                        return;
                    }
                    req.session.userId = user.id;
                    res.redirect("/");
                });
            }).catch(next);
        });

        this._router.get("/logout", (req: Request, res: Response) => {
            req.session.destroy(() => {
                res.redirect("/login");
            });
        });
    }
}

/**
 * @returns the secret signing the session cookies.
 *
 * Derived from the bootstrap key rather than being it: one compromise should
 * not hand over both the session signature and the settings encryption. The
 * label is what separates the two uses.
 */
function deriveSessionSecret(secretKey: string | undefined): string {
    if (secretKey == null || secretKey === "") {
        // v1 drew this with Math.random(), which is not a source anything
        // security-related should be built on.
        return randomBytes(32).toString("base64");
    }
    return createHash("sha256").update(secretKey).update("dagda:session").digest("base64");
}
