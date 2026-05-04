import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeFirebaseAdmin } from './firebase-admin';

export interface AuthenticatedRequest extends NextRequest {
  userId?: string;
  userEmail?: string;
  isAdmin?: boolean;
}

/**
 * Verify Firebase ID token from Authorization header
 * Usage in API routes:
 *
 * const authResult = await verifyAuth(request);
 * if (authResult.error) return authResult.error;
 * const userId = authResult.userId!;
 */
export async function verifyAuth(request: NextRequest): Promise<{
  userId?: string;
  userEmail?: string;
  isAdmin?: boolean;
  error?: NextResponse;
}> {
  try {
    // Get Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        error: NextResponse.json(
          { error: 'Unauthorized', message: 'Missing or invalid Authorization header' },
          { status: 401 }
        ),
      };
    }

    // Extract token
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      return {
        error: NextResponse.json(
          { error: 'Unauthorized', message: 'No token provided' },
          { status: 401 }
        ),
      };
    }

    // Initialize Firebase Admin if needed
    initializeFirebaseAdmin();

    // Verify token
    const decodedToken = await getAuth().verifyIdToken(token);

    return {
      userId: decodedToken.uid,
      userEmail: decodedToken.email,
      isAdmin: decodedToken.admin === true || false,
    };
  } catch (error) {
    console.error('Auth verification error:', error);

    if (error instanceof Error) {
      // Handle specific Firebase Auth errors
      if (error.message.includes('expired')) {
        return {
          error: NextResponse.json(
            { error: 'Unauthorized', message: 'Token expired' },
            { status: 401 }
          ),
        };
      }

      if (error.message.includes('invalid')) {
        return {
          error: NextResponse.json(
            { error: 'Unauthorized', message: 'Invalid token' },
            { status: 401 }
          ),
        };
      }
    }

    return {
      error: NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication failed' },
        { status: 401 }
      ),
    };
  }
}

/**
 * Verify user owns the resource
 * Usage: await verifyOwnership(userId, resourceOwnerId, 'shop')
 */
export async function verifyOwnership(
  userId: string,
  resourceOwnerId: string,
  resourceType: string = 'resource'
): Promise<{ error?: NextResponse }> {
  if (userId !== resourceOwnerId) {
    return {
      error: NextResponse.json(
        {
          error: 'Forbidden',
          message: `You do not have permission to access this ${resourceType}`
        },
        { status: 403 }
      ),
    };
  }

  return {};
}

/**
 * Verify user has admin role
 */
export async function verifyAdmin(isAdmin: boolean): Promise<{ error?: NextResponse }> {
  if (!isAdmin) {
    return {
      error: NextResponse.json(
        { error: 'Forbidden', message: 'Admin access required' },
        { status: 403 }
      ),
    };
  }

  return {};
}

/**
 * Rate limiting.
 *
 * Production: backed by Upstash Redis (sliding window) so limits are shared
 * across all serverless instances. Auto-detects via env vars
 * `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (set in Vercel).
 *
 * Local dev / missing env vars: falls back to a per-process in-memory map so
 * `npm run dev` works without an Upstash account. Same API either way.
 */

const upstashEnabled =
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN;

// Lazily-initialised Upstash Redis client (singleton across requests).
let _redis: import('@upstash/redis').Redis | null = null;
async function getRedis() {
  if (_redis) return _redis;
  const { Redis } = await import('@upstash/redis');
  _redis = Redis.fromEnv();
  return _redis;
}

// One Ratelimit instance per (max, window) combo — cheap to cache, expensive
// to recreate per-request.
const _limiters = new Map<string, import('@upstash/ratelimit').Ratelimit>();
async function getLimiter(maxRequests: number, windowMs: number) {
  const key = `${maxRequests}:${windowMs}`;
  const cached = _limiters.get(key);
  if (cached) return cached;

  const { Ratelimit } = await import('@upstash/ratelimit');
  const redis = await getRedis();
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(maxRequests, `${windowMs} ms`),
    analytics: false,
    prefix: 'rl:nar24',
  });
  _limiters.set(key, limiter);
  return limiter;
}

// In-memory fallback (local dev only).
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkInMemory(
  identifier: string,
  maxRequests: number,
  windowMs: number
): { error?: NextResponse } {
  const now = Date.now();
  const entry = rateLimitMap.get(identifier);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs });
    return {};
  }

  if (entry.count >= maxRequests) {
    return {
      error: NextResponse.json(
        { error: 'Too Many Requests', message: 'Rate limit exceeded' },
        { status: 429 }
      ),
    };
  }

  entry.count++;
  return {};
}

export async function checkRateLimit(
  identifier: string, // userId or IP
  maxRequests: number = 100,
  windowMs: number = 60000 // 1 minute
): Promise<{ error?: NextResponse }> {
  if (!upstashEnabled) {
    return checkInMemory(identifier, maxRequests, windowMs);
  }

  try {
    const limiter = await getLimiter(maxRequests, windowMs);
    const { success, limit, remaining, reset } = await limiter.limit(identifier);

    if (success) return {};

    return {
      error: NextResponse.json(
        { error: 'Too Many Requests', message: 'Rate limit exceeded' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': String(remaining),
            'X-RateLimit-Reset': String(reset),
            'Retry-After': String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))),
          },
        }
      ),
    };
  } catch (err) {
    // Never let a Redis outage break the API — fail open and log.
    console.error('[rateLimit] Upstash error, allowing request:', err);
    return {};
  }
}

/**
 * Extract client IP from request headers (works behind proxies/CDNs)
 */
export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Apply IP-based rate limiting to a request.
 * Returns a 429 response if limit exceeded, otherwise undefined.
 *
 * Usage:
 *   const limited = await applyRateLimit(request, 60, 60000);
 *   if (limited) return limited;
 */
export async function applyRateLimit(
  request: NextRequest,
  maxRequests: number = 60,
  windowMs: number = 60000
): Promise<NextResponse | null> {
  const ip = getClientIp(request);
  const result = await checkRateLimit(ip, maxRequests, windowMs);
  return result.error ?? null;
}
