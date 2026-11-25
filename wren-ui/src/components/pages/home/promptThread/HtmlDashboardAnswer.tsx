import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import styled from 'styled-components';
import { Alert, Button, Skeleton, Space, Tag, message } from 'antd';
import DownloadOutlined from '@ant-design/icons/DownloadOutlined';
import ExportOutlined from '@ant-design/icons/ExportOutlined';
import PushpinOutlined from '@ant-design/icons/PushpinOutlined';
import ReloadOutlined from '@ant-design/icons/ReloadOutlined';
import { Path } from '@/utils/enum';
import { DashboardItemType } from '@/apollo/client/graphql/__types__';
import { useCreateDashboardItemMutation } from '@/apollo/client/graphql/dashboard.generated';
import { usePreviewDataMutation } from '@/apollo/client/graphql/home.generated';
import { Props as AnswerResultProps } from '@/components/pages/home/promptThread/AnswerResult';
import { buildHtmlDashboardDocument } from './htmlDashboardBuilder';

const StyledSkeleton = styled(Skeleton)`
  padding: 16px;
  .ant-skeleton-paragraph {
    margin-bottom: 0;
  }
`;

const Container = styled.div<{ $embedded?: boolean }>`
  background: #080909;
  ${(props) =>
    props.$embedded
      ? `
    margin-top: 16px;
    border: 1px solid #222222;
    border-radius: 12px;
    overflow: hidden;
  `
      : ''}
`;

const Toolbar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  background-color: #141414;
  border-bottom: 1px solid #222222;
  flex-wrap: wrap;
  gap: 8px;
`;

const DashboardFrame = styled.iframe<{ $height: number }>`
  width: 100%;
  height: ${(props) => props.$height}px;
  border: none;
  display: block;
  background: #080909;
`;

type HtmlDashboardProps = AnswerResultProps & {
  embedded?: boolean;
};

export default function HtmlDashboardAnswer(props: HtmlDashboardProps) {
  const { threadResponse, embedded } = props;
  const { id, question, sql } = threadResponse;
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [previewData, previewDataResult] = usePreviewDataMutation({
    onError: (err) => console.error(err),
  });

  const [pinned, setPinned] = useState<boolean>(false);
  const [createDashboardItem, createDashboardResult] =
    useCreateDashboardItemMutation({
      onError: (err) => {
        console.error(err);
        message.error('Не удалось закрепить данные на дашборде');
      },
      onCompleted: () => {
        setPinned(true);
        message.success(
          <span>
            Закреплено на{' '}
            <a
              onClick={() => router.push(Path.HomeDashboard)}
              style={{ color: '#FF8500', textDecoration: 'underline' }}
            >
              главном дашборде
            </a>
          </span>,
        );
      },
    });

  const [aiHtml, setAiHtml] = useState<string>('');
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiMode, setAiMode] = useState<'ai' | 'fallback' | null>(null);
  const [frameHeight, setFrameHeight] = useState<number>(embedded ? 640 : 900);

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

  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      if (
        event.source === iframeRef.current?.contentWindow &&
        event.data?.type === 'wren-dashboard-height' &&
        typeof event.data.height === 'number'
      ) {
        setFrameHeight(event.data.height);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

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

  const handlePin = async () => {
    if (!sql) return;
    await createDashboardItem({
      variables: {
        data: {
          itemType: DashboardItemType.TABLE,
          responseId: id,
        },
      },
    });
  };

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
      <div className={embedded ? 'mt-4' : 'p-4'}>
        <StyledSkeleton active paragraph={{ rows: 5 }} />
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
    if (embedded) return null;
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
    <Container $embedded={embedded}>
      <Toolbar>
        <Space size="small">
          <span className="text-sm gray-7">
            HTML Dashboard (Apache ECharts)
          </span>
          {aiMode === 'ai' && <Tag color="orange">AI Generated</Tag>}
          {aiMode === 'fallback' && <Tag>Auto Template</Tag>}
        </Space>
        <Space size="small" wrap>
          <Button size="small" icon={<ReloadOutlined />} onClick={loadData}>
            Обновить
          </Button>
          {sql && (
            <Button
              size="small"
              icon={<PushpinOutlined />}
              loading={createDashboardResult.loading}
              onClick={handlePin}
            >
              {pinned ? 'Закреплено' : 'Закрепить'}
            </Button>
          )}
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
        ref={iframeRef}
        $height={frameHeight}
        title={`HTML Dashboard ${id}`}
        srcDoc={htmlDoc}
        sandbox="allow-scripts allow-downloads"
      />
    </Container>
  );
}
