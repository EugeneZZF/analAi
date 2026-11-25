import { useEffect, useRef, useState } from 'react';
import {
  Button,
  Col,
  Form,
  Input,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Switch,
  Tabs,
  Typography,
  message,
} from 'antd';
import UploadOutlined from '@ant-design/icons/UploadOutlined';
import DownloadOutlined from '@ant-design/icons/DownloadOutlined';
import FileMarkdownOutlined from '@ant-design/icons/FileMarkdownOutlined';
import { isEmpty } from 'lodash';
import { FORM_MODE } from '@/utils/enum';
import { ModalAction } from '@/hooks/useModalAction';
import { Skill } from '@/apollo/client/graphql/__types__';
import MarkdownBlock from '@/components/editor/MarkdownBlock';

const { Text } = Typography;

const SKILL_CATEGORIES = [
  'Customer Analytics',
  'Sales & Product Analytics',
  'Forecasting & Time Series',
  'BI & Visualization',
  'Risk & Operations',
  'Finance & Unit Economics',
  'Marketing & Attribution',
  'General',
];

const DEFAULT_SKILL_MD_TEMPLATE = `---
name: Custom Analytical Skill
slug: custom-analytical-skill
description: Brief summary of when the agent should use this analytical skill.
category: General
tags:
  - analytics
  - sql
triggers:
  - ключевое слово
  - trigger phrase
questions:
  - Пример вопроса пользователя, активирующего скилл
enabled: true
is_global: false
is_shared: true
author: Data Analyst
version: "1.0"
---

## Методология анализа

Опишите пошаговую методику, которой должен следовать ИИ-агент:

### 1. Правила генерации SQL (SQL Rules)
- Какие таблицы, CTE, метрики и алиасы колонок использовать.
- Как группировать и сортировать результат.

### 2. Интерпретация и текстовый ответ (Answer Guidelines)
- На какие показатели обратить внимание в выводах.
- Какие бизнес-рекомендации предложить пользователю.

### 3. Визуализация и HTML-дашборд (Dashboard Guidelines)
- Какие графики (area, bar, donut, line) и KPI-карточки вывести на дашборде.
`;

type Props = ModalAction<Skill> & {
  loading?: boolean;
};

