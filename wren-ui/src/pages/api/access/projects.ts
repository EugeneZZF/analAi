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
  if (user.role !== 'admin') {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Доступ разрешен только администраторам',
    });
  }

  const [projects, users] = await Promise.all([
    components.authService.listProjectPolicies(),
    components.authService.listUsers(),
  ]);

  return res.status(200).json({ projects, users });
}
