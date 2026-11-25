import { NextApiRequest, NextApiResponse } from 'next';
import { components } from '@/common';
import { setAuthCookie } from '@server/utils/auth';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body || {};
    const result = await components.authService.login({ email, password });
    setAuthCookie(res, result.token);
    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(401).json({
      error: err?.message || 'Неверный email или пароль',
    });
  }
}
