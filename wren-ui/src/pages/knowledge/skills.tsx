import { useMemo, useRef, useState } from 'react';
import {
  Button,
  Input,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  TableColumnsType,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import styled from 'styled-components';
import ThunderboltOutlined from '@ant-design/icons/ThunderboltOutlined';
import UploadOutlined from '@ant-design/icons/UploadOutlined';
import DownloadOutlined from '@ant-design/icons/DownloadOutlined';
import EyeOutlined from '@ant-design/icons/EyeOutlined';
import EditOutlined from '@ant-design/icons/EditOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import SearchOutlined from '@ant-design/icons/SearchOutlined';
import SiderLayout from '@/components/layouts/SiderLayout';
import PageLayout from '@/components/layouts/PageLayout';
import useDrawerAction from '@/hooks/useDrawerAction';
import useModalAction from '@/hooks/useModalAction';
import GlobalLabel from '@/components/pages/knowledge/GlobalLabel';
import SkillModal from '@/components/modals/SkillModal';
import SkillDrawer from '@/components/pages/knowledge/SkillDrawer';
import { Skill } from '@/apollo/client/graphql/__types__';
import {
  useSkillsQuery,
  useCreateSkillMutation,
  useUpdateSkillMutation,
  useImportSkillMutation,
  useDeleteSkillMutation,
} from '@/apollo/client/graphql/skills.generated';

const { Paragraph, Text } = Typography;

const FilterToolbar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
`;

export default function ManageSkills() {
  const skillModal = useModalAction();
  const skillDrawer = useDrawerAction();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [filterScope, setFilterScope] = useState<string>('ALL');

  const { data, loading } = useSkillsQuery({
    fetchPolicy: 'cache-and-network',
  });
  const skills = data?.skills || [];

  const getBaseOptions = (options: any) => ({
    onError: (error: any) => {
      console.error(error);
      message.error(error?.message || 'Ошибка при сохранении скилла');
    },
    refetchQueries: ['Skills'],
    awaitRefetchQueries: true,
    ...options,
  });

  const [createSkillMutation, { loading: createLoading }] =
    useCreateSkillMutation(
      getBaseOptions({
        onCompleted: () => message.success('Скилл добавлен в библиотеку.'),
      }),
    );

  const [updateSkillMutation, { loading: updateLoading }] =
    useUpdateSkillMutation(
      getBaseOptions({
        onCompleted: () => message.success('Скилл обновлён.'),
      }),
    );

  const [importSkillMutation, { loading: importLoading }] =
    useImportSkillMutation(
      getBaseOptions({
        onCompleted: (res) =>
          message.success(
            `Импортирован скилл «${res?.importSkill?.name || 'SKILL.md'}»`,
          ),
      }),
    );

  const [deleteSkillMutation] = useDeleteSkillMutation(
    getBaseOptions({
      onCompleted: () => message.success('Скилл удалён из библиотеки.'),
    }),
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    skills.forEach((s) => {
      if (s.category) set.add(s.category);
    });
    return ['ALL', ...Array.from(set)];
  }, [skills]);

  const filteredSkills = useMemo(() => {
    return skills.filter((s) => {
      if (selectedCategory !== 'ALL' && s.category !== selectedCategory) {
        return false;
      }
      if (filterScope === 'ENABLED' && !s.enabled) return false;
      if (filterScope === 'GLOBAL' && !s.isGlobal) return false;
      if (filterScope === 'BUILTIN' && !s.isBuiltin) return false;
      if (filterScope === 'CUSTOM' && s.isBuiltin) return false;

      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        const hay = [
          s.name,
          s.slug,
          s.description,
          s.category,
          ...(s.tags || []),
          ...(s.triggers || []),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [skills, selectedCategory, filterScope, searchText]);

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const rawMarkdown = String(ev.target?.result || '');
      if (!rawMarkdown.trim()) return;
      await importSkillMutation({
        variables: {
          data: {
            rawMarkdown,
            isShared: true,
            overwrite: true,
          },
        },
      });
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const handleExportSkill = (skill: Skill) => {
    const blob = new Blob([skill.rawMarkdown || skill.content], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${skill.slug}-SKILL.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleToggleEnabled = async (skill: Skill, checked: boolean) => {
    await updateSkillMutation({
      variables: {
        where: { id: skill.id },
        data: { enabled: checked },
      },
    });
  };

  const handleToggleGlobal = async (skill: Skill, checked: boolean) => {
    await updateSkillMutation({
      variables: {
        where: { id: skill.id },
        data: { isGlobal: checked },
      },
    });
  };

  const columns: TableColumnsType<Skill> = [
    {
      title: 'Скилл (Skill & Methodology)',
      dataIndex: 'name',
      width: '36%',
      render: (_, record) => (
        <div>
          <div className="d-flex align-center flex-wrap" style={{ gap: 6 }}>
            <Text
              strong
              className="cursor-pointer geekblue-6"
              onClick={() => skillDrawer.openDrawer(record)}
            >
              {record.name}
            </Text>
            <Tag color="geekblue">@{record.slug}</Tag>
            <Tag>{record.category}</Tag>
            {record.isBuiltin && <Tag color="cyan">Built-in</Tag>}
            {record.isShared && <Tag color="gold">Shared</Tag>}
          </div>
          <Paragraph
            className="gray-7 mt-1 mb-0 text-sm"
            ellipsis={{ rows: 2 }}
            title={record.description}
          >
            {record.description}
          </Paragraph>
        </div>
      ),
    },
    {
      title: 'Триггеры и автоподбор (Triggers & Tags)',
      dataIndex: 'triggers',
      width: '34%',
      render: (triggers: string[], record) => {
        if (record.isGlobal) {
          return (
            <div>
              <GlobalLabel />
              <div className="text-xs gray-6 mt-1">
                Применяется ко всем запросам пользователя
              </div>
            </div>
          );
        }
        const shownTriggers = (triggers || []).slice(0, 5);
        const moreCount = (triggers || []).length - shownTriggers.length;
        return (
          <div>
            {shownTriggers.map((t) => (
              <Tag key={t} color="blue" className="mb-1">
                {t}
              </Tag>
            ))}
            {moreCount > 0 && (
              <Tag className="mb-1">+{moreCount} триггеров</Tag>
            )}
            {!!record.tags?.length && (
              <div className="mt-1">
                {record.tags.slice(0, 4).map((tag) => (
                  <Tag key={tag} className="text-xs bg-gray-2 border-gray-4">
                    #{tag}
                  </Tag>
                ))}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Глобальный',
      dataIndex: 'isGlobal',
      width: 110,
      align: 'center',
      render: (isGlobal: boolean, record) => (
        <Tooltip title="Если включено, агент применяет этот скилл к каждому запросу независимо от триггеров">
          <Switch
            size="small"
            checked={isGlobal}
            onChange={(checked) => handleToggleGlobal(record, checked)}
          />
        </Tooltip>
      ),
    },
    {
      title: 'Активен',
      dataIndex: 'enabled',
      width: 100,
      align: 'center',
      render: (enabled: boolean, record) => (
        <Switch
          size="small"
          checked={enabled}
          onChange={(checked) => handleToggleEnabled(record, checked)}
        />
      ),
    },
    {
      title: 'Действия',
      key: 'action',
      width: 150,
      align: 'right',
      render: (_, record) => (
        <Space size="small">
          <Tooltip title="Просмотр SKILL.md">
            <Button
              size="small"
              type="text"
              icon={<EyeOutlined />}
              onClick={() => skillDrawer.openDrawer(record)}
            />
          </Tooltip>
          <Tooltip title="Редактировать скилл">
            <Button
              size="small"
              type="text"
              icon={<EditOutlined />}
              onClick={() => skillModal.openModal(record)}
            />
          </Tooltip>
          <Tooltip title="Скачать SKILL.md">
            <Button
              size="small"
              type="text"
              icon={<DownloadOutlined />}
              onClick={() => handleExportSkill(record)}
            />
          </Tooltip>
          <Popconfirm
            title={`Удалить скилл «${record.name}»?`}
            okText="Удалить"
            cancelText="Отмена"
            okButtonProps={{ danger: true }}
            onConfirm={() =>
              deleteSkillMutation({ variables: { where: { id: record.id } } })
            }
          >
            <Tooltip title="Удалить">
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <SiderLayout loading={false}>
      <PageLayout
        title={
          <>
            <ThunderboltOutlined className="mr-2 gray-8" />
            Skills Library (Библиотека аналитических скиллов SKILL.md)
          </>
        }
        titleExtra={
          <Space>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown,.txt"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
            <Button
              icon={<UploadOutlined />}
              loading={importLoading}
              onClick={() => fileInputRef.current?.click()}
            >
              Импорт SKILL.md
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => skillModal.openModal()}
            >
              Добавить скилл
            </Button>
          </Space>
        }
        description={
          <>
            Библиотека аналитических скиллов в формате{' '}
            <code>SKILL.md</code> (YAML-метаданные + Markdown-инструкции).
            Агент автоматически подбирает подходящие скиллы по смыслу вопроса и
            фразам-триггерам (например: RFM-анализ, когорты, ABC/Парето,
            прогнозирование продаж), а также позволяет явно выбирать скиллы при
            отправке запроса или через упоминание <code>@slug</code>. Вы можете
            создавать свои скиллы, импортировать и экспортировать файлы{' '}
            <code>SKILL.md</code> для обмена в общей библиотеке.
          </>
        }
      >
        <FilterToolbar>
          <Space wrap>
            <Input
              prefix={<SearchOutlined className="gray-6" />}
              placeholder="Поиск по названию, @slug, триггерам или тегам..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 340 }}
              allowClear
            />
            <Select
              value={selectedCategory}
              onChange={setSelectedCategory}
              style={{ width: 220 }}
            >
              {categories.map((cat) => (
                <Select.Option key={cat} value={cat}>
                  {cat === 'ALL' ? 'Все категории' : cat}
                </Select.Option>
              ))}
            </Select>
            <Select
              value={filterScope}
              onChange={setFilterScope}
              style={{ width: 190 }}
            >
              <Select.Option value="ALL">Все скиллы ({skills.length})</Select.Option>
              <Select.Option value="ENABLED">Только активные</Select.Option>
              <Select.Option value="GLOBAL">Глобальные</Select.Option>
              <Select.Option value="BUILTIN">Предустановленные</Select.Option>
              <Select.Option value="CUSTOM">Пользовательские</Select.Option>
            </Select>
          </Space>
          <Text className="gray-6 text-sm">
            Активно скиллов:{' '}
            <strong>{skills.filter((s) => s.enabled).length}</strong> из{' '}
            {skills.length}
          </Text>
        </FilterToolbar>

        <Table
          className="ant-table-has-header"
          dataSource={filteredSkills}
          loading={loading}
          columns={columns}
          rowKey="id"
          pagination={{
            hideOnSinglePage: true,
            pageSize: 10,
            size: 'small',
          }}
          scroll={{ x: 980 }}
        />

        <SkillDrawer
          {...skillDrawer.state}
          onClose={skillDrawer.closeDrawer}
        />

        <SkillModal
          {...skillModal.state}
          onClose={skillModal.closeModal}
          loading={createLoading || updateLoading}
          onSubmit={async ({ id, data: skillData }) => {
            if (id) {
              await updateSkillMutation({
                variables: { where: { id }, data: skillData },
              });
            } else {
              await createSkillMutation({
                variables: { data: skillData },
              });
            }
          }}
        />
      </PageLayout>
    </SiderLayout>
  );
}
