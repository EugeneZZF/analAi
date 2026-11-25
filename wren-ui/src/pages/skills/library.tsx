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
  Tabs,
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
import CheckOutlined from '@ant-design/icons/CheckOutlined';
import LockOutlined from '@ant-design/icons/LockOutlined';
import GlobalOutlined from '@ant-design/icons/GlobalOutlined';
import SiderLayout from '@/components/layouts/SiderLayout';
import PageLayout from '@/components/layouts/PageLayout';
import useDrawerAction from '@/hooks/useDrawerAction';
import useModalAction from '@/hooks/useModalAction';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/hooks/useI18n';
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
  useAddSkillToUserMutation,
  useRemoveSkillFromUserMutation,
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

export default function SkillsLibraryPage() {
  const { user, isAdmin } = useAuth();
  const { t } = useTranslation();
  const skillModal = useModalAction();
  const skillDrawer = useDrawerAction();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'my' | 'library'>('library');
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [filterScope, setFilterScope] = useState<string>('ALL');

  const { data, loading, refetch } = useSkillsQuery({
    variables: { scope: activeTab },
    fetchPolicy: 'cache-and-network',
  });
  const skills = data?.skills || [];

  const getBaseOptions = (options: any) => ({
    onError: (error: any) => {
      console.error(error);
      message.error(error?.message || t('skills.saveError'));
    },
    refetchQueries: ['Skills'],
    awaitRefetchQueries: true,
    ...options,
  });

  const [createSkillMutation, { loading: createLoading }] =
    useCreateSkillMutation(
      getBaseOptions({
        onCompleted: () => message.success(t('skills.skillAdded')),
      }),
    );

  const [updateSkillMutation, { loading: updateLoading }] =
    useUpdateSkillMutation(
      getBaseOptions({
        onCompleted: () => message.success(t('skills.skillUpdated')),
      }),
    );

  const [importSkillMutation, { loading: importLoading }] =
    useImportSkillMutation(
      getBaseOptions({
        onCompleted: (res: any) =>
          message.success(
            t('skills.skillImported', {
              name: res?.importSkill?.name || 'SKILL.md',
            }),
          ),
      }),
    );

  const [deleteSkillMutation] = useDeleteSkillMutation(
    getBaseOptions({
      onCompleted: () => message.success(t('skills.skillDeleted')),
    }),
  );

  const [addSkillToUserMutation] = useAddSkillToUserMutation(
    getBaseOptions({
      onCompleted: () => {
        message.success(t('skills.skillAttached'));
        refetch();
      },
    }),
  );

  const [removeSkillFromUserMutation] = useRemoveSkillFromUserMutation(
    getBaseOptions({
      onCompleted: () => {
        message.success(t('skills.skillDetached'));
        refetch();
      },
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
      if (filterScope === 'PUBLIC' && !s.isPublic) return false;
      if (filterScope === 'PRIVATE' && s.isPublic) return false;

      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        const hay = [
          s.name,
          s.slug,
          s.description,
          s.category,
          s.authorName || s.author,
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

  const canModifySkill = (record: Skill) => {
    if (isAdmin) return true;
    if (record.authorId == null) return true;
    return record.authorId === user?.id;
  };

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
            isPublic: activeTab === 'library',
            isShared: activeTab === 'library',
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
      title: t('skills.colSkill'),
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
            {record.isPublic ? (
              <Tag icon={<GlobalOutlined />} color="green">
                Public
              </Tag>
            ) : (
              <Tag icon={<LockOutlined />} color="default">
                Private
              </Tag>
            )}
            {record.authorName && (
              <Tag color="default">
                {t('common.author')}: {record.authorName}
              </Tag>
            )}
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
      title: t('skills.colTriggers'),
      dataIndex: 'triggers',
      width: '28%',
      render: (triggers: string[], record) => {
        if (record.isGlobal) {
          return (
            <div>
              <GlobalLabel />
              <div className="text-xs gray-6 mt-1">
                {t('skills.globalDesc')}
              </div>
            </div>
          );
        }
        const shownTriggers = (triggers || []).slice(0, 4);
        const moreCount = (triggers || []).length - shownTriggers.length;
        return (
          <div>
            {shownTriggers.map((trig) => (
              <Tag key={trig} color="blue" className="mb-1">
                {trig}
              </Tag>
            ))}
            {moreCount > 0 && (
              <Tag className="mb-1">
                {t('skills.moreTriggers', { count: moreCount })}
              </Tag>
            )}
          </div>
        );
      },
    },
    {
      title: t('skills.colGlobal'),
      dataIndex: 'isGlobal',
      width: 100,
      align: 'center',
      render: (isGlobal: boolean, record) => (
        <Switch
          size="small"
          checked={isGlobal}
          disabled={!canModifySkill(record)}
          onChange={(checked) => handleToggleGlobal(record, checked)}
        />
      ),
    },
    {
      title: t('skills.colActive'),
      dataIndex: 'enabled',
      width: 90,
      align: 'center',
      render: (enabled: boolean, record) => (
        <Switch
          size="small"
          checked={enabled}
          disabled={!canModifySkill(record)}
          onChange={(checked) => handleToggleEnabled(record, checked)}
        />
      ),
    },
    {
      title: t('skills.colActions'),
      key: 'action',
      width: 240,
      align: 'right',
      render: (_, record) => {
        const isOwner = record.authorId === user?.id;
        return (
          <Space size="small">
            {record.isPublic &&
              (record.isAdded ? (
                isOwner ? (
                  <Tag color="green" icon={<CheckOutlined />}>
                    {t('skills.yourSkill')}
                  </Tag>
                ) : (
                  <Button
                    size="small"
                    icon={<CheckOutlined />}
                    onClick={() =>
                      removeSkillFromUserMutation({
                        variables: { where: { id: record.id } },
                      })
                    }
                  >
                    {t('skills.added')}
                  </Button>
                )
              ) : (
                <Button
                  size="small"
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() =>
                    addSkillToUserMutation({
                      variables: { where: { id: record.id } },
                    })
                  }
                  style={{
                    background: '#FF8500',
                    borderColor: '#FF8500',
                    color: '#080909',
                    fontWeight: 600,
                  }}
                >
                  {t('skills.addToMe')}
                </Button>
              ))}
            <Tooltip title={t('skills.viewTooltip')}>
              <Button
                size="small"
                type="text"
                icon={<EyeOutlined />}
                onClick={() => skillDrawer.openDrawer(record)}
              />
            </Tooltip>
            {canModifySkill(record) && (
              <Tooltip title={t('skills.editTooltip')}>
                <Button
                  size="small"
                  type="text"
                  icon={<EditOutlined />}
                  onClick={() => skillModal.openModal(record)}
                />
              </Tooltip>
            )}
            <Tooltip title={t('skills.downloadTooltip')}>
              <Button
                size="small"
                type="text"
                icon={<DownloadOutlined />}
                onClick={() => handleExportSkill(record)}
              />
            </Tooltip>
            {canModifySkill(record) && (
              <Popconfirm
                title={t('skills.deleteConfirm', { name: record.name })}
                okText={t('common.delete')}
                cancelText={t('common.cancel')}
                okButtonProps={{ danger: true }}
                onConfirm={() =>
                  deleteSkillMutation({ variables: { where: { id: record.id } } })
                }
              >
                <Tooltip title={t('common.delete')}>
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                  />
                </Tooltip>
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <SiderLayout loading={false}>
      <PageLayout
        title={
          <>
            <ThunderboltOutlined className="mr-2 gray-8" />
            {t('skills.pageTitle')}
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
              {t('skills.importBtn')}
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => skillModal.openModal()}
            >
              {t('skills.createBtn')}
            </Button>
          </Space>
        }
        description={t('skills.pageDescription')}
      >
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'my' | 'library')}
          className="mb-3"
        >
          <Tabs.TabPane tab={t('skills.tabLibrary')} key="library" />
          <Tabs.TabPane tab={t('skills.tabMy')} key="my" />
        </Tabs>

        <FilterToolbar>
          <Space wrap>
            <Input
              prefix={<SearchOutlined className="gray-6" />}
              placeholder={t('skills.searchPlaceholder')}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 320 }}
              allowClear
            />
            <Select
              value={selectedCategory}
              onChange={setSelectedCategory}
              style={{ width: 200 }}
            >
              {categories.map((cat) => (
                <Select.Option key={cat} value={cat}>
                  {cat === 'ALL' ? t('skills.allCategories') : cat}
                </Select.Option>
              ))}
            </Select>
            <Select
              value={filterScope}
              onChange={setFilterScope}
              style={{ width: 190 }}
            >
              <Select.Option value="ALL">
                {t('skills.allCount', { count: skills.length })}
              </Select.Option>
              <Select.Option value="PUBLIC">
                {t('skills.filterPublic')}
              </Select.Option>
              <Select.Option value="PRIVATE">
                {t('skills.filterPrivate')}
              </Select.Option>
              <Select.Option value="ENABLED">
                {t('skills.filterEnabled')}
              </Select.Option>
              <Select.Option value="GLOBAL">
                {t('skills.filterGlobal')}
              </Select.Option>
            </Select>
          </Space>
          <Text className="gray-6 text-sm">
            {t('common.shown')}: <strong>{filteredSkills.length}</strong>
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
