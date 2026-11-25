import axios from 'axios';
import { NextApiRequest, NextApiResponse } from 'next';

interface HtmlDashboardBody {
  question: string;
  sql?: string;
  columns: { name: string; type: string }[];
  rows: Record<string, any>[];
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = req.body as HtmlDashboardBody;
  if (!body?.rows?.length) {
    return res.status(400).json({ ok: false, error: 'Rows are required' });
  }

  const aiEndpoint = (
    process.env.WREN_AI_ENDPOINT || 'http://wren-ai-service:5555'
  ).replace(/\/+$/, '');

  try {
    const response = await axios.post(
      `${aiEndpoint}/v1/html-dashboard`,
      {
        question: body.question || 'Data Dashboard',
        sql: body.sql || '',
        columns: body.columns || [],
        rows: body.rows,
      },
      { timeout: 95000 },
    );
    return res.status(200).json(response.data);
  } catch (err: any) {
    return res.status(502).json({
      ok: false,
      error: err?.response?.data?.detail || err?.message || 'AI service error',
    });
  }
}
