import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcryptjs";
import connectPgSimple from "connect-pg-simple";
import { pool, db } from "./db";
import { storage } from "./storage";
import type { User } from "@shared/schema";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";

// Passport: validar usuario vs bcrypt hash
passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const user = await storage.getUserByUsername(username);
      if (!user) return done(null, false);
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return done(null, false);
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }),
);

passport.serializeUser((user, done) => {
  done(null, (user as User).id);
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const r = await db
      .select({ id: users.id, username: users.username, role: users.role })
      .from(users)
      .where(eq(users.id, id));
    done(null, r[0] || false);
  } catch (err) {
    done(err);
  }
});

export function setupAuth(app: Express) {
  const PgSession = connectPgSimple(session);

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be set in production");
  }

  app.use(
    session({
      store: new PgSession({ pool, createTableIfMissing: true }),
      secret: sessionSecret || "dev-insecure-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 días
      },
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());

  // Endpoints de auth
  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: User | false) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ error: "Credenciales inválidas" });
      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        return res.json({ user: { id: user.id, username: user.username, role: user.role } });
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      req.session.destroy((destroyErr) => {
        if (destroyErr) return next(destroyErr);
        res.clearCookie("connect.sid");
        res.json({ ok: true });
      });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (req.isAuthenticated() && req.user) {
      const u = req.user as User;
      return res.json({ user: { id: u.id, username: u.username, role: u.role } });
    }
    return res.status(401).json({ error: "No autenticado" });
  });
}

// Middleware: exige sesión válida
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: "No autenticado" });
}
