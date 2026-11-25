import { NextApiRequest, NextApiResponse } from 'next';
import { components } from '@/common';
import { extractTokenFromRequest } from '@server/utils/auth';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = extractTokenFromRequest(req);
  const user = await components.authService.getUserFromToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return res.status(200).json({
    user: {
      id: user.userId,
      email: user.email,
      name: user.name,
      role: user.role,
      language: user.language || 'ru',
    },
  });
}
