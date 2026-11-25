import { NextApiRequest, NextApiResponse } from 'next';
import { components } from '@/common';
import { extractTokenFromRequest } from '@server/utils/auth';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'PATCH' && req.method !== 'PUT' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = extractTokenFromRequest(req);
  const user = await components.authService.getUserFromToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { language } = req.body || {};
    const updatedUser = await components.authService.updateUserLanguage(
      user.userId,
      language,
    );
    return res.status(200).json({ user: updatedUser });
  } catch (err: any) {
    return res.status(400).json({
      error: err?.message || 'Ошибка сохранения языка',
    });
  }
}
