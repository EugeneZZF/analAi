import { Button, Drawer, Space, Tag, Typography, message } from 'antd';
import DownloadOutlined from '@ant-design/icons/DownloadOutlined';
import CopyOutlined from '@ant-design/icons/CopyOutlined';
import ThunderboltOutlined from '@ant-design/icons/ThunderboltOutlined';
import QuestionOutlined from '@ant-design/icons/QuestionOutlined';
import { getCompactTime } from '@/utils/time';
import { DrawerAction } from '@/hooks/useDrawerAction';
import GlobalLabel from '@/components/pages/knowledge/GlobalLabel';
import MarkdownBlock from '@/components/editor/MarkdownBlock';
import { Skill } from '@/apollo/client/graphql/__types__';

const { Text, Paragraph } = Typography;

type Props = DrawerAction<Skill>;

export default function SkillDrawer(props: Props) {
  const { visible, defaultValue, onClose } = props;

  const handleDownload = () => {
    if (!defaultValue) return;
    const blob = new Blob([defaultValue.rawMarkdown || defaultValue.content], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${defaultValue.slug}-SKILL.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyMarkdown = async () => {
    if (!defaultValue) return;
    try {
      await navigator.clipboard.writeText(
        defaultValue.rawMarkdown || defaultValue.content,
      );
      message.success('SKILL.md скопирован в буфер обмена');
    } catch (_err) {
      message.error('Не удалось скопировать SKILL.md');
    }
  };

  return (
    <Drawer
      closable
      destroyOnClose
      onClose={onClose}
      title={
        <div className="d-flex align-center justify-space-between pr-6">
          <span>
            <ThunderboltOutlined className="mr-2 geekblue-6" />
            {defaultValue?.name || 'Skill Details'}
          </span>
          <Space size="small">
            <Button
              size="small"
              icon={<CopyOutlined />}
              onClick={handleCopyMarkdown}
            >
              Копировать SKILL.md
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<DownloadOutlined />}
              onClick={handleDownload}
            >
              Скачать SKILL.md
            </Button>
          </Space>
        </div>
      }
      visible={visible}
      width={780}
    >
      <div className="mb-4">
        <Space wrap size="small">
          <Tag color="geekblue">@{defaultValue?.slug}</Tag>
          <Tag color="blue">{defaultValue?.category || 'General'}</Tag>
          {defaultValue?.enabled ? (
            <Tag color="green">Активен (Enabled)</Tag>
          ) : (
            <Tag color="default">Отключён (Disabled)</Tag>
          )}
          {defaultValue?.isGlobal ? (
            <GlobalLabel />
          ) : (
            <Tag color="purple">Автоподбор по контексту и триггерам</Tag>
          )}
          {defaultValue?.isBuiltin && <Tag color="cyan">Built-in Skill</Tag>}
          {defaultValue?.isShared && <Tag color="gold">Shared Library</Tag>}
        </Space>
      </div>

      <div className="mb-5">
        <Text className="gray-7 d-block mb-1">Описание</Text>
        <Paragraph className="mb-0">
          {defaultValue?.description || '-'}
        </Paragraph>
      </div>

      {!!defaultValue?.triggers?.length && (
        <div className="mb-5">
          <Text className="gray-7 d-block mb-2">
            Триггеры автоподбора (Triggers)
          </Text>
          <div>
            {defaultValue.triggers.map((trig) => (
              <Tag key={trig} className="mb-1" color="geekblue">
                {trig}
              </Tag>
            ))}
          </div>
        </div>
      )}

      {!!defaultValue?.questions?.length && (
        <div className="mb-5">
          <Text className="gray-7 d-block mb-2">
            Примеры запросов пользователей
          </Text>
          <div>
            {defaultValue.questions.map((question, idx) => (
              <div key={`${question}-${idx}`} className="my-1">
                <Tag className="bg-gray-1 border-gray-5">
                  <QuestionOutlined className="geekblue-6 mr-1" />
                  <Text className="gray-9">{question}</Text>
                </Tag>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-5">
        <Text className="gray-7 d-block mb-2">
          Инструкции для агента (SKILL.md Markdown)
        </Text>
        <div className="border border-gray-4 rounded p-4 bg-gray-1">
          <MarkdownBlock content={defaultValue?.content || ''} />
        </div>
      </div>

      <div className="mb-4">
        <Text className="gray-7">
          Автор: <strong>{defaultValue?.author || 'User'}</strong> · Версия:{' '}
          <strong>{defaultValue?.version || '1.0'}</strong> · Обновлено:{' '}
          {defaultValue?.updatedAt
            ? getCompactTime(defaultValue.updatedAt)
            : '-'}
        </Text>
      </div>
    </Drawer>
  );
}
