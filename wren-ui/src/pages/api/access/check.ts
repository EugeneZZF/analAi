import { NextApiRequest, NextApiResponse } from 'next';
import { components } from '@/common';
import {
  extractTokenFromRequest,
  FORBIDDEN_DATA_MESSAGE,
} from '@server/utils/auth';

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

  const projectId = req.query.projectId ? Number(req.query.projectId) : null;
  const allowed = await components.authService.checkProjectAccess(
    user,
    projectId,
  );
  if (!allowed) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: FORBIDDEN_DATA_MESSAGE,
    });
  }

  return res.status(200).json({ ok: true });
}
