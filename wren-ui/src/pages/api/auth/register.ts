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
    const { email, name, password, role } = req.body || {};
    const result = await components.authService.register({
      email,
      name,
      password,
      role,
    });
    setAuthCookie(res, result.token);
    return res.status(201).json(result);
  } catch (err: any) {
    return res.status(400).json({
      error: err?.message || 'Ошибка регистрации',
    });
  }
}
