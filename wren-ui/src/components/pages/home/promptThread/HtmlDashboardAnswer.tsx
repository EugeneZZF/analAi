import { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { Alert, Button, Skeleton, Space, Tag } from 'antd';
import DownloadOutlined from '@ant-design/icons/DownloadOutlined';
import ExportOutlined from '@ant-design/icons/ExportOutlined';
import ReloadOutlined from '@ant-design/icons/ReloadOutlined';
import { usePreviewDataMutation } from '@/apollo/client/graphql/home.generated';
import { Props as AnswerResultProps } from '@/components/pages/home/promptThread/AnswerResult';
import { buildHtmlDashboardDocument } from './htmlDashboardBuilder';

const StyledSkeleton = styled(Skeleton)`
  padding: 16px;
  .ant-skeleton-paragraph {
    margin-bottom: 0;
  }
`;

const Container = styled.div`
  background: var(--gray-1);
`;

const Toolbar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background-color: var(--gray-2);
  border-bottom: 1px solid var(--gray-4);
`;

const DashboardFrame = styled.iframe`
  width: 100%;
  height: 760px;
  border: none;
  display: block;
  background: #080909;
`;

export default function HtmlDashboardAnswer(props: AnswerResultProps) {
  const { threadResponse } = props;
  const { id, question, sql } = threadResponse;

  const [previewData, previewDataResult] = usePreviewDataMutation({
    onError: (err) => console.error(err),
  });

  const [aiHtml, setAiHtml] = useState<string>('');
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiMode, setAiMode] = useState<'ai' | 'fallback' | null>(null);

  const loadData = () => {
    setAiHtml('');
    setAiMode(null);
    previewData({
      variables: { where: { responseId: id } },
    });
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const { columns, rows } = useMemo(() => {
    const raw = previewDataResult.data?.previewData;
    const cols = (raw?.columns || []).map((c: any) => ({
      name: c.name,
      type: c.type,
    }));
    const mappedRows = (raw?.data || []).map((rowValues: any[]) =>
      cols.reduce((acc: Record<string, any>, col, idx) => {
        acc[col.name] = rowValues[idx];
        return acc;
      }, {}),
    );
    return { columns: cols, rows: mappedRows };
  }, [previewDataResult.data]);

  const fallbackHtml = useMemo(() => {
    if (!rows.length || !columns.length) return '';
    return buildHtmlDashboardDocument({
      title: question || 'WrenAI HTML Dashboard',
      sql,
      columns,
      rows,
    });
  }, [question, sql, columns, rows]);

  useEffect(() => {
    if (!rows.length || !columns.length) return;
    let cancelled = false;

    const generateWithAi = async () => {
      setAiLoading(true);
      try {
        const res = await fetch('/api/v1/html_dashboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: question || 'Data Dashboard',
            sql: sql || '',
            columns,
            rows,
          }),
        });
        const data = await res.json();
        if (!cancelled && data?.ok && data?.html) {
          setAiHtml(data.html);
          setAiMode('ai');
        } else if (!cancelled) {
          setAiMode('fallback');
        }
      } catch (_err) {
        if (!cancelled) {
          setAiMode('fallback');
        }
      } finally {
        if (!cancelled) {
          setAiLoading(false);
        }
      }
    };

    generateWithAi();
    return () => {
      cancelled = true;
    };
  }, [id, question, sql, columns, rows]);

  const htmlDoc = aiHtml || fallbackHtml;

  const handleDownloadHtml = () => {
    if (!htmlDoc) return;
    const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wren_dashboard_${id}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOpenNewTab = () => {
    if (!htmlDoc) return;
    const blob = new Blob([htmlDoc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (previewDataResult.loading || aiLoading) {
    return (
      <div className="p-4">
        <StyledSkeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  if (previewDataResult.error) {
    return (
      <div className="p-4">
        <Alert
          type="error"
          showIcon
          message="Не удалось загрузить данные для HTML-дашборда"
          description={previewDataResult.error.message}
        />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="p-4">
        <Alert
          type="info"
          showIcon
          message="Нет данных для построения HTML-дашборда"
        />
      </div>
    );
  }

  return (
    <Container>
      <Toolbar>
        <Space size="small">
          <span className="text-sm gray-7">
            HTML Dashboard (Apache ECharts)
          </span>
          {aiMode === 'ai' && <Tag color="orange">AI Generated</Tag>}
          {aiMode === 'fallback' && <Tag>Auto Template</Tag>}
        </Space>
        <Space size="small">
          <Button size="small" icon={<ReloadOutlined />} onClick={loadData}>
            Обновить
          </Button>
          <Button
            size="small"
            icon={<ExportOutlined />}
            onClick={handleOpenNewTab}
          >
            Открыть в новой вкладке
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleDownloadHtml}
          >
            Скачать HTML
          </Button>
        </Space>
      </Toolbar>
      <DashboardFrame
        title={`HTML Dashboard ${id}`}
        srcDoc={htmlDoc}
        sandbox="allow-scripts allow-downloads"
      />
    </Container>
  );
}
