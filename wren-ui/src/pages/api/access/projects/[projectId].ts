import { NextApiRequest, NextApiResponse } from 'next';
import { components } from '@/common';
import { extractTokenFromRequest, ProjectAccessMode } from '@server/utils/auth';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'PUT') {
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

  const projectId = Number(req.query.projectId);
  if (!Number.isFinite(projectId) || projectId <= 0) {
    return res.status(400).json({ error: 'Invalid projectId' });
  }

  try {
    const { accessMode, allowedUserIds } = req.body || {};
    const updated = await components.authService.updateProjectPolicy(
      projectId,
      accessMode as ProjectAccessMode,
      Array.isArray(allowedUserIds) ? allowedUserIds : [],
    );
    return res.status(200).json({ policy: updated });
  } catch (err: any) {
    return res.status(400).json({
      error: err?.message || 'Ошибка обновления прав доступа',
    });
  }
}