export default function SkillModal(props: Props) {
  const { defaultValue, formMode, loading, onClose, onSubmit, visible } = props;
  const isCreateMode = formMode === FORM_MODE.CREATE;

  const [form] = Form.useForm();
  const [editorMode, setEditorMode] = useState<'visual' | 'markdown'>('visual');
  const [previewContent, setPreviewContent] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isGlobal = Form.useWatch('isGlobal', form);
  const contentValue = Form.useWatch('content', form);

  useEffect(() => {
    if (visible) {
      setPreviewContent(false);
      if (!isEmpty(defaultValue)) {
        setEditorMode('visual');
        form.setFieldsValue({
          name: defaultValue.name,
          slug: defaultValue.slug,
          description: defaultValue.description,
          category: defaultValue.category || 'General',
          tags: defaultValue.tags || [],
          triggers: defaultValue.triggers || [],
          questionsText: (defaultValue.questions || []).join('\n'),
          content: defaultValue.content || '',
          rawMarkdown: defaultValue.rawMarkdown || '',
          enabled: defaultValue.enabled ?? true,
          isGlobal: defaultValue.isGlobal ?? false,
          isPublic: defaultValue.isPublic ?? defaultValue.isShared ?? true,
          author: defaultValue.author || 'User',
          version: defaultValue.version || '1.0',
        });
      } else {
        setEditorMode('visual');
        form.setFieldsValue({
          name: '',
          slug: '',
          description: '',
          category: 'General',
          tags: ['analytics', 'bi'],
          triggers: [],
          questionsText: '',
          content:
            '## Методология анализа\n\n### 1. Правила генерации SQL\n- Используй понятные бизнес-алиасы колонок (`total_revenue`, `order_count`, `avg_order_value`).\n\n### 2. Выводы и рекомендации\n- Сформулируй ключевые инсайты и практические рекомендации.\n\n### 3. Визуализация и HTML-дашборд\n- Выведи ключевые KPI и наглядные графики.',
          rawMarkdown: DEFAULT_SKILL_MD_TEMPLATE,
          enabled: true,
          isGlobal: false,
          isPublic: true,
          author: 'Data Team',
          version: '1.0',
        });
      }
    }
  }, [visible, defaultValue]);

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result || '');
      form.setFieldsValue({ rawMarkdown: text });
      setEditorMode('markdown');
      message.success(`Загружен файл ${file.name}`);
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const handleDownloadTemplate = () => {
    const raw =
      form.getFieldValue('rawMarkdown') ||
      defaultValue?.rawMarkdown ||
      DEFAULT_SKILL_MD_TEMPLATE;
    const slug =
      form.getFieldValue('slug') || defaultValue?.slug || 'custom-skill';
    const blob = new Blob([raw], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}-SKILL.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOk = () => {
    form
      .validateFields()
      .then(async (values) => {
        if (editorMode === 'markdown') {
          await onSubmit({
            id: defaultValue?.id,
            data: {
              rawMarkdown: values.rawMarkdown,
              isPublic: values.isPublic ?? true,
              isShared: values.isPublic ?? true,
            },
          });
        } else {
          const questions = (values.questionsText || '')
            .split('\n')
            .map((q: string) => q.trim())
            .filter(Boolean);
          await onSubmit({
            id: defaultValue?.id,
            data: {
              name: values.name,
              slug: values.slug || undefined,
              description: values.description || '',
              category: values.category || 'General',
              tags: values.tags || [],
              triggers: values.triggers || [],
              questions,
              content: values.content || '',
              enabled: values.enabled ?? true,
              isGlobal: values.isGlobal ?? false,
              isPublic: values.isPublic ?? true,
              isShared: values.isPublic ?? true,
              author: values.author || 'User',
              version: values.version || '1.0',
            },
          });
        }
        onClose();
      })
      .catch(console.error);
  };

  return (
    <Modal
      title={
        <div className="d-flex align-center justify-space-between pr-6">
          <span>
            <FileMarkdownOutlined className="mr-2 geekblue-6" />
            {isCreateMode ? 'Добавить скилл в библиотеку' : `Редактировать скилл: ${defaultValue?.name}`}
          </span>
          <Space size="small">
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown,.txt"
              style={{ display: 'none' }}
              onChange={handleUploadFile}
            />
            <Button
              size="small"
              icon={<UploadOutlined />}
              onClick={() => fileInputRef.current?.click()}
            >
              Загрузить SKILL.md
            </Button>
            <Button
              size="small"
              icon={<DownloadOutlined />}
              onClick={handleDownloadTemplate}
            >
              Скачать SKILL.md
            </Button>
          </Space>
        </div>
      }
      centered
      closable
      confirmLoading={loading}
      destroyOnClose
      maskClosable={false}
      onCancel={onClose}
      visible={visible}
      width={860}
      cancelButtonProps={{ disabled: loading }}
      okText={isCreateMode ? 'Создать скилл' : 'Сохранить изменения'}
      onOk={handleOk}
      afterClose={() => form.resetFields()}
    >
      <Tabs
        activeKey={editorMode}
        onChange={(key) => setEditorMode(key as 'visual' | 'markdown')}
        size="small"
      >
        <Tabs.TabPane tab="Конструктор скилла (Visual)" key="visual" />
        <Tabs.TabPane tab="Исходный код SKILL.md (YAML + Markdown)" key="markdown" />
      </Tabs>

      <Form form={form} preserve={false} layout="vertical">
        {editorMode === 'visual' ? (
          <>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item
                  label="Название скилла (Name)"
                  name="name"
                  rules={[{ required: true, message: 'Введите название скилла' }]}
                >
                  <Input placeholder="Например: RFM-сегментация клиентов" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item
                  label="Slug (ID для @вызова)"
                  name="slug"
                  extra="Латиница, например: rfm-analysis"
                >
                  <Input placeholder="auto-generated" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="Категория" name="category">
                  <Select showSearch>
                    {SKILL_CATEGORIES.map((cat) => (
                      <Select.Option key={cat} value={cat}>
                        {cat}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              label="Краткое описание (Description)"
              name="description"
              rules={[{ required: true, message: 'Укажите краткое описание скилла' }]}
            >
              <Input placeholder="Для каких аналитических задач агент должен применять этот скилл" />
            </Form.Item>

            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  label="Режим активации агентом"
                  name="isGlobal"
                  extra="Глобальные скиллы применяются к каждому запросу, контекстные — автоматически по триггерам и смыслу вопроса."
                >
                  <Radio.Group>
                    <Radio.Button value={false}>
                      Автоподбор по триггерам / смыслу
                    </Radio.Button>
                    <Radio.Button value={true}>
                      Глобальный (всегда активен)
                    </Radio.Button>
                  </Radio.Group>
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item
                  label="Активен (Enabled)"
                  name="enabled"
                  valuePropName="checked"
                >
                  <Switch checkedChildren="Вкл" unCheckedChildren="Выкл" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item
                  label="Видимость (Public / Private)"
                  name="isPublic"
                  valuePropName="checked"
                  extra="Публичный виден всем в Library"
                >
                  <Switch checkedChildren="Public" unCheckedChildren="Private" />
                </Form.Item>
              </Col>
            </Row>

            {!isGlobal && (
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item
                    label="Ключевые фразы-триггеры (Triggers)"
                    name="triggers"
                    extra="Нажмите Enter после ввода каждой фразы (например: rfm, когорт, парето, прогноз)"
                  >
                    <Select
                      mode="tags"
                      placeholder="Добавьте триггеры для автоподбора..."
                      tokenSeparators={[',']}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    label="Теги библиотеки (Tags)"
                    name="tags"
                    extra="Теги для поиска и фильтрации в библиотеке скиллов"
                  >
                    <Select
                      mode="tags"
                      placeholder="rfm, маркетинг, продажи..."
                      tokenSeparators={[',']}
                    />
                  </Form.Item>
                </Col>
              </Row>
            )}

            <Form.Item
              label="Примеры вопросов (по одному на строку)"
              name="questionsText"
            >
              <Input.TextArea
                rows={2}
                placeholder={
                  'Проведи RFM-анализ клиентской базы\nКакие клиенты находятся в зоне риска оттока?'
                }
              />
            </Form.Item>

            <div className="d-flex justify-space-between align-center mb-1">
              <Text strong>
                Инструкции скилла в Markdown (SQL правила, интерпретация, дашборд)
              </Text>
              <Button
                type="link"
                size="small"
                onClick={() => setPreviewContent(!previewContent)}
              >
                {previewContent ? 'Редактировать Markdown' : 'Предпросмотр Markdown'}
              </Button>
            </div>
            {previewContent ? (
              <div
                className="border border-gray-4 rounded p-3 bg-gray-1 mb-3"
                style={{ maxHeight: 300, overflowY: 'auto' }}
              >
                <MarkdownBlock content={contentValue || ''} />
              </div>
            ) : (
              <Form.Item
                name="content"
                rules={[
                  {
                    required: true,
                    message: 'Введите Markdown-инструкции скилла',
                  },
                ]}
              >
                <Input.TextArea
                  rows={9}
                  style={{ fontFamily: 'monospace', fontSize: 13 }}
                  placeholder="## Методология..."
                />
              </Form.Item>
            )}
          </>
        ) : (
          <>
            <Form.Item
              label="Полный документ SKILL.md (YAML Frontmatter + Markdown)"
              name="rawMarkdown"
              rules={[
                {
                  required: true,
                  message: 'Вставьте содержимое файла SKILL.md',
                },
              ]}
              extra="Вы можете вставить готовый SKILL.md с YAML-метаданными или загрузить файл кнопкой сверху."
            >
              <Input.TextArea
                rows={18}
                style={{ fontFamily: 'monospace', fontSize: 13 }}
                placeholder={DEFAULT_SKILL_MD_TEMPLATE}
              />
            </Form.Item>
            <Form.Item
              label="Опубликовать в общую библиотеку (Library)"
              name="isPublic"
              valuePropName="checked"
            >
              <Switch checkedChildren="Public" unCheckedChildren="Private" />
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  );
}
