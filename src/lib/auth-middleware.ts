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
 * Rate limiting helper (simple in-memory implementation)
 * For production, use Redis or a proper rate limiting service
 */
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export async function checkRateLimit(
  identifier: string, // userId or IP
  maxRequests: number = 100,
  windowMs: number = 60000 // 1 minute
): Promise<{ error?: NextResponse }> {
  const now = Date.now();
  const userLimit = rateLimitMap.get(identifier);

  if (!userLimit || now > userLimit.resetTime) {
    // Reset or initialize
    rateLimitMap.set(identifier, {
      count: 1,
      resetTime: now + windowMs,
    });
    return {};
  }

  if (userLimit.count >= maxRequests) {
    return {
      error: NextResponse.json(
        { error: 'Too Many Requests', message: 'Rate limit exceeded' },
        { status: 429 }
      ),
    };
  }

  // Increment count
  userLimit.count++;
  return {};
}

// Cleanup old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap.entries()) {
    if (now > value.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);
