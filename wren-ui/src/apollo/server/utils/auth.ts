import crypto from 'crypto';
import { NextApiRequest, NextApiResponse } from 'next';
import { ApolloError } from 'apollo-server-micro';

export type UserRole = 'admin' | 'user';
export type UILanguage = 'ru' | 'en';
export type ProjectAccessMode = 'public' | 'admin_only' | 'specific_users';

export interface JwtPayload {
  userId: number;
  email: string;
  name: string;
  role: UserRole;
  language?: UILanguage;
  iat: number;
  exp: number;
}

export interface AuthUser {
  userId: number;
  email: string;
  name: string;
  role: UserRole;
  language: UILanguage;
}

export const AUTH_COOKIE_NAME = 'analai_token';
export const FORBIDDEN_DATA_MESSAGE =
  'У вас недостаточно прав для получения этих данных, обратитесь к администратору, чтобы получить доступ';

const JWT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

const getJwtSecret = (): string => {
  return (
    process.env.JWT_SECRET ||
    process.env.SESSION_SECRET ||
    'analai-jwt-secret-key-change-in-production'
  );
};

const base64UrlEncode = (input: Buffer | string): string => {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
};

const base64UrlDecode = (input: string): string => {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64').toString('utf8');
};

export const signJwt = (
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  ttlSeconds = JWT_TTL_SECONDS,
): string => {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  };
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = crypto
    .createHmac('sha256', getJwtSecret())
    .update(`${header}.${body}`)
    .digest();
  return `${header}.${body}.${base64UrlEncode(signature)}`;
};

export const verifyJwt = (token: string): JwtPayload | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expectedSig = base64UrlEncode(
      crypto
        .createHmac('sha256', getJwtSecret())
        .update(`${header}.${body}`)
        .digest(),
    );
    const sigBuf = Buffer.from(sig, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (
      sigBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expectedBuf)
    ) {
      return null;
    }
    const decoded = JSON.parse(base64UrlDecode(body)) as JwtPayload;
    if (!decoded || typeof decoded.userId !== 'number') return null;
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
};

export const extractTokenFromRequest = (req: NextApiRequest): string | null => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const cookies = cookieHeader.split(';');
    for (const part of cookies) {
      const [rawKey, ...rest] = part.trim().split('=');
      if (rawKey === AUTH_COOKIE_NAME) {
        return decodeURIComponent(rest.join('='));
      }
    }
  }
  return null;
};

export const setAuthCookie = (res: NextApiResponse, token: string) => {
  const maxAge = JWT_TTL_SECONDS;
  res.setHeader(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`,
  );
};

export const clearAuthCookie = (res: NextApiResponse) => {
  res.setHeader(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  );
};

export class UnauthorizedApolloError extends ApolloError {
  constructor(message = 'Требуется авторизация') {
    super(message, 'UNAUTHENTICATED', { httpStatus: 401 });
  }
}

export class ForbiddenApolloError extends ApolloError {
  constructor(message = FORBIDDEN_DATA_MESSAGE) {
    super(message, 'FORBIDDEN', { httpStatus: 403 });
  }
}
