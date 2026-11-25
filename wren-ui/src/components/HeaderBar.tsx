import { useState } from 'react';
import { useRouter } from 'next/router';
import { Button, Layout, Space, Tag, Typography } from 'antd';
import styled from 'styled-components';
import LockOutlined from '@ant-design/icons/LockOutlined';
import LogoutOutlined from '@ant-design/icons/LogoutOutlined';
import UserOutlined from '@ant-design/icons/UserOutlined';
import LogoBar from '@/components/LogoBar';
import { Path } from '@/utils/enum';
import Deploy from '@/components/deploy/Deploy';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/hooks/useI18n';
import DatabaseAccessModal from '@/components/modals/DatabaseAccessModal';

const { Header } = Layout;
const { Text } = Typography;

const StyledButton = styled(Button)<{ $isHighlight: boolean }>`
  background: ${(props) =>
    props.$isHighlight ? 'rgba(255, 133, 0, 0.16)' : 'transparent'};
  font-weight: ${(props) => (props.$isHighlight ? '700' : 'normal')};
  border: ${(props) =>
    props.$isHighlight
      ? '1px solid rgba(255, 133, 0, 0.35)'
      : '1px solid transparent'};
  color: ${(props) => (props.$isHighlight ? '#FF8500' : '#E5E5E5')};

  &:hover,
  &:focus {
    background: ${(props) =>
      props.$isHighlight
        ? 'rgba(255, 133, 0, 0.22)'
        : 'rgba(255, 255, 255, 0.06)'};
    color: ${(props) => (props.$isHighlight ? '#FF8500' : '#FFFFFF')};
  }
`;

const StyledHeader = styled(Header)`
  height: 48px;
  border-bottom: 1px solid #222222;
  background: #080909;
  padding: 10px 16px;
`;

export default function HeaderBar() {
  const router = useRouter();
  const { pathname } = router;
  const { user, isAdmin, logout } = useAuth();
  const { t } = useTranslation();
  const [accessModalOpen, setAccessModalOpen] = useState(false);

  const showNav = !pathname.startsWith(Path.Onboarding);
  const isModeling = pathname.startsWith(Path.Modeling);
  const isSkillsActive =
    pathname.startsWith(Path.Skills) || pathname.startsWith('/knowledge');

  return (
    <StyledHeader>
      <div
        className="d-flex justify-space-between align-center"
        style={{ marginTop: -2 }}
      >
        <Space size={[48, 0]}>
          <LogoBar />
          {showNav && (
            <Space size={[16, 0]}>
              <StyledButton
                shape="round"
                size="small"
                $isHighlight={pathname.startsWith(Path.Home)}
                onClick={() => router.push(Path.Home)}
              >
                {t('nav.home')}
              </StyledButton>
              <StyledButton
                shape="round"
                size="small"
                $isHighlight={pathname.startsWith(Path.Modeling)}
                onClick={() => router.push(Path.Modeling)}
              >
                {t('nav.modeling')}
              </StyledButton>
              <StyledButton
                shape="round"
                size="small"
                $isHighlight={isSkillsActive}
                onClick={() => router.push(Path.SkillsLibrary)}
              >
                {t('nav.skills')}
              </StyledButton>
              <StyledButton
                shape="round"
                size="small"
                $isHighlight={pathname.startsWith(Path.APIManagement)}
                onClick={() => router.push(Path.APIManagementHistory)}
              >
                {t('nav.api')}
              </StyledButton>
            </Space>
          )}
        </Space>
        <Space size={[12, 0]} align="center">
          {isModeling && <Deploy />}
          {isAdmin && (
            <Button
              size="small"
              icon={<LockOutlined />}
              onClick={() => setAccessModalOpen(true)}
              style={{
                background: 'rgba(255, 133, 0, 0.14)',
                borderColor: 'rgba(255, 133, 0, 0.4)',
                color: '#FF8500',
              }}
            >
              {t('nav.dbAccess')}
            </Button>
          )}
          {user && (
            <Space size={6} align="center">
              <UserOutlined style={{ color: '#8c8c8c' }} />
              <Text style={{ color: '#e5e5e5', fontSize: 12 }}>
                {user.name}
              </Text>
              <Tag
                color={isAdmin ? 'orange' : 'default'}
                style={{ marginRight: 0 }}
              >
                {user.role}
              </Tag>
              <Button
                type="text"
                size="small"
                icon={<LogoutOutlined />}
                onClick={logout}
                style={{ color: '#a6a6a6' }}
                title={t('common.logout')}
              >
                {t('common.logout')}
              </Button>
            </Space>
          )}
        </Space>
      </div>
      {isAdmin && (
        <DatabaseAccessModal
          visible={accessModalOpen}
          onClose={() => setAccessModalOpen(false)}
        />
      )}
    </StyledHeader>
  );
}
