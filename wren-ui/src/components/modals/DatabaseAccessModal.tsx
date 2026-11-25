import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Modal,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import DatabaseOutlined from '@ant-design/icons/DatabaseOutlined';
import LockOutlined from '@ant-design/icons/LockOutlined';
import { getStoredToken } from '@/hooks/useAuth';
import { useTranslation } from '@/hooks/useI18n';

const { Text } = Typography;

type AccessMode = 'public' | 'admin_only' | 'specific_users';

interface ProjectPolicy {
  projectId: number;
  projectName: string;
  datasource: string;
  accessMode: AccessMode;
  allowedUserIds: number[];
}

interface UserOption {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function DatabaseAccessModal({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [projects, setProjects] = useState<ProjectPolicy[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);

  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    try {
      const token = getStoredToken();
      const res = await fetch('/api/access/projects', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || t('dbAccess.loadError'));
      }
      setProjects(data.projects || []);
      setUsers(data.users || []);
    } catch (err: any) {
      message.error(err?.message || t('dbAccess.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (visible) {
      fetchPolicies();
    }
  }, [visible, fetchPolicies]);

  const updateLocalPolicy = (
    projectId: number,
    patch: Partial<ProjectPolicy>,
  ) => {
    setProjects((prev) =>
      prev.map((p) => (p.projectId === projectId ? { ...p, ...patch } : p)),
    );
  };

  const handleSave = async (policy: ProjectPolicy) => {
    setSavingId(policy.projectId);
    try {
      const token = getStoredToken();
      const res = await fetch(`/api/access/projects/${policy.projectId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          accessMode: policy.accessMode,
          allowedUserIds: policy.allowedUserIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || t('dbAccess.saveError'));
      }
      message.success(
        t('dbAccess.saveSuccess', { name: policy.projectName }),
      );
    } catch (err: any) {
      message.error(err?.message || t('dbAccess.saveError'));
    } finally {
      setSavingId(null);
    }
  };

  const nonAdminUsers = users.filter((u) => u.role !== 'admin');

  return (
    <Modal
      title={
        <Space>
          <LockOutlined style={{ color: '#FF8500' }} />
          <span>{t('dbAccess.title')}</span>
        </Space>
      }
      visible={visible}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
          {t('common.close')}
        </Button>,
      ]}
      width={680}
    >
      <Alert
        type="info"
        showIcon
        className="mb-4"
        message={t('dbAccess.infoBanner')}
      />

      {loading ? (
        <div className="py-8 text-center">
          <Spin />
        </div>
      ) : projects.length === 0 ? (
        <Text type="secondary">{t('dbAccess.noProjects')}</Text>
      ) : (
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          {projects.map((proj) => (
            <div
              key={proj.projectId}
              style={{
                padding: 14,
                borderRadius: 10,
                border: '1px solid #2a2a2a',
                background: '#141414',
              }}
            >
              <div className="d-flex justify-space-between align-center mb-3">
                <Space>
                  <DatabaseOutlined style={{ color: '#FF8500' }} />
                  <Text strong>{proj.projectName}</Text>
                  <Tag>{proj.datasource}</Tag>
                </Space>
                <Button
                  type="primary"
                  size="small"
                  loading={savingId === proj.projectId}
                  onClick={() => handleSave(proj)}
                  style={{
                    background: '#FF8500',
                    borderColor: '#FF8500',
                    color: '#080909',
                    fontWeight: 600,
                  }}
                >
                  {t('common.save')}
                </Button>
              </div>

              <div className="mb-2">
                <Text type="secondary" className="text-xs d-block mb-1">
                  {t('dbAccess.accessLevel')}
                </Text>
                <Select
                  style={{ width: '100%' }}
                  value={proj.accessMode}
                  onChange={(val: AccessMode) =>
                    updateLocalPolicy(proj.projectId, { accessMode: val })
                  }
                >
                  <Select.Option value="public">
                    {t('dbAccess.modePublic')}
                  </Select.Option>
                  <Select.Option value="admin_only">
                    {t('dbAccess.modeAdminOnly')}
                  </Select.Option>
                  <Select.Option value="specific_users">
                    {t('dbAccess.modeSpecificUsers')}
                  </Select.Option>
                </Select>
              </div>

              {proj.accessMode === 'specific_users' && (
                <div className="mt-3">
                  <Text type="secondary" className="text-xs d-block mb-1">
                    {t('dbAccess.whitelistLabel')}
                  </Text>
                  <Select
                    mode="multiple"
                    style={{ width: '100%' }}
                    placeholder={t('dbAccess.whitelistPlaceholder')}
                    value={proj.allowedUserIds}
                    onChange={(ids: number[]) =>
                      updateLocalPolicy(proj.projectId, { allowedUserIds: ids })
                    }
                    optionFilterProp="label"
                    options={nonAdminUsers.map((u) => ({
                      value: u.id,
                      label: `${u.name} (${u.email})`,
                    }))}
                  />
                </div>
              )}
            </div>
          ))}
        </Space>
      )}
    </Modal>
  );
}
